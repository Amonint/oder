import {
  fetchAdsList,
  fetchCampaigns,
  fetchCompetitorAds,
  fetchPageAdDiagnostics,
  fetchPageConversionTimeseries,
  fetchPageDemographics,
  fetchPageFunnel,
  fetchPageGeo,
  fetchPageInsights,
  fetchPageStability,
  fetchPageTrafficQuality,
  fetchPageTrafficQualityTimeseries,
  fetchPageTimeseries,
  type PageTimeseriesResponse,
} from "@/api/client";
import { computePrevPeriod } from "@/lib/periodCompare";

const ALL = "__all__";

export function effectivePageOpts(
  datePreset: string,
  customDateStart: string | null,
  customDateStop: string | null,
  campaignId: string | undefined,
): Record<string, string | undefined> {
  if (datePreset === "today") {
    const today = new Date().toISOString().slice(0, 10);
    return { dateStart: today, dateStop: today, campaignId };
  }
  if (datePreset === "custom" && customDateStart && customDateStop) {
    return {
      dateStart: customDateStart,
      dateStop: customDateStop,
      campaignId,
    };
  }
  return { datePreset, campaignId };
}

export interface PageDashboardExportCollectInput {
  accountId: string;
  pageId: string;
  datePreset: string;
  customDateStart: string | null;
  customDateStop: string | null;
  campaignSelect: string;
  demographicsBreakdown: "age" | "gender" | "age,gender";
  competitorPageId: string | null;
}

export type ModuleStatus = "ok" | "error" | "skipped";

type TrapOutcome = {
  label: string;
  status: ModuleStatus;
  message?: string;
  data: unknown;
};

async function trap(
  label: string,
  fn: () => Promise<unknown>,
): Promise<TrapOutcome> {
  try {
    const data = await fn();
    return { label, status: "ok", data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { label, status: "error", message: msg, data: null };
  }
}

export function deriveConversionBounds(convData: unknown): {
  start: string;
  stop: string;
} | null {
  const rows =
    (
      convData as {
        data?: Array<{ date: string }>;
      } | null
    )?.data ?? [];
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0]?.date;
  const stop = sorted[sorted.length - 1]?.date;
  if (!start || !stop) return null;
  return { start, stop };
}

export async function collectPageDashboardExport(
  input: PageDashboardExportCollectInput,
) {
  const id = input.accountId;
  const pid = input.pageId;
  const campaignId =
    input.campaignSelect !== ALL ? input.campaignSelect : undefined;
  const baseOpts = effectivePageOpts(
    input.datePreset,
    input.customDateStart,
    input.customDateStop,
    campaignId,
  );

  const wave1 = await Promise.all([
    trap("page_insights", () => fetchPageInsights(id, pid, baseOpts)),
    trap("page_geo", () => fetchPageGeo(id, pid, baseOpts)),
    trap("page_funnel", () => fetchPageFunnel(id, pid, baseOpts)),
    trap("page_traffic_quality", () =>
      fetchPageTrafficQuality(id, pid, baseOpts),
    ),
    trap("page_traffic_quality_timeseries", () =>
      fetchPageTrafficQualityTimeseries(id, pid, baseOpts),
    ),
    trap("page_conversion_timeseries", () =>
      fetchPageConversionTimeseries(id, pid, baseOpts),
    ),
    trap("page_stability", () =>
      fetchPageStability(id, pid, { campaignId }),
    ),
    trap("page_ad_diagnostics", () =>
      fetchPageAdDiagnostics(id, pid, baseOpts),
    ),
    trap("page_timeseries", () => fetchPageTimeseries(id, pid, baseOpts)),
    trap("demographics_insights_page", () =>
      fetchPageDemographics(id, pid, {
        ...baseOpts,
        breakdown: input.demographicsBreakdown,
      }),
    ),
    trap("campaigns", () => fetchCampaigns(id)),
    trap("ads_list", () =>
      campaignId
        ? fetchAdsList(id, { campaignId })
        : fetchAdsList(id),
    ),
    input.competitorPageId
      ? trap("competitor_ads", () =>
          fetchCompetitorAds(input.competitorPageId!),
        )
      : Promise.resolve({
          label: "competitor_ads",
          status: "skipped" as const,
          message: "Sin competidor seleccionado en la vista",
          data: null,
        }),
    Promise.resolve({
      label: "page_actions",
      status: "skipped" as const,
      message:
        "fetchPageActions no se usa en PageDashboard UI — paridad con pantalla actual",
      data: null,
    }),
  ]);

  const byLabel = Object.fromEntries(
    wave1.map((o) => [o.label, o]),
  ) as Record<string, TrapOutcome>;

  const bounds = deriveConversionBounds(byLabel.page_conversion_timeseries?.data);

  let convPrevTrap: TrapOutcome;

  let prevComputed: ReturnType<typeof computePrevPeriod> | null = null;

  if (bounds && input.datePreset !== "maximum") {
    prevComputed = computePrevPeriod(bounds.start, bounds.stop);
  }

  if (!prevComputed) {
    convPrevTrap = {
      label: "page_conversion_timeseries_previous",
      status: "skipped",
      message:
        input.datePreset === "maximum"
          ? "preset maximum omite comparación período anterior"
          : bounds == null
          ? "serie conversiones incompleta para derivar bounds"
          : "sin ventana fecha prev calculable",
      data: null,
    };
  } else {
    convPrevTrap = await trap(
      "page_conversion_timeseries_previous",
      () =>
        fetchPageConversionTimeseries(id, pid, {
          campaignId,
          dateStart: prevComputed!.dateStart,
          dateStop: prevComputed!.dateStop,
        }),
    );
  }

  const parts: Record<string, { status: ModuleStatus; message?: string }> = {
    ...Object.fromEntries(
      wave1.map((t) => [t.label, { status: t.status, message: t.message }] as const),
    ),
    page_conversion_timeseries_previous: {
      status: convPrevTrap.status,
      message: convPrevTrap.message,
    },
  };

  const pageTsResp =
    byLabel.page_timeseries?.status === "ok"
      ? (byLabel.page_timeseries.data as PageTimeseriesResponse | null)
      : null;

  return {
    parts,
    data: {
      page_insights: byLabel.page_insights?.data ?? null,
      page_geo: byLabel.page_geo?.data ?? null,
      page_funnel: byLabel.page_funnel?.data ?? null,
      page_traffic_quality: byLabel.page_traffic_quality?.data ?? null,
      page_traffic_quality_timeseries:
        byLabel.page_traffic_quality_timeseries?.data ?? null,
      page_conversion_timeseries:
        byLabel.page_conversion_timeseries?.data ?? null,
      page_conversion_timeseries_previous: convPrevTrap.data ?? null,
      conversion_comparison_period: prevComputed,
      page_stability: byLabel.page_stability?.data ?? null,
      page_ad_diagnostics: byLabel.page_ad_diagnostics?.data ?? null,
      page_timeseries: pageTsResp?.data ?? null,
      page_timeseries_meta:
        pageTsResp != null
          ? {
              page_id: pageTsResp.page_id,
              date_preset: pageTsResp.date_preset,
              time_increment: pageTsResp.time_increment,
            }
          : null,
      demographics_insights_page: {
        breakdown: input.demographicsBreakdown,
        response: byLabel.demographics_insights_page?.data ?? null,
      },
      campaigns: byLabel.campaigns?.data ?? null,
      ads_list: byLabel.ads_list?.data ?? null,
      competitor_ads: input.competitorPageId
        ? (byLabel.competitor_ads?.data ?? null)
        : null,
      page_actions: null,
    },
  };
}

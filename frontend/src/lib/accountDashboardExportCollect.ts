import { ACCOUNT_DASHBOARD_OBJECTIVE_METRIC } from "@/lib/accountDashboardExportConstants";
import {
  fetchAccountDashboard,
  fetchAdAccounts,
  fetchAdsets,
  fetchAdsList,
  fetchAdsPerformance,
  fetchAudiencePerformance,
  fetchAttributionInsights,
  fetchCampaigns,
  fetchCreativeFatigue,
  fetchDemographicsInsights,
  fetchEntitySummary,
  fetchAdsetsLearningSummary,
  fetchGeoInsights,
  fetchMessagingInsights,
  fetchPlacementInsights,
  fetchTimeInsights,
  fetchAdTargeting,
  type AdAccount,
  type AdsPerformanceResponse,
  type AdsetRow,
  type AudiencePerformanceResponse,
  type AttributionResponse,
  type CampaignRow,
  type CreativeFatigueResponse,
  type DashboardResponse,
  type DemographicsResponse,
  type EntitySummaryResponse,
  type GeoInsightsResponse,
  type LearningSummaryResponse,
  type MessagingResponse,
  type PlacementInsightsResponse,
  type TargetingResponse,
  type TimeInsightsResponse,
} from "@/api/client";
import { computePrevPeriod } from "@/lib/periodCompare";

export type AdsAttributionWindow = NonNullable<
  Parameters<typeof fetchAdsPerformance>[1]["attributionWindow"]
>;

const ALL = "__all__";

export function buildEffectiveDateParamsForExport(
  datePreset: string,
  customDateStart: string | null,
  customDateStop: string | null,
): Record<string, string> {
  if (datePreset === "today") {
    const today = new Date().toISOString().slice(0, 10);
    return { dateStart: today, dateStop: today };
  }
  if (datePreset === "custom" && customDateStart && customDateStop) {
    return { dateStart: customDateStart, dateStop: customDateStop };
  }
  return { datePreset };
}

export interface AccountDashboardExportCollectInput {
  accountId: string;
  datePreset: string;
  customDateStart: string | null;
  customDateStop: string | null;
  campaignSelect: string;
  adsetSelect: string;
  selectedAdId: string | null;
  attributionWindow: AdsAttributionWindow;
  perfGranularity: "period" | "daily";
  demographicsBreakdown: "age" | "gender" | "age,gender";
  audienceCategory:
    | "all"
    | "interests"
    | "behaviors"
    | "education_majors"
    | "family_statuses"
    | "life_events"
    | "work_positions";
  audienceMinSpend: number;
  geoScope: "account" | "ad";
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

/** Carga paralela de todo lo que alimenta el dashboard de cuenta, sin depender del tab activo. */
export async function collectAccountDashboardExport(
  input: AccountDashboardExportCollectInput,
): Promise<{
  dashboard: DashboardResponse | null;
  parts: Record<string, { status: ModuleStatus; message?: string }>;
  data: {
    account_dashboard_previous: DashboardResponse | null;
    ad_accounts_list: AdAccount[];
    campaigns: CampaignRow[];
    adsets: AdsetRow[] | null;
    ads_list: Awaited<ReturnType<typeof fetchAdsList>> | null;
    ads_performance: AdsPerformanceResponse | null;
    placement_insights: PlacementInsightsResponse | null;
    geo_insights: GeoInsightsResponse | null;
    demographics_insights: DemographicsResponse | null;
    audience_performance: AudiencePerformanceResponse | null;
    attribution_insights: AttributionResponse | null;
    messaging_insights: MessagingResponse | null;
    messaging_insights_previous: MessagingResponse | null;
    creative_fatigue: CreativeFatigueResponse | null;
    time_insights_daily: TimeInsightsResponse | null;
    time_insights_hourly: TimeInsightsResponse | null;
    entity_summary_campaign: EntitySummaryResponse | null;
    entity_summary_adset: EntitySummaryResponse | null;
    adsets_learning_summary: LearningSummaryResponse | null;
    ad_targeting: TargetingResponse | null;
  };
}> {
  const id = input.accountId;
  const campaignKey =
    input.campaignSelect !== ALL ? input.campaignSelect : null;

  const effective = buildEffectiveDateParamsForExport(
    input.datePreset,
    input.customDateStart,
    input.customDateStop,
  );

  const dashMain = await trap("account_dashboard", () =>
    fetchAccountDashboard(id, input.datePreset, {
      campaignId: campaignKey ?? undefined,
      objectiveMetric: ACCOUNT_DASHBOARD_OBJECTIVE_METRIC,
      ...(effective as { datePreset?: string; dateStart?: string; dateStop?: string }),
    }),
  );

  let prevPeriod: ReturnType<typeof computePrevPeriod> | null = null;
  const dashRow = dashMain.data as DashboardResponse | null;
  if (
    dashMain.status === "ok" &&
    dashRow?.date_start &&
    dashRow?.date_stop &&
    input.datePreset !== "maximum"
  ) {
    prevPeriod = computePrevPeriod(dashRow.date_start, dashRow.date_stop);
  }

  const rankingOptsBase: Parameters<typeof fetchAdsPerformance>[1] = {
    ...effective,
    objectiveMetric: ACCOUNT_DASHBOARD_OBJECTIVE_METRIC,
    attributionWindow: input.attributionWindow,
    ...(input.perfGranularity === "daily" ? { timeIncrement: 1 as const } : {}),
  };
  if (input.selectedAdId) rankingOptsBase.adId = input.selectedAdId;
  else if (input.adsetSelect !== ALL) rankingOptsBase.adsetId = input.adsetSelect;
  else if (campaignKey) rankingOptsBase.campaignId = campaignKey;

  const placementOpts: Parameters<typeof fetchPlacementInsights>[1] = {
    ...effective,
    includeDeviceBreakdowns: true,
  };
  if (input.selectedAdId) placementOpts.adId = input.selectedAdId;
  else if (input.adsetSelect !== ALL) placementOpts.adsetId = input.adsetSelect;
  else if (campaignKey) placementOpts.campaignId = campaignKey;

  const geoEnabled =
    input.geoScope === "account" ||
    Boolean(input.selectedAdId) ||
    input.adsetSelect !== ALL ||
    Boolean(campaignKey);

  const messagingLevel =
    input.selectedAdId || input.adsetSelect !== ALL ? "ad" : "campaign";

  const geoBlock = geoEnabled
    ? trap("geo_insights", () =>
        fetchGeoInsights(id, {
          scope:
            input.geoScope === "ad" && input.selectedAdId ? "ad" : "account",
          adId: input.selectedAdId ?? undefined,
          adsetId:
            input.adsetSelect !== ALL ? input.adsetSelect : undefined,
          campaignId: campaignKey ?? undefined,
          ...effective,
        }),
      )
    : Promise.resolve({
        label: "geo_insights",
        status: "skipped" as const,
        message: "Geo deshabilitado en UI cuando no hay alcance de filtro suficiente",
        data: null,
      });

  const outcomes = await Promise.all([
    trap("account_dashboard_previous", () =>
      prevPeriod
        ? fetchAccountDashboard(id, "last_30d", {
            campaignId: campaignKey ?? undefined,
            objectiveMetric: ACCOUNT_DASHBOARD_OBJECTIVE_METRIC,
            dateStart: prevPeriod.dateStart,
            dateStop: prevPeriod.dateStop,
          })
        : Promise.resolve(null),
    ),
    trap("ad_accounts_list", () => fetchAdAccounts()),
    trap("campaigns", () => fetchCampaigns(id)),
    campaignKey
      ? trap("adsets", () => fetchAdsets(id, campaignKey))
      : Promise.resolve({
          label: "adsets",
          status: "skipped" as const,
          message: "Sin campaña seleccionada",
          data: null,
        }),
    trap("ads_list", () =>
      input.adsetSelect !== ALL
        ? fetchAdsList(id, { adsetId: input.adsetSelect })
        : campaignKey
          ? fetchAdsList(id, { campaignId: campaignKey })
          : fetchAdsList(id),
    ),
    trap("ads_performance", () =>
      fetchAdsPerformance(id, rankingOptsBase),
    ),
    trap("placement_insights", () =>
      fetchPlacementInsights(id, placementOpts),
    ),
    geoBlock,
    trap("demographics_insights", () =>
      fetchDemographicsInsights(id, {
        breakdown: input.demographicsBreakdown,
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        adId: input.selectedAdId ?? undefined,
      }),
    ),
    trap("audience_performance", () =>
      fetchAudiencePerformance(id, {
        category: input.audienceCategory,
        minSpend: input.audienceMinSpend,
        limit: 30,
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        adId: input.selectedAdId ?? undefined,
      }),
    ),
    trap("attribution_insights", () =>
      fetchAttributionInsights(id, {
        window: input.attributionWindow,
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        adId: input.selectedAdId ?? undefined,
      }),
    ),
    trap("messaging_insights", () =>
      fetchMessagingInsights(id, {
        level: messagingLevel,
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        adId: input.selectedAdId ?? undefined,
      }),
    ),
    trap("messaging_insights_previous", () =>
      prevPeriod
        ? fetchMessagingInsights(id, {
            level: messagingLevel,
            dateStart: prevPeriod.dateStart,
            dateStop: prevPeriod.dateStop,
            campaignId: campaignKey ?? undefined,
            adsetId:
              input.adsetSelect !== ALL ? input.adsetSelect : undefined,
            adId: input.selectedAdId ?? undefined,
          })
        : Promise.resolve(null),
    ),
    trap("creative_fatigue", () =>
      fetchCreativeFatigue(id, {
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
      }),
    ),
    trap("time_insights_daily", () =>
      fetchTimeInsights(id, {
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        adId: input.selectedAdId ?? undefined,
        timeIncrement: "1",
        attributionWindow: input.attributionWindow,
      }),
    ),
    trap("time_insights_hourly", () =>
      fetchTimeInsights(id, {
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        adId: input.selectedAdId ?? undefined,
        timeIncrement: "hourly",
        attributionWindow: input.attributionWindow,
      }),
    ),
    trap("entity_summary_campaign", () =>
      fetchEntitySummary(id, {
        level: "campaign",
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        objectiveMetric: ACCOUNT_DASHBOARD_OBJECTIVE_METRIC,
        attributionWindow: input.attributionWindow,
      }),
    ),
    trap("entity_summary_adset", () =>
      fetchEntitySummary(id, {
        level: "adset",
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
        objectiveMetric: ACCOUNT_DASHBOARD_OBJECTIVE_METRIC,
        attributionWindow: input.attributionWindow,
      }),
    ),
    trap("adsets_learning_summary", () =>
      fetchAdsetsLearningSummary(id, {
        ...effective,
        campaignId: campaignKey ?? undefined,
        adsetId:
          input.adsetSelect !== ALL ? input.adsetSelect : undefined,
      }),
    ),
    input.selectedAdId
      ? trap("ad_targeting", () => fetchAdTargeting(id, input.selectedAdId!))
      : Promise.resolve({
          label: "ad_targeting",
          status: "skipped" as const,
          message: "Sin anuncio seleccionado",
          data: null,
        }),
  ]);

  const byLabel = Object.fromEntries(
    outcomes.map((o) => [o.label, o]),
  ) as Record<string, TrapOutcome>;

  const parts: Record<string, { status: ModuleStatus; message?: string }> = {
    account_dashboard: {
      status: dashMain.status,
      message: dashMain.message,
    },
    ...Object.fromEntries(
      outcomes.map((t) => [t.label, { status: t.status, message: t.message }] as const),
    ),
  };

  const normPrev = (
    label: keyof typeof byLabel & string,
    noPrevMsg: string,
  ): void => {
    const row = byLabel[label];
    if (!row) return;
    if (row.status === "ok" && row.data === null) {
      row.status = "skipped";
      row.message = row.message ?? noPrevMsg;
      parts[label] = { status: "skipped", message: row.message };
    }
  };

  if (!prevPeriod) {
    normPrev(
      "account_dashboard_previous",
      input.datePreset === "maximum"
        ? "preset maximum omite comparación período anterior"
        : "sin fechas de periodo anterior",
    );
    normPrev(
      "messaging_insights_previous",
      input.datePreset === "maximum"
        ? "preset maximum omite comparación período anterior"
        : "sin fechas de periodo anterior",
    );
  }

  const campaignsData = (
    ((byLabel.campaigns?.data as { data: CampaignRow[] } | null)?.data ??
      null) ?? []
  ) as CampaignRow[];

  const adAccountsData = (
    (byLabel.ad_accounts_list?.data as { data: AdAccount[] } | null)?.data ??
    []
  ) as AdAccount[];

  let adsetsData: AdsetRow[] | null = null;
  if (campaignKey && byLabel.adsets?.status === "ok" && byLabel.adsets?.data != null)
    adsetsData = (
      ((byLabel.adsets.data as { data: AdsetRow[] }).data ?? []) as AdsetRow[]
    ).slice();
  else if (byLabel.adsets?.status === "skipped")
    adsetsData = null;
  else if (byLabel.adsets?.status === "error")
    adsetsData = null;

  return {
    dashboard: dashRow ?? null,
    parts,
    data: {
      account_dashboard_previous: (byLabel.account_dashboard_previous
        ?.data ?? null) as DashboardResponse | null,
      ad_accounts_list: adAccountsData,
      campaigns: campaignsData,
      adsets: adsetsData,
      ads_list: (byLabel.ads_list?.data ?? null) as Awaited<
        ReturnType<typeof fetchAdsList>
      > | null,
      ads_performance: (byLabel.ads_performance?.data ??
        null) as AdsPerformanceResponse | null,
      placement_insights: (byLabel.placement_insights?.data ??
        null) as PlacementInsightsResponse | null,
      geo_insights: (byLabel.geo_insights?.data ?? null) as GeoInsightsResponse | null,
      demographics_insights: (byLabel.demographics_insights?.data ??
        null) as DemographicsResponse | null,
      audience_performance: (byLabel.audience_performance?.data ??
        null) as AudiencePerformanceResponse | null,
      attribution_insights: (byLabel.attribution_insights?.data ??
        null) as AttributionResponse | null,
      messaging_insights: (byLabel.messaging_insights?.data ??
        null) as MessagingResponse | null,
      messaging_insights_previous: (byLabel.messaging_insights_previous
        ?.data ?? null) as MessagingResponse | null,
      creative_fatigue: (byLabel.creative_fatigue?.data ??
        null) as CreativeFatigueResponse | null,
      time_insights_daily: (byLabel.time_insights_daily?.data ??
        null) as TimeInsightsResponse | null,
      time_insights_hourly: (byLabel.time_insights_hourly?.data ??
        null) as TimeInsightsResponse | null,
      entity_summary_campaign: (byLabel.entity_summary_campaign?.data ??
        null) as EntitySummaryResponse | null,
      entity_summary_adset: (byLabel.entity_summary_adset?.data ??
        null) as EntitySummaryResponse | null,
      adsets_learning_summary: (byLabel.adsets_learning_summary?.data ??
        null) as LearningSummaryResponse | null,
      ad_targeting: (byLabel.ad_targeting?.data ?? null) as TargetingResponse | null,
    },
  };
}

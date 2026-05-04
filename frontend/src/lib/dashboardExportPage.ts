import type { collectPageDashboardExport } from "@/lib/pageDashboardExportCollect";

type CollectedPage = Awaited<ReturnType<typeof collectPageDashboardExport>>;

const README = [
  "Snapshot de dashboard de marca/página — mismos fetches que PageDashboardPage (columna principal y competidor si estaba seleccionado).",
  "page_actions permanece fuera porque la UI actual no usa fetchPageActions; coverage.page_actions tiene la nota.",
  "conversion_timeseries_previous sigue los bounds de la serie actual igual que comparisonSeries en pantalla.",
  "data.page_timeseries es el array diario PageTimeseriesRow[]; metadata del fetch en page_timeseries_meta cuando hubo datos.",
] as const;

export interface PageDashboardExportFilters {
  date_preset: string;
  custom_date_start: string | null;
  custom_date_stop: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  geo_metric_selected_ui: string;
  /** Métrica mostrada en el coropleta de provincias (puede diferir del mapa tabla). */
  choropleth_metric_selected_ui?: string;
  demographics_breakdown: "age" | "gender" | "age,gender";
  competitor: { page_id: string; name: string } | null;
}

/** Extrae filas `PageTimeseriesRow[]` aunque un export viejo guarde `{ data: [...] }`. */
export function normalizePageTimeseriesRowsForExport(
  pageTimeseries: unknown,
): Array<{ date_start?: string; date_stop?: string }> {
  if (Array.isArray(pageTimeseries)) {
    return pageTimeseries as Array<{ date_start?: string; date_stop?: string }>;
  }
  if (
    pageTimeseries &&
    typeof pageTimeseries === "object" &&
    "data" in pageTimeseries
  ) {
    const inner = (pageTimeseries as { data?: unknown }).data;
    if (Array.isArray(inner)) {
      return inner as Array<{ date_start?: string; date_stop?: string }>;
    }
  }
  return [];
}

export function buildPageDashboardSnapshot(opts: {
  accountId: string;
  accountName: string | null;
  pageId: string;
  pageName: string | null;
  currency: string | null;
  timezone: string;
  filters: PageDashboardExportFilters;
  collected: CollectedPage;
}) {
  const tsRows = normalizePageTimeseriesRowsForExport(
    opts.collected.data.page_timeseries,
  );
  let since: string | null = opts.filters.custom_date_start;
  let until: string | null = opts.filters.custom_date_stop;
  if (!since || !until) {
    const dates = tsRows
      .map((r) => String(r.date_start ?? r.date_stop ?? "").trim())
      .filter(Boolean)
      .sort();
    if (dates.length > 0) {
      since = since ?? dates[0] ?? null;
      until = until ?? dates[dates.length - 1] ?? null;
    }
  }

  return {
    schema_version: "dashboard_snapshot.page.v1" as const,
    report_metadata: {
      generated_at: new Date().toISOString(),
      account_id: opts.accountId,
      account_name: opts.accountName,
      page_id: opts.pageId,
      page_name: opts.pageName,
      currency: opts.currency,
      timezone: opts.timezone,
      scope: "page_dashboard" as const,
      date_preset: opts.filters.date_preset,
      date_range: { since, until },
    },
    readme: [...README],
    filters: opts.filters,
    coverage: opts.collected.parts,
    data: opts.collected.data,
  };
}

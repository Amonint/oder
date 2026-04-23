import type {
  CampaignRow,
  PageActionsResponse,
  PageDemographicsResponse,
  PageFunnelResponse,
  PageGeoResponse,
  PageInsightsResponse,
  PageTimeseriesResponse,
  TrafficQualityResponse,
} from "@/api/client";

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function buildLlmPageContextReport(input: {
  accountId: string;
  pageId: string;
  datePreset: string;
  dateStart: string | null;
  dateStop: string | null;
  campaignId: string | null;
  insights?: PageInsightsResponse;
  geo?: PageGeoResponse;
  demographics?: PageDemographicsResponse;
  funnel?: PageFunnelResponse;
  timeseries?: PageTimeseriesResponse;
  actions?: PageActionsResponse;
  traffic?: TrafficQualityResponse;
  campaigns: CampaignRow[];
}) {
  const ts = (input.timeseries?.data ?? []).map((r) => ({
    date: String(r.date_start ?? r.date_stop ?? ""),
    spend: toNum(r.spend),
    impressions: toNum(r.impressions),
    reach: toNum(r.reach),
    ctr: toNum(r.ctr),
    cpm: toNum(r.cpm),
    cpc: toNum(r.cpc),
  }));
  const totals = ts.reduce(
    (acc, p) => {
      acc.spend += p.spend;
      acc.impressions += p.impressions;
      acc.reach += p.reach;
      return acc;
    },
    { spend: 0, impressions: 0, reach: 0 },
  );
  return {
    schema_version: "llm_context_report.page.v1",
    report_metadata: {
      generated_at: new Date().toISOString(),
      account_id: input.accountId,
      page_id: input.pageId,
      date_preset: input.datePreset,
      date_range: { since: input.dateStart, until: input.dateStop },
      filters: { campaign_id: input.campaignId },
    },
    page_overview: {
      spend: totals.spend,
      impressions: totals.impressions,
      reach: totals.reach,
      ctr: toNum(input.insights?.data?.[0]?.ctr),
      cpm: totals.impressions > 0 ? (totals.spend * 1000) / totals.impressions : null,
    },
    funnel: input.funnel ?? null,
    traffic_quality: input.traffic ?? null,
    actions: input.actions ?? null,
    timeseries_daily: ts,
    geo: input.geo ?? null,
    demographics: input.demographics ?? null,
    campaigns_available: (input.campaigns ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective ?? null,
      status: c.status ?? null,
    })),
  };
}

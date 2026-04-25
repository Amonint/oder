import type {
  AdDiagnosticsRow,
  AdRow,
  CampaignRow,
  PageActionsResponse,
  PageDemographicsResponse,
  PageFunnelResponse,
  PageGeoResponse,
  PageInsightsResponse,
  PageTimeseriesResponse,
  TrafficQualityResponse,
} from "@/api/client";
import { resolveAdReference } from "@/lib/adReference";

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export function buildLlmPageContextReport(input: {
  accountId: string;
  accountName: string | null;
  pageId: string;
  pageName: string | null;
  datePreset: string;
  dateStart: string | null;
  dateStop: string | null;
  campaignId: string | null;
  campaignName: string | null;
  currency: string | null;
  timezone: string;
  insights?: PageInsightsResponse;
  geo?: PageGeoResponse;
  demographics?: PageDemographicsResponse;
  funnel?: PageFunnelResponse;
  timeseries?: PageTimeseriesResponse;
  actions?: PageActionsResponse;
  traffic?: TrafficQualityResponse;
  campaigns: CampaignRow[];
  ads?: AdRow[];
  adDiagnostics?: AdDiagnosticsRow[];
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
  const ads = input.ads ?? [];
  const diagnostics = input.adDiagnostics ?? [];
  const adsWithReference = ads.filter((ad) => {
    const href = resolveAdReference({
      adId: ad.id,
      adAccountId: input.accountId,
      creative: ad.creative,
      storyId: ad.creative?.effective_object_story_id ?? null,
      storyPermalink: ad.creative?.effective_object_story_permalink ?? null,
    }).url;
    return Boolean(href);
  }).length;

  return {
    schema_version: "llm_context_report.page.v1",
    report_metadata: {
      generated_at: new Date().toISOString(),
      account_id: input.accountId,
      account_name: input.accountName,
      page_id: input.pageId,
      page_name: input.pageName,
      currency: input.currency,
      timezone: input.timezone,
      date_preset: input.datePreset,
      date_range: { since: input.dateStart, until: input.dateStop },
      filters: {
        campaign_id: input.campaignId,
        campaign_name: input.campaignName,
      },
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
    report_updates_applied: {
      ad_reference_links_enabled: true,
      diagnostics_layout_overflow_fixed: true,
      non_technical_copy_refined: true,
      dashboard_palette_standardized: true,
    },
    reference_link_coverage: {
      ads_total: ads.length,
      ads_with_reference: adsWithReference,
      ad_diagnostics_rows_total: diagnostics.length,
      ad_diagnostics_rows_with_reference_estimate: Math.min(diagnostics.length, adsWithReference),
    },
    module_status: {
      crm_dependent_modules_removed: true,
      messaging_module_meta_only: true,
    },
  };
}

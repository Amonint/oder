import type {
  AdPerformanceRow,
  AdRow,
  AdsetRow,
  CampaignRow,
  DashboardResponse,
} from "@/api/client";
import type { DailyInsightPoint } from "@/lib/timeSeriesFromMeta";
import { ctrNumber, enrichAdRankingRows, toFloat } from "@/lib/adRankingDerived";

type ReportInput = {
  accountId: string;
  accountName: string;
  currency: string | null;
  timezone: string;
  datePreset: string;
  dateStart: string | null;
  dateStop: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  dashboard: DashboardResponse | undefined;
  rankingRows: AdPerformanceRow[];
  dailyPoints: DailyInsightPoint[];
  campaigns: CampaignRow[];
  adsets: AdsetRow[];
  ads: AdRow[];
};

type PeriodAggregate = {
  period: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  revenue: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
};

const MIN_IMPRESSIONS_AD = 1000;
const MIN_CLICKS_AD = 30;
const MIN_SPEND_AD = 20;
const MIN_RESULTS_AD = 3;

function safeDiv(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return a / b;
}

function periodFromDate(dateIso: string, mode: "month" | "week" | "day"): string {
  if (mode === "day") return dateIso;
  if (mode === "month") return dateIso.slice(0, 7);
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum);
  return d.toISOString().slice(0, 10);
}

function aggregatePeriods(points: DailyInsightPoint[], mode: "month" | "week" | "day"): PeriodAggregate[] {
  const buckets = new Map<string, Omit<PeriodAggregate, "period" | "ctr" | "cpc" | "cpm" | "cpa" | "roas">>();
  for (const p of points) {
    const period = periodFromDate(p.date, mode);
    const prev = buckets.get(period) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      revenue: 0,
    };
    const clicks = Math.max(0, Math.round((p.impressions * p.ctr) / 100));
    prev.spend += p.spend;
    prev.impressions += p.impressions;
    prev.clicks += clicks;
    prev.results += p.results;
    prev.revenue += p.purchaseValue;
    buckets.set(period, prev);
  }
  return [...buckets.entries()]
    .map(([period, x]) => {
      const ctr = safeDiv(x.clicks * 100, x.impressions);
      const cpc = safeDiv(x.spend, x.clicks);
      const cpm = safeDiv(x.spend * 1000, x.impressions);
      const cpa = safeDiv(x.spend, x.results);
      const roas = safeDiv(x.revenue, x.spend);
      return { period, ...x, ctr, cpc, cpm, cpa, roas };
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}

function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => 1);
  return values.map((v) => (v - min) / (max - min));
}

export function buildLlmContextReport(input: ReportInput) {
  const enriched = enrichAdRankingRows(input.rankingRows);
  const withMetrics = enriched.map((e) => {
    const impressions = toFloat(e.row.impressions);
    const clicks = toFloat(e.row.clicks);
    const isValid =
      impressions >= MIN_IMPRESSIONS_AD &&
      clicks >= MIN_CLICKS_AD &&
      e.spend >= MIN_SPEND_AD &&
      e.results >= MIN_RESULTS_AD;
    return {
      ...e,
      impressions,
      clicks,
      ctr: ctrNumber(e.row),
      isValid,
    };
  });
  const validRows = withMetrics.filter((x) => x.isValid);
  const roasNorm = normalize(validRows.map((x) => x.roas ?? 0));
  const ctrNorm = normalize(validRows.map((x) => x.ctr));
  const resultsNorm = normalize(validRows.map((x) => x.results));
  const cpaNorm = normalize(validRows.map((x) => x.cpa ?? 0));
  const scored = validRows.map((x, idx) => ({
    ...x,
    megaScore: 0.4 * roasNorm[idx] + 0.2 * ctrNorm[idx] + 0.25 * resultsNorm[idx] + 0.15 * (1 - cpaNorm[idx]),
  }));
  scored.sort((a, b) => b.megaScore - a.megaScore);

  const monthAgg = aggregatePeriods(input.dailyPoints, "month")
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
    .slice(0, 6);
  const weekAgg = aggregatePeriods(input.dailyPoints, "week")
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
    .slice(0, 6);
  const dayAgg = aggregatePeriods(input.dailyPoints, "day")
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
    .slice(0, 10);

  const campaignAgg = new Map<string, { name: string; spend: number; results: number; revenue: number; impressions: number; clicks: number }>();
  const adsetAgg = new Map<string, { name: string; spend: number; results: number; revenue: number; impressions: number; clicks: number }>();
  for (const row of withMetrics) {
    const campaignId = String(row.row.campaign_id ?? "");
    const campaignName = String((row.row.campaign_name ?? campaignId) || "sin_campana");
    const c = campaignAgg.get(campaignId) ?? { name: campaignName, spend: 0, results: 0, revenue: 0, impressions: 0, clicks: 0 };
    c.spend += row.spend;
    c.results += row.results;
    c.revenue += row.roas && row.roas > 0 ? row.roas * row.spend : 0;
    c.impressions += row.impressions;
    c.clicks += row.clicks;
    campaignAgg.set(campaignId, c);

    const adsetId = String(row.row.adset_id ?? "");
    const adsetName = String((row.row.adset_name ?? adsetId) || "sin_conjunto");
    const a = adsetAgg.get(adsetId) ?? { name: adsetName, spend: 0, results: 0, revenue: 0, impressions: 0, clicks: 0 };
    a.spend += row.spend;
    a.results += row.results;
    a.revenue += row.roas && row.roas > 0 ? row.roas * row.spend : 0;
    a.impressions += row.impressions;
    a.clicks += row.clicks;
    adsetAgg.set(adsetId, a);
  }

  const campaignRanking = [...campaignAgg.entries()]
    .map(([id, x]) => ({
      entity_id: id,
      entity_name: x.name,
      entity_type: "campaign",
      spend: x.spend,
      results: x.results,
      ctr: safeDiv(x.clicks * 100, x.impressions),
      cpa: safeDiv(x.spend, x.results),
      roas: safeDiv(x.revenue, x.spend),
    }))
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
    .slice(0, 10);
  const adsetRanking = [...adsetAgg.entries()]
    .map(([id, x]) => ({
      entity_id: id,
      entity_name: x.name,
      entity_type: "adset",
      spend: x.spend,
      results: x.results,
      ctr: safeDiv(x.clicks * 100, x.impressions),
      cpa: safeDiv(x.spend, x.results),
      roas: safeDiv(x.revenue, x.spend),
    }))
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))
    .slice(0, 10);

  const spendTotal = withMetrics.reduce((acc, x) => acc + x.spend, 0);
  const top20Spend = [...withMetrics].sort((a, b) => b.spend - a.spend).slice(0, 20).reduce((acc, x) => acc + x.spend, 0);
  const top20Share = safeDiv(top20Spend, spendTotal);

  const adPerfMap = new Map(scored.map((x) => [String(x.row.ad_id ?? ""), x]));
  const topAds = scored.slice(0, 10).map((x, idx) => ({
    rank_position: idx + 1,
    ad_id: x.row.ad_id,
    ad_name: x.row.ad_name,
    campaign_id: x.row.campaign_id ?? null,
    campaign_name: x.row.campaign_name ?? null,
    adset_id: x.row.adset_id ?? null,
    adset_name: x.row.adset_name ?? null,
    spend: x.spend,
    impressions: x.impressions,
    clicks: x.clicks,
    results: x.results,
    cpa: x.cpa,
    roas: x.roas,
    ctr: x.ctr,
    mega_score: Number(x.megaScore.toFixed(6)),
    low_data_confidence: !x.isValid,
  }));
  const bottomAds = [...scored]
    .sort((a, b) => a.megaScore - b.megaScore)
    .slice(0, 10)
    .map((x, idx) => ({
      rank_position: idx + 1,
      ad_id: x.row.ad_id,
      ad_name: x.row.ad_name,
      campaign_id: x.row.campaign_id ?? null,
      campaign_name: x.row.campaign_name ?? null,
      adset_id: x.row.adset_id ?? null,
      adset_name: x.row.adset_name ?? null,
      spend: x.spend,
      impressions: x.impressions,
      clicks: x.clicks,
      results: x.results,
      cpa: x.cpa,
      roas: x.roas,
      ctr: x.ctr,
      mega_score: Number(x.megaScore.toFixed(6)),
      low_data_confidence: !x.isValid,
    }));

  const creativeCatalog = input.ads.map((ad) => {
    const perf = adPerfMap.get(String(ad.id));
    const creative = (ad.creative ?? {}) as Record<string, unknown>;
    return {
      ad_id: ad.id,
      ad_name: ad.name,
      campaign_id: ad.campaign_id,
      adset_id: ad.adset_id,
      creative_id: String(creative.id ?? ""),
      creative_name: String(creative.name ?? ""),
      primary_text: String(creative.body ?? ""),
      headline: String(creative.title ?? ""),
      description: "",
      cta: String(creative.call_to_action_type ?? ""),
      object_story_spec: creative.object_story_spec ?? null,
      spend: perf?.spend ?? null,
      results: perf?.results ?? null,
      cpa: perf?.cpa ?? null,
      roas: perf?.roas ?? null,
    };
  });

  const riskFlags = [
    {
      flag_code: "insufficient_data",
      triggered: withMetrics.length === 0,
      severity: "high",
      evidence: { ranking_rows: withMetrics.length },
    },
    {
      flag_code: "overconcentration",
      triggered: (top20Share ?? 0) > 0.6,
      severity: (top20Share ?? 0) > 0.75 ? "high" : "medium",
      evidence: { spend_top_20_ads_share: top20Share },
    },
  ];

  return {
    schema_version: "llm_context_report.v1",
    report_metadata: {
      generated_at: new Date().toISOString(),
      account_id: input.accountId,
      account_name: input.accountName,
      timezone: input.timezone,
      currency: input.currency ?? "USD",
      date_range: {
        since: input.dateStart,
        until: input.dateStop,
      },
      date_preset: input.datePreset,
      filters: {
        campaign_id: input.campaignId,
        adset_id: input.adsetId,
        ad_id: input.adId,
      },
    },
    global_kpis: {
      spend: toFloat(input.dashboard?.summary?.spend),
      impressions: toFloat(input.dashboard?.summary?.impressions),
      clicks: toFloat(input.dashboard?.summary?.clicks),
      results: toFloat(input.dashboard?.derived?.results),
      revenue_estimated: withMetrics.reduce((acc, x) => acc + ((x.roas ?? 0) * x.spend), 0),
      ctr: toFloat(input.dashboard?.summary?.ctr),
      cpc: safeDiv(toFloat(input.dashboard?.summary?.spend), toFloat(input.dashboard?.summary?.clicks)),
      cpm: toFloat(input.dashboard?.summary?.cpm),
      cpa: input.dashboard?.derived?.cpa ?? null,
      roas: input.dashboard?.derived?.roas ?? null,
    },
    best_months: monthAgg,
    best_weeks: weekAgg,
    best_days: dayAgg,
    mega_ad: topAds[0] ?? null,
    top_ads: topAds,
    bottom_ads: bottomAds,
    top_campaigns: campaignRanking,
    top_adsets: adsetRanking,
    creative_catalog: creativeCatalog,
    comparison_features: {
      spend_top_20_ads_share: top20Share,
      campaigns_count: input.campaigns.length,
      adsets_count: input.adsets.length,
      ads_count: input.ads.length,
      valid_ads_count: validRows.length,
    },
    risk_flags: riskFlags,
    calculation_trace: {
      computed_at: new Date().toISOString(),
      thresholds: {
        min_impressions_ad: MIN_IMPRESSIONS_AD,
        min_clicks_ad: MIN_CLICKS_AD,
        min_spend_ad: MIN_SPEND_AD,
        min_results_ad: MIN_RESULTS_AD,
      },
      row_counts: {
        campaigns: input.campaigns.length,
        adsets: input.adsets.length,
        ads: input.ads.length,
        ranking_rows: input.rankingRows.length,
        daily_points: input.dailyPoints.length,
      },
      excluded_counts: {
        ads_low_data: withMetrics.length - validRows.length,
      },
      notes: [
        "Reporte deterministico construido con agregaciones de dashboard, ads/performance, entities y insights/time",
      ],
    },
  };
}

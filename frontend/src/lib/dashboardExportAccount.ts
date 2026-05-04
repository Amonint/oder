import { ACCOUNT_DASHBOARD_OBJECTIVE_METRIC } from "@/lib/accountDashboardExportConstants";
import type { collectAccountDashboardExport } from "@/lib/accountDashboardExportCollect";
import type {
  AccountDashboardExportCollectInput,
} from "@/lib/accountDashboardExportCollect";

type CollectedAccount = Awaited<ReturnType<typeof collectAccountDashboardExport>>;

export type RankingMetricExport =
  | "impressions"
  | "clicks"
  | "spend"
  | "ctr"
  | "results"
  | "cpa"
  | "roas";

export interface AccountDashboardExportFilters {
  unified_dashboard_ui: boolean;
  objective_metric_used: typeof ACCOUNT_DASHBOARD_OBJECTIVE_METRIC;
  ranking_metric_ui: RankingMetricExport;
  min_spend_ranking_usd_ui: number;
  geo_metric_ui: string;
  funnel_level_ui: "account" | "campaign" | "ad";
  date_preset: string;
  custom_date_start: string | null;
  custom_date_stop: string | null;
  resolved_date_range: {
    since: string | null;
    until: string | null;
  };
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  attribution_window: AccountDashboardExportCollectInput["attributionWindow"];
  performance_granularity: "period" | "daily";
  demographics_breakdown: AccountDashboardExportCollectInput["demographicsBreakdown"];
  audience_category: AccountDashboardExportCollectInput["audienceCategory"];
  audience_min_spend: number;
  geo_scope: "account" | "ad";
}

const README = [
  "Snapshot de dashboard de cuenta: mismos endpoints que cargan Tabs Resumen/Audiencia/Comercial/Avanzado/Creatividades.",
  "coverage indica por módulo ok | error | skipped (equivale a comportamiento cuando la UI no dispara ese fetch).",
  "account_dashboard_previous y messaging_insights_previous usan el periodo simétrico anterior salvo preset maximum.",
] as const;

export function buildAccountDashboardSnapshot(opts: {
  accountId: string;
  accountName: string | null;
  currency: string | null;
  timezone: string;
  filters: AccountDashboardExportFilters;
  collected: CollectedAccount;
}) {
  const { collected, filters, accountId, accountName, currency, timezone } = opts;

  return {
    schema_version: "dashboard_snapshot.account.v1" as const,
    report_metadata: {
      generated_at: new Date().toISOString(),
      account_id: accountId,
      account_name: accountName,
      currency: currency ?? "USD",
      timezone,
      scope: "ad_account_dashboard" as const,
      date_preset: filters.date_preset,
      date_range: filters.resolved_date_range,
    },
    readme: [...README],
    filters,
    coverage: collected.parts,
    data: {
      account_dashboard: collected.dashboard ?? null,
      ...collected.data,
    },
  };
}

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import AdCreatividadEfficiencyBarCharts from "@/components/AdCreatividadEfficiencyBarCharts";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  fetchAccountDashboard,
  fetchAdAccounts,
  fetchAdsList,
  fetchAdsPerformance,
  fetchAdsets,
  fetchCampaigns,
  fetchGeoInsights,
  fetchPlacementInsights,
  fetchAdTargeting,
  fetchDemographicsInsights,
  fetchAudiencePerformance,
  fetchAttributionInsights,
  fetchMessagingInsights,
  fetchCreativeFatigue,
  fetchTimeInsights,
  getMetaAccessToken,
  type AdPerformanceRow,
} from "@/api/client";
import DemographicsPanel from "@/components/DemographicsPanel";
import AudiencePerformancePanel from "@/components/AudiencePerformancePanel";
import AttributionWindowPanel from "@/components/AttributionWindowPanel";
import LeadsPanel from "@/components/LeadsPanel";
import CreativeFatigueTable from "@/components/CreativeFatigueTable";
import CreativeSaturationScatter from "@/components/CreativeSaturationScatter";
import FunnelLevelTable, { type FunnelLevelRow } from "@/components/FunnelLevelTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import GeoMap, { compareGeoInsightRowsForMetric, type GeoMapMetric } from "@/components/GeoMap";
import PlacementEfficiencyBarChart from "@/components/PlacementEfficiencyBarChart";
import TargetingPanel from "@/components/TargetingPanel";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DASHBOARD_KPI_LABELS,
  DASHBOARD_KPI_TOOLTIPS,
  RANKING_METRIC_LABELS,
  labelForMetaActionType,
  shortActionTypeLabel,
} from "@/lib/metaInsightsLabels";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import { groupActionsByCategory } from "@/lib/actionCategories";
import GlobalFilterBar from "@/components/dashboard-unificado/GlobalFilterBar";
import ExecutiveSummary from "@/components/dashboard-unificado/ExecutiveSummary";
import CampaignRankingTable from "@/components/dashboard-unificado/CampaignRankingTable";
import AdsetDiagnosticView from "@/components/dashboard-unificado/AdsetDiagnosticView";
import CreativePerformanceView from "@/components/dashboard-unificado/CreativePerformanceView";
import InsightsDecisionPanel from "@/components/dashboard-unificado/InsightsDecisionPanel";
import AccountTimeInsightsSection from "@/components/AccountTimeInsightsSection";
import PeriodComparisonCard from "@/components/PeriodComparisonCard";
import SpendSparkline from "@/components/SpendSparkline";
import { buildDashboardInsights } from "@/lib/dashboardDiagnostics";
import { parseTimeInsightRows } from "@/lib/timeSeriesFromMeta";
import {
  barColorAt,
  contrastingForeground,
  dashboardChartColor,
  pickDashboardColor,
} from "@/lib/dashboardColors";
import { ctrNumber, enrichAdRankingRows, toFloat } from "@/lib/adRankingDerived";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DashboardContextStrip from "@/components/DashboardContextStrip";
import {
  computePrevPeriod,
  unionCrossesMetaAttributionChange,
  META_ATTRIBUTION_CHANGE_ISO,
  deltaPercent,
} from "@/lib/periodCompare";
import { attributionWindowLabelEs } from "@/lib/formatDashboardContext";
import { buildLlmContextReport } from "@/lib/llmContextReport";

const ALL = "__all__";

type AdsAttributionWindow = NonNullable<
  Parameters<typeof fetchAdsPerformance>[1]["attributionWindow"]
>;

type RankingMetric =
  | "impressions"
  | "clicks"
  | "spend"
  | "ctr"
  | "results"
  | "cpa"
  | "roas";

const GEO_METRIC_LABEL_ES: Record<GeoMapMetric, string> = {
  impressions: "impresiones",
  clicks: "clics",
  spend: "gasto",
  reach: "alcance",
  cpa: "CPA",
  results: "resultados",
};

const DATE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
  { value: "maximum", label: "Máximo disponible" },
] as const;
const OBJECTIVE_METRIC = "messaging_conversation_started" as const;

function objectiveMetricLabel(metric: string | null | undefined): string {
  switch (metric) {
    case "messaging_first_reply":
      return "Primeras respuestas";
    case "lead":
      return "Leads";
    case "messaging_conversation_started":
    default:
      return "Conversaciones iniciadas";
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toLocaleString("es", { maximumFractionDigits: 2 });
}

const EMPTY_PUBLICATION_RE = /^(?:publicaci[oó]n:\s*)?["“”'`]\s*["“”'`]$/i;

function withEntityFallback(name: string | null | undefined, id: string | null | undefined, kind: "Campaña" | "Conjunto" | "Anuncio"): string {
  const raw = String(name ?? "").trim();
  const safeId = String(id ?? "").trim();
  if (raw && !EMPTY_PUBLICATION_RE.test(raw)) return raw;
  if (safeId) return `${kind} sin nombre (ID: ${safeId})`;
  return `${kind} sin nombre`;
}

function isInferredSource(source: string | null | undefined): boolean {
  return Boolean(source && source !== "meta_ad_name");
}

function inferredSourceHint(source: string | null | undefined): string {
  switch (source) {
    case "creative_name":
      return "Nombre inferido desde el nombre del creative (Meta no devolvió nombre de anuncio).";
    case "story_id":
      return "Nombre inferido desde el ID de publicación promocionada (story_id).";
    case "ad_id_fallback":
      return "Nombre inferido con fallback por ID del anuncio.";
    default:
      return "Nombre inferido por datos incompletos de Meta.";
  }
}

interface ActionDistributionSectionProps {
  adRows: AdPerformanceRow[];
  availableTypes: string[];
}

function ActionDistributionSection({ adRows, availableTypes }: ActionDistributionSectionProps) {
  const [selectedActionType, setSelectedActionType] = useState<string>(availableTypes[0] ?? "");

  type AdActionRow = {
    ad_id: string;
    ad_name: string;
    campaign_name: string;
    ad_inferred: boolean;
    ad_source: string | undefined;
    campaign_inferred: boolean;
    volume: number;
    spend: number;
    /** cost_per_action_type de Meta para el tipo seleccionado (referencia). */
    cost: number | null;
  };

  const byAd: AdActionRow[] = adRows
    .map((row) => {
      const vol = (row.actions ?? [])
        .filter((a) => String(a.action_type) === selectedActionType)
        .reduce((s, a) => s + Number(a.value ?? 0), 0);
      const cost = (row.cost_per_action_type ?? [])
        .find((a) => String(a.action_type) === selectedActionType);
      const spend = parseFloat(String(row.spend ?? "0")) || 0;
      const campaignRaw = String(row.campaign_name ?? "").trim();
      return {
        ad_id: row.ad_id,
        ad_name: withEntityFallback(row.ad_name ?? null, String(row.ad_id ?? ""), "Anuncio"),
        campaign_name: withEntityFallback(
          row.campaign_name ?? null,
          String(row.campaign_id ?? ""),
          "Campaña",
        ),
        ad_inferred: isInferredSource(row.ad_label_source),
        ad_source: row.ad_label_source,
        campaign_inferred: !campaignRaw || EMPTY_PUBLICATION_RE.test(campaignRaw),
        volume: vol,
        spend,
        cost: cost ? Number(cost.value) : null,
      };
    })
    .filter((r) => r.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  const byCampaign = Object.values(
    byAd.reduce<Record<string, { campaign_name: string; volume: number; spend: number; inferred: boolean }>>((acc, row) => {
      if (!acc[row.campaign_name]) {
        acc[row.campaign_name] = { campaign_name: row.campaign_name, volume: 0, spend: 0, inferred: false };
      }
      const entry = acc[row.campaign_name];
      entry.volume += row.volume;
      entry.spend += row.spend;
      entry.inferred = entry.inferred || row.campaign_inferred;
      return acc;
    }, {}),
  ).sort((a, b) => b.volume - a.volume);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-foreground font-semibold">Distribución de acciones</h3>
        <Select value={selectedActionType} onValueChange={setSelectedActionType}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Tipo de acción" />
          </SelectTrigger>
          <SelectContent>
            {availableTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {labelForMetaActionType(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Por anuncio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por anuncio (top 10)</CardTitle>
            <CardDescription className="text-xs">
              Columna derecha: gasto del anuncio en el periodo ÷ volumen del tipo de acción seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {byAd.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">Sin datos para este tipo de acción.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anuncio</TableHead>
                      <TableHead className="text-right">Volumen</TableHead>
                      <TableHead className="text-right">Gasto ÷ volumen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byAd.map((row) => (
                      <TableRow key={row.ad_id}>
                        <TableCell>
                          <p className="truncate text-sm font-medium max-w-[220px] inline-flex items-center gap-2">
                            <span className="truncate">{row.ad_name}</span>
                            {row.ad_inferred ? (
                              <span
                                className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                                title={inferredSourceHint(row.ad_source)}
                              >
                                Nombre inferido
                              </span>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground text-xs">{row.campaign_name}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.volume.toLocaleString("es")}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.volume > 0
                            ? `$${(row.spend / row.volume).toFixed(2)}`
                            : row.cost !== null
                              ? `$${row.cost.toFixed(2)}`
                              : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por campaña */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por campaña</CardTitle>
            <CardDescription className="text-xs">
              Coste efectivo = gasto de los anuncios del top ÷ volumen del tipo de acción elegido (no es el CPA
              agregado del resumen).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {byCampaign.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">Sin datos para este tipo de acción.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaña</TableHead>
                      <TableHead className="text-right">Volumen</TableHead>
                      <TableHead className="text-right">Gasto ÷ volumen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCampaign.map((row) => (
                      <TableRow key={row.campaign_name}>
                        <TableCell className="text-sm font-medium max-w-[240px]">
                          <span className="inline-flex items-center gap-2 max-w-full">
                            <span className="truncate">{row.campaign_name}</span>
                            {row.inferred ? (
                              <span className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                                Nombre inferido
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.volume.toLocaleString("es")}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.volume > 0 ? `$${(row.spend / row.volume).toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [datePreset, setDatePreset] = useState<string>("last_30d");
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("impressions");
  const [minSpendRankingUsd, setMinSpendRankingUsd] = useState(25);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [campaignSelect, setCampaignSelect] = useState<string>(ALL);
  const [adsetSelect, setAdsetSelect] = useState<string>(ALL);
  const [geoScope, setGeoScope] = useState<"account" | "ad">("account");
  const [funnelLevel, setFunnelLevel] = useState<"account" | "campaign" | "ad">("account");
  const [geoMetric, setGeoMetric] = useState<GeoMapMetric>("impressions");
  const [mainTab, setMainTab] = useState<string>("resumen");
  const [perfGranularity, setPerfGranularity] = useState<"period" | "daily">("period");
  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateStart, setCustomDateStart] = useState<string | null>(null);
  const [customDateStop, setCustomDateStop] = useState<string | null>(null);
  const [demographicsBreakdown, setDemographicsBreakdown] = useState<"age" | "gender" | "age,gender">("age");
  const [audienceCategory, setAudienceCategory] = useState<
    "all" | "interests" | "behaviors" | "education_majors" | "family_statuses" | "life_events" | "work_positions"
  >("all");
  const [audienceMinSpend, setAudienceMinSpend] = useState<number>(10);
  const [attributionWindow, setAttributionWindow] = useState<AdsAttributionWindow>("click_7d");
  const [isExportingReport, setIsExportingReport] = useState(false);
  const useUnifiedDashboard = String(import.meta.env.VITE_UNIFIED_DASHBOARD ?? "").toLowerCase() === "true";
  const hasToken = Boolean(getMetaAccessToken());
  const id = accountId ? decodeURIComponent(accountId) : "";
  const campaignKey = campaignSelect !== ALL ? campaignSelect : null;

  const effectiveDateParams = useMemo(() => {
    if (datePreset === "today") {
      const today = new Date().toISOString().slice(0, 10);
      return { dateStart: today, dateStop: today };
    }
    if (datePreset === "custom" && customDateStart && customDateStop) {
      return { dateStart: customDateStart, dateStop: customDateStop };
    }
    return { datePreset };
  }, [datePreset, customDateStart, customDateStop]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", id, datePreset, campaignKey, customDateStart, customDateStop],
    queryFn: () =>
      fetchAccountDashboard(id, datePreset, {
        campaignId: campaignKey ?? undefined,
        objectiveMetric: OBJECTIVE_METRIC,
        ...effectiveDateParams,
      }),
    enabled: hasToken && Boolean(id),
    staleTime: 5 * 60 * 1000,
  });

  const prevPeriod = useMemo(() => {
    if (!data?.date_start || !data?.date_stop) return null;
    // Con «maximum» el rango efectivo es muy largo; el periodo simétrico anterior suele quedar sin datos en Meta
    // (ceros / vacío) y confunde más que ayuda.
    if (datePreset === "maximum") return null;
    return computePrevPeriod(data.date_start, data.date_stop);
  }, [data?.date_start, data?.date_stop, datePreset]);

  const prevDashboardQuery = useQuery({
    queryKey: ["dashboard-prev", id, prevPeriod?.dateStart, prevPeriod?.dateStop, campaignKey],
    queryFn: () =>
      fetchAccountDashboard(id, "last_30d", {
        campaignId: campaignKey ?? undefined,
        objectiveMetric: OBJECTIVE_METRIC,
        dateStart: prevPeriod!.dateStart,
        dateStop: prevPeriod!.dateStop,
      }),
    enabled: hasToken && Boolean(id) && Boolean(prevPeriod),
    staleTime: 5 * 60 * 1000,
  });

  const showAttributionDiscontinuity = useMemo(() => {
    if (!data?.date_start || !data?.date_stop || !prevPeriod) return false;
    return unionCrossesMetaAttributionChange(
      data.date_start,
      data.date_stop,
      prevPeriod.dateStart,
      prevPeriod.dateStop,
    );
  }, [data?.date_start, data?.date_stop, prevPeriod]);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAdAccounts,
    enabled: hasToken && Boolean(id),
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaigns(id),
    enabled: hasToken && Boolean(id),
  });

  const adsetsQuery = useQuery({
    queryKey: ["adsets", id, campaignKey],
    queryFn: () => fetchAdsets(id, campaignKey!),
    enabled: hasToken && Boolean(id) && Boolean(campaignKey),
  });

  const adsListQuery = useQuery({
    queryKey: ["ads-list", id, campaignKey, adsetSelect],
    queryFn: () => {
      if (adsetSelect !== ALL) return fetchAdsList(id, { adsetId: adsetSelect });
      if (campaignKey) return fetchAdsList(id, { campaignId: campaignKey });
      return fetchAdsList(id);
    },
    enabled: hasToken && Boolean(id),
  });

  const rankingQuery = useQuery({
    queryKey: [
      "ads-performance",
      id,
      datePreset,
      customDateStart,
      customDateStop,
      perfGranularity,
      campaignKey,
      adsetSelect,
      selectedAdId,
      attributionWindow,
    ],
    queryFn: () => {
      const opts: Parameters<typeof fetchAdsPerformance>[1] = { ...effectiveDateParams };
      opts.objectiveMetric = OBJECTIVE_METRIC;
      opts.attributionWindow = attributionWindow;
      if (perfGranularity === "daily") opts.timeIncrement = 1;
      if (selectedAdId) {
        opts.adId = selectedAdId;
      } else if (adsetSelect !== ALL) {
        opts.adsetId = adsetSelect;
      } else if (campaignKey) {
        opts.campaignId = campaignKey;
      }
      return fetchAdsPerformance(id, opts);
    },
    enabled: hasToken && Boolean(id),
  });

  const placementQuery = useQuery({
    queryKey: [
      "placement-insights",
      id,
      datePreset,
      customDateStart,
      customDateStop,
      campaignKey,
      adsetSelect,
      selectedAdId,
    ],
    queryFn: () => {
      const opts: Parameters<typeof fetchPlacementInsights>[1] = { ...effectiveDateParams };
      if (selectedAdId) {
        opts.adId = selectedAdId;
      } else if (adsetSelect !== ALL) {
        opts.adsetId = adsetSelect;
      } else if (campaignKey) {
        opts.campaignId = campaignKey;
      }
      return fetchPlacementInsights(id, opts);
    },
    enabled: hasToken && Boolean(id) && mainTab === "audiencia",
  });

  const accountLabel =
    accountsQuery.data?.data.find((a) => a.id === id)?.name ?? id;

  const geoQuery = useQuery({
    queryKey: [
      "geo-insights",
      id,
      geoScope,
      selectedAdId,
      datePreset,
      customDateStart,
      customDateStop,
      campaignKey,
    ],
    queryFn: () =>
      fetchGeoInsights(id, {
        scope: geoScope === "ad" && selectedAdId ? "ad" : "account",
        adId: selectedAdId ?? undefined,
        adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
        campaignId: campaignKey ?? undefined,
        ...effectiveDateParams,
      }),
    enabled:
      hasToken &&
      Boolean(id) &&
      (geoScope === "account" || Boolean(selectedAdId) || adsetSelect !== ALL || Boolean(campaignKey)),
  });

  const targetingQuery = useQuery({
    queryKey: ["targeting", id, selectedAdId],
    queryFn: () => fetchAdTargeting(id, selectedAdId!),
    enabled: hasToken && Boolean(id) && Boolean(selectedAdId),
  });

  const demographicsQuery = useQuery({
    queryKey: [
      "demographics",
      id,
      demographicsBreakdown,
      datePreset,
      campaignKey,
      adsetSelect,
      selectedAdId,
      customDateStart,
      customDateStop,
    ],
    queryFn: () => fetchDemographicsInsights(id, {
      breakdown: demographicsBreakdown,
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
      adId: selectedAdId ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "audiencia",
    staleTime: 5 * 60 * 1000,
  });

  const audiencePerformanceQuery = useQuery({
    queryKey: [
      "audience-performance",
      id,
      audienceCategory,
      audienceMinSpend,
      datePreset,
      campaignKey,
      adsetSelect,
      selectedAdId,
      customDateStart,
      customDateStop,
    ],
    queryFn: () =>
      fetchAudiencePerformance(id, {
        category: audienceCategory,
        minSpend: audienceMinSpend,
        limit: 30,
        ...effectiveDateParams,
        campaignId: campaignKey ?? undefined,
        adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
        adId: selectedAdId ?? undefined,
      }),
    enabled: hasToken && Boolean(id) && mainTab === "audiencia",
    staleTime: 5 * 60 * 1000,
  });

  const attributionQuery = useQuery({
    queryKey: [
      "attribution",
      id,
      attributionWindow,
      datePreset,
      campaignKey,
      adsetSelect,
      selectedAdId,
      customDateStart,
      customDateStop,
    ],
    queryFn: () => fetchAttributionInsights(id, {
      window: attributionWindow,
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
      adId: selectedAdId ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "avanzado",
    staleTime: 5 * 60 * 1000,
  });

  const leadsQuery = useQuery({
    queryKey: ["messaging", id, datePreset, campaignKey, adsetSelect, selectedAdId, customDateStart, customDateStop],
    queryFn: () => fetchMessagingInsights(id, {
      level: selectedAdId ? "ad" : adsetSelect !== ALL ? "ad" : "campaign",
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
      adId: selectedAdId ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "comercial",
    staleTime: 5 * 60 * 1000,
  });

  const leadsPrevQuery = useQuery({
    queryKey: [
      "messaging-prev",
      id,
      prevPeriod?.dateStart,
      prevPeriod?.dateStop,
      campaignKey,
      adsetSelect,
      selectedAdId,
    ],
    queryFn: () => fetchMessagingInsights(id, {
      level: selectedAdId ? "ad" : adsetSelect !== ALL ? "ad" : "campaign",
      dateStart: prevPeriod!.dateStart,
      dateStop: prevPeriod!.dateStop,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
      adId: selectedAdId ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "comercial" && Boolean(prevPeriod),
    staleTime: 5 * 60 * 1000,
  });


  const fatigueQuery = useQuery({
    queryKey: ["fatigue", id, datePreset, campaignKey, adsetSelect, customDateStart, customDateStop],
    queryFn: () => fetchCreativeFatigue(id, {
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "creatividades",
    staleTime: 5 * 60 * 1000,
  });


  const timeInsightsQuery = useQuery({
    queryKey: [
      "time-insights",
      id,
      mainTab,
      datePreset,
      customDateStart,
      customDateStop,
      campaignKey,
      adsetSelect,
      selectedAdId,
      attributionWindow,
    ],
    queryFn: () =>
      fetchTimeInsights(id, {
        ...effectiveDateParams,
        campaignId: campaignKey ?? undefined,
        adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
        adId: selectedAdId ?? undefined,
        timeIncrement: "1",
        attributionWindow,
      }),
    enabled: hasToken && Boolean(id) && mainTab === "resumen",
    staleTime: 5 * 60 * 1000,
  });

  const dailyTimePoints = useMemo(
    () => parseTimeInsightRows((timeInsightsQuery.data?.data ?? []) as Record<string, unknown>[]),
    [timeInsightsQuery.data],
  );

  const datePresetLabelEs = useMemo(
    () => DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? datePreset,
    [datePreset],
  );

  function handleDatePresetChange(value: string) {
    if (value === "custom") {
      setShowDateModal(true);
    } else {
      setDatePreset(value);
      setCustomDateStart(null);
      setCustomDateStop(null);
    }
  }

  function handleDownloadLlmReport() {
    try {
      setIsExportingReport(true);
      const report = buildLlmContextReport({
        accountId: id,
        accountName: accountLabel,
        currency: accountsQuery.data?.data.find((a) => a.id === id)?.currency ?? null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        datePreset,
        dateStart: data?.date_start ?? (datePreset === "custom" ? customDateStart : null),
        dateStop: data?.date_stop ?? (datePreset === "custom" ? customDateStop : null),
        campaignId: campaignKey,
        adsetId: adsetSelect !== ALL ? adsetSelect : null,
        adId: selectedAdId,
        dashboard: data,
        rankingRows: rankingQuery.data?.data ?? [],
        dailyPoints: dailyTimePoints,
        campaigns: campaignsQuery.data?.data ?? [],
        adsets: adsetsQuery.data?.data ?? [],
        ads: adsListQuery.data?.data ?? [],
      });
      const filename = `llm_context_report_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingReport(false);
    }
  }

  const campaignNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaignsQuery.data?.data ?? []) {
      m.set(c.id, withEntityFallback(c.name, c.id, "Campaña"));
    }
    return m;
  }, [campaignsQuery.data]);

  const adsetNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of adsetsQuery.data?.data ?? []) {
      m.set(a.id, withEntityFallback(a.name, a.id, "Conjunto"));
    }
    return m;
  }, [adsetsQuery.data]);

  const adNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of adsListQuery.data?.data ?? []) {
      m.set(a.id, withEntityFallback(a.name, a.id, "Anuncio"));
    }
    return m;
  }, [adsListQuery.data]);

  const adNameSourceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of adsListQuery.data?.data ?? []) {
      if (a.name_source) m.set(a.id, a.name_source);
    }
    return m;
  }, [adsListQuery.data]);

  const selectedAdLabel = selectedAdId
    ? (adNameMap.get(selectedAdId) ?? selectedAdId.slice(0, 12))
    : null;
  const selectedAdIsInferred = selectedAdId
    ? isInferredSource(adNameSourceMap.get(selectedAdId))
    : false;
  const selectedAdSource = selectedAdId ? adNameSourceMap.get(selectedAdId) : undefined;

  const categoryChartData = useMemo(() => {
    const actions = data?.actions ?? [];
    return groupActionsByCategory(
      actions.map((a) => ({
        action_type: String(a.action_type),
        value: Number(a.value ?? 0),
      })),
    ).map((r) => ({ label: r.label, value: r.value }));
  }, [data?.actions]);

  const topActionsChartData = useMemo(() => {
    const actions = data?.actions ?? [];
    return [...actions]
      .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
      .slice(0, 8)
      .map((a) => ({
        key: String(a.action_type),
        label: shortActionTypeLabel(String(a.action_type), 26),
        value: Number(a.value ?? 0),
      }));
  }, [data?.actions]);

  const costChartData = useMemo(() => {
    const costs = data?.cost_per_action_type ?? [];
    return [...costs]
      .filter((c) => Number(c.value ?? 0) > 0)
      .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
      .slice(0, 8)
      .map((c) => ({
        key: String(c.action_type),
        label: shortActionTypeLabel(String(c.action_type), 26),
        value: Number(c.value ?? 0),
      }));
  }, [data?.cost_per_action_type]);

  const chartConfigCategory = {
    value: {
      label: "Eventos",
      color: dashboardChartColor(0),
    },
  } satisfies ChartConfig;

  const chartConfigTop = {
    value: {
      label: "Cantidad",
      color: dashboardChartColor(1),
    },
  } satisfies ChartConfig;

  const chartConfigCost = {
    value: {
      label: "Coste medio",
      color: dashboardChartColor(2),
    },
  } satisfies ChartConfig;

  const { rankingRowsEnriched, rankingChartData } = useMemo(() => {
    const enriched = enrichAdRankingRows(rankingQuery.data?.data ?? []);
    const minSpend = minSpendRankingUsd;
    type Pt = { label: string; value: number; id: string };

    if (rankingMetric === "cpa") {
      const chartData: Pt[] = enriched
        .filter((e) => e.spend >= minSpend && e.cpa != null && e.cpa > 0)
        .sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))
        .slice(0, 10)
        .map((e) => ({
          label: e.label,
          value: e.cpa!,
          id: String(e.row.ad_id ?? e.label),
        }));
      return { rankingRowsEnriched: enriched, rankingChartData: chartData };
    }

    if (rankingMetric === "roas") {
      const chartData: Pt[] = enriched
        .filter((e) => e.spend >= minSpend && e.roas != null && e.roas > 0)
        .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
        .slice(0, 10)
        .map((e) => ({
          label: e.label,
          value: e.roas!,
          id: String(e.row.ad_id ?? e.label),
        }));
      return { rankingRowsEnriched: enriched, rankingChartData: chartData };
    }

    const chartData: Pt[] = enriched
      .map((e) => {
        let value = 0;
        if (rankingMetric === "impressions") value = toFloat(e.row.impressions);
        else if (rankingMetric === "clicks") value = toFloat(e.row.clicks);
        else if (rankingMetric === "spend") value = e.spend;
        else if (rankingMetric === "ctr") value = ctrNumber(e.row);
        else value = e.results;
        return {
          label: e.label,
          value,
          id: String(e.row.ad_id ?? e.label),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { rankingRowsEnriched: enriched, rankingChartData: chartData };
  }, [rankingQuery.data, rankingMetric, minSpendRankingUsd]);

  const placementSpendByPlatform = useMemo(() => {
    const rows = placementQuery.data?.data ?? [];
    const m = new Map<string, number>();
    for (const r of rows) {
      const plat = String(r.publisher_platform ?? "—");
      const pos = String(r.platform_position ?? "—");
      const k = `${plat} · ${pos}`;
      m.set(k, (m.get(k) ?? 0) + Number(r.spend ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [placementQuery.data]);

  const rankingChartConfig = {
    value: {
      label: RANKING_METRIC_LABELS[rankingMetric] ?? rankingMetric,
      color: dashboardChartColor(3),
    },
  } satisfies ChartConfig;

  const unifiedInsights = useMemo(() => {
    const curr = data?.summary ?? {};
    const prev = prevDashboardQuery.data?.summary ?? {};
    const cpmDelta = prev.cpm ? deltaPercent(Number(curr.cpm ?? 0), Number(prev.cpm)) : null;
    const ctrDelta = prev.ctr ? deltaPercent(Number(curr.ctr ?? 0), Number(prev.ctr)) : null;
    const currConv = Number(data?.derived?.results ?? 0);
    const prevConv = Number(prevDashboardQuery.data?.derived?.results ?? 0);
    const conversionDelta = prevConv > 0 ? deltaPercent(currConv, prevConv) : null;
    return buildDashboardInsights({
      cpmDelta,
      ctrDelta,
      conversionDelta,
      frequency: Number(curr.frequency ?? 0),
    });
  }, [data, prevDashboardQuery.data]);

  if (!hasToken) {
    return <Navigate to="/" replace />;
  }

  if (!id) {
    return <Navigate to="/accounts" replace />;
  }

  return (
    <div className="w-full space-y-6 py-6">
      <DateRangePickerModal
        open={showDateModal}
        onClose={() => setShowDateModal(false)}
        onApply={(start, end) => {
          setCustomDateStart(start);
          setCustomDateStop(end);
          setDatePreset("custom");
          setShowDateModal(false);
        }}
        initialStart={customDateStart ?? undefined}
        initialEnd={customDateStop ?? undefined}
      />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Inicio</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/accounts">Cuentas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[200px] truncate font-mono text-xs">
              {id}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Rendimiento de Ads (Cuenta)
          </h1>
          <p className="text-muted-foreground font-mono text-sm" title={id}>
            {accountLabel}
          </p>
          {data?.date_start && data?.date_stop ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Periodo reportado: {data.date_start} → {data.date_stop}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Periodo</span>
          <Select value={datePreset} onValueChange={handleDatePresetChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue>
                {datePreset === "custom" && customDateStart && customDateStop
                  ? `${customDateStart} → ${customDateStop}`
                  : DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? datePreset}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">Rendimiento anuncios</span>
          <Select
            value={perfGranularity}
            onValueChange={(v) => setPerfGranularity(v as "period" | "daily")}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="period">Periodo agregado</SelectItem>
              <SelectItem value="daily">Diario (suma por anuncio)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground">
              Cuenta
            </span>
            <Button variant="ghost" size="sm" className="rounded-none border-l h-auto px-3" asChild>
              <Link to={`/accounts/${encodeURIComponent(id)}/pages`}>Página</Link>
            </Button>
          </div>
          <Button variant="outline" asChild>
            <Link to="/accounts">Volver a cuentas</Link>
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleDownloadLlmReport}
            disabled={isExportingReport || isLoading || rankingQuery.isLoading}
          >
            {isExportingReport ? "Generando..." : "Descargar reporte"}
          </Button>
        </div>
      </div>

      <Alert>
        <AlertTitle>Estás viendo: Cuenta</AlertTitle>
        <AlertDescription>
          Aquí ves el rendimiento de tus anuncios de toda la cuenta.
          Si quieres revisar una marca o fanpage puntual, cambia a <strong>Página</strong>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Explorar por estructura</CardTitle>
          <CardDescription>
            Primero elige cuenta (ya estás en{" "}
            <span className="font-medium text-foreground">{accountLabel}</span>
            ). La <strong>campaña</strong> filtra el <strong>resumen</strong> (KPIs
            y gráficos de acciones), el ranking, plataformas y mensajería; conjunto
            y anuncio afinan más.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs">Campaña</span>
              <Select
                value={campaignSelect}
                onValueChange={(v) => {
                  setCampaignSelect(v);
                  setAdsetSelect(ALL);
                  setSelectedAdId(null);
                }}
                disabled={campaignsQuery.isLoading}
              >
                <SelectTrigger className="w-[min(100vw-2rem,280px)]">
                  <SelectValue placeholder="Cargando…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas las campañas</SelectItem>
                  {(campaignsQuery.data?.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {withEntityFallback(c.name, c.id, "Campaña")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs">Conjunto</span>
              <Select
                value={adsetSelect}
                onValueChange={(v) => {
                  setAdsetSelect(v);
                  setSelectedAdId(null);
                }}
                disabled={!campaignKey || adsetsQuery.isLoading}
              >
                <SelectTrigger className="w-[min(100vw-2rem,280px)]">
                  <SelectValue
                    placeholder={
                      campaignKey ? "Todos los conjuntos" : "Elige campaña"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los conjuntos</SelectItem>
                  {(adsetsQuery.data?.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {withEntityFallback(s.name, s.id, "Conjunto")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs">Anuncio</span>
              <Select
                value={selectedAdId ?? ALL}
                onValueChange={(v) => setSelectedAdId(v === ALL ? null : v)}
                disabled={!campaignKey || adsListQuery.isLoading}
              >
                <SelectTrigger className="w-[min(100vw-2rem,280px)]">
                  <SelectValue
                    placeholder={
                      campaignKey ? "Todos los anuncios" : "Elige campaña"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos los anuncios</SelectItem>
                  {(adsListQuery.data?.data ?? []).map((ad) => (
                    <SelectItem key={ad.id} value={ad.id}>
                      <span className="inline-flex items-center gap-2">
                        <span>{withEntityFallback(ad.name, ad.id, "Anuncio")}</span>
                        {isInferredSource(ad.name_source) ? (
                          <span
                            className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                            title={inferredSourceHint(ad.name_source)}
                          >
                            Nombre inferido
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">Filtros activos:</span>
            <Badge variant="secondary" className="gap-1 pr-1 font-normal">
              Cuenta: {accountLabel}
            </Badge>
            {campaignKey ? (
              <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                Campaña:{" "}
                {campaignNameMap.get(campaignKey) ?? campaignKey.slice(0, 12)}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label="Quitar campaña"
                  onClick={() => {
                    setCampaignSelect(ALL);
                    setAdsetSelect(ALL);
                    setSelectedAdId(null);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ) : null}
            {campaignKey && adsetSelect !== ALL ? (
              <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                Conjunto:{" "}
                {adsetNameMap.get(adsetSelect) ?? adsetSelect.slice(0, 12)}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label="Quitar conjunto"
                  onClick={() => {
                    setAdsetSelect(ALL);
                    setSelectedAdId(null);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ) : null}
            {selectedAdId ? (
              <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                Anuncio:{" "}
                {selectedAdLabel}
                {selectedAdIsInferred ? (
                  <span
                    className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                    title={inferredSourceHint(selectedAdSource)}
                  >
                    Nombre inferido
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  aria-label="Quitar anuncio"
                  onClick={() => setSelectedAdId(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {useUnifiedDashboard ? (
        <GlobalFilterBar
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          campaignValue={campaignSelect}
          adsetValue={adsetSelect}
          adValue={selectedAdId ?? ALL}
          onCampaignChange={(v) => {
            setCampaignSelect(v);
            setAdsetSelect(ALL);
            setSelectedAdId(null);
          }}
          onAdsetChange={(v) => {
            setAdsetSelect(v);
            setSelectedAdId(null);
          }}
          onAdChange={(v) => setSelectedAdId(v === ALL ? null : v)}
          campaignOptions={(campaignsQuery.data?.data ?? []).map((c) => ({
            id: c.id,
            name: withEntityFallback(c.name, c.id, "Campaña"),
          }))}
          adsetOptions={(adsetsQuery.data?.data ?? []).map((s) => ({
            id: s.id,
            name: withEntityFallback(s.name, s.id, "Conjunto"),
          }))}
          adOptions={(adsListQuery.data?.data ?? []).map((a) => ({
            id: a.id,
            name: withEntityFallback(a.name, a.id, "Anuncio"),
            inferred: isInferredSource(a.name_source),
          }))}
          onOpenCustomDate={() => setShowDateModal(true)}
        />
      ) : null}

      <DashboardContextStrip
        datePreset={datePreset}
        dateStart={data?.date_start ?? (datePreset === "custom" ? customDateStart : null)}
        dateStop={data?.date_stop ?? (datePreset === "custom" ? customDateStop : null)}
        currencyCode={accountsQuery.data?.data.find((a) => a.id === id)?.currency ?? null}
        attributionWindowLabel={attributionWindowLabelEs(
          attributionQuery.data?.window ?? attributionWindow ?? data?.context?.attribution_window,
        )}
      />

      {rankingQuery.data?.messaging_actions_summary &&
      Object.keys(rankingQuery.data.messaging_actions_summary).length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mensajería / WhatsApp (acciones)</CardTitle>
            <CardDescription>
              Suma de tipos de acción relacionados con conversaciones en el periodo
              del ranking (Insights).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(rankingQuery.data.messaging_actions_summary).map(
                ([k, v]) => (
                  <Badge key={k} variant="outline" className="font-mono text-xs">
                    {labelForMetaActionType(k)}: {formatNum(v)}
                  </Badge>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data?.insights_empty ? (
        <Alert>
          <AlertTitle>Sin datos en este periodo</AlertTitle>
          <AlertDescription>
            Meta no devolvió filas de insights para este rango. Prueba otro preset
            (p. ej. <strong>maximum</strong>) o revisa que la cuenta tenga
            actividad.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="creatividades">Creatividades</TabsTrigger>
          <TabsTrigger value="audiencia">Audiencia</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="avanzado">Avanzado</TabsTrigger>
          {useUnifiedDashboard ? <TabsTrigger value="decisiones">Decisiones</TabsTrigger> : null}
        </TabsList>

        {/* ── Tab: Resumen ── */}
        <TabsContent value="resumen" className="space-y-6 pt-4">
          {useUnifiedDashboard && data ? (
            <>
              <ExecutiveSummary summary={data.summary} cpa={data.derived?.cpa ?? null} roas={data.derived?.roas ?? null} />
              <CampaignRankingTable rows={rankingQuery.data?.data ?? []} />
              <AdsetDiagnosticView selectedCampaign={campaignKey} selectedAdset={adsetSelect !== ALL ? adsetSelect : null} selectedAd={selectedAdId} />
              <CreativePerformanceView totalAds={(rankingQuery.data?.data ?? []).length} />
            </>
          ) : null}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : null}

          {isError ? (
            <Alert variant="destructive">
              <AlertTitle>Error al cargar el dashboard</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Error desconocido"}
              </AlertDescription>
            </Alert>
          ) : null}

          {data && !isLoading ? (
            <>
              {showAttributionDiscontinuity ? (
                <Alert className="border-amber-500/40 bg-amber-500/10">
                  <AlertTitle>Comparación y cambio Meta ({META_ATTRIBUTION_CHANGE_ISO})</AlertTitle>
                  <AlertDescription className="text-sm">
                    El periodo seleccionado y el periodo anterior cruzan el {META_ATTRIBUTION_CHANGE_ISO}. Meta
                    ajustó entonces la disponibilidad de ventanas de visualización largas en Ads Insights; los deltas de
                    CPA/ROAS entre tramos pueden no ser totalmente comparables.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
                  Objetivo activo: {objectiveMetricLabel(data.derived?.objective_metric ?? OBJECTIVE_METRIC)}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
                  Trazabilidad: resultados y CPA derivado calculados sobre este objetivo.
                </Badge>
              </div>

              {/* ── Banner de estado ── */}
              {(() => {
                const ctr = Number(data.summary.ctr ?? 0);
                const freq = Number(data.summary.frequency ?? 0);
                const spend = Number(data.summary.spend ?? 0);
                if (spend === 0) return null;

                type Signal = { text: string; level: "red" | "yellow" | "green" };
                const signals: Signal[] = [];

                // CTR signal
                if (ctr < 0.5) signals.push({ text: "CTR crítico (<0.5%) — revisar creatividades", level: "red" });
                else if (ctr < 1) signals.push({ text: "CTR bajo (<1%) — considerar nuevos creativos", level: "yellow" });
                else signals.push({ text: `CTR en rango (${ctr.toFixed(2)}%)`, level: "green" });

                // Frequency signal
                if (freq > 5) signals.push({ text: `Frecuencia alta (${freq.toFixed(1)}) — riesgo saturación`, level: "red" });
                else if (freq > 3) signals.push({ text: `Frecuencia elevada (${freq.toFixed(1)}) — vigilar fatiga`, level: "yellow" });

                // CPA delta signal (only if prev period loaded)
                const prevSpend = Number(prevDashboardQuery.data?.summary?.spend ?? 0);
                if (prevSpend > 0) {
                  const spendDelta = deltaPercent(spend, prevSpend);
                  if (spendDelta !== null) {
                    const positive = spendDelta >= 0;
                    signals.push({
                      text: `Gasto ${positive ? "▲" : "▼"} ${Math.abs(spendDelta).toFixed(0)}% vs período anterior`,
                      level: positive ? "yellow" : "green",
                    });
                  }
                }

                return (
                  <div className="flex flex-wrap gap-2">
                    {signals.map((s, i) => {
                      const chipBg = pickDashboardColor(`${s.level}-${s.text}`, i);
                      return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: chipBg,
                          borderColor: chipBg,
                          color: contrastingForeground(chipBg),
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: pickDashboardColor(`${s.level}-${s.text}`, i + 1) }}
                        />
                        {s.text}
                      </span>
                    );
                    })}
                  </div>
                );
              })()}
              <TooltipProvider delayDuration={300}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(data.summary).map(([key, val]) => {
                    const tipData = DASHBOARD_KPI_TOOLTIPS[key];
                    const tipText = tipData
                      ? `${tipData.description} Fórmula: ${tipData.formula} Fuente: ${tipData.source} (${tipData.type})`
                      : undefined;
                    const numVal = Number(val);
                    const derivedCpa = data.derived?.cpa != null ? Number(data.derived.cpa) : null;
                    const displayCostPerResult =
                      key === "cost_per_result" &&
                      (!Number.isFinite(numVal) || numVal <= 0) &&
                      derivedCpa != null &&
                      derivedCpa > 0;
                    const displayVal = displayCostPerResult ? derivedCpa : numVal;
                    const displayLabel =
                      key === "cost_per_result" && displayCostPerResult
                        ? "Costo por resultado estimado"
                        : (DASHBOARD_KPI_LABELS[key] ?? key);
                    return (
                      <Card key={key}>
                        <CardHeader className="pb-2">
                          <CardDescription className="flex items-center gap-1">
                            {displayLabel}
                            {tipText && <InfoTooltip text={tipText} />}
                          </CardDescription>
                          <CardTitle className="text-2xl tabular-nums">
                            {key === "cost_per_result"
                              ? `$${Number(displayVal).toLocaleString("es", { maximumFractionDigits: 2 })}`
                              : formatNum(displayVal)}
                          </CardTitle>
                          {displayCostPerResult ? (
                            <p className="text-muted-foreground text-xs mt-1">
                              Meta devolvió 0 en agregado; mostrado: coste efectivo (gasto ÷ primer resultado no trivial).
                            </p>
                          ) : null}
                          {/* Delta vs previous period */}
                          {(() => {
                            if (key === "cost_per_result" && displayCostPerResult) {
                              const prevCpa = prevDashboardQuery.data?.derived?.cpa;
                              const pc = prevCpa != null ? Number(prevCpa) : null;
                              if (!prevDashboardQuery.data || pc == null || pc === 0 || derivedCpa == null)
                                return null;
                              const delta = deltaPercent(derivedCpa, pc);
                              if (delta === null) return null;
                              const positive = delta >= 0;
                              const good = !positive;
                              return (
                                <p
                                  className={`text-xs font-medium tabular-nums ${good ? "text-green-600" : "text-red-600"}`}
                                >
                                  {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs período anterior (CPA
                                  derivado)
                                </p>
                              );
                            }
                            const prevVal = Number(prevDashboardQuery.data?.summary?.[key] ?? 0);
                            const currVal = Number(displayVal);
                            if (!prevDashboardQuery.data || prevVal === 0) return null;
                            const delta = deltaPercent(currVal, prevVal);
                            if (delta === null) return null;
                            const isPositiveGood = !["cpm", "cpp", "frequency", "cost_per_result"].includes(key);
                            const positive = delta >= 0;
                            const good = isPositiveGood ? positive : !positive;
                            return (
                              <p className={`text-xs font-medium tabular-nums ${good ? "text-green-600" : "text-red-600"}`}>
                                {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs período anterior
                              </p>
                            );
                          })()}
                        </CardHeader>
                      </Card>
                    );
                  })}
                  {(() => {
                    const spend = Number(data.summary.spend ?? 0);
                    const replies = (data.actions ?? [])
                      .filter((a) => String(a.action_type) === "messaging_first_reply")
                      .reduce((s, a) => s + Number(a.value ?? 0), 0);
                    if (replies === 0) return null;
                    const cpc = spend / replies;
                    return (
                      <Card key="costo_conv">
                        <CardHeader className="pb-2">
                          <CardDescription className="flex items-center gap-1">
                            Costo / conversación respondida
                            <InfoTooltip text="KPI derivado. Fórmula: Gasto ÷ primeras respuestas (messaging_first_reply). Fuente: Meta Insights (derivado). Puede no estar disponible en todas las cuentas." />
                          </CardDescription>
                          <CardTitle className="text-2xl tabular-nums">${cpc.toFixed(2)}</CardTitle>
                        </CardHeader>
                      </Card>
                    );
                  })()}
                </div>
              </TooltipProvider>

              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Gasto diario (pauta asociada a la cuenta)</CardTitle>
                    <CardDescription>
                      Serie diaria desde Meta para el mismo periodo y filtro de campaña. Útil para ver ritmo de inversión.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SpendSparkline
                      data={dailyTimePoints}
                      legend="Gasto diario asociado a la cuenta"
                    />
                  </CardContent>
                </Card>
                <AccountTimeInsightsSection
                  points={dailyTimePoints}
                  isLoading={timeInsightsQuery.isLoading}
                  isError={timeInsightsQuery.isError}
                  timeRange={timeInsightsQuery.data?.time_range}
                  datePresetLabel={datePresetLabelEs}
                  attributionWindowCode={attributionWindow}
                  metaAttributionSent={timeInsightsQuery.data?.attribution_windows_sent ?? null}
                />
              </div>

              {datePreset === "maximum" ? (
                <Alert>
                  <AlertTitle>Comparación de periodos desactivada con «Máximo disponible»</AlertTitle>
                  <AlertDescription className="text-sm">
                    Este preset abarca todo el histórico que devuelve Meta; un periodo anterior de la misma
                    duración suele quedar fuera de actividad o de retención útil (tabla en ceros o vacía). Para ver
                    cambios porcentuales respecto al periodo previo, elige <strong>30 días</strong>,{" "}
                    <strong>7 días</strong> o un <strong>rango personalizado</strong>.
                  </AlertDescription>
                </Alert>
              ) : prevPeriod ? (
                <PeriodComparisonCard
                  data={data}
                  prev={prevDashboardQuery.data}
                  prevPeriod={prevPeriod}
                  prevLoading={prevDashboardQuery.isLoading}
                />
              ) : null}

              {/* ── Card comparativa: costos de adquisición ── */}
              <TooltipProvider delayDuration={300}>
              {(() => {
                const spend = Number(data.summary.spend ?? 0);
                if (spend === 0) return null;

                const actions = data.actions ?? [];
                const costActions = data.cost_per_action_type ?? [];

                // Costo por acción (Meta): primer cost_per_action_type no trivial (un solo tipo; no es “el” CPA de cuenta)
                const TRIVIAL = new Set(["post_engagement", "page_engagement", "photo_view", "video_view"]);
                const mainCostAction = costActions.find((a) => !TRIVIAL.has(String(a.action_type)));
                const costPerResult = mainCostAction ? Number(mainCostAction.value) : null;

                // CPA alineado al backend / KPI “Resultados (derivado)”: no sumar tipos de acción distintos (eso falseaba el denominador).
                const cpaPrincipal =
                  data.derived?.cpa != null && Number.isFinite(Number(data.derived.cpa))
                    ? Number(data.derived.cpa)
                    : null;

                // Costo por conversación iniciada
                const convsStarted = actions
                  .filter((a) => String(a.action_type) === "onsite_conversion.messaging_conversation_started_7d")
                  .reduce((s, a) => s + Number(a.value ?? 0), 0);
                const costPerConvStarted = convsStarted > 0 ? spend / convsStarted : null;

                // Costo por conversación respondida
                const replies = actions
                  .filter((a) => String(a.action_type) === "messaging_first_reply")
                  .reduce((s, a) => s + Number(a.value ?? 0), 0);
                const costPerReplied = replies > 0 ? spend / replies : null;

                const costs = [
                  {
                    label: "CPA (resultado principal)",
                    value: cpaPrincipal,
                    tip: "Mismo criterio que el backend y la comparación de periodos: cost_per_result de Meta si es >0; si no, gasto ÷ conversaciones iniciadas (onsite_conversion.messaging_conversation_started_7d).",
                  },
                  {
                    label: "Costo / acción (primer tipo Meta)",
                    value: costPerResult,
                    tip: "Primer cost_per_action_type numérico en la respuesta (excl. interacciones triviales). Suele referirse a un solo action_type; puede diferir mucho del CPA de cuenta agregado.",
                  },
                  { label: "Costo / conv. iniciada", value: costPerConvStarted, tip: "Gasto ÷ conversaciones iniciadas (onsite_conversion.messaging_conversation_started_7d). Derivado." },
                  { label: "Costo / conv. respondida", value: costPerReplied, tip: "Gasto ÷ primeras respuestas (messaging_first_reply). Derivado. Puede no estar disponible en todas las cuentas." },
                ];

                if (costs.every((c) => c.value === null)) return null;

                return (
                  <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Costos de adquisición</CardTitle>
                        <CardDescription>Comparativa de costos según etapa del embudo publicitario</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {costs.map((c, i) => (
                            <div key={`${c.label}-${i}`} className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground text-xs flex items-center gap-0.5">
                                {c.label}
                                <InfoTooltip text={c.tip} />
                              </span>
                              <span className="text-foreground text-xl font-bold tabular-nums">
                                {c.value !== null ? `$${c.value.toFixed(2)}` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                  </Card>
                );
              })()}
              </TooltipProvider>

              <p className="text-muted-foreground text-sm">
                {data.scope === "campaign" && data.campaign_id ? (
                  <>
                    Resumen filtrado por campaña:{" "}
                    <span className="font-medium text-foreground">
                      {campaignNameMap.get(data.campaign_id) ?? data.campaign_id}
                    </span>
                  </>
                ) : (
                  <>Resumen de toda la cuenta publicitaria (todas las campañas).</>
                )}
              </p>

              <Separator />

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Acciones agrupadas por categoría</CardTitle>
                    <CardDescription>
                      Suma de eventos (Meta) agrupados: mensajería, tráfico,
                      interacción, conversiones y otras.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0">
                    {categoryChartData.length === 0 ? (
                      <p className="text-muted-foreground px-6 text-sm">
                        Sin acciones en este periodo.
                      </p>
                    ) : (
                      <ChartContainer
                        config={chartConfigCategory}
                        className="min-h-[260px] w-full"
                      >
                        <BarChart
                          accessibilityLayer
                          data={categoryChartData}
                          margin={{ left: 8, right: 8, top: 8, bottom: 72 }}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            tickMargin={8}
                            angle={-25}
                            textAnchor="end"
                            height={72}
                            interval={0}
                            fontSize={10}
                          />
                          <YAxis tickLine={false} axisLine={false} width={48} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="value" radius={4}>
                            {categoryChartData.map((d, i) => (
                              <Cell key={`${String(d.label)}-${i}`} fill={barColorAt(i, String(d.label))} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Tipos de acción con más volumen</CardTitle>
                    <CardDescription>
                      Top 8 tipos individuales por cantidad de eventos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pl-0">
                    {topActionsChartData.length === 0 ? (
                      <p className="text-muted-foreground px-6 text-sm">
                        Sin datos para graficar.
                      </p>
                    ) : (
                      <ChartContainer config={chartConfigTop} className="min-h-[260px] w-full">
                        <BarChart
                          accessibilityLayer
                          data={topActionsChartData}
                          margin={{ left: 8, right: 8, top: 8, bottom: 72 }}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            tickMargin={8}
                            angle={-35}
                            textAnchor="end"
                            height={72}
                            interval={0}
                            fontSize={9}
                          />
                          <YAxis tickLine={false} axisLine={false} width={48} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="value" radius={4}>
                            {topActionsChartData.map((d, i) => (
                              <Cell key={`${String(d.key)}-${i}`} fill={barColorAt(i, String(d.label))} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Coste medio por tipo de acción (mayor primero)</CardTitle>
                  <CardDescription>
                    Valores que devuelve Meta en el periodo (moneda de la cuenta). Solo
                    visualización; antes estaba en tabla.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pl-0">
                  {costChartData.length === 0 ? (
                    <p className="text-muted-foreground px-6 text-sm">
                      Sin datos de coste por acción.
                    </p>
                  ) : (
                    <ChartContainer config={chartConfigCost} className="min-h-[280px] w-full">
                      <BarChart
                        accessibilityLayer
                        data={costChartData}
                        margin={{ left: 8, right: 8, top: 8, bottom: 72 }}
                      >
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          tickMargin={8}
                          angle={-35}
                          textAnchor="end"
                          height={72}
                          interval={0}
                          fontSize={9}
                        />
                        <YAxis tickLine={false} axisLine={false} width={52} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={4}>
                          {costChartData.map((d, i) => (
                            <Cell key={`${String(d.key)}-${i}`} fill={barColorAt(i, String(d.label))} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* ── Distribución de acciones por anuncio/campaña ── */}
              {(() => {
                const adRows = rankingQuery.data?.data ?? [];
                if (adRows.length === 0) return null;

                // Collect all action types present in the data
                const actionTypeCounts: Map<string, number> = new Map();
                for (const row of adRows) {
                  for (const a of row.actions ?? []) {
                    const t = String(a.action_type);
                    actionTypeCounts.set(t, (actionTypeCounts.get(t) ?? 0) + Number(a.value ?? 0));
                  }
                }
                const availableTypes = Array.from(actionTypeCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([t]) => t);

                if (availableTypes.length === 0) return null;

                return <ActionDistributionSection adRows={adRows} availableTypes={availableTypes} />;
              })()}
            </>
          ) : null}
        </TabsContent>

        {useUnifiedDashboard ? (
          <TabsContent value="decisiones" className="space-y-6 pt-4">
            <InsightsDecisionPanel insights={unifiedInsights} />
          </TabsContent>
        ) : null}

        {/* ── Tab: Creatividades (ranking + catálogo + fatiga) ── */}
        <TabsContent value="creatividades" className="space-y-6 pt-4">

          <h3 className="text-foreground text-lg font-semibold">Ranking de anuncios</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
              Objetivo activo: {objectiveMetricLabel(rankingQuery.data?.objective_metric ?? OBJECTIVE_METRIC)}
            </Badge>
            <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
              Ranking, resultados y CPA usan el mismo criterio para comparacion homogénea.
            </Badge>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">Métrica:</span>
              <Select value={rankingMetric} onValueChange={(v) => setRankingMetric(v as RankingMetric)}>
                <SelectTrigger className="w-[min(100vw-2rem,220px)]">
                  <SelectValue placeholder="Métrica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="impressions">Impresiones</SelectItem>
                  <SelectItem value="clicks">Clics</SelectItem>
                  <SelectItem value="spend">Gasto</SelectItem>
                  <SelectItem value="ctr">Tasa de clics (CTR)</SelectItem>
                  <SelectItem value="results">Resultados</SelectItem>
                  <SelectItem value="cpa">CPA</SelectItem>
                  <SelectItem value="roas">ROAS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-spend-ranking" className="text-muted-foreground text-xs">
                Gasto mínimo (USD) para CPA / ROAS
              </Label>
              <Input
                id="min-spend-ranking"
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                className="w-[120px]"
                value={minSpendRankingUsd}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n) && n >= 0) setMinSpendRankingUsd(n);
                }}
              />
            </div>
          </div>
          <p className="text-muted-foreground max-w-3xl text-xs">
            Los gráficos por CPA y ROAS solo ordenan anuncios con gasto ≥ umbral (evita CPA engañoso con poco volumen). Todas las filas siguen en la tabla.
          </p>

          {rankingQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : null}

          {rankingQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Error al cargar el ranking</AlertTitle>
              <AlertDescription>
                {rankingQuery.error instanceof Error ? rankingQuery.error.message : "Error desconocido"}
              </AlertDescription>
            </Alert>
          ) : null}

          {!rankingQuery.isLoading && !rankingQuery.isError ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Ranking de anuncios</CardTitle>
                  <CardDescription>
                    Top anuncios por rendimiento en el periodo seleccionado.
                    {selectedAdId ? (
                      <span className="text-primary ml-2 inline-flex items-center gap-2 font-medium">
                        <span>Anuncio seleccionado: {selectedAdLabel}</span>
                        {selectedAdIsInferred ? (
                          <span
                            className="rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                            title={inferredSourceHint(selectedAdSource)}
                          >
                            Nombre inferido
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground ml-2">
                        Haz clic en una fila para seleccionar un anuncio.
                      </span>
                    )}
                  </CardDescription>
                  <div className="pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedAdId ? "default" : "outline"}
                      onClick={() => setMainTab("avanzado")}
                    >
                      {selectedAdId
                        ? "Ver targeting del anuncio seleccionado"
                        : "Ir a Avanzado para configurar targeting"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Conjunto</TableHead>
                          <TableHead className="text-right">Impresiones</TableHead>
                          <TableHead className="text-right">Clics</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">Resultados</TableHead>
                          <TableHead className="text-right" title="Coste por resultado (Meta o derivado)">
                            CPA
                          </TableHead>
                          <TableHead className="text-right">CTR (%)</TableHead>
                          <TableHead className="text-right" title="Coste por mil impresiones">
                            CPM
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankingRowsEnriched.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center">
                              Sin datos de anuncios para este periodo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rankingRowsEnriched.map(({ row, results, cpa, spend }, idx) => (
                            <TableRow
                              key={String(row.ad_id ?? idx)}
                              className={`cursor-pointer ${selectedAdId === String(row.ad_id) ? "bg-muted" : ""} ${
                                (rankingMetric === "cpa" || rankingMetric === "roas") && spend < minSpendRankingUsd
                                  ? "text-muted-foreground"
                                  : ""
                              }`}
                              onClick={() => {
                                const adId = row.ad_id != null ? String(row.ad_id) : null;
                                if (adId) setSelectedAdId(adId);
                              }}
                            >
                              <TableCell className="font-medium">
                                {withEntityFallback(row.ad_label, String(row.ad_id ?? ""), "Anuncio")}
                                {row.ad_label_source && row.ad_label_source !== "meta_ad_name" ? (
                                  <Badge
                                    variant="outline"
                                    className="ml-2 align-middle text-[10px]"
                                    title={inferredSourceHint(row.ad_label_source)}
                                  >
                                    Nombre inferido
                                  </Badge>
                                ) : null}
                                {spend < minSpendRankingUsd ? (
                                  <span className="text-muted-foreground ml-1 text-[10px] font-normal">
                                    (gasto por debajo del mínimo)
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                                {row.adset_name ?? row.adset_id ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {Number(row.impressions ?? 0).toLocaleString("es")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {String(row.clicks ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                ${String(row.spend ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {results > 0 ? results.toLocaleString("es") : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {cpa != null && cpa > 0 ? `$${cpa.toFixed(2)}` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {String(row.ctr ?? "—")}%
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                ${String(row.cpm ?? "—")}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Distribución por anuncio</CardTitle>
                  <CardDescription>
                    {RANKING_METRIC_LABELS[rankingMetric] ?? rankingMetric} — top 10.
                    {rankingMetric === "cpa" || rankingMetric === "roas" ? (
                      <span className="text-muted-foreground">
                        {" "}
                        Barras horizontales; solo anuncios con gasto ≥ {minSpendRankingUsd} USD.
                      </span>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pl-0">
                  {rankingChartData.length === 0 ? (
                    <p className="text-muted-foreground px-6 text-sm">
                      {rankingMetric === "cpa" || rankingMetric === "roas"
                        ? "Sin anuncios que cumplan el gasto mínimo y tengan esta métrica calculable. Revisa la tabla o baja el umbral."
                        : "No hay datos para graficar."}
                    </p>
                  ) : rankingMetric === "cpa" || rankingMetric === "roas" ? (
                    <ChartContainer config={rankingChartConfig} className="min-h-[300px] w-full">
                      <BarChart
                        accessibilityLayer
                        layout="vertical"
                        data={rankingChartData}
                        margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
                      >
                        <CartesianGrid horizontal={false} />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) =>
                            rankingMetric === "cpa" ? `$${v}` : `${Number(v).toFixed(2)}×`
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={120}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={4}>
                          {rankingChartData.map((d, i) => (
                            <Cell key={d.id} fill={barColorAt(i, d.id)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <ChartContainer config={rankingChartConfig} className="min-h-[280px] w-full">
                      <BarChart
                        accessibilityLayer
                        data={rankingChartData}
                        margin={{ left: 8, right: 8, top: 8, bottom: 48 }}
                      >
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          tickMargin={8}
                          angle={-35}
                          textAnchor="end"
                          height={64}
                          interval={0}
                          fontSize={10}
                        />
                        <YAxis tickLine={false} axisLine={false} width={48} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={4}>
                          {rankingChartData.map((d, i) => (
                            <Cell key={d.id} fill={barColorAt(i, d.id)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Vista eficiencia (CPA y ROAS)</CardTitle>
                  <CardDescription>
                    Comparación fija de eficiencia (misma ventana que el ranking). Umbral de gasto:{" "}
                    {minSpendRankingUsd} USD.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AdCreatividadEfficiencyBarCharts
                    rows={rankingQuery.data?.data ?? []}
                    minSpendUsd={minSpendRankingUsd}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}

          <Separator className="my-4" />
          <h3 className="text-foreground text-lg font-semibold">Catálogo</h3>
          <Card>
            <CardHeader>
              <CardTitle>Campañas</CardTitle>
              <CardDescription>
                Objetivo, presupuestos y fechas desde Graph API (estructura A).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Objetivo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Presupuesto día</TableHead>
                        <TableHead>Inicio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(campaignsQuery.data?.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Sin campañas.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (campaignsQuery.data?.data ?? []).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {c.name}
                            </TableCell>
                            <TableCell className="text-xs">{c.objective ?? "—"}</TableCell>
                            <TableCell className="text-xs">{c.effective_status ?? c.status ?? "—"}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {c.daily_budget ?? c.lifetime_budget ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {c.start_time?.slice(0, 10) ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conjuntos (ad sets)</CardTitle>
              <CardDescription>
                Incluye <code className="text-xs">targeting</code> y objetivos de optimización.
                {campaignKey ? null : (
                  <span className="text-amber-600 dark:text-amber-500"> Elige una campaña arriba para filtrar.</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!campaignKey ? (
                <p className="text-muted-foreground text-sm">Selecciona una campaña en “Explorar por estructura”.</p>
              ) : adsetsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="space-y-4">
                  {(adsetsQuery.data?.data ?? []).map((s) => (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{s.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {s.optimization_goal ?? "—"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Billing: {s.billing_event ?? "—"} · Bid: {s.bid_strategy ?? "—"}
                      </p>
                      <pre className="bg-muted/50 mt-2 max-h-40 overflow-auto rounded-md p-2 text-[11px] leading-snug">
                        {JSON.stringify(s.targeting ?? {}, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {(adsetsQuery.data?.data ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sin conjuntos para esta campaña.</p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anuncios y creativos</CardTitle>
              <CardDescription>
                Referencia a <code className="text-xs">creative</code> (texto, CTA, story spec).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!campaignKey ? (
                <p className="text-muted-foreground text-sm">Selecciona una campaña para listar anuncios.</p>
              ) : adsListQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="space-y-4">
                  {(adsListQuery.data?.data ?? []).map((ad) => (
                    <div key={ad.id} className="rounded-lg border p-3">
                      <p className="font-medium">{ad.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {ad.effective_status ?? ad.status ?? "—"} · CTA:{" "}
                        {ad.creative?.call_to_action_type ?? "—"}
                      </p>
                      {ad.creative?.title ? (
                        <p className="mt-2 text-sm">{ad.creative.title}</p>
                      ) : null}
                      {ad.creative?.body ? (
                        <p className="text-muted-foreground mt-1 text-xs line-clamp-3">{ad.creative.body}</p>
                      ) : null}
                      <pre className="bg-muted/50 mt-2 max-h-32 overflow-auto rounded-md p-2 text-[11px]">
                        {JSON.stringify(ad.creative?.object_story_spec ?? {}, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {(adsListQuery.data?.data ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sin anuncios en este filtro.</p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Separator className="my-4" />
          <h3 className="text-foreground text-lg font-semibold">Fatiga creativa</h3>
          <CreativeFatigueTable
            data={fatigueQuery.data?.data}
            alerts={fatigueQuery.data?.alerts}
            isLoading={fatigueQuery.isLoading}
            isError={fatigueQuery.isError}
            errorMessage={fatigueQuery.error instanceof Error ? fatigueQuery.error.message : undefined}
          />
          <CreativeSaturationScatter
            data={fatigueQuery.data?.data}
            isLoading={fatigueQuery.isLoading}
          />
        </TabsContent>

        {/* ── Tab: Audiencia (plataformas + geografía + demografía) ── */}
        <TabsContent value="audiencia" className="space-y-6 pt-4">
          <h3 className="text-foreground text-lg font-semibold">Plataformas</h3>
          <Card>
            <CardHeader>
              <CardTitle>Gasto por plataforma y posición</CardTitle>
              <CardDescription>
                Breakdown <code className="text-xs">publisher_platform</code> +{" "}
                <code className="text-xs">platform_position</code> (Facebook, Instagram, etc.).
                Respeta los mismos filtros de campaña / conjunto / anuncio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {placementQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : placementQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {placementQuery.error instanceof Error
                      ? placementQuery.error.message
                      : "No se pudieron cargar placements."}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plataforma</TableHead>
                          <TableHead>Posición</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">% Gasto</TableHead>
                          <TableHead className="text-right">Impresiones</TableHead>
                          <TableHead className="text-right">Clics</TableHead>
                          <TableHead className="text-right">CTR</TableHead>
                          <TableHead className="text-right">CPM</TableHead>
                          <TableHead className="text-right">CPC</TableHead>
                          <TableHead className="text-right">Frecuencia</TableHead>
                          <TableHead className="text-right">CPA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(placementQuery.data?.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-muted-foreground">
                              Sin filas de placement para este periodo o filtros.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (placementQuery.data?.data ?? []).map((row, idx) => (
                            <TableRow key={`${row.ad_id}-${row.publisher_platform}-${row.platform_position}-${idx}`}>
                              <TableCell className="text-xs">{row.publisher_platform ?? "—"}</TableCell>
                              <TableCell className="max-w-[180px] truncate text-xs">
                                {row.platform_position ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                ${String(row.spend ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {row.pct_spend != null ? `${row.pct_spend.toFixed(1)}%` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {String(row.impressions ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {String(row.clicks ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {row.ctr != null ? `${String(row.ctr)}%` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {row.cpm != null ? `$${String(row.cpm)}` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {row.cpc != null ? `$${String(row.cpc)}` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {row.frequency != null ? String(row.frequency) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {row.cpa_derived != null ? `$${row.cpa_derived.toFixed(2)}` : "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {placementSpendByPlatform.length > 0 ? (
                    <div className="mt-4">
                      <p className="text-muted-foreground mb-2 text-sm">Gasto agregado (top)</p>
                      <div className="flex flex-wrap gap-2">
                        {placementSpendByPlatform.slice(0, 14).map(([k, v]) => (
                          <Badge key={k} variant="secondary" className="font-normal">
                            {k}: ${v.toFixed(2)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <PlacementEfficiencyBarChart
                    rows={placementQuery.data?.data ?? []}
                    datePreset={placementQuery.data?.date_preset ?? null}
                    timeRange={placementQuery.data?.time_range ?? null}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Separator className="my-4" />
          <h3 className="text-foreground text-lg font-semibold">Geografía</h3>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground text-sm">Ámbito:</span>
            <Select value={geoScope} onValueChange={(v) => setGeoScope(v as "account" | "ad")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Cuenta completa</SelectItem>
                <SelectItem value="ad">Anuncio seleccionado</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-sm">Vista:</span>
            <Select value={geoMetric} onValueChange={(v) => setGeoMetric(v as GeoMapMetric)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="impressions">Por impresiones</SelectItem>
                <SelectItem value="spend">Por gasto</SelectItem>
                <SelectItem value="cpa">Por CPA</SelectItem>
                <SelectItem value="results">Por resultados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {geoScope === "ad" && !selectedAdId ? (
            <Alert>
              <AlertTitle>Selecciona un anuncio</AlertTitle>
              <AlertDescription>
                Ve a la pestaña <strong>Creatividades</strong>, haz clic en una fila para seleccionar un anuncio y luego vuelve aquí.
              </AlertDescription>
            </Alert>
          ) : null}

          {geoQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : null}

          {geoQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Error al cargar datos geográficos</AlertTitle>
              <AlertDescription>
                {geoQuery.error instanceof Error ? geoQuery.error.message : "Error desconocido"}
              </AlertDescription>
            </Alert>
          ) : null}

          {!geoQuery.isLoading && !geoQuery.isError && (geoScope === "account" || Boolean(selectedAdId)) ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Distribución geográfica — eficiencia</CardTitle>
                  <CardDescription>
                    {geoScope === "account"
                      ? "Cuenta completa"
                      : `Anuncio ${selectedAdLabel ?? selectedAdId}`}{" "}
                    — vista por{" "}
                    {GEO_METRIC_LABEL_ES[geoMetric]}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Región</TableHead>
                          <TableHead className="text-right">Impresiones</TableHead>
                          <TableHead className="text-right">Clics</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">Resultados</TableHead>
                          <TableHead className="text-right">CPA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(geoQuery.data?.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center">
                              Sin datos geográficos para este periodo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          [...(geoQuery.data?.data ?? [])]
                            .sort((a, b) => compareGeoInsightRowsForMetric(a, b, geoMetric))
                            .map((row, idx) => (
                              <TableRow key={String(row.region ?? row.region_name ?? idx)}>
                                <TableCell className="font-medium text-sm">
                                  {String(row.region_name ?? row.region ?? "Desconocido")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  {Number(row.impressions ?? 0).toLocaleString("es")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  {String(row.clicks ?? "—")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  ${Number(row.spend ?? 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  {row.results != null ? row.results.toLocaleString("es") : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  {row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}
                                </TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mapa geográfico</CardTitle>
                  <CardDescription>
                    Distribución interactiva — métrica: {geoMetric}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {geoQuery.data ? (
                    <GeoMap
                      data={geoQuery.data.data}
                      metadata={geoQuery.data.metadata}
                      metric={geoMetric}
                      extraCaption={
                        geoMetric === "cpa"
                          ? `CPA por región alineado con el mismo criterio de resultados que el resumen (referencia: ${attributionWindowLabelEs(data?.context?.attribution_window) ?? "ventana predeterminada Meta"}).`
                          : undefined
                      }
                    />
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : null}

          <Separator className="my-4" />
          <h3 className="text-foreground text-lg font-semibold">Demografía</h3>
          <DemographicsPanel
            data={demographicsQuery.data?.data}
            isLoading={demographicsQuery.isLoading}
            isError={demographicsQuery.isError}
            errorMessage={demographicsQuery.error instanceof Error ? demographicsQuery.error.message : undefined}
            breakdown={demographicsBreakdown}
            onBreakdownChange={setDemographicsBreakdown}
          />

          <Separator className="my-4" />
          <h3 className="text-foreground text-lg font-semibold">Audiencias que mejor rinden</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="audience-category">Categoría</Label>
              <Select
                value={audienceCategory}
                onValueChange={(v) =>
                  setAudienceCategory(
                    v as
                      | "all"
                      | "interests"
                      | "behaviors"
                      | "education_majors"
                      | "family_statuses"
                      | "life_events"
                      | "work_positions",
                  )
                }
              >
                <SelectTrigger id="audience-category" className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="interests">Intereses</SelectItem>
                  <SelectItem value="behaviors">Comportamientos</SelectItem>
                  <SelectItem value="education_majors">Carreras / educación</SelectItem>
                  <SelectItem value="family_statuses">Estado familiar</SelectItem>
                  <SelectItem value="life_events">Eventos de vida</SelectItem>
                  <SelectItem value="work_positions">Cargos de trabajo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="audience-min-spend">Gasto mínimo (USD)</Label>
              <Input
                id="audience-min-spend"
                className="w-[160px]"
                type="number"
                min={0}
                step="1"
                value={String(audienceMinSpend)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setAudienceMinSpend(Number.isFinite(next) && next >= 0 ? next : 0);
                }}
              />
            </div>
          </div>
          <AudiencePerformancePanel
            data={audiencePerformanceQuery.data}
            isLoading={audiencePerformanceQuery.isLoading}
            isError={audiencePerformanceQuery.isError}
            errorMessage={
              audiencePerformanceQuery.error instanceof Error
                ? audiencePerformanceQuery.error.message
                : undefined
            }
          />
        </TabsContent>

        {/* ── Tab: Avanzado (targeting + atribución) ── */}
        <TabsContent value="avanzado" className="space-y-6 pt-4">
          <h3 className="text-foreground text-lg font-semibold">Targeting</h3>
          <Card>
            <CardHeader>
              <CardTitle>Targeting del anuncio seleccionado</CardTitle>
              <CardDescription>
                Selecciona un anuncio en la tabla Ranking para ver su targeting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedAdId ? (
                <Alert>
                  <AlertTitle>Sin anuncio seleccionado</AlertTitle>
                  <AlertDescription>
                    Ve a la pestaña <strong>Creatividades</strong>, haz clic en una fila para seleccionar un anuncio y luego vuelve aquí.
                  </AlertDescription>
                  <div className="pt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => setMainTab("creatividades")}>
                      Ir a Creatividades
                    </Button>
                  </div>
                </Alert>
              ) : targetingQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 rounded-md" />
                  ))}
                </div>
              ) : targetingQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Error al cargar el targeting</AlertTitle>
                  <AlertDescription>
                    {targetingQuery.error instanceof Error ? targetingQuery.error.message : "Error desconocido"}
                  </AlertDescription>
                </Alert>
              ) : targetingQuery.data?.targeting ? (
                <TargetingPanel targeting={targetingQuery.data.targeting} />
              ) : null}
            </CardContent>
          </Card>

          <Separator className="my-4" />
          <h3 className="text-foreground text-lg font-semibold">Atribución</h3>
          <AttributionWindowPanel
            data={attributionQuery.data}
            isLoading={attributionQuery.isLoading}
            isError={attributionQuery.isError}
            errorMessage={attributionQuery.error instanceof Error ? attributionQuery.error.message : undefined}
            window={attributionWindow}
            onWindowChange={(w) => setAttributionWindow(w as AdsAttributionWindow)}
          />

          {data && prevPeriod ? (
            <>
              <Separator className="my-4" />
              <h3 className="text-foreground text-lg font-semibold">Comparación de periodos (resumen)</h3>
              <PeriodComparisonCard
                data={data}
                prev={prevDashboardQuery.data}
                prevPeriod={prevPeriod}
                prevLoading={prevDashboardQuery.isLoading}
              />
            </>
          ) : null}
        </TabsContent>

        {/* ── Tab: Comercial (leads + datos comerciales) ── */}
        <TabsContent value="comercial" className="space-y-6 pt-4">
          <h3 className="text-foreground text-lg font-semibold">Comercial (Mensajería)</h3>
          <LeadsPanel
            data={leadsQuery.data}
            previousData={leadsPrevQuery.data}
            isLoading={leadsQuery.isLoading}
            isError={leadsQuery.isError}
            errorMessage={leadsQuery.error instanceof Error ? leadsQuery.error.message : undefined}
          />
          <Separator className="my-4" />
          <Alert>
            <AlertTitle>Métricas CRM removidas</AlertTitle>
            <AlertDescription>
              Esta vista conserva solo métricas derivadas de Meta. Los módulos que dependían de CRM/carga manual fueron retirados.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-foreground text-sm font-medium">Embudo Meta por nivel:</span>
              <Select value={funnelLevel} onValueChange={(v) => setFunnelLevel(v as typeof funnelLevel)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Nivel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Consolidado (cuenta)</SelectItem>
                  <SelectItem value="campaign">Por campaña</SelectItem>
                  <SelectItem value="ad">Por anuncio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {funnelLevel !== "account" && (() => {
              const adRows = rankingQuery.data?.data ?? [];

              if (funnelLevel === "ad") {
                const rows: FunnelLevelRow[] = adRows.map((row) => {
                  const rowActions = row.actions ?? [];
                  return {
                    id: row.ad_id,
                    name: row.ad_name,
                    impressions: Number(row.impressions ?? 0),
                    reach: Number(row.reach ?? 0),
                    clicks: Number(row.unique_clicks ?? row.clicks ?? 0),
                    conversations_started: rowActions
                      .filter((a) => String(a.action_type) === "onsite_conversion.messaging_conversation_started_7d")
                      .reduce((s, a) => s + Number(a.value ?? 0), 0),
                    first_replies: rowActions
                      .filter((a) => String(a.action_type) === "messaging_first_reply")
                      .reduce((s, a) => s + Number(a.value ?? 0), 0),
                    spend: Number(row.spend ?? 0),
                  };
                }).sort((a, b) => b.conversations_started - a.conversations_started);
                return <FunnelLevelTable rows={rows} level="ad" />;
              }

              const campaignMap: Record<string, FunnelLevelRow> = {};
              for (const row of adRows) {
                const cid = row.campaign_id ?? row.campaign_name;
                if (!campaignMap[cid]) {
                  campaignMap[cid] = {
                    id: cid,
                    name: row.campaign_name,
                    impressions: 0,
                    reach: 0,
                    clicks: 0,
                    conversations_started: 0,
                    first_replies: 0,
                    spend: 0,
                  };
                }
                const entry = campaignMap[cid];
                entry.impressions += Number(row.impressions ?? 0);
                entry.reach += Number(row.reach ?? 0);
                entry.clicks += Number(row.unique_clicks ?? row.clicks ?? 0);
                entry.spend += Number(row.spend ?? 0);
                for (const a of row.actions ?? []) {
                  if (String(a.action_type) === "onsite_conversion.messaging_conversation_started_7d") {
                    entry.conversations_started += Number(a.value ?? 0);
                  }
                  if (String(a.action_type) === "messaging_first_reply") {
                    entry.first_replies += Number(a.value ?? 0);
                  }
                }
              }
              const campaignRows = Object.values(campaignMap).sort((a, b) => b.conversations_started - a.conversations_started);
              return <FunnelLevelTable rows={campaignRows} level="campaign" />;
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

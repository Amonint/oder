import { useMemo, useState, useRef, useEffect } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAdAccounts,
  fetchCampaigns,
  fetchAdsList,
  fetchPages,
  fetchPageGeo,
  fetchPageDemographics,
  fetchPageInsights,
  fetchPageConversionTimeseries,
  fetchPageTrafficQuality,
  fetchPageTrafficQualityTimeseries,
  fetchPageAdDiagnostics,
  fetchPageFunnel,
  fetchTimeInsights,
  getMetaAccessToken,
  type GeoInsightRow,
  type GeoMetadata,
  type ConversionTimeseriesRow,
  type DemographicsRow,
} from "@/api/client";
import CompetitorPanel from "@/components/CompetitorPanel";
import { useCompetitorResolve } from "@/hooks/useCompetitorResolve";
import type { CompetitorResolvedSuggestion } from "@/api/client";
import RetentionModule from "@/components/RetentionModule";
import TrafficQualityCard from "@/components/TrafficQualityCard";
import TrafficQualityTimeseriesCard from "@/components/TrafficQualityTimeseriesCard";
import ConversionCpaControlChartCard from "@/components/ConversionCpaControlChartCard";
import AdDiagnosticsTable from "@/components/AdDiagnosticsTable";
import HourlyCpaHeatmapSection from "@/components/HourlyCpaHeatmapSection";
import ConversionFunnelCard from "@/components/ConversionFunnelCard";
import VideoRetentionFunnelCard from "@/components/VideoRetentionFunnelCard";
import ConversationDepthCpaCard from "@/components/ConversationDepthCpaCard";
import FunnelReplyGaugeCard from "@/components/FunnelReplyGaugeCard";
import MediaCostTimeseriesCard from "@/components/MediaCostTimeseriesCard";
import ConversationQualityCard from "@/components/ConversationQualityCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import KpiGrid from "@/components/KpiGrid";
import EcuadorProvinceMap from "@/components/EcuadorProvinceMap";
import GeoRegionalEfficiencyBars from "@/components/GeoRegionalEfficiencyBars";
import type { GeoMapMetric } from "@/components/GeoMap";
import DemographicsPanel from "@/components/DemographicsPanel";
import { computePrevPeriod, unionCrossesMetaAttributionChange } from "@/lib/periodCompare";
import { buildPageDashboardSnapshot } from "@/lib/dashboardExportPage";
import { collectPageDashboardExport } from "@/lib/pageDashboardExportCollect";
import { resolveAdReference } from "@/lib/adReference";
import { resolvePageDateFilter } from "@/lib/pageDateFilter";

const ALL = "__all__";
const PAGE_BREAKDOWN_OBJECTIVE_METRIC = "messaging_conversation_started" as const;
const GEO_CPA_MIN_SPEND_USD = 25;
const PAGE_MESSAGING_OBJECTIVE_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
];

function hasValidCpa(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function filterSeriesByCpa(rows: ConversionTimeseriesRow[] | undefined): ConversionTimeseriesRow[] {
  return (rows ?? []).filter((row) => hasValidCpa(row.cpa));
}

function filterDemographicsByCpa(rows: DemographicsRow[] | undefined): DemographicsRow[] {
  return (rows ?? []).filter((row) => hasValidCpa(row.cpa));
}

const DATE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
  { value: "maximum", label: "Máximo disponible" },
] as const;

const EMPTY_PUBLICATION_RE = /^(?:publicaci[oó]n:\s*)?["“”'`]\s*["“”'`]$/i;
function safeCampaignName(name: string | null | undefined, id: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  const safeId = String(id ?? "").trim();
  if (raw && !EMPTY_PUBLICATION_RE.test(raw)) return raw;
  if (safeId) return `Campaña sin nombre (ID: ${safeId})`;
  return "Campaña sin nombre";
}

export default function PageDashboardPage() {
  const { accountId, pageId } = useParams<{
    accountId: string;
    pageId: string;
  }>();
  const hasToken = Boolean(getMetaAccessToken());
  const [datePreset, setDatePreset] = useState("last_30d");
  const [campaignSelect, setCampaignSelect] = useState(ALL);
  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateStart, setCustomDateStart] = useState<string | null>(null);
  const [customDateStop, setCustomDateStop] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showCompetitorSearch, setShowCompetitorSearch] = useState(false);
  const [competitorInput, setCompetitorInput] = useState("");
  const [pageDemographicsBreakdown, setPageDemographicsBreakdown] = useState<
    "age" | "gender" | "age,gender"
  >("age");
  const [pageGeoMetric, setPageGeoMetric] = useState<GeoMapMetric>("clicks");
  const [isExportingReport, setIsExportingReport] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const resolveState = useCompetitorResolve(competitorInput, pageId ? decodeURIComponent(pageId) : undefined);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setCompetitorInput("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (resolveState.status === "resolved") {
      setSelectedCompetitor({ id: resolveState.page_id, name: resolveState.name });
      setShowCompetitorSearch(false);
      setCompetitorInput("");
    }
  }, [resolveState]);

  const id = accountId ? decodeURIComponent(accountId) : "";
  const pid = pageId ? decodeURIComponent(pageId) : "";
  const campaignId = campaignSelect !== ALL ? campaignSelect : undefined;

  if (!hasToken) return <Navigate to="/" replace />;
  if (!id) return <Navigate to="/accounts" replace />;
  if (!pid) return <Navigate to={`/accounts/${encodeURIComponent(id)}/pages`} replace />;

  const pageDateFilter = useMemo(
    () =>
      resolvePageDateFilter({
        datePreset,
        customDateStart,
        customDateStop,
      }),
    [datePreset, customDateStart, customDateStop],
  );
  const effectiveDateParams = pageDateFilter.requestParams;
  const explicitDateWindow = pageDateFilter.calendarWindow;

  function handleDatePresetChange(value: string) {
    if (value === "custom") {
      setShowDateModal(true);
    } else {
      setDatePreset(value);
      setCustomDateStart(null);
      setCustomDateStop(null);
    }
  }

  async function handleDownloadReport() {
    setIsExportingReport(true);
    try {
      const account = accountsQuery.data?.data.find((a) => a.id === id);
      const page = pagesQuery.data?.data.find((p) => p.page_id === pid);
      const selectedCampaignName =
        campaignId != null
          ? safeCampaignName(
              campaignsQuery.data?.data.find((c) => c.id === campaignId)?.name ??
                null,
              campaignId,
            )
          : null;
      const collected = await collectPageDashboardExport({
        accountId: id,
        pageId: pid,
        datePreset,
        customDateStart,
        customDateStop,
        campaignSelect,
        demographicsBreakdown: pageDemographicsBreakdown,
        competitorPageId: selectedCompetitor?.id ?? null,
      });
      const report = buildPageDashboardSnapshot({
        accountId: id,
        accountName: account?.name ?? null,
        pageId: pid,
        pageName: page?.name ?? null,
        currency: account?.currency ?? null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        filters: {
          date_preset: datePreset,
          custom_date_start: customDateStart,
          custom_date_stop: customDateStop,
          campaign_id: campaignId ?? null,
          campaign_name: selectedCampaignName,
          geo_metric_selected_ui: pageGeoMetric,
          demographics_breakdown: pageDemographicsBreakdown,
          competitor: selectedCompetitor
            ? { page_id: selectedCompetitor.id, name: selectedCompetitor.name }
            : null,
        },
        collected,
      });
      const filename = `dashboard_snapshot_page_${pid.replace(/[^a-zA-Z0-9_-]/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json;charset=utf-8",
      });
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

  const opts = {
    ...effectiveDateParams,
    campaignId,
    objectiveMetric: PAGE_BREAKDOWN_OBJECTIVE_METRIC,
  };

  const insightsQuery = useQuery({
    queryKey: ["page-insights-v2", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageInsights(id, pid, opts),
  });

  const geoQuery = useQuery({
    queryKey: ["page-geo", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageGeo(id, pid, opts),
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaigns(id),
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAdAccounts,
  });

  const pagesQuery = useQuery({
    queryKey: ["pages", id, datePreset, customDateStart, customDateStop],
    queryFn: () =>
      fetchPages(id, {
        datePreset,
        dateStart: (effectiveDateParams as { dateStart?: string }).dateStart,
        dateStop: (effectiveDateParams as { dateStop?: string }).dateStop,
      }),
  });

  const adsListQuery = useQuery({
    queryKey: ["ads-list", id, campaignId],
    queryFn: () => {
      if (campaignId) return fetchAdsList(id, { campaignId });
      return fetchAdsList(id);
    },
  });

  const adReferenceUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ad of adsListQuery.data?.data ?? []) {
      const href = resolveAdReference({
        adId: ad.id,
        adAccountId: id,
        creative: ad.creative,
        storyId: ad.creative?.effective_object_story_id ?? null,
        storyPermalink: ad.creative?.effective_object_story_permalink ?? null,
      }).url;
      if (href) map.set(String(ad.id), href);
    }
    return map;
  }, [adsListQuery.data?.data, id]);

  const conversionTsQuery = useQuery({
    queryKey: ["page-conv-ts-v4", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageConversionTimeseries(id, pid, opts),
  });

  const trafficQualityQuery = useQuery({
    queryKey: ["page-traffic-quality", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageTrafficQuality(id, pid, opts),
  });

  const trafficQualityTsQuery = useQuery({
    queryKey: ["page-traffic-quality-ts", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageTrafficQualityTimeseries(id, pid, opts),
  });

  const adDiagnosticsQuery = useQuery({
    queryKey: ["page-ad-diagnostics", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageAdDiagnostics(id, pid, opts),
  });

  const hourlyPageInsightsQuery = useQuery({
    queryKey: ["page-hourly", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () =>
      fetchTimeInsights(id, {
        ...effectiveDateParams,
        campaignId,
        timeIncrement: "hourly",
      }),
    enabled: hasToken && Boolean(id),
  });

  const funnelQuery = useQuery({
    queryKey: ["page-funnel-v2", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageFunnel(id, pid, opts),
  });

  const pageDemographicsQuery = useQuery({
    queryKey: [
      "page-demographics",
      id,
      pid,
      datePreset,
      customDateStart,
      customDateStop,
      campaignId,
      pageDemographicsBreakdown,
    ],
    queryFn: () =>
      fetchPageDemographics(id, pid, {
        ...opts,
        breakdown: pageDemographicsBreakdown,
      }),
  });

  const pageConvBounds = useMemo(() => {
    const rows = conversionTsQuery.data?.data ?? [];
    if (rows.length < 2) return null;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    return { start: sorted[0]!.date, stop: sorted[sorted.length - 1]!.date };
  }, [conversionTsQuery.data?.data]);

  const conversionRowsCpa = useMemo(
    () => filterSeriesByCpa(conversionTsQuery.data?.data),
    [conversionTsQuery.data?.data],
  );
  const conversionRowsRawCount = conversionTsQuery.data?.data?.length ?? 0;

  const prevPageConvPeriod = useMemo(() => {
    if (!pageDateFilter.compareAgainstPreviousPeriod) return null;
    if (explicitDateWindow) {
      return computePrevPeriod(explicitDateWindow.dateStart, explicitDateWindow.dateStop);
    }
    if (!pageConvBounds) return null;
    return computePrevPeriod(pageConvBounds.start, pageConvBounds.stop);
  }, [pageDateFilter.compareAgainstPreviousPeriod, explicitDateWindow, pageConvBounds]);

  const pageConvDiscontinuity = useMemo(() => {
    if (!prevPageConvPeriod) return false;
    const currStart = explicitDateWindow?.dateStart ?? pageConvBounds?.start;
    const currStop = explicitDateWindow?.dateStop ?? pageConvBounds?.stop;
    if (!currStart || !currStop) return false;
    return unionCrossesMetaAttributionChange(
      currStart,
      currStop,
      prevPageConvPeriod.dateStart,
      prevPageConvPeriod.dateStop,
    );
  }, [explicitDateWindow, pageConvBounds, prevPageConvPeriod]);

  const pageConversionPrevQuery = useQuery({
    queryKey: [
      "page-conv-ts-prev",
      "v3",
      id,
      pid,
      campaignId,
      prevPageConvPeriod?.dateStart,
      prevPageConvPeriod?.dateStop,
    ],
    queryFn: () =>
      fetchPageConversionTimeseries(id, pid, {
        campaignId,
        dateStart: prevPageConvPeriod!.dateStart,
        dateStop: prevPageConvPeriod!.dateStop,
      }),
    enabled: Boolean(
      id && pid && prevPageConvPeriod && (conversionTsQuery.data?.data?.length ?? 0) >= 2,
    ),
  });

  const conversionPrevRowsCpa = useMemo(
    () => pageConversionPrevQuery.data?.data ?? [],
    [pageConversionPrevQuery.data?.data],
  );

  const geoRows: GeoInsightRow[] = (geoQuery.data?.data ?? []).map((r) => {
    const clicksRaw = r.clicks;
    const clicks =
      typeof clicksRaw === "number"
        ? clicksRaw
        : parseInt(String(clicksRaw ?? "0"), 10) || 0;
    const results =
      typeof r.results === "number"
        ? r.results
        : r.results == null
          ? undefined
          : parseInt(String(r.results), 10) || 0;
    const cpa =
      r.cpa === null || r.cpa === undefined ? null : Number(r.cpa);
    return {
      region: r.region ?? "",
      region_name: r.region_name ?? r.region ?? "",
      impressions: parseInt(String(r.impressions ?? "0"), 10) || 0,
      clicks,
      spend: r.spend ?? "0",
      reach: parseInt(String(r.reach ?? "0"), 10) || 0,
      results,
      cpa: Number.isFinite(cpa) && (cpa as number) > 0 ? cpa : null,
    };
  }).filter((row) => row.clicks > 0 || row.impressions > 0 || parseFloat(String(row.spend)) > 0);
  const geoRowsRawCount = geoQuery.data?.data?.length ?? 0;

  useEffect(() => {
    if (pageGeoMetric === "cpa" && geoRows.length > 0 && !geoRows.some((r) => r.cpa !== null)) {
      setPageGeoMetric("clicks");
    }
  }, [geoRows, pageGeoMetric]);

  const demographicsRowsCpa = useMemo(
    () => filterDemographicsByCpa(pageDemographicsQuery.data?.data),
    [pageDemographicsQuery.data?.data],
  );
  const demographicsRowsRawCount = pageDemographicsQuery.data?.data?.length ?? 0;

  const geoMeta: GeoMetadata = geoQuery.data?.metadata ?? {
    scope: "account",
    ad_id: null,
    total_rows: geoRows.length,
    complete_coverage: false,
    objective_metric: PAGE_BREAKDOWN_OBJECTIVE_METRIC,
    objective_breakdown_complete: null,
    warning: null,
    note: `Página: ${pid}`,
  };
  const geoMetaFiltered: GeoMetadata = {
    ...geoMeta,
    total_rows: geoRows.length,
  };

  const primaryError = insightsQuery.error ?? null;
  const totalConversations = funnelQuery.data?.conversations_started ?? 0;
  const totalFirstReplies = funnelQuery.data?.first_replies ?? 0;
  const totalSpend = parseFloat(insightsQuery.data?.data?.[0]?.spend ?? "0") || 0;
  const aggregateCpa =
    totalConversations > 0 ? Math.round((totalSpend / totalConversations) * 100) / 100 : null;

  const mainContent = (
    <div className="w-full space-y-6">
      {/* Error global */}
      {primaryError ? (
        <Alert variant="destructive">
          <AlertTitle>Error al cargar datos</AlertTitle>
          <AlertDescription>
            {primaryError instanceof Error
              ? primaryError.message
              : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* KPIs */}
      <KpiGrid
        data={insightsQuery.data?.data}
        isLoading={insightsQuery.isLoading}
        conversations={totalConversations}
        cpa={aggregateCpa}
        firstReplies={totalFirstReplies}
      />

      <MediaCostTimeseriesCard
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
      />

      {/* Módulo 1: Rentabilidad y Adquisición */}
      {!conversionTsQuery.isLoading && conversionRowsRawCount > 0 && conversionRowsCpa.length === 0 ? (
        <Alert>
          <AlertTitle>Sin CPA válido para rentabilidad</AlertTitle>
          <AlertDescription>
            Llegaron {conversionRowsRawCount} filas, pero ninguna trae CPA &gt; 0 para “conversación iniciada”.
            Revisa objetivo/atribución en Meta o periodo con más señal.
          </AlertDescription>
        </Alert>
      ) : null}
      <RetentionModule
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
        objectiveLabel="conversaciones iniciadas"
        comparisonSeries={conversionPrevRowsCpa}
        comparisonLoading={pageConversionPrevQuery.isLoading}
        showAttributionDiscontinuity={pageConvDiscontinuity}
        currentPeriod={
          explicitDateWindow
            ? { dateStart: explicitDateWindow.dateStart, dateStop: explicitDateWindow.dateStop }
            : pageConvBounds
            ? { dateStart: pageConvBounds.start, dateStop: pageConvBounds.stop }
            : undefined
        }
        previousPeriod={
          prevPageConvPeriod
            ? { dateStart: prevPageConvPeriod.dateStart, dateStop: prevPageConvPeriod.dateStop }
            : undefined
        }
      />
      {/* Módulo 2: Embudo de Conversión */}
      <ConversionFunnelCard
        data={funnelQuery.data}
        isLoading={funnelQuery.isLoading}
      />
      <VideoRetentionFunnelCard
        data={funnelQuery.data}
        isLoading={funnelQuery.isLoading}
      />
      <ConversationDepthCpaCard
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
      />
      <ConversationQualityCard
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
      />
      <ConversionCpaControlChartCard
        data={conversionRowsCpa}
        isLoading={conversionTsQuery.isLoading}
        metricLabel="costo por conversación iniciada"
        currentPeriod={
          explicitDateWindow
            ? { dateStart: explicitDateWindow.dateStart, dateStop: explicitDateWindow.dateStop }
            : pageConvBounds
              ? { dateStart: pageConvBounds.start, dateStop: pageConvBounds.stop }
              : undefined
        }
      />
      <FunnelReplyGaugeCard
        funnel={funnelQuery.data}
        insightsRow={insightsQuery.data?.data?.[0]}
        isLoading={funnelQuery.isLoading || insightsQuery.isLoading}
      />

      {/* Módulo 3: Calidad de Tráfico */}
      <TrafficQualityCard
        data={trafficQualityQuery.data}
        isLoading={trafficQualityQuery.isLoading}
      />
      <TrafficQualityTimeseriesCard
        data={trafficQualityTsQuery.data?.data}
        isLoading={trafficQualityTsQuery.isLoading}
        isError={trafficQualityTsQuery.isError}
        errorMessage={
          trafficQualityTsQuery.error instanceof Error ? trafficQualityTsQuery.error.message : undefined
        }
      />

      {/* Distribución geográfica */}
      {geoQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : geoRows.length > 0 ? (
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-foreground text-base font-semibold">
                Distribución geográfica
              </h2>
              <Select value={pageGeoMetric} onValueChange={(v) => setPageGeoMetric(v as GeoMapMetric)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clicks">Clics</SelectItem>
                  <SelectItem value="impressions">Impresiones</SelectItem>
                  <SelectItem value="reach">Alcance</SelectItem>
                  <SelectItem value="spend">Gasto</SelectItem>
                  <SelectItem value="results">Resultados</SelectItem>
                  {geoRows.some((r) => r.cpa !== null) && (
                    <SelectItem value="cpa">CPA</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <EcuadorProvinceMap
              data={geoRows}
              metadata={geoMetaFiltered}
              metric={pageGeoMetric}
              minSpendUsd={GEO_CPA_MIN_SPEND_USD}
              extraCaption={
                pageGeoMetric === "cpa"
                  ? "Costo por conversación iniciada por región."
                  : undefined
              }
            />
            {pageGeoMetric === "cpa" ? (
              <p className="text-muted-foreground mt-2 max-w-3xl text-xs leading-relaxed">
                El mapa usa la misma ventana de fechas que el resto de la vista de página. La atribución sigue la
                configuración predeterminada de Meta para insights de pauta (sin override explícito en esta pantalla).
              </p>
            ) : null}
          </div>
          <GeoRegionalEfficiencyBars
            rows={geoRows}
            mapMetric={pageGeoMetric}
            minSpendUsd={GEO_CPA_MIN_SPEND_USD}
          />
        </div>
      ) : geoRowsRawCount > 0 ? (
        <Alert>
          <AlertTitle>Sin datos geográficos</AlertTitle>
          <AlertDescription>
            Se recibieron {geoRowsRawCount} regiones, pero ninguna tiene actividad registrada en el período.
          </AlertDescription>
        </Alert>
      ) : null}

      {!pageDemographicsQuery.isLoading && demographicsRowsRawCount > 0 && demographicsRowsCpa.length === 0 ? (
        <Alert>
          <AlertTitle>Sin segmentos demográficos con CPA válido</AlertTitle>
          <AlertDescription>
            Llegaron {demographicsRowsRawCount} filas demográficas, pero ninguna trae CPA &gt; 0.
          </AlertDescription>
        </Alert>
      ) : null}
      <DemographicsPanel
        sectionTitle="Audiencia de pauta (demografía)"
        objectiveLabel="conversación iniciada"
        strictObjectiveCpa
        data={demographicsRowsCpa}
        isLoading={pageDemographicsQuery.isLoading}
        isError={pageDemographicsQuery.isError}
        errorMessage={
          pageDemographicsQuery.error instanceof Error
            ? pageDemographicsQuery.error.message
            : undefined
        }
        breakdown={pageDemographicsBreakdown}
        onBreakdownChange={setPageDemographicsBreakdown}
      />

      {/* Oportunidad horaria */}
      <HourlyCpaHeatmapSection
        rows={(hourlyPageInsightsQuery.data?.data ?? []) as Record<string, unknown>[]}
        objectiveActionTypes={PAGE_MESSAGING_OBJECTIVE_TYPES}
        overrideObjectiveLabel="Conversaciones iniciadas"
        isLoading={hourlyPageInsightsQuery.isLoading}
        isError={hourlyPageInsightsQuery.isError}
        errorMessage={
          hourlyPageInsightsQuery.error instanceof Error
            ? hourlyPageInsightsQuery.error.message
            : undefined
        }
      />

      {/* Módulo 3: Diagnóstico de Creatividades */}
      <AdDiagnosticsTable
        data={adDiagnosticsQuery.data?.data}
        isLoading={adDiagnosticsQuery.isLoading}
        adReferenceUrlById={adReferenceUrlById}
      />
    </div>
  );

  return (
    <div className="w-full py-6">
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

      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/accounts">Cuentas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/accounts/${encodeURIComponent(id)}/pages`}>Páginas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[200px] truncate font-mono text-xs">
              {pid}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mt-6">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Rendimiento por Página (Marca)
          </h1>
          <p className="text-muted-foreground font-mono text-sm">{pid}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Periodo</span>
          <Select value={datePreset} onValueChange={handleDatePresetChange}>
            <SelectTrigger className="w-[200px]">
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
          <div className="flex rounded-md border overflow-hidden">
            <Button variant="ghost" size="sm" className="rounded-none h-auto px-3" asChild>
              <Link to={`/accounts/${encodeURIComponent(id)}/dashboard`}>Cuenta</Link>
            </Button>
            <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground border-l">
              Página
            </span>
          </div>
          <Button variant="outline" asChild>
            <Link to={`/accounts/${encodeURIComponent(id)}/pages`}>
              ← Páginas
            </Link>
          </Button>
          <Button
            type="button"
            onClick={() => void handleDownloadReport()}
            disabled={isExportingReport}
          >
            {isExportingReport ? "Recolectando módulos…" : "Descargar reporte"}
          </Button>
        </div>
      </div>

      {/* Filtro de campaña + Inteligencia competitiva */}
      <div className="flex flex-wrap items-end gap-3 mt-6">
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs">Filtrar por campaña</span>
          <Select
            value={campaignSelect}
            onValueChange={setCampaignSelect}
            disabled={campaignsQuery.isLoading}
          >
            <SelectTrigger className="w-[min(100vw-2rem,320px)]">
              <SelectValue placeholder="Cargando campañas…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las campañas</SelectItem>
              {(campaignsQuery.data?.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {safeCampaignName(c.name, c.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buscador de competidor */}
        <div className="space-y-2.5 md:ml-8 lg:ml-12">
          <span className="text-muted-foreground text-xs">Inteligencia competitiva</span>
          {selectedCompetitor ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium truncate max-w-[200px]">{selectedCompetitor.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-1"
                onClick={() => {
                  setSelectedCompetitor(null);
                  setShowCompetitorSearch(false);
                  setCompetitorInput("");
                }}
                aria-label="Quitar competidor"
              >
                ✕
              </Button>
            </div>
          ) : showCompetitorSearch ? (
            <div ref={searchRef} className="relative">
              <Input
                autoFocus
                placeholder="Pega URL de Facebook o Instagram, o escribe el nombre…"
                value={competitorInput}
                onChange={(e) => setCompetitorInput(e.target.value)}
                className="w-[min(100vw-2rem,320px)]"
              />

              {/* Resolving */}
              {resolveState.status === "resolving" && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                  Buscando…
                </div>
              )}

              {/* Error */}
              {resolveState.status === "error" && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-destructive">
                  {resolveState.message}
                </div>
              )}

              {/* Sugerencias (texto libre) */}
              {resolveState.status === "suggestions" && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <div className="px-3 py-1.5 text-xs text-amber-600 border-b">
                    ⚠ Resultados aproximados — pega la URL para exactitud
                  </div>
                  {resolveState.items.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                  )}
                  {resolveState.items.map((s: CompetitorResolvedSuggestion) => (
                    <button
                      key={s.page_id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedCompetitor({ id: s.page_id, name: s.name });
                        setShowCompetitorSearch(false);
                        setCompetitorInput("");
                      }}
                    >
                      <span className="font-medium">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowCompetitorSearch(true)}>
              Buscar competidor
            </Button>
          )}
        </div>
      </div>

      {selectedCompetitor ? (
        <div className="flex gap-4 lg:flex-row flex-col mt-6">
          <div className="lg:w-1/2 w-full min-w-0 space-y-6">
            {mainContent}
          </div>
          <div className="lg:w-1/2 w-full min-w-0">
            {selectedCompetitor && (
              <CompetitorPanel
                pageId={selectedCompetitor.id}
                pageName={selectedCompetitor.name}
                onClose={() => setSelectedCompetitor(null)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6">{mainContent}</div>
      )}
    </div>
  );
}

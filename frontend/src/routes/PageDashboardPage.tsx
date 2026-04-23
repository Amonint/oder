import { useMemo, useState, useRef, useEffect } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchPageGeo,
  fetchPageDemographics,
  fetchPageInsights,
  fetchPageConversionTimeseries,
  fetchPageTrafficQuality,
  fetchPageAdDiagnostics,
  fetchPageFunnel,
  fetchPageTimeseries,
  fetchPageStability,
  getMetaAccessToken,
  type GeoInsightRow,
  type GeoMetadata,
} from "@/api/client";
import CompetitorPanel from "@/components/CompetitorPanel";
import { useCompetitorResolve } from "@/hooks/useCompetitorResolve";
import type { CompetitorResolvedSuggestion } from "@/api/client";
import RetentionModule from "@/components/RetentionModule";
import TrafficQualityCard from "@/components/TrafficQualityCard";
import AdDiagnosticsTable from "@/components/AdDiagnosticsTable";
import ConversionFunnelCard from "@/components/ConversionFunnelCard";
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
import GeoMap from "@/components/GeoMap";
import ChoroplethMap from "@/components/ChoroplethMap";
import DemographicsPanel from "@/components/DemographicsPanel";
import SpendSparkline from "@/components/SpendSparkline";
import PerformanceControlChartCard from "@/components/PerformanceControlChartCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { computePrevPeriod, unionCrossesMetaAttributionChange } from "@/lib/periodCompare";
import { buildLlmPageContextReport } from "@/lib/llmPageContextReport";

const ALL = "__all__";

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
  const [pageGeoMetric, setPageGeoMetric] = useState<
    "impressions" | "spend" | "cpa" | "results"
  >("impressions");
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

  function handleDatePresetChange(value: string) {
    if (value === "custom") {
      setShowDateModal(true);
    } else {
      setDatePreset(value);
      setCustomDateStart(null);
      setCustomDateStop(null);
    }
  }

  function handleDownloadReport() {
    try {
      setIsExportingReport(true);
      const report = buildLlmPageContextReport({
        accountId: id,
        pageId: pid,
        datePreset,
        dateStart: (effectiveDateParams as { dateStart?: string }).dateStart ?? null,
        dateStop: (effectiveDateParams as { dateStop?: string }).dateStop ?? null,
        campaignId: campaignId ?? null,
        insights: insightsQuery.data,
        geo: geoQuery.data,
        demographics: pageDemographicsQuery.data,
        funnel: funnelQuery.data,
        timeseries: pageTimeseriesQuery.data,
        actions: undefined,
        traffic: trafficQualityQuery.data,
        campaigns: campaignsQuery.data?.data ?? [],
      });
      const filename = `llm_context_report_page_${pid.replace(/[^a-zA-Z0-9_-]/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
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

  const opts = { ...effectiveDateParams, campaignId };

  const insightsQuery = useQuery({
    queryKey: ["page-insights", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageInsights(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const geoQuery = useQuery({
    queryKey: ["page-geo", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageGeo(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaigns(id),
    staleTime: 10 * 60 * 1000,
  });

  const conversionTsQuery = useQuery({
    queryKey: ["page-conv-ts", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageConversionTimeseries(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const trafficQualityQuery = useQuery({
    queryKey: ["page-traffic-quality", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageTrafficQuality(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const adDiagnosticsQuery = useQuery({
    queryKey: ["page-ad-diagnostics", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageAdDiagnostics(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const funnelQuery = useQuery({
    queryKey: ["page-funnel", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageFunnel(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const pageTimeseriesQuery = useQuery({
    queryKey: ["page-timeseries", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageTimeseries(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const pageSpendDaily = useMemo(() => {
    const raw = pageTimeseriesQuery.data?.data ?? [];
    const pts: { date: string; spend: number }[] = [];
    for (const r of raw) {
      const d = String(r.date_start ?? r.date_stop ?? "").trim();
      if (!d) continue;
      pts.push({ date: d, spend: parseFloat(String(r.spend ?? "0")) || 0 });
    }
    return pts.sort((a, b) => a.date.localeCompare(b.date));
  }, [pageTimeseriesQuery.data]);

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
    staleTime: 5 * 60 * 1000,
  });

  const pageStabilityQuery = useQuery({
    queryKey: [
      "page-stability",
      id,
      pid,
      campaignId,
      datePreset,
      customDateStart,
      customDateStop,
    ],
    queryFn: () => fetchPageStability(id, pid, { campaignId, metric: "cac" }),
    staleTime: 5 * 60 * 1000,
  });

  const pageConvBounds = useMemo(() => {
    const rows = conversionTsQuery.data?.data ?? [];
    if (rows.length < 2) return null;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    return { start: sorted[0]!.date, stop: sorted[sorted.length - 1]!.date };
  }, [conversionTsQuery.data?.data]);

  const prevPageConvPeriod = useMemo(() => {
    if (!pageConvBounds) return null;
    return computePrevPeriod(pageConvBounds.start, pageConvBounds.stop);
  }, [pageConvBounds]);

  const pageConvDiscontinuity = useMemo(() => {
    if (!pageConvBounds || !prevPageConvPeriod) return false;
    return unionCrossesMetaAttributionChange(
      pageConvBounds.start,
      pageConvBounds.stop,
      prevPageConvPeriod.dateStart,
      prevPageConvPeriod.dateStop,
    );
  }, [pageConvBounds, prevPageConvPeriod]);

  const pageConversionPrevQuery = useQuery({
    queryKey: [
      "page-conv-ts-prev",
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
    staleTime: 5 * 60 * 1000,
  });

  const geoRows: GeoInsightRow[] = (geoQuery.data?.data ?? []).map((r) => {
    const clicksRaw = r.clicks;
    const clicks =
      typeof clicksRaw === "number"
        ? clicksRaw
        : parseInt(String(clicksRaw ?? "0"), 10) || 0;
    const results =
      typeof r.results === "number" ? r.results : parseInt(String(r.results ?? "0"), 10) || 0;
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
      cpa: Number.isFinite(cpa) ? cpa : null,
    };
  });

  const choroplethMetric: "spend" | "impressions" =
    pageGeoMetric === "spend" ? "spend" : "impressions";

  const geoMeta: GeoMetadata = {
    scope: "account",
    ad_id: null,
    total_rows: geoRows.length,
    complete_coverage: true,
    note: `Página: ${pid}`,
  };

  const primaryError = insightsQuery.error ?? null;

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
      {insightsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <KpiGrid
          data={insightsQuery.data?.data}
          isLoading={insightsQuery.isLoading}
        />
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gasto diario (pauta asociada a la página)</CardTitle>
          <CardDescription>
            Serie diaria desde Meta para el mismo periodo y filtro de campaña. Útil para ver ritmo de inversión.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pageTimeseriesQuery.isLoading ? (
            <Skeleton className="h-12 w-full rounded-md" />
          ) : pageTimeseriesQuery.isError ? (
            <p className="text-muted-foreground text-sm">
              No se pudo cargar la serie temporal de gasto.
            </p>
          ) : (
            <SpendSparkline
              data={pageSpendDaily}
              legend="Gasto diario de pauta asociado a la página"
            />
          )}
        </CardContent>
      </Card>

      {/* Módulo 1: Rentabilidad y Adquisición */}
      <RetentionModule
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
        comparisonSeries={pageConversionPrevQuery.data?.data}
        comparisonLoading={pageConversionPrevQuery.isLoading}
        showAttributionDiscontinuity={pageConvDiscontinuity}
      />
      <PerformanceControlChartCard
        data={pageStabilityQuery.data}
        isLoading={pageStabilityQuery.isLoading}
        isError={pageStabilityQuery.isError}
        errorMessage={
          pageStabilityQuery.error instanceof Error
            ? pageStabilityQuery.error.message
            : undefined
        }
        title="Estabilidad (CAC) - página"
      />

      {/* Módulo 2: Embudo de Conversión */}
      <ConversionFunnelCard
        data={funnelQuery.data}
        isLoading={funnelQuery.isLoading}
      />

      {/* Módulo 3: Calidad de Tráfico */}
      <TrafficQualityCard
        data={trafficQualityQuery.data}
        isLoading={trafficQualityQuery.isLoading}
      />

      {/* Distribución geográfica */}
      {geoQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : geoRows.length > 0 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-foreground mb-3 text-base font-semibold">
              Distribución geográfica
            </h2>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground text-sm">Métrica del mapa</span>
              <Select
                value={pageGeoMetric}
                onValueChange={(v) =>
                  setPageGeoMetric(v as "impressions" | "spend" | "cpa" | "results")
                }
              >
                <SelectTrigger className="w-[220px]">
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
            <GeoMap
              data={geoRows}
              metadata={geoMeta}
              metric={pageGeoMetric}
              extraCaption={
                pageGeoMetric === "cpa"
                  ? "CPA por región según resultados que devuelve Meta en este desglose; compáralo con el CPA agregado de los KPIs del mismo periodo y filtro de campaña."
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
          {geoQuery.data && geoQuery.data.data.length > 0 && (
            <ChoroplethMap
              data={geoQuery.data.data.map((row) => ({
                region_name: row.region_name || row.region || "",
                spend: parseFloat(String(row.spend ?? "0")),
                impressions: parseInt(String(row.impressions ?? "0"), 10) || undefined,
              }))}
              metric={choroplethMetric}
            />
          )}
        </div>
      ) : null}

      <DemographicsPanel
        sectionTitle="Audiencia de pauta (demografía)"
        data={pageDemographicsQuery.data?.data}
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

      {/* Módulo 3: Diagnóstico de Creatividades */}
      <AdDiagnosticsTable
        data={adDiagnosticsQuery.data?.data}
        isLoading={adDiagnosticsQuery.isLoading}
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
            onClick={handleDownloadReport}
            disabled={isExportingReport || insightsQuery.isLoading || pageTimeseriesQuery.isLoading}
          >
            {isExportingReport ? "Generando..." : "Descargar reporte"}
          </Button>
        </div>
      </div>

      <Alert className="mt-4">
        <AlertTitle>Estás viendo: Página</AlertTitle>
        <AlertDescription>
          Aquí ves el rendimiento de una página específica.
          Si quieres ver el panorama completo de anuncios, cambia a <strong>Cuenta</strong>.
        </AlertDescription>
      </Alert>

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

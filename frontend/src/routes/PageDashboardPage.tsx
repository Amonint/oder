import { useMemo, useState, useRef, useEffect } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchPageGeo,
  fetchPageInsights,
  fetchPageConversionTimeseries,
  fetchPageTrafficQuality,
  fetchPageAdDiagnostics,
  fetchPageFunnel,
  getMetaAccessToken,
  type GeoInsightRow,
  type GeoMetadata,
} from "@/api/client";
import CompetitorPanel from "@/components/CompetitorPanel";
import MarketRadarPanel from "@/components/MarketRadarPanel";
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

const ALL = "__all__";

const DATE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
  { value: "maximum", label: "Máximo disponible" },
] as const;

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
  const [marketRadarOpen, setMarketRadarOpen] = useState(false);
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

  function handleOpenMarketRadar() {
    setSelectedCompetitor(null);
    setShowCompetitorSearch(false);
    setCompetitorInput("");
    setMarketRadarOpen(true);
  }

  function handleSelectCompetitorFromRadar(id: string, name: string) {
    setMarketRadarOpen(false);
    setSelectedCompetitor({ id, name });
  }

  function handleDatePresetChange(value: string) {
    if (value === "custom") {
      setShowDateModal(true);
    } else {
      setDatePreset(value);
      setCustomDateStart(null);
      setCustomDateStop(null);
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

  const geoRows: GeoInsightRow[] = (geoQuery.data?.data ?? []).map((r) => ({
    region: r.region ?? "",
    region_name: r.region_name ?? r.region ?? "",
    impressions: parseInt(r.impressions ?? "0") || 0,
    clicks: 0,
    spend: r.spend ?? "0",
    reach: parseInt(r.reach ?? "0") || 0,
  }));

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

      {/* Módulo 1: Rentabilidad y Adquisición */}
      <RetentionModule
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
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
            <GeoMap data={geoRows} metadata={geoMeta} metric="impressions" />
          </div>
          {geoQuery.data && geoQuery.data.data.length > 0 && (
            <ChoroplethMap
              data={geoQuery.data.data.map((row) => ({
                region_name: row.region_name || row.region || "",
                spend: parseFloat(row.spend ?? "0"),
                impressions: parseInt(row.impressions ?? "0") || undefined,
              }))}
              metric="spend"
            />
          )}
        </div>
      ) : null}

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
            Dashboard de página
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
          <Button variant="outline" asChild>
            <Link to={`/accounts/${encodeURIComponent(id)}/pages`}>
              ← Páginas
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtro de campaña + Buscar competidor */}
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
                  {c.name || c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Radar de Mercado */}
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs">Radar de Mercado</span>
          {marketRadarOpen ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium text-primary">Activo</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-1"
                onClick={() => setMarketRadarOpen(false)}
                aria-label="Cerrar Radar"
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleOpenMarketRadar}>
              🎯 Radar de Mercado
            </Button>
          )}
        </div>

        {/* Buscador de competidor */}
        <div className="space-y-1.5">
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

      {selectedCompetitor || marketRadarOpen ? (
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
            {marketRadarOpen && (
              <MarketRadarPanel
                pageId={pid}
                onClose={() => setMarketRadarOpen(false)}
                onSelectCompetitor={handleSelectCompetitorFromRadar}
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

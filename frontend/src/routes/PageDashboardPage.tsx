import { useMemo, useState } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchPageActions,
  fetchPageGeo,
  fetchPageInsights,
  fetchPagePlacements,
  fetchPageTimeseries,
  getMetaAccessToken,
  type GeoInsightRow,
  type GeoMetadata,
} from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import ActionsChart from "@/components/ActionsChart";
import TimeseriesChart from "@/components/TimeseriesChart";
import PlacementChart from "@/components/PlacementChart";
import GeoMap from "@/components/GeoMap";

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

  const opts = { ...effectiveDateParams, campaignId };

  const insightsQuery = useQuery({
    queryKey: ["page-insights", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageInsights(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const actionsQuery = useQuery({
    queryKey: ["page-actions", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageActions(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const timeseriesQuery = useQuery({
    queryKey: ["page-timeseries", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageTimeseries(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const placementsQuery = useQuery({
    queryKey: ["page-placements", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPagePlacements(id, pid, opts),
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

  // Adaptar PageGeoRow → GeoInsightRow para GeoMap
  const geoRows: GeoInsightRow[] = (geoQuery.data?.data ?? []).map((r) => ({
    region: r.region ?? "",
    region_name: r.region ?? "",
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

  const isAnyLoading =
    insightsQuery.isLoading ||
    actionsQuery.isLoading ||
    timeseriesQuery.isLoading;

  const primaryError =
    insightsQuery.error ?? actionsQuery.error ?? placementsQuery.error ?? null;

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
      <div className="flex flex-wrap items-start justify-between gap-4">
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

      {/* Filtro de campaña */}
      <div className="flex flex-wrap items-end gap-3">
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
      </div>

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
      {isAnyLoading ? (
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

      {/* Evolución + Acciones */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TimeseriesChart
          data={timeseriesQuery.data?.data}
          isLoading={timeseriesQuery.isLoading}
        />
        <ActionsChart
          data={actionsQuery.data?.data}
          isLoading={actionsQuery.isLoading}
        />
      </div>

      {/* Placements */}
      <PlacementChart
        data={placementsQuery.data?.data}
        isLoading={placementsQuery.isLoading}
      />

      {/* Geo */}
      {geoQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : geoRows.length > 0 ? (
        <div>
          <h2 className="text-foreground mb-3 text-base font-semibold">
            Distribución geográfica
          </h2>
          <GeoMap data={geoRows} metadata={geoMeta} metric="impressions" />
        </div>
      ) : null}
    </div>
  );
}

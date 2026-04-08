import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
  getMetaAccessToken,
} from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import GeoMap from "@/components/GeoMap";
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
  RANKING_METRIC_LABELS,
  labelForMetaActionType,
  shortActionTypeLabel,
} from "@/lib/metaInsightsLabels";
import { groupActionsByCategory } from "@/lib/actionCategories";

const ALL = "__all__";

const DATE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
  { value: "maximum", label: "Máximo disponible" },
] as const;

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toLocaleString("es", { maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [datePreset, setDatePreset] = useState<string>("last_30d");
  const [rankingMetric, setRankingMetric] = useState<"impressions" | "clicks" | "spend" | "ctr">("impressions");
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [campaignSelect, setCampaignSelect] = useState<string>(ALL);
  const [adsetSelect, setAdsetSelect] = useState<string>(ALL);
  const [geoScope, setGeoScope] = useState<"account" | "ad">("account");
  const [mainTab, setMainTab] = useState<string>("resumen");
  const [perfGranularity, setPerfGranularity] = useState<"period" | "daily">("period");
  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateStart, setCustomDateStart] = useState<string | null>(null);
  const [customDateStop, setCustomDateStop] = useState<string | null>(null);
  const hasToken = Boolean(getMetaAccessToken());
  const id = accountId ? decodeURIComponent(accountId) : "";
  const campaignKey = campaignSelect !== ALL ? campaignSelect : null;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", id, datePreset, campaignKey, customDateStart, customDateStop],
    queryFn: () =>
      fetchAccountDashboard(id, datePreset, {
        campaignId: campaignKey ?? undefined,
        ...effectiveDateParams,
      }),
    enabled: hasToken && Boolean(id),
    staleTime: 5 * 60 * 1000,
  });

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
      if (!campaignKey) return Promise.resolve({ data: [] });
      if (adsetSelect !== ALL) return fetchAdsList(id, { adsetId: adsetSelect });
      return fetchAdsList(id, { campaignId: campaignKey });
    },
    enabled: hasToken && Boolean(id) && Boolean(campaignKey),
  });

  const rankingQuery = useQuery({
    queryKey: [
      "ads-performance",
      id,
      datePreset,
      perfGranularity,
      campaignKey,
      adsetSelect,
      selectedAdId,
    ],
    queryFn: () => {
      const opts: Parameters<typeof fetchAdsPerformance>[1] = { datePreset };
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
      campaignKey,
      adsetSelect,
      selectedAdId,
    ],
    queryFn: () => {
      const opts: Parameters<typeof fetchPlacementInsights>[1] = { datePreset };
      if (selectedAdId) {
        opts.adId = selectedAdId;
      } else if (adsetSelect !== ALL) {
        opts.adsetId = adsetSelect;
      } else if (campaignKey) {
        opts.campaignId = campaignKey;
      }
      return fetchPlacementInsights(id, opts);
    },
    enabled: hasToken && Boolean(id) && mainTab === "plataformas",
  });

  const accountLabel =
    accountsQuery.data?.data.find((a) => a.id === id)?.name ?? id;

  const geoQuery = useQuery({
    queryKey: ["geo-insights", id, geoScope, selectedAdId, datePreset],
    queryFn: () => fetchGeoInsights(id, {
      scope: geoScope,
      adId: geoScope === "ad" ? (selectedAdId ?? undefined) : undefined,
      datePreset,
    }),
    enabled: hasToken && Boolean(id) && (geoScope === "account" || Boolean(selectedAdId)),
  });

  const targetingQuery = useQuery({
    queryKey: ["targeting", id, selectedAdId],
    queryFn: () => fetchAdTargeting(id, selectedAdId!),
    enabled: hasToken && Boolean(id) && Boolean(selectedAdId),
  });

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

  const campaignNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaignsQuery.data?.data ?? []) m.set(c.id, c.name);
    return m;
  }, [campaignsQuery.data]);

  const adsetNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of adsetsQuery.data?.data ?? []) m.set(a.id, a.name);
    return m;
  }, [adsetsQuery.data]);

  const adNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of adsListQuery.data?.data ?? []) m.set(a.id, a.name);
    return m;
  }, [adsListQuery.data]);

  const categoryChartData = useMemo(() => {
    const actions = data?.actions ?? [];
    return groupActionsByCategory(
      actions.map((a) => ({
        action_type: a.action_type,
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
        label: shortActionTypeLabel(String(c.action_type), 26),
        value: Number(c.value ?? 0),
      }));
  }, [data?.cost_per_action_type]);

  const chartConfigCategory = {
    value: {
      label: "Eventos",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  const chartConfigTop = {
    value: {
      label: "Cantidad",
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;

  const chartConfigCost = {
    value: {
      label: "Coste medio",
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig;

  const rankingChartData = useMemo(() => {
    return (rankingQuery.data?.data ?? [])
      .map((row) => ({
        label: String(row.ad_label ?? row.ad_name ?? row.ad_id ?? "").slice(0, 22),
        value: Number(row[rankingMetric as keyof typeof row] ?? 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rankingQuery.data, rankingMetric]);

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
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

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
            Dashboard
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
          <Button variant="outline" asChild>
            <Link to="/accounts">Volver a cuentas</Link>
          </Button>
        </div>
      </div>

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
                      {c.name || c.id}
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
                      {s.name || s.id}
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
                      {ad.name || ad.id}
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
                {adNameMap.get(selectedAdId) ?? selectedAdId.slice(0, 12)}
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
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="plataformas">Plataformas</TabsTrigger>
          <TabsTrigger value="geografia">Geografía</TabsTrigger>
          <TabsTrigger value="targeting">Targeting</TabsTrigger>
        </TabsList>

        {/* ── Tab: Resumen ── */}
        <TabsContent value="resumen" className="space-y-6 pt-4">
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(data.summary).map(([key, val]) => (
                  <Card key={key}>
                    <CardHeader className="pb-2">
                      <CardDescription>
                        {DASHBOARD_KPI_LABELS[key] ?? key}
                      </CardDescription>
                      <CardTitle className="text-2xl tabular-nums">
                        {formatNum(val)}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>

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
                          <Bar dataKey="value" fill="var(--color-value)" radius={4} />
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
                          <Bar dataKey="value" fill="var(--color-value)" radius={4} />
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
                        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── Tab: Ranking ── */}
        <TabsContent value="ranking" className="space-y-6 pt-4">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">Métrica:</span>
            <Select value={rankingMetric} onValueChange={(v) => setRankingMetric(v as typeof rankingMetric)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Métrica" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="impressions">Impresiones</SelectItem>
                <SelectItem value="clicks">Clics</SelectItem>
                <SelectItem value="spend">Gasto</SelectItem>
                <SelectItem value="ctr">Tasa de clics (CTR)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                      <span className="text-primary ml-2 font-medium">
                        Anuncio seleccionado: {selectedAdId}
                      </span>
                    ) : (
                      <span className="text-muted-foreground ml-2">
                        Haz clic en una fila para seleccionar un anuncio.
                      </span>
                    )}
                  </CardDescription>
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
                          <TableHead className="text-right">CTR (%)</TableHead>
                          <TableHead className="text-right" title="Coste por mil impresiones">
                            CPM
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rankingQuery.data?.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center">
                              Sin datos de anuncios para este periodo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (rankingQuery.data?.data ?? []).map((row, idx) => (
                            <TableRow
                              key={String(row.ad_id ?? idx)}
                              className={`cursor-pointer ${selectedAdId === String(row.ad_id) ? "bg-muted" : ""}`}
                              onClick={() => {
                                const adId = row.ad_id != null ? String(row.ad_id) : null;
                                if (adId) setSelectedAdId(adId);
                              }}
                            >
                              <TableCell className="font-medium">
                                {row.ad_label}
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
                    {RANKING_METRIC_LABELS[rankingMetric] ?? rankingMetric} por anuncio
                    (top 10).
                  </CardDescription>
                </CardHeader>
                <CardContent className="pl-0">
                  {rankingChartData.length === 0 ? (
                    <p className="text-muted-foreground px-6 text-sm">
                      No hay datos para graficar.
                    </p>
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
                        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── Tab: Catálogo (estructura Meta) ── */}
        <TabsContent value="catalogo" className="space-y-6 pt-4">
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
        </TabsContent>

        {/* ── Tab: Plataformas / placements ── */}
        <TabsContent value="plataformas" className="space-y-6 pt-4">
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
                          <TableHead className="text-right">Impresiones</TableHead>
                          <TableHead className="text-right">Clics</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(placementQuery.data?.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
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
                              <TableCell className="text-right tabular-nums">
                                ${String(row.spend ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {String(row.impressions ?? "—")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {String(row.clicks ?? "—")}
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
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Geografía ── */}
        <TabsContent value="geografia" className="space-y-6 pt-4">
          <div className="flex items-center gap-3">
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
          </div>

          {geoScope === "ad" && !selectedAdId ? (
            <Alert>
              <AlertTitle>Selecciona un anuncio</AlertTitle>
              <AlertDescription>
                Ve a la pestaña <strong>Ranking</strong>, haz clic en una fila para seleccionar un anuncio y luego vuelve aquí.
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
                  <CardTitle>Distribución geográfica</CardTitle>
                  <CardDescription>
                    Impresiones por región —{" "}
                    {geoScope === "account" ? "cuenta completa" : `anuncio ${selectedAdId}`}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Región</TableHead>
                          <TableHead className="text-right">Impresiones</TableHead>
                          <TableHead className="text-right">Clics</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(geoQuery.data?.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center">
                              Sin datos geográficos para este periodo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (geoQuery.data?.data ?? []).map((row, idx) => (
                            <TableRow key={String(row.region ?? row.region_name ?? idx)}>
                              <TableCell className="font-medium">
                                {String(row.region ?? row.region_name ?? "Desconocido")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {Number(row.impressions ?? 0).toLocaleString("es")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {String(row.clicks ?? "—")}
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
                  <CardDescription>Distribución geográfica interactiva.</CardDescription>
                </CardHeader>
                <CardContent>
                  {geoQuery.isLoading ? (
                    <Skeleton className="w-full h-96" />
                  ) : geoQuery.isError ? (
                    <Alert variant="destructive">
                      <AlertDescription>Error al obtener datos geográficos.</AlertDescription>
                    </Alert>
                  ) : geoQuery.data ? (
                    <GeoMap
                      data={geoQuery.data.data}
                      metadata={geoQuery.data.metadata}
                      metric="impressions"
                    />
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── Tab: Targeting ── */}
        <TabsContent value="targeting" className="pt-4">
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
                    Ve a la pestaña <strong>Ranking</strong>, haz clic en una fila para seleccionar un anuncio y luego vuelve aquí.
                  </AlertDescription>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

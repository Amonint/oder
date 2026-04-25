import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { useEffect, useState } from "react";
import type { AudiencePerformanceResponse } from "@/api/client";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DASHBOARD_COLORS, barColorAt, dashboardChartColor } from "@/lib/dashboardColors";

const chartConfig = {
  spend: { label: "Gasto", color: DASHBOARD_COLORS[0] },
  results: { label: "Resultados", color: DASHBOARD_COLORS[1] },
  cpa_like: { label: "CPA aprox", color: DASHBOARD_COLORS[2] },
} satisfies ChartConfig;

const REF_STROKE = dashboardChartColor(3);
const REF_STROKE_OPACITY = 0.55;
const AUDIENCE_CUT_MODE_STORAGE_KEY = "audience_performance_cut_mode";

interface AudiencePerformancePanelProps {
  data?: AudiencePerformanceResponse;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function AudiencePerformancePanel({
  data,
  isLoading,
  isError,
  errorMessage,
}: AudiencePerformancePanelProps) {
  const [cutMode, setCutMode] = useState<"median" | "p25_p75">("median");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(AUDIENCE_CUT_MODE_STORAGE_KEY);
    if (saved === "median" || saved === "p25_p75") {
      setCutMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUDIENCE_CUT_MODE_STORAGE_KEY, cutMode);
  }, [cutMode]);
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error al cargar audiencias</AlertTitle>
        <AlertDescription>{errorMessage ?? "No se pudieron cargar audiencias."}</AlertDescription>
      </Alert>
    );
  }

  const rows = data?.data ?? [];
  const topChartRows = rows.slice(0, 10).map((row) => {
    const key = String(row.audience_id ?? row.audience_name);
    return {
      audience: row.audience_name.length > 34 ? `${row.audience_name.slice(0, 34)}...` : row.audience_name,
      colorKey: key,
      results: row.results,
      spend: row.spend,
    };
  });
  const scatterRows = rows
    .filter((row) => row.cpa_like != null && row.spend > 0 && row.results > 0)
    .map((row) => ({
      audience: row.audience_name,
      colorKey: String(row.audience_id ?? row.audience_name),
      spend: row.spend,
      cpa_like: row.cpa_like as number,
      results: row.results,
    }));

  const cpaValues = scatterRows.map((row) => row.cpa_like).sort((a, b) => a - b);
  const spendValues = scatterRows.map((row) => row.spend).sort((a, b) => a - b);
  const medianCpa =
    cpaValues.length === 0
      ? null
      : cpaValues.length % 2 === 1
        ? cpaValues[(cpaValues.length - 1) / 2]
        : (cpaValues[cpaValues.length / 2 - 1] + cpaValues[cpaValues.length / 2]) / 2;
  const medianSpend =
    spendValues.length === 0
      ? null
      : spendValues.length % 2 === 1
        ? spendValues[(spendValues.length - 1) / 2]
        : (spendValues[spendValues.length / 2 - 1] + spendValues[spendValues.length / 2]) / 2;
  const weightedCtr = rows.reduce(
    (acc, row) => {
      acc.clicks += row.clicks;
      acc.impressions += row.impressions;
      return acc;
    },
    { clicks: 0, impressions: 0 },
  );
  const weightedCtrPct =
    weightedCtr.impressions > 0 ? (weightedCtr.clicks / weightedCtr.impressions) * 100 : null;
  const percentile = (values: number[], p: number): number | null => {
    if (values.length === 0) return null;
    if (values.length === 1) return values[0];
    const idx = (values.length - 1) * p;
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    if (low === high) return values[low];
    const weight = idx - low;
    return values[low] * (1 - weight) + values[high] * weight;
  };
  const p25Cpa = percentile(cpaValues, 0.25);
  const p75Cpa = percentile(cpaValues, 0.75);
  const p25Spend = percentile(spendValues, 0.25);
  const p75Spend = percentile(spendValues, 0.75);
  const activeCuts =
    cutMode === "p25_p75"
      ? {
          spendLow: p25Spend,
          spendHigh: p75Spend,
          cpaLow: p25Cpa,
          cpaHigh: p75Cpa,
        }
      : {
          spendLow: medianSpend,
          spendHigh: medianSpend,
          cpaLow: medianCpa,
          cpaHigh: medianCpa,
        };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ranking de audiencias (inferido)</CardTitle>
          <CardDescription>
            Top audiencias por resultados en el periodo y filtros actuales. El gasto y resultado se distribuyen entre
            etiquetas configuradas en el targeting de cada anuncio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
            Señal inferida para hipótesis; no equivale a causalidad exacta de Meta por audiencia.
          </Badge>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Sin datos suficientes para construir ranking de audiencias con estos filtros.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={topChartRows} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="audience" width={180} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="results" radius={4} name="Resultados">
                  {topChartRows.map((d, i) => (
                    <Cell key={d.colorKey} fill={barColorAt(i, d.colorKey)} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Filas analizadas: {data?.summary.rows_considered ?? 0}</Badge>
            <Badge variant="secondary">Con targeting: {data?.summary.rows_with_targeting ?? 0}</Badge>
            <Badge variant="secondary">Audiencias únicas: {data?.summary.distinct_audiences ?? 0}</Badge>
            <Badge variant="secondary">Gasto acumulado: ${Number(data?.summary.total_spend ?? 0).toFixed(2)}</Badge>
            <Badge variant="secondary">
              CTR ponderado: {weightedCtrPct != null ? `${weightedCtrPct.toFixed(2)}%` : "—"}
            </Badge>
            <Badge variant="secondary">
              Mediana CPA: {medianCpa != null ? `$${medianCpa.toFixed(2)}` : "—"}
            </Badge>
          </div>
          {data?.note ? <p className="text-muted-foreground text-xs">{data.note}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapa estadístico de eficiencia</CardTitle>
          <CardDescription>
            Dispersión por audiencia: eje X = gasto, eje Y = CPA aprox, tamaño = resultados. Abajo-izquierda suele
            indicar audiencias más eficientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Criterio de corte</p>
              <Select value={cutMode} onValueChange={(v) => setCutMode(v as "median" | "p25_p75")}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="median">Mediana (50/50)</SelectItem>
                  <SelectItem value="p25_p75">Percentiles 25/75 (estricto)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {scatterRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay suficientes audiencias con gasto y resultados para calcular dispersión.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ScatterChart margin={{ top: 16, right: 22, bottom: 8, left: 8 }}>
                <CartesianGrid />
                <XAxis
                  type="number"
                  dataKey="spend"
                  name="Gasto"
                  tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                />
                <YAxis
                  type="number"
                  dataKey="cpa_like"
                  name="CPA aprox"
                  tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                />
                <ZAxis type="number" dataKey="results" range={[70, 430]} name="Resultados" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, key) => {
                        if (key === "spend" || key === "cpa_like") return `$${Number(value).toFixed(2)}`;
                        if (key === "results") return Number(value).toFixed(2);
                        return String(value);
                      }}
                    />
                  }
                />
                {activeCuts.spendLow != null ? (
                  <ReferenceLine
                    x={activeCuts.spendLow}
                    stroke={REF_STROKE}
                    strokeOpacity={REF_STROKE_OPACITY}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{
                      value:
                        cutMode === "p25_p75"
                          ? `P25 gasto: $${activeCuts.spendLow.toFixed(1)}`
                          : `Mediana gasto: $${activeCuts.spendLow.toFixed(1)}`,
                      position: "insideTopLeft",
                      fontSize: 11,
                      fill: DASHBOARD_COLORS[2],
                    }}
                  />
                ) : null}
                {activeCuts.spendHigh != null && cutMode === "p25_p75" ? (
                  <ReferenceLine
                    x={activeCuts.spendHigh}
                    stroke={REF_STROKE}
                    strokeOpacity={REF_STROKE_OPACITY}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{
                      value: `P75 gasto: $${activeCuts.spendHigh.toFixed(1)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: DASHBOARD_COLORS[2],
                    }}
                  />
                ) : null}
                {activeCuts.cpaLow != null ? (
                  <ReferenceLine
                    y={activeCuts.cpaLow}
                    stroke={REF_STROKE}
                    strokeOpacity={REF_STROKE_OPACITY}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{
                      value:
                        cutMode === "p25_p75"
                          ? `P25 CPA: $${activeCuts.cpaLow.toFixed(1)}`
                          : `Mediana CPA: $${activeCuts.cpaLow.toFixed(1)}`,
                      position: "insideBottomLeft",
                      fontSize: 11,
                      fill: DASHBOARD_COLORS[2],
                    }}
                  />
                ) : null}
                {activeCuts.cpaHigh != null && cutMode === "p25_p75" ? (
                  <ReferenceLine
                    y={activeCuts.cpaHigh}
                    stroke={REF_STROKE}
                    strokeOpacity={REF_STROKE_OPACITY}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                    label={{
                      value: `P75 CPA: $${activeCuts.cpaHigh.toFixed(1)}`,
                      position: "insideTopLeft",
                      fontSize: 11,
                      fill: DASHBOARD_COLORS[2],
                    }}
                  />
                ) : null}
                <Scatter data={scatterRows} name="Audiencias">
                  {scatterRows.map((row, i) => (
                    <Cell
                      key={`${row.colorKey}-${row.spend}-${row.cpa_like}`}
                      fill={barColorAt(i, row.colorKey)}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ChartContainer>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Leyenda (dispersión):</span>
            <Badge variant="secondary" className="inline-flex items-center gap-1.5 font-normal">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full border border-foreground/20"
                style={{ background: DASHBOARD_COLORS[0] }}
                aria-hidden
              />
              Cada punto es una audiencia; el color se repite según la paleta (mismo criterio que el resto del
              panel).
            </Badge>
            <Badge variant="secondary" className="max-w-2xl font-normal text-left leading-snug">
              Cuadrante favorable (bajo gasto y bajo CPA, según corte) suele quedar cerca de abajo-izquierda. Zona
              con más gasto y más CPA, arriba-derecha relativa a las líneas.
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle por audiencia</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Audiencia</TableHead>
                  <TableHead className="text-right">Resultados</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Conversaciones</TableHead>
                  <TableHead className="text-right">1ras respuestas</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">CPA aprox</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right"># Ads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Sin datos.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={`${row.category}-${row.audience_id ?? row.audience_name}`}>
                      <TableCell className="text-xs">{row.category}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-sm">{row.audience_name}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.results.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.leads_insights.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.conversations_started.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.first_replies.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">${row.spend.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.cpa_like != null ? `$${row.cpa_like.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.ctr != null ? `${row.ctr.toFixed(2)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.ads_count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

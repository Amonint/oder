import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import InfoTooltip from "@/components/InfoTooltip";
import type { ConversionTimeseriesRow } from "@/api/client";
import { barColorAt, dashboardChartColor } from "@/lib/dashboardColors";
import { META_ATTRIBUTION_CHANGE_ISO } from "@/lib/periodCompare";

interface RetentionModuleProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
  /** Serie del periodo anterior; se alinea posición a posición con el periodo actual (anclado al largo de la serie actual). */
  comparisonSeries?: ConversionTimeseriesRow[] | undefined;
  comparisonLoading?: boolean;
  /** Mostrar aviso si la comparación cruza el cambio de métricas Meta (2025-06-10). */
  showAttributionDiscontinuity?: boolean;
  currentPeriod?: { dateStart: string; dateStop: string };
  previousPeriod?: { dateStart: string; dateStop: string };
}

/** Ancla al periodo actual: D1…D_M con M = días del actual; el día i empareja el punto del anterior con el mismo desplazamiento desde el final. */
function alignComparisonToCurrentPeriod(
  curr: ConversionTimeseriesRow[],
  prev: ConversionTimeseriesRow[],
): Array<{
  dayIndex: number;
  spend: number;
  cpa: number;
  spendPrev: number;
  cpaPrev: number;
}> {
  const a = [...curr].sort((x, y) => x.date.localeCompare(y.date));
  const b = [...prev].sort((x, y) => x.date.localeCompare(y.date));
  if (a.length < 2 || b.length < 1) return [];
  return a.map((row, i) => {
    const prevIdx = b.length - (a.length - i);
    const p = prevIdx >= 0 && prevIdx < b.length ? b[prevIdx]! : null;
    return {
      dayIndex: i + 1,
      spend: row.spend,
      cpa: row.cpa,
      spendPrev: p?.spend ?? 0,
      cpaPrev: p?.cpa ?? 0,
    };
  });
}

function buildDailyCalendar(startIso: string, stopIso: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  const stop = new Date(`${stopIso}T00:00:00Z`);
  while (d.getTime() <= stop.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function densifySeries(
  rows: ConversionTimeseriesRow[],
  startIso: string,
  stopIso: string,
): ConversionTimeseriesRow[] {
  const byDate = new Map(rows.map((r) => [r.date, r] as const));
  return buildDailyCalendar(startIso, stopIso).map((date) => {
    const found = byDate.get(date);
    if (found) return found;
    return {
      date,
      spend: 0,
      cpa: 0,
      conversions: 0,
      conversations_started: 0,
      revenue: 0,
      replied: 0,
      depth2: 0,
    };
  });
}

function KpiTile({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 space-y-1">
      <p className="text-muted-foreground text-xs flex items-center">
        {label}
        <InfoTooltip text={tooltip} />
      </p>
      <p className="text-foreground text-xl font-semibold">{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  );
}

export default function RetentionModule({
  data,
  isLoading,
  comparisonSeries,
  comparisonLoading,
  showAttributionDiscontinuity,
  currentPeriod,
  previousPeriod,
}: RetentionModuleProps) {
  const rows = data ?? [];
  const compareRows = comparisonSeries ?? [];
  const { mergedCompare, compareLengthMismatch, loadedCurrentDays, loadedPreviousDays, totalCurrentDays } = useMemo(() => {
    if (compareRows.length < 2 || rows.length < 2) {
      return {
        mergedCompare: [] as ReturnType<typeof alignComparisonToCurrentPeriod>,
        compareLengthMismatch: false,
        loadedCurrentDays: rows.length,
        loadedPreviousDays: compareRows.length,
        totalCurrentDays: rows.length,
      };
    }
    if (currentPeriod && previousPeriod) {
      const denseCurr = densifySeries(rows, currentPeriod.dateStart, currentPeriod.dateStop);
      const densePrev = densifySeries(compareRows, previousPeriod.dateStart, previousPeriod.dateStop);
      const n = Math.min(denseCurr.length, densePrev.length);
      return {
        mergedCompare: denseCurr.slice(0, n).map((row, i) => {
          const prev = densePrev[i]!;
          return {
            dayIndex: i + 1,
            spend: row.spend,
            cpa: row.cpa,
            spendPrev: prev.spend,
            cpaPrev: prev.cpa,
          };
        }),
        compareLengthMismatch:
          rows.length !== denseCurr.length || compareRows.length !== densePrev.length,
        loadedCurrentDays: rows.length,
        loadedPreviousDays: compareRows.length,
        totalCurrentDays: denseCurr.length,
      };
    }
    const a = [...rows].sort((x, y) => x.date.localeCompare(y.date));
    const b = [...compareRows].sort((x, y) => x.date.localeCompare(y.date));
    return {
      mergedCompare: alignComparisonToCurrentPeriod(rows, compareRows),
      compareLengthMismatch: b.length !== a.length,
      loadedCurrentDays: rows.length,
      loadedPreviousDays: compareRows.length,
      totalCurrentDays: a.length,
    };
  }, [rows, compareRows, currentPeriod, previousPeriod]);

  // Totales para KPI cards
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  const totalConversationsStarted = rows.reduce((s, r) => s + (r.conversations_started ?? 0), 0);
  const totalReplied = rows.reduce((s, r) => s + (r.replied ?? 0), 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const replyRate = totalConversationsStarted > 0 ? (totalReplied / totalConversationsStarted) * 100 : 0;

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const useComparisonChart = mergedCompare.length >= 2;

  return (
    <section className="space-y-4">
      <h2 className="text-foreground text-lg font-semibold">Rentabilidad y Adquisición</h2>
      {showAttributionDiscontinuity ? (
        <Alert>
          <AlertTitle>Comparación entre definiciones distintas de Meta</AlertTitle>
          <AlertDescription className="text-sm">
            El periodo actual o el anterior cruzan el {META_ATTRIBUTION_CHANGE_ISO}. A partir de esa fecha Meta
            dejó de exponer algunas ventanas largas de visualización; los CPA/ROAS agregados pueden no ser
            comparables entre ambos lados del corte. Interpreta las diferencias con cautela.
          </AlertDescription>
        </Alert>
      ) : null}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0,1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              label="CPA Promedio"
              value={fmt(avgCpa)}
              sub="Costo por resultado"
              tooltip="Costo promedio por conversión (lead, mensaje iniciado o compra). Se calcula: Gasto total ÷ Total de conversiones del período."
            />
            <KpiTile
              label="Tasa de Respuesta (Insights)"
              value={replyRate > 0 ? `${replyRate.toFixed(1)}%` : "—"}
              sub="Serie diaria agregada"
              tooltip="Definición distinta a la tarjeta «Tasa de primera respuesta» del embudo. Aquí: suma de acciones messaging_conversation_replied_7d ÷ suma de conversaciones iniciadas de la misma serie diaria. Agregado de Insights de pauta, no el embudo de página."
            />
            <KpiTile
              label="Conversiones"
              value={totalConversions.toFixed(0)}
              sub="Leads / Mensajes iniciados"
              tooltip="Total de conversiones del período: leads generados, mensajes de WhatsApp o Messenger iniciados, o compras. Fuente: campo actions de la API, filtrado por tipos de conversión configurados."
            />
            <KpiTile
              label="Primeras Respuestas (Insights)"
              value={totalReplied > 0 ? totalReplied.toFixed(0) : "—"}
              sub="Suma replied en la serie"
              tooltip="Suma de la métrica replied de la serie de conversiones (misma ventana y filtro que el gráfico). No es «first_replies» del embudo Meta; úsalo junto al KPI de tasa Insights arriba."
            />
          </div>
        </TooltipProvider>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {useComparisonChart ? "Gasto y CPA — actual vs periodo anterior" : "Gasto diario vs CPA"}
          </CardTitle>
          <div className="text-muted-foreground space-y-1 text-sm">
            <p>
              {useComparisonChart
                ? "Eje X = D1…DM (calendario completo del periodo actual). Barras = gasto actual · línea CPA actual · discontinuas = anterior en su día calendario equivalente del periodo previo."
                : "Barras = Gasto ($) · Línea = CPA ($)"}
            </p>
            {useComparisonChart && compareLengthMismatch ? (
              <p className="text-xs">
                Cobertura de datos Meta: actual {loadedCurrentDays}/{totalCurrentDays} días cargados · anterior {loadedPreviousDays}/{totalCurrentDays}. Días sin fila en Meta se completan en 0 para mantener comparabilidad de calendario.
              </p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || (comparisonLoading && useComparisonChart) ? (
            <Skeleton className="h-56 w-full" />
          ) : rows.length < 2 ? (
            <p className="text-muted-foreground text-sm">
              Se necesitan al menos 2 días de datos para mostrar la evolución.
            </p>
          ) : useComparisonChart ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={mergedCompare} margin={{ left: 8, right: 32, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="dayIndex"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: number) => `D${d}`}
                />
                <YAxis
                  yAxisId="spend"
                  orientation="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "Gasto ($)", angle: -90, position: "insideLeft", offset: -4, style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="cpa"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "CPA ($)", angle: 90, position: "insideRight", offset: 4, style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value);
                    if (String(name).includes("Gasto")) return [`$${v.toFixed(2)}`, name as string];
                    if (String(name).includes("CPA")) return [`$${v.toFixed(2)}`, name as string];
                    return [v, name as string];
                  }}
                  labelFormatter={(label) => `Día relativo (desde inicio periodo actual): ${label}`}
                />
                <Legend />
                <Bar yAxisId="spend" dataKey="spend" name="Gasto (actual)" opacity={0.7} radius={[3, 3, 0, 0]}>
                  {mergedCompare.map((_, i) => (
                    <Cell key={`c-${i}`} fill={barColorAt(i, String(i))} />
                  ))}
                </Bar>
                <Area
                  yAxisId="cpa"
                  type="monotone"
                  dataKey="cpaPrev"
                  name="Banda CPA anterior"
                  fill={dashboardChartColor(0)}
                  fillOpacity={0.12}
                  stroke="none"
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="cpa"
                  type="monotone"
                  dataKey="cpa"
                  name="CPA (actual)"
                  stroke={dashboardChartColor(1)}
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="spend"
                  type="monotone"
                  dataKey="spendPrev"
                  name="Gasto (anterior)"
                  stroke={dashboardChartColor(2)}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
                <Line
                  yAxisId="cpa"
                  type="monotone"
                  dataKey="cpaPrev"
                  name="CPA (anterior)"
                  stroke={dashboardChartColor(0)}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={{ left: 8, right: 32, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  yAxisId="spend"
                  orientation="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "Gasto ($)", angle: -90, position: "insideLeft", offset: -4, style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="cpa"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "CPA ($)", angle: 90, position: "insideRight", offset: 4, style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value);
                    if (name === "Gasto") return [`$${v.toFixed(2)}`, name as string];
                    if (name === "CPA") return [`$${v.toFixed(2)}`, name as string];
                    return [v, name as string];
                  }}
                  labelFormatter={(label) => `Fecha: ${String(label)}`}
                />
                <Legend />
                <Bar yAxisId="spend" dataKey="spend" name="Gasto" opacity={0.7} radius={[3, 3, 0, 0]}>
                  {rows.map((r, i) => (
                    <Cell key={r.date} fill={barColorAt(i, String(r.date))} />
                  ))}
                </Bar>
                <Line
                  yAxisId="cpa"
                  type="monotone"
                  dataKey="cpa"
                  name="CPA"
                  stroke={dashboardChartColor(1)}
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

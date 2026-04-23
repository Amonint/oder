import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
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
  /** Serie del periodo anterior (misma lógica de API; se alinea por días relativos al final). */
  comparisonSeries?: ConversionTimeseriesRow[] | undefined;
  comparisonLoading?: boolean;
  /** Mostrar aviso si la comparación cruza el cambio de métricas Meta (2026-01-12). */
  showAttributionDiscontinuity?: boolean;
}

function alignTrailingSeries(
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
  const n = Math.min(a.length, b.length);
  if (n < 2) return [];
  const as = a.slice(-n);
  const bs = b.slice(-n);
  return as.map((row, i) => ({
    dayIndex: i + 1,
    spend: row.spend,
    cpa: row.cpa,
    spendPrev: bs[i]!.spend,
    cpaPrev: bs[i]!.cpa,
  }));
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
}: RetentionModuleProps) {
  const rows = data ?? [];
  const compareRows = comparisonSeries ?? [];
  const mergedCompare = useMemo(
    () => (compareRows.length >= 2 && rows.length >= 2 ? alignTrailingSeries(rows, compareRows) : []),
    [rows, compareRows],
  );

  // Totales para KPI cards
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  const totalReplied = rows.reduce((s, r) => s + (r.replied ?? 0), 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const replyRate = totalConversions > 0 ? (totalReplied / totalConversions) * 100 : 0;

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
              label="Tasa de Respuesta"
              value={replyRate > 0 ? `${replyRate.toFixed(1)}%` : "—"}
              sub="Conversaciones con respuesta"
              tooltip="Porcentaje de conversaciones donde el prospecto respondió activamente. Se calcula: Conversaciones con respuesta ÷ Conversaciones iniciadas × 100. Mide la calidad del lead."
            />
            <KpiTile
              label="Conversiones"
              value={totalConversions.toFixed(0)}
              sub="Leads / Mensajes iniciados"
              tooltip="Total de conversiones del período: leads generados, mensajes de WhatsApp o Messenger iniciados, o compras. Fuente: campo actions de la API, filtrado por tipos de conversión configurados."
            />
            <KpiTile
              label="Primeras Respuestas"
              value={totalReplied > 0 ? totalReplied.toFixed(0) : "—"}
              sub="Personas que respondieron"
              tooltip="Número de conversaciones donde el prospecto respondió al mensaje. Indica interés real del lead. Fuente: acción onsite_conversion.messaging_conversation_replied_7d de Meta."
            />
          </div>
        </TooltipProvider>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {useComparisonChart ? "Gasto y CPA — actual vs periodo anterior" : "Gasto diario vs CPA"}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {useComparisonChart
              ? "Eje X = día relativo al final del periodo (alineado 1:1 con el periodo previo de igual duración). Barras = gasto actual · línea continua = CPA actual · líneas discontinuas = periodo anterior."
              : "Barras = Gasto ($) · Línea = CPA ($)"}
          </p>
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
                  labelFormatter={(label) => `Día relativo: ${label}`}
                />
                <Legend />
                <Bar yAxisId="spend" dataKey="spend" name="Gasto (actual)" opacity={0.7} radius={[3, 3, 0, 0]}>
                  {mergedCompare.map((_, i) => (
                    <Cell key={`c-${i}`} fill={barColorAt(i, String(i))} />
                  ))}
                </Bar>
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

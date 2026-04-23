import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyInsightPoint } from "@/lib/timeSeriesFromMeta";
import { dashboardChartColor } from "@/lib/dashboardColors";
import { attributionWindowLabelEs } from "@/lib/formatDashboardContext";

interface AccountTimeInsightsSectionProps {
  points: DailyInsightPoint[];
  isLoading: boolean;
  isError: boolean;
  /** Rango devuelto por la API de tiempo (si existe). */
  timeRange: { since: string; until: string } | null | undefined;
  datePresetLabel: string | null | undefined;
  attributionWindowCode?: string | null;
  /** Ventanas enviadas a Meta en `/insights/time` (p. ej. `7d_click`); vacío = default de la API. */
  metaAttributionSent?: string[] | null;
}

export default function AccountTimeInsightsSection({
  points,
  isLoading,
  isError,
  timeRange,
  datePresetLabel,
  attributionWindowCode,
}: AccountTimeInsightsSectionProps) {
  const attr = attributionWindowLabelEs(attributionWindowCode ?? null);
  const periodNote =
    timeRange?.since && timeRange?.until
      ? `${timeRange.since} → ${timeRange.until}`
      : datePresetLabel ?? "—";

  const footer = `Periodo: ${periodNote} · Atribución (referencia KPI): ${attr ?? "—"}`;
  const hasRoasSeries = points.some((p) => p.roas != null);
  const efficiencySeries = points
    .map((p) => ({
      date: p.date,
      efficiency: p.spend > 0 && p.results > 0 ? p.results / p.spend : null,
    }))
    .filter((p) => p.efficiency != null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || points.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Series diarias (cuenta)</CardTitle>
          <CardDescription>
            {isError
              ? "No se pudieron cargar insights diarios."
              : "No hay suficientes días con datos para graficar la serie temporal."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">A1 — Gasto y resultados (diario)</CardTitle>
          <CardDescription>{footer}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={points} margin={{ left: 8, right: 36, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis
                yAxisId="spend"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              />
              <YAxis yAxisId="res" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v, name) => {
                  const n = Number(v ?? 0);
                  const nm = String(name ?? "");
                  return nm === "Gasto" ? [`$${n.toFixed(2)}`, nm] : [n, nm];
                }}
              />
              <Legend />
              <Bar yAxisId="spend" dataKey="spend" name="Gasto" fill={dashboardChartColor(0)} opacity={0.75} />
              <Line
                yAxisId="res"
                type="monotone"
                dataKey="results"
                name="Resultados"
                stroke={dashboardChartColor(1)}
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {hasRoasSeries ? "A3 — Retorno diario estimado" : "A3 — Tendencia diaria de eficiencia"}
          </CardTitle>
          <CardDescription>
            {hasRoasSeries
              ? "Relación entre el valor generado y el gasto de cada día."
              : "No hay datos suficientes para calcular retorno diario en este periodo; se muestra una tendencia alternativa de rendimiento."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {hasRoasSeries ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(2)}×`} />
                <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(2)}×`, "ROAS"]} />
                <Line
                  type="monotone"
                  dataKey="roas"
                  name="ROAS"
                  stroke={dashboardChartColor(2)}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Mostramos una serie alternativa de <strong>eficiencia por resultado</strong> para mantener una señal de
                tendencia cuando no se puede calcular retorno diario.
              </p>
              {efficiencySeries.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={efficiencySeries} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(3)}`} />
                    <Tooltip formatter={(v) => [Number(v ?? 0).toFixed(4), "Eficiencia (res/$)"]} />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      name="Eficiencia (res/$)"
                      stroke={dashboardChartColor(5)}
                      dot={false}
                      strokeWidth={2}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">A6 — CPM y CTR en el tiempo (cuenta)</CardTitle>
          <CardDescription>Complemento a la dispersión frecuencia vs CTR en Creatividades.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={points} margin={{ left: 8, right: 36, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis yAxisId="cpm" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
              <YAxis
                yAxisId="ctr"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${Number(v).toFixed(2)}%`}
              />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="cpm"
                type="monotone"
                dataKey="cpm"
                name="CPM"
                stroke={dashboardChartColor(3)}
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="ctr"
                type="monotone"
                dataKey="ctr"
                name="CTR %"
                stroke={dashboardChartColor(4)}
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </section>
  );
}

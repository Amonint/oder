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

  const footer = `Fechas: ${periodNote}. Las series de resultados y retorno usan la regla de atribución «${attr ?? "predeterminada de la plataforma"}» (la misma que eliges en el panel de ventana).`;
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
          <CardTitle className="text-base">Evolución día a día</CardTitle>
          <CardDescription>
            {isError
              ? "No se pudieron cargar los datos diarios. Revisa la conexión o prueba otro periodo."
              : "Hace falta al menos dos días con datos para dibujar la tendencia."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gasto e impacto cada día</CardTitle>
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
                  return nm === "Inversión del día"
                    ? [`$${n.toFixed(2)}`, nm]
                    : [n, nm];
                }}
              />
              <Legend />
              <Bar
                yAxisId="spend"
                dataKey="spend"
                name="Inversión del día"
                fill={dashboardChartColor(0)}
                opacity={0.75}
              />
              <Line
                yAxisId="res"
                type="monotone"
                dataKey="results"
                name="Resultados ese día"
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
            {hasRoasSeries ? "¿Cuánto ingresaste por cada euro o dólar invertido?" : "Eficiencia día a día"}
          </CardTitle>
          <CardDescription>
            {hasRoasSeries
              ? "Cada punto es el retorno estimado de ese día: ingresos atribuidos a anuncios frente a lo que gastaste."
              : "En este tramo no hay retorno diario fiable; en su lugar mostramos cuántos resultados obtuviste por cada unidad de gasto, para ver si mejorabas o empeorabas."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {hasRoasSeries ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(2)}×`} />
                <Tooltip
                  formatter={(v) => [`${Number(v ?? 0).toFixed(2)}×`, "Retorno (ingresos ÷ gasto)"]}
                />
                <Line
                  type="monotone"
                  dataKey="roas"
                  name="Retorno (ingresos ÷ gasto)"
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
                Mostramos <strong>cuántos resultados por cada dólar gastado</strong> para que sigas viendo una tendencia
                aunque el retorno en dinero no esté disponible día a día.
              </p>
              {efficiencySeries.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={efficiencySeries} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(3)}`} />
                    <Tooltip formatter={(v) => [Number(v ?? 0).toFixed(4), "Resultados por dólar"]} />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      name="Resultados por dólar"
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
          <CardTitle className="text-base">Coste de llegar a mil personas y tasa de clics</CardTitle>
          <CardDescription>
            Una curva es el coste medio por mil veces que se mostró el anuncio; la otra es el porcentaje de esas
            visualizaciones en las que alguien hizo clic. Sirve a simple vista para ver si el anuncio se volvía más caro
            de mostrar o si la gente dejaba de pinchar.
          </CardDescription>
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
                name="Coste por mil impresiones"
                stroke={dashboardChartColor(3)}
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="ctr"
                type="monotone"
                dataKey="ctr"
                name="Porcentaje de clics (CTR)"
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

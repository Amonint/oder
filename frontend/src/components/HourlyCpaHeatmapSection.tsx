import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  buildHourlyOpportunityPoints,
  evaluateHourlyDecisionReadiness,
  type HourlyOpportunityPoint,
} from "@/lib/timeSeriesFromMeta";
import { dashboardChartColor } from "@/lib/dashboardColors";
import { labelForMetaActionType } from "@/lib/metaInsightsLabels";

interface HourlyCpaHeatmapSectionProps {
  rows: Record<string, unknown>[] | undefined;
  objectiveActionTypes: string[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  /** Fuerza la etiqueta de objetivo sin exigir que objectiveActionTypes tenga exactamente un elemento. */
  overrideObjectiveLabel?: string;
}

const MIN_RESULTS_FOR_CONFIDENCE = 2;
const MIN_ACTIVE_HOURS_FOR_DECISION = 6;
const MIN_TOTAL_RESULTS_FOR_DECISION = 10;

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatResults(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const twelveHour = normalized % 12 || 12;
  return `${twelveHour} ${suffix}`;
}

function findBestReliable(points: HourlyOpportunityPoint[]): HourlyOpportunityPoint | null {
  let best: HourlyOpportunityPoint | null = null;
  for (const point of points) {
    if (!point.reliable || point.cpa == null) continue;
    if (!best || point.cpa < (best.cpa ?? Number.POSITIVE_INFINITY)) best = point;
  }
  return best;
}

function findWorstReliable(points: HourlyOpportunityPoint[]): HourlyOpportunityPoint | null {
  let worst: HourlyOpportunityPoint | null = null;
  for (const point of points) {
    if (!point.reliable || point.cpa == null) continue;
    if (!worst || point.cpa > (worst.cpa ?? Number.NEGATIVE_INFINITY)) worst = point;
  }
  return worst;
}

export default function HourlyCpaHeatmapSection({
  rows,
  objectiveActionTypes,
  isLoading,
  isError,
  errorMessage,
  overrideObjectiveLabel,
}: HourlyCpaHeatmapSectionProps) {
  const hasSingleObjectiveAction = objectiveActionTypes.length === 1 || Boolean(overrideObjectiveLabel);
  const objectiveLabel = overrideObjectiveLabel
    ?? (objectiveActionTypes.length === 1 ? labelForMetaActionType(objectiveActionTypes[0]) : null);

  const points = useMemo(
    () => buildHourlyOpportunityPoints(rows ?? [], objectiveActionTypes, MIN_RESULTS_FOR_CONFIDENCE),
    [rows, objectiveActionTypes],
  );

  const activeHours = useMemo(() => points.filter((point) => point.hasData), [points]);
  const hoursWithResults = useMemo(() => points.filter((point) => point.results > 0).length, [points]);
  const totalResults = useMemo(() => points.reduce((sum, point) => sum + point.results, 0), [points]);
  const hoursSpendWithoutResults = useMemo(
    () => points.filter((point) => point.spendWithoutResults).length,
    [points],
  );
  const reliableHours = useMemo(() => points.filter((point) => point.reliable && point.cpa != null), [points]);
  const bestReliableHour = useMemo(() => findBestReliable(points), [points]);
  const worstReliableHour = useMemo(() => findWorstReliable(points), [points]);
  const decisionReadiness = useMemo(
    () =>
      evaluateHourlyDecisionReadiness({
        activeHours: activeHours.length,
        totalResults,
        minActiveHours: MIN_ACTIVE_HOURS_FOR_DECISION,
        minTotalResults: MIN_TOTAL_RESULTS_FOR_DECISION,
      }),
    [activeHours.length, totalResults],
  );

  if (isLoading) return <Skeleton className="h-[420px] w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oportunidad horaria</CardTitle>
          <CardDescription className="text-destructive">{errorMessage ?? "Error"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasSingleObjectiveAction) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oportunidad horaria</CardTitle>
          <CardDescription>
            Este gráfico se oculta si Meta no deja una sola conversión objetivo clara para el rango actual. Con mezcla
            de objetivos, el CPA horario terminaba siendo ambiguo.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (activeHours.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oportunidad horaria</CardTitle>
          <CardDescription>
            Sin filas horarias utilizables para {objectiveLabel ?? "resultado objetivo"}. Comprueba que el periodo
            tenga datos y que la cuenta permita breakdown horario.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!decisionReadiness.ready) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Oportunidad horaria</CardTitle>
          <CardDescription>
            El periodo actual no tiene muestra suficiente para recomendar horarios de pauta con confianza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              Horas activas: {activeHours.length} / mínimo {MIN_ACTIVE_HOURS_FOR_DECISION}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              Resultados totales: {formatResults(totalResults)} / mínimo {MIN_TOTAL_RESULTS_FOR_DECISION}
            </Badge>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              Horas con gasto sin resultados: {hoursSpendWithoutResults}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Usa un periodo más amplio o más volumen antes de tomar decisiones por hora exacta.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Oportunidad horaria del objetivo</CardTitle>
        <CardDescription>
          Agrupa todas las fechas del rango por <strong>hora del día</strong> usando{" "}
          <strong>{objectiveLabel ?? "resultado objetivo"}</strong>. Prioriza gasto y resultados; el CPA solo se toma
          como señal confiable desde {MIN_RESULTS_FOR_CONFIDENCE} resultados por hora. La hora se interpreta en zona
          horaria del anunciante, según el breakdown horario actual de Meta.{" "}
          El desglose es a nivel de cuenta o campaña —la API de Meta no permite filtrar horas por página específica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Horas con resultados: {hoursWithResults}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Horas con gasto sin resultados: {hoursSpendWithoutResults}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Mejor hora confiable:{" "}
            {bestReliableHour ? `${formatHour(bestReliableHour.hour)} · ${formatCurrency(bestReliableHour.cpa ?? 0)}` : "N/D"}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Peor hora confiable:{" "}
            {worstReliableHour ? `${formatHour(worstReliableHour.hour)} · ${formatCurrency(worstReliableHour.cpa ?? 0)}` : "N/D"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: dashboardChartColor(0) }}
            />
            Gasto por hora
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: dashboardChartColor(2) }}
            />
            Resultados por hora
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" />
            Gasto sin resultados
          </span>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 11 }}
              tickFormatter={(hour: number) => formatHour(hour)}
            />
            <YAxis
              yAxisId="spend"
              tick={{ fontSize: 11 }}
              tickFormatter={(value: number) => `$${value}`}
            />
            <YAxis
              yAxisId="results"
              orientation="right"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as HourlyOpportunityPoint | undefined;
                if (!point) return null;
                return (
                  <div className="min-w-44 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                    <p className="font-medium">{formatHour(point.hour)}</p>
                    {!point.hasData ? (
                      <p className="mt-1 text-muted-foreground">Sin datos en esta hora.</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <p>Gasto: {formatCurrency(point.spend)}</p>
                        <p>Resultados: {formatResults(point.results)}</p>
                        <p>
                          CPA:{" "}
                          {point.cpa != null ? formatCurrency(point.cpa) : point.spendWithoutResults ? "Sin resultados" : "N/D"}
                        </p>
                        <p className="text-muted-foreground">
                          {point.reliable
                            ? "Muestra suficiente para comparar CPA."
                            : point.spendWithoutResults
                              ? "Hubo gasto, pero ningún resultado."
                              : `Muestra baja: menos de ${MIN_RESULTS_FOR_CONFIDENCE} resultados.`}
                        </p>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              yAxisId="spend"
              dataKey="spend"
              name="Gasto"
              radius={[6, 6, 0, 0]}
              fill={dashboardChartColor(0)}
            >
              {points.map((point) => (
                <Cell
                  key={point.hour}
                  fill={point.spendWithoutResults ? "rgb(251 191 36)" : dashboardChartColor(0)}
                />
              ))}
            </Bar>
            <Line
              yAxisId="results"
              dataKey="results"
              name="Resultados"
              type="monotone"
              stroke={dashboardChartColor(2)}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">Horas confiables para CPA</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se listan solo horas con al menos {MIN_RESULTS_FOR_CONFIDENCE} resultados.
            </p>
            {reliableHours.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Todavía no hay horas con muestra suficiente.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {reliableHours
                  .slice()
                  .sort((a, b) => (a.cpa ?? Number.POSITIVE_INFINITY) - (b.cpa ?? Number.POSITIVE_INFINITY))
                  .map((point) => (
                    <Badge key={point.hour} variant="secondary" className="font-normal">
                      {formatHour(point.hour)} · {formatCurrency(point.cpa ?? 0)}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">Lectura recomendada</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>Compara primero gasto y resultados, no solo CPA.</li>
              <li>Si una hora tiene gasto pero cero resultados, úsala como alerta de desperdicio.</li>
              <li>Un CPA aislado con poca muestra no debería mover decisiones de pauta.</li>
              <li>Las etiquetas se muestran como hora exacta del día: 12 AM, 3 PM, 11 PM.</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

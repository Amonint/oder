import {
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FatigueAlert, FatigueRow } from "@/api/client";
import { dashboardChartColor } from "@/lib/dashboardColors";
import { AdReferenceLink } from "@/components/AdReferenceLink";

interface CreativeFatigueCpaScatterProps {
  data: FatigueRow[] | undefined;
  alerts: FatigueAlert[] | undefined;
  isLoading: boolean;
  adReferenceUrlById?: Map<string, string>;
}

const MIN_IMPRESSIONS = 400;

export default function CreativeFatigueCpaScatter({
  data,
  alerts,
  isLoading,
  adReferenceUrlById,
}: CreativeFatigueCpaScatterProps) {
  if (isLoading) return <Skeleton className="h-80 w-full rounded-xl" />;

  const points =
    (data ?? [])
      .filter((r) => r.impressions >= MIN_IMPRESSIONS && r.cpa != null && r.cpa > 0 && r.frequency > 0)
      .map((r, i) => ({
        ad_id: r.ad_id,
        name: r.ad_name.slice(0, 40) + (r.ad_name.length > 40 ? "…" : ""),
        frequency: r.frequency,
        cpa: r.cpa as number,
        spend: r.spend,
        i,
      })) ?? [];

  const alertCount = (alerts ?? []).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Frecuencia vs CPA (fatiga y coste)</CardTitle>
        <CardDescription>
          Cada punto es un anuncio con volumen. Frecuencia alta + CPA alto suele invitar a refrescar creativo o
          ampliar audiencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alertCount > 0 ? (
          <Alert variant="destructive" className="py-2">
            <AlertTitle>Alertas de saturación ({alertCount})</AlertTitle>
            <AlertDescription className="text-xs">
              Revisa la tabla de fatiga: hay combinaciones de frecuencia y CTR que Meta marca como riesgo.
            </AlertDescription>
          </Alert>
        ) : null}
        {points.length < 3 ? (
          <p className="text-muted-foreground text-sm">
            No hay suficientes anuncios con CPA y frecuencia para esta dispersión.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="frequency"
                name="Frecuencia"
                tick={{ fontSize: 11 }}
                label={{ value: "Frecuencia", position: "bottom", offset: 0, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number"
                dataKey="cpa"
                name="CPA"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
              />
              <ZAxis type="number" dataKey="spend" range={[50, 400]} name="Gasto" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as (typeof points)[0];
                  if (!p) return null;
                  return (
                    <div className="border-border bg-background rounded-md border px-2 py-1.5 text-xs shadow-md">
                      <AdReferenceLink href={adReferenceUrlById?.get(String(p.ad_id ?? "")) ?? null} compact />
                      <p className="font-medium">{p.name}</p>
                      <p className="text-muted-foreground tabular-nums">
                        Frec.: {p.frequency.toFixed(2)} · CPA: ${p.cpa.toFixed(2)} · Gasto: ${p.spend.toFixed(2)}
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter name="Anuncios" data={points} fill={dashboardChartColor(0)} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

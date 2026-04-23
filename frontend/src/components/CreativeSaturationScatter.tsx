import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { FatigueRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";

const MIN_IMPRESSIONS = 500;

interface CreativeSaturationScatterProps {
  data: FatigueRow[] | undefined;
  isLoading: boolean;
}

export default function CreativeSaturationScatter({ data, isLoading }: CreativeSaturationScatterProps) {
  const points =
    (data ?? [])
      .filter((r) => r.impressions >= MIN_IMPRESSIONS && r.frequency > 0)
      .map((r) => ({
        ad_id: r.ad_id,
        name: r.ad_name.slice(0, 42) + (r.ad_name.length > 42 ? "…" : ""),
        frequency: r.frequency,
        ctr: r.ctr,
        spend: r.spend,
        impressions: r.impressions,
      })) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Señal de saturación (frecuencia vs CTR)</CardTitle>
        <CardDescription>
          Cada punto es un anuncio con al menos {MIN_IMPRESSIONS.toLocaleString("es")} impresiones. Frecuencia alta con
          CTR bajo suele indicar audiencia saturada o creativo cansado (A6).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : points.length < 3 ? (
          <p className="text-muted-foreground text-sm">
            No hay suficientes anuncios con volumen para un dispersión fiable.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="frequency"
                name="Frecuencia"
                tick={{ fontSize: 11 }}
                label={{ value: "Frecuencia (promedio)", position: "bottom", offset: 0, style: { fontSize: 11 } }}
              />
              <YAxis
                type="number"
                dataKey="ctr"
                name="CTR"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(2)}%`}
                label={{ value: "CTR (%)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
              />
              <ZAxis type="number" dataKey="spend" range={[40, 400]} name="Gasto" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as {
                    name?: string;
                    frequency?: number;
                    ctr?: number;
                    spend?: number;
                    impressions?: number;
                  };
                  if (!p) return null;
                  return (
                    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-md">
                      <p className="font-medium">{p.name ?? ""}</p>
                      <p className="text-muted-foreground mt-1 tabular-nums">
                        Frecuencia: {p.frequency?.toFixed(2) ?? "—"} · CTR: {p.ctr != null ? `${p.ctr.toFixed(2)}%` : "—"}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        Gasto: ${(p.spend ?? 0).toFixed(2)} · Imp.: {(p.impressions ?? 0).toLocaleString("es")}
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter name="Anuncios" data={points} fill={barColorAt(0, "scatter")}>
                {points.map((p, i) => (
                  <Cell key={p.ad_id} fill={barColorAt(i, p.ad_id)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

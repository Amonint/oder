import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageTimeseriesRow } from "@/api/client";

interface TimeseriesChartProps {
  data: PageTimeseriesRow[] | undefined;
  isLoading: boolean;
}

export default function TimeseriesChart({ data, isLoading }: TimeseriesChartProps) {
  const rows = (data ?? []).map((r) => ({
    date: r.date_start ?? "",
    spend: parseFloat(r.spend ?? "0"),
    impressions: parseInt(r.impressions ?? "0"),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Cómo evolucionó?</CardTitle>
        <p className="text-muted-foreground text-sm">Gasto e impresiones diarias</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : rows.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Se necesitan al menos 2 días de datos para mostrar la evolución.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows} margin={{ left: 8, right: 32 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                yAxisId="spend"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                yAxisId="impressions"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === "Gasto" ? [`$${v.toFixed(2)}`, name] : [v.toLocaleString(), name]
                }
              />
              <Legend />
              <Line yAxisId="spend" type="monotone" dataKey="spend" name="Gasto" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line yAxisId="impressions" type="monotone" dataKey="impressions" name="Impresiones" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

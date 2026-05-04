import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrafficQualityTimeseriesRow } from "@/api/client";
import { dashboardChartColor } from "@/lib/dashboardColors";

interface TrafficQualityTimeseriesCardProps {
  data: TrafficQualityTimeseriesRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function TrafficQualityTimeseriesCard({
  data,
  isLoading,
  isError,
  errorMessage,
}: TrafficQualityTimeseriesCardProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calidad de tráfico en el tiempo</CardTitle>
          <CardDescription className="text-destructive">{errorMessage ?? "Error"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calidad de tráfico en el tiempo</CardTitle>
          <CardDescription>Sin suficientes días para dibujar la serie.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolución diaria: clics salientes y CTR único</CardTitle>
        <CardDescription>
          Serie desde Meta para la página filtrada. CTR único en % (eje derecho) vs volumen de outbound (eje izquierdo).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              allowDecimals={false}
              label={{ value: "Outbound", angle: -90, position: "insideLeft", style: { fontSize: 10 } }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="outbound_clicks"
              name="Clics salientes"
              stroke={dashboardChartColor(0)}
              dot={false}
              strokeWidth={2}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="unique_ctr"
              name="CTR único %"
              stroke={dashboardChartColor(1)}
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

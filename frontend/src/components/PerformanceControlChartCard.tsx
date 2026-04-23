import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StabilityResponse } from "@/api/client";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
} from "recharts";

interface PerformanceControlChartCardProps {
  data: StabilityResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  title?: string;
}

export default function PerformanceControlChartCard({
  data,
  isLoading,
  isError,
  errorMessage,
  title = "Estabilidad del desempeño",
}: PerformanceControlChartCardProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {errorMessage ?? "No se pudo cargar el control chart."}
          </p>
        </CardContent>
      </Card>
    );
  }
  const rows = data?.data ?? [];
  const metricLabel =
    data?.metric === "cac" ? "CAC" : data?.metric === "roas" ? "ROAS" : "Close rate";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {metricLabel} con límites de control. Score estabilidad:{" "}
          <span className="font-semibold">{data?.summary?.stability_score ?? "—"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length < 2 ? (
          <p className="text-sm text-muted-foreground">Se requieren al menos 2 periodos para medir volatilidad.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} />
              <YAxis />
              <Tooltip formatter={(v: unknown) => Number(v ?? 0).toFixed(4)} />
              <Line dataKey="metric_value" stroke="#56048C" strokeWidth={2} dot={false} name={metricLabel} />
              <Line dataKey="mean" stroke="#111827" strokeDasharray="4 4" dot={false} name="Media" />
              <Line dataKey="ucl" stroke="#D91480" strokeDasharray="3 3" dot={false} name="UCL" />
              <Line dataKey="lcl" stroke="#D91480" strokeDasharray="3 3" dot={false} name="LCL" />
              <Scatter
                data={rows.filter((r) => r.is_outlier)}
                dataKey="metric_value"
                fill="#EF4444"
                name="Outlier"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BottleneckRow } from "@/api/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface BottleneckWaterfallCardProps {
  data: BottleneckRow[] | undefined;
  primaryBottleneck: string | null | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function BottleneckWaterfallCard({
  data,
  primaryBottleneck,
  isLoading,
  isError,
  errorMessage,
}: BottleneckWaterfallCardProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuello de botella</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {errorMessage ?? "No se pudo cargar el embudo de pérdida."}
          </p>
        </CardContent>
      </Card>
    );
  }
  const rows = (data ?? []).map((r) => ({
    stage: r.stage,
    drop_pct: Number((r.drop_pct * 1).toFixed(2)),
    conversion_pct: Number((r.conversion_rate * 100).toFixed(2)),
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cuello de botella comercial</CardTitle>
        <CardDescription>
          Caída por etapa del embudo. Principal cuello:{" "}
          <span className="font-semibold">{primaryBottleneck ?? "—"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos para calcular pérdidas por etapa.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" />
              <YAxis tickFormatter={(v: number) => `${v}%`} />
              <Tooltip formatter={(v: unknown) => `${Number(v ?? 0).toFixed(2)}%`} />
              <Bar dataKey="drop_pct" name="% caída" fill="#D91480" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

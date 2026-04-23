import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampaignCloseSpeedRow } from "@/api/client";
import {
  CartesianGrid,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Scatter,
  ResponsiveContainer,
} from "recharts";

interface CampaignCloseTimeBoxplotCardProps {
  data: CampaignCloseSpeedRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function CampaignCloseTimeBoxplotCard({
  data,
  isLoading,
  isError,
  errorMessage,
}: CampaignCloseTimeBoxplotCardProps) {
  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tiempo de cierre por campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {errorMessage ?? "No se pudo cargar el análisis de cierre."}
          </p>
        </CardContent>
      </Card>
    );
  }
  const rows = (data ?? [])
    .filter((r) => r.sales_closed > 0)
    .slice(0, 8)
    .map((r) => ({
      name: r.campaign_name || r.campaign_id,
      p25: r.close_days_p25,
      p50: r.close_days_p50,
      p75: r.close_days_p75,
      iqr: Math.max(r.close_days_p75 - r.close_days_p25, 0),
      avg: r.avg_days_to_close,
      sales: r.sales_closed,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tiempo de cierre por campaña</CardTitle>
        <CardDescription>
          Rango intercuartil (p25-p75) y mediana de días para cerrar ventas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin datos suficientes de cierre para mostrar distribución.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rows} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v: number) => `${v}d`} />
              <YAxis dataKey="name" type="category" width={180} />
              <Tooltip
                formatter={(value: unknown, key: string | number | undefined) => {
                  const n = Number(value ?? 0);
                  if (key === "sales") return [n, "Ventas"];
                  return [`${n.toFixed(1)} días`, String(key ?? "valor")];
                }}
              />
              <Bar dataKey="p25" stackId="range" fill="transparent" />
              <Bar dataKey="iqr" stackId="range" fill="#6D28D9" radius={3} name="p25-p75" />
              <Scatter dataKey="p50" fill="#111827" name="Mediana (p50)" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

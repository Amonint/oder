import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SlaLostRevenueResponse } from "@/api/client";
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

interface SlaLostRevenueCardProps {
  data: SlaLostRevenueResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function SlaLostRevenueCard({
  data,
  isLoading,
  isError,
  errorMessage,
}: SlaLostRevenueCardProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingreso perdido por demora SLA</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {errorMessage ?? "No se pudo cargar impacto SLA."}
          </p>
        </CardContent>
      </Card>
    );
  }
  const rows =
    data?.data?.map((r) => ({
      x: r.avg_first_response_hours,
      y: r.lost_revenue_est,
      label: r.campaign_name,
    })) ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ingreso perdido por demora SLA</CardTitle>
        <CardDescription>
          {data?.summary
            ? `Pérdida estimada total: $${data.summary.total_lost_revenue_est.toFixed(2)}`
            : "Sin datos suficientes"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay datos de respuesta/SLA para estimar pérdida.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart>
              <XAxis
                type="number"
                dataKey="x"
                name="Horas primera respuesta"
                tickFormatter={(v: number) => `${v}h`}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Pérdida estimada"
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: unknown, name: string | number | undefined) => {
                  if (name === "Pérdida estimada") return [`$${Number(v ?? 0).toFixed(2)}`, "Pérdida"];
                  if (name === "Horas primera respuesta") return [`${Number(v ?? 0).toFixed(2)}h`, "Demora"];
                  return [String(v ?? ""), String(name ?? "")];
                }}
              />
              <Scatter name="Campañas" data={rows} fill="#56048C" />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

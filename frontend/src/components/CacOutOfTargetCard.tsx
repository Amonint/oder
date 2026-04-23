import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CacOutTargetResponse } from "@/api/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface CacOutOfTargetCardProps {
  data: CacOutTargetResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function CacOutOfTargetCard({
  data,
  isLoading,
  isError,
  errorMessage,
}: CacOutOfTargetCardProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">% gasto fuera CAC objetivo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {errorMessage ?? "No se pudo cargar CAC fuera de objetivo."}
          </p>
        </CardContent>
      </Card>
    );
  }
  const summary = data?.summary;
  const rows =
    data?.data
      ?.filter((r) => r.outside_spend > 0)
      .slice(0, 8)
      .map((r) => ({
        campaign: r.campaign_name,
        outside_spend: r.outside_spend,
      })) ?? [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">% gasto fuera CAC objetivo</CardTitle>
        <CardDescription>
          {summary
            ? `${summary.outside_spend_pct.toFixed(1)}% del gasto total está fuera de objetivo`
            : "Sin datos suficientes"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay campañas fuera de CAC objetivo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="campaign" hide />
              <YAxis tickFormatter={(v: number) => `$${v}`} />
              <Tooltip formatter={(v: unknown) => `$${Number(v ?? 0).toFixed(2)}`} />
              <Bar dataKey="outside_spend" fill="#D91480" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

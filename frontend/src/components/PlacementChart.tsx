import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PagePlacementRow } from "@/api/client";

interface PlacementChartProps {
  data: PagePlacementRow[] | undefined;
  isLoading: boolean;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

export default function PlacementChart({ data, isLoading }: PlacementChartProps) {
  const rows = (data ?? [])
    .map((r) => ({
      label: `${r.publisher_platform ?? "—"} / ${r.platform_position ?? "—"}`,
      spend: parseFloat(r.spend ?? "0"),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Dónde se gastó?</CardTitle>
        <p className="text-muted-foreground text-sm">Gasto por plataforma y posición</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin datos de placements en el periodo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(rows.length * 36, 120)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 16, right: 32 }}>
              <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(0)}`} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, "Gasto"]} />
              <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

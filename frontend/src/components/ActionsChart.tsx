import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageActionRow } from "@/api/client";

interface ActionsChartProps {
  data: PageActionRow[] | undefined;
  isLoading: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  mensajeria: "#10b981",
  engagement: "#3b82f6",
  trafico: "#f59e0b",
  video: "#8b5cf6",
  guardados: "#ef4444",
};

const CATEGORY_LABELS: Record<string, string> = {
  mensajeria: "Mensajería",
  engagement: "Engagement",
  trafico: "Tráfico",
  video: "Video",
  guardados: "Guardados",
};

export default function ActionsChart({ data, isLoading }: ActionsChartProps) {
  const rows = (data ?? []).map((r) => ({
    label: CATEGORY_LABELS[r.category] ?? r.category,
    category: r.category,
    value: r.value,
  }));

  const hasData = rows.some((r) => r.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Qué generó?</CardTitle>
        <p className="text-muted-foreground text-sm">Acciones agrupadas por tipo de resultado</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasData ? (
          <p className="text-muted-foreground text-sm">Sin acciones en el periodo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows} margin={{ left: 8, right: 8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [Number(value).toFixed(0), "Acciones"]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[r.category] ?? "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

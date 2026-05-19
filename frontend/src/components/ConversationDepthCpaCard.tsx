import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversionTimeseriesRow } from "@/api/client";

interface ConversationDepthCpaCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

const STAGE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444"];

export default function ConversationDepthCpaCard({ data, isLoading }: ConversationDepthCpaCardProps) {
  const stages = useMemo(() => {
    const rows = data ?? [];
    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const conv = rows.reduce((s, r) => s + r.conversations_started, 0);
    const d2 = rows.reduce((s, r) => s + r.depth2, 0);
    const d3 = rows.reduce((s, r) => s + r.depth3, 0);
    const d5 = rows.reduce((s, r) => s + r.depth5, 0);

    if (totalSpend === 0 || conv === 0) return [];

    const cpa = (n: number) => (n > 0 ? parseFloat((totalSpend / n).toFixed(2)) : null);

    return [
      { label: "Conversación iniciada", cpa: cpa(conv), count: conv },
      { label: "Profundidad 2", cpa: cpa(d2), count: d2 },
      { label: "Profundidad 3", cpa: cpa(d3), count: d3 },
      { label: "Profundidad 5", cpa: cpa(d5), count: d5 },
    ].filter((s) => s.cpa !== null && s.count > 0);
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">CPA por profundidad de conversación</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (stages.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">CPA por profundidad de conversación</CardTitle>
        <p className="text-xs text-muted-foreground">
          Costo de llevar a un prospecto hasta cada etapa del chat. Gasto total ÷ conteo de la etapa.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(140, stages.length * 52)}>
          <BarChart data={stages} layout="vertical" margin={{ left: 8, right: 40 }}>
            <XAxis
              type="number"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              formatter={(value, _name, { payload }) => [
                `$${Number(value).toFixed(2)} · ${(payload as { count: number }).count} casos`,
                "CPA",
              ]}
            />
            <Bar dataKey="cpa" radius={[0, 4, 4, 0]}>
              {stages.map((s, i) => (
                <Cell key={s.label} fill={STAGE_COLORS[i % STAGE_COLORS.length]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

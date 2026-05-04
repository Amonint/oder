import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LearningSummaryResponse } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";

interface LearningStageSpendChartProps {
  data: LearningSummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

const LABELS: Record<string, string> = {
  LEARNING: "Aprendizaje",
  SUCCESS: "Éxito (estable)",
  FAIL: "Fuera de aprendizaje",
  unknown: "Desconocido",
};

export default function LearningStageSpendChart({
  data,
  isLoading,
  isError,
  errorMessage,
}: LearningStageSpendChartProps) {
  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto por fase de aprendizaje</CardTitle>
          <CardDescription className="text-destructive">{errorMessage ?? "Error"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows = (data?.by_stage ?? []).filter((r) => r.spend > 0);
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto por fase de aprendizaje</CardTitle>
          <CardDescription>Sin gasto a nivel conjunto en este periodo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const pieData = rows.map((r, i) => ({
    name: LABELS[r.stage] ?? r.stage,
    value: r.spend,
    key: r.stage,
    i,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Inversión en conjuntos por estado de aprendizaje</CardTitle>
        <CardDescription>
          Combina insights nivel conjunto con `learning_stage_info` en Graph API. Útil para ver cuánto presupuesto
          está en fase de aprendizaje vs estable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
            >
              {pieData.map((entry) => (
                <Cell key={entry.key} fill={barColorAt(entry.i, entry.key)} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `$${Number(value ?? 0).toFixed(2)}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversionTimeseriesRow } from "@/api/client";

interface ConversionCpaControlChartCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

export default function ConversionCpaControlChartCard({
  data,
  isLoading,
}: ConversionCpaControlChartCardProps) {
  const chart = useMemo(() => {
    const rows = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const cpas = rows.map((r) => r.cpa).filter((c) => c > 0 && Number.isFinite(c));
    if (cpas.length < 3) return [];
    const mean = cpas.reduce((s, c) => s + c, 0) / cpas.length;
    const variance = cpas.reduce((s, c) => s + (c - mean) ** 2, 0) / cpas.length;
    const std = Math.sqrt(variance);
    const ucl = mean + 2 * std;
    const lcl = Math.max(0, mean - 2 * std);
    return rows.map((r) => ({
      date: r.date,
      cpa: r.cpa,
      mean,
      ucl,
      lcl,
      is_outlier: r.cpa > ucl || r.cpa < lcl,
    }));
  }, [data]);

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  if (chart.length < 3) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carta de control — CPA diario</CardTitle>
          <CardDescription>Se requieren al menos 3 días con CPA para estimar dispersión.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const outliers = chart.filter((r) => r.is_outlier).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Carta de control — CPA (serie de conversión)</CardTitle>
        <CardDescription>
          Límites ±2σ sobre la serie diaria de CPA. Puntos rojos = fuera de control ({outliers} en este periodo).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chart} margin={{ left: 8, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
            <Tooltip formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} />
            <Line type="monotone" dataKey="mean" stroke="#64748b" strokeDasharray="5 5" dot={false} name="Media" />
            <Line type="monotone" dataKey="ucl" stroke="#94a3b8" strokeDasharray="3 3" dot={false} name="UCL" />
            <Line type="monotone" dataKey="lcl" stroke="#94a3b8" strokeDasharray="3 3" dot={false} name="LCL" />
            <Line
              type="monotone"
              dataKey="cpa"
              stroke="#56048C"
              strokeWidth={2}
              name="CPA"
              dot={(props) => {
                const { cx, cy, payload } = props as {
                  cx?: number;
                  cy?: number;
                  payload?: { is_outlier?: boolean };
                };
                if (cx == null || cy == null) return null;
                if (payload?.is_outlier) {
                  return <circle cx={cx} cy={cy} r={5} fill="#EF4444" stroke="#fff" strokeWidth={1} />;
                }
                return <circle cx={cx} cy={cy} r={0} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

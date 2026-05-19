import { useMemo } from "react";
import {
  Bar,
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
import { shouldShowControlChart } from "@/lib/pageDashboardDecisions";

interface ConversionCpaControlChartCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
  metricLabel?: string;
  currentPeriod?: { dateStart: string; dateStop: string };
  minCoverage?: number;
}

export default function ConversionCpaControlChartCard({
  data,
  isLoading,
  metricLabel = "costo por resultado",
  currentPeriod,
  minCoverage = 0.6,
}: ConversionCpaControlChartCardProps) {
  const analysis = useMemo(() => {
    const rows = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const totalDaysFromRange = (() => {
      const start = currentPeriod?.dateStart;
      const stop = currentPeriod?.dateStop;
      if (!start || !stop) return null;
      const a = new Date(`${start}T00:00:00Z`);
      const b = new Date(`${stop}T00:00:00Z`);
      const diff = Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
      return Number.isFinite(diff) && diff > 0 ? diff : null;
    })();
    const cpas = rows
      .map((r) => r.cpa)
      .filter((c): c is number => c != null && c > 0 && Number.isFinite(c));
    const totalDays = totalDaysFromRange ?? rows.length;
    const cpaCoverage = totalDays > 0 ? cpas.length / totalDays : 0;
    if (totalDays > 0 && cpaCoverage < minCoverage) {
      return {
        chart: [] as Array<{ date: string; cpa: number | null; mean: number; ucl: number; lcl: number; is_outlier: boolean }>,
        coverageBlocked: true,
        totalDays,
        loadedCpaDays: cpas.length,
      };
    }
    if (!shouldShowControlChart(rows)) {
      return {
        chart: [] as Array<{ date: string; cpa: number | null; mean: number; ucl: number; lcl: number; is_outlier: boolean }>,
        coverageBlocked: false,
        totalDays,
        loadedCpaDays: cpas.length,
      };
    }
    const mean = cpas.reduce((s, c) => s + c, 0) / cpas.length;
    const variance = cpas.reduce((s, c) => s + (c - mean) ** 2, 0) / cpas.length;
    const std = Math.sqrt(variance);
    const ucl = mean + 2 * std;
    const lcl = Math.max(0, mean - 2 * std);
    return {
      chart: rows.map((r) => ({
        date: r.date,
        cpa: r.cpa,
        mean,
        ucl,
        lcl,
        is_outlier: typeof r.cpa === "number" && r.cpa > 0 ? r.cpa > ucl || r.cpa < lcl : false,
      })),
      coverageBlocked: false,
      totalDays,
      loadedCpaDays: cpas.length,
    };
  }, [data, currentPeriod, minCoverage]);

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  if (analysis.coverageBlocked) {
    const simpleRows = [...(data ?? [])]
      .filter((r) => r.cpa != null && r.cpa > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, cpa: r.cpa, spend: r.spend }));
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">CPA diario — {metricLabel}</CardTitle>
          <CardDescription>
            {analysis.loadedCpaDays}/{analysis.totalDays} días activos — cobertura insuficiente para análisis estadístico. Se muestra la serie disponible.
          </CardDescription>
        </CardHeader>
        {simpleRows.length > 0 && (
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={simpleRows} margin={{ left: 8, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
                <YAxis yAxisId="cpa" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} width={40} />
                <YAxis yAxisId="spend" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} width={40} />
                <Tooltip formatter={(v, name) => [`$${Number(v ?? 0).toFixed(2)}`, name]} labelFormatter={(l) => `Fecha: ${l}`} />
                <Bar yAxisId="spend" dataKey="spend" name="Gasto" fill="#6366f1" opacity={0.4} radius={[3,3,0,0]} />
                <Line yAxisId="cpa" type="monotone" dataKey="cpa" stroke="#56048C" strokeWidth={2} dot={{ r: 3 }} name={metricLabel} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        )}
      </Card>
    );
  }

  if (analysis.chart.length < 3) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carta de control — {metricLabel} diario</CardTitle>
          <CardDescription>Se requieren al menos 7 días con CPA válido para estimar dispersión de forma útil.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const outliers = analysis.chart.filter((r) => r.is_outlier).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Carta de control — {metricLabel}</CardTitle>
        <CardDescription>
          Límites ±2σ sobre serie diaria. Puntos rojos = fuera de control ({outliers} en este periodo).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={analysis.chart} margin={{ left: 8, right: 8, top: 8 }}>
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
              name={metricLabel}
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

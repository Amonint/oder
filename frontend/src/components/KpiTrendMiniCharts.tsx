import { useState, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardChartColor } from "@/lib/dashboardColors";
import type { DailyInsightPoint } from "@/lib/timeSeriesFromMeta";
import { cn } from "@/lib/utils";

interface KpiTrendMiniChartsProps {
  points: DailyInsightPoint[];
  isLoading: boolean;
}

type MetricKey = keyof DailyInsightPoint;

interface MetricDef {
  key: MetricKey;
  label: string;
  format: (v: number) => string;
  yFormat: (v: number) => string;
  colorIndex: number;
}

const METRICS: MetricDef[] = [
  {
    key: "spend",
    label: "Gasto",
    format: (v) => `$${v.toFixed(2)}`,
    yFormat: (v) => `$${v % 1 === 0 ? v : v.toFixed(1)}`,
    colorIndex: 0,
  },
  {
    key: "impressions",
    label: "Impresiones",
    format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
    yFormat: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)),
    colorIndex: 1,
  },
  {
    key: "clicks",
    label: "Clics",
    format: (v) => Math.round(v).toLocaleString("es"),
    yFormat: (v) => String(Math.round(v)),
    colorIndex: 2,
  },
  {
    key: "reach",
    label: "Alcance",
    format: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
    yFormat: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)),
    colorIndex: 3,
  },
  {
    key: "frequency",
    label: "Frecuencia",
    format: (v) => v.toFixed(2),
    yFormat: (v) => v.toFixed(1),
    colorIndex: 4,
  },
  {
    key: "cpm",
    label: "CPM",
    format: (v) => `$${v.toFixed(2)}`,
    yFormat: (v) => `$${v.toFixed(1)}`,
    colorIndex: 5,
  },
  {
    key: "cpp",
    label: "CPP",
    format: (v) => `$${v.toFixed(2)}`,
    yFormat: (v) => `$${v.toFixed(1)}`,
    colorIndex: 0,
  },
  {
    key: "ctr",
    label: "CTR",
    format: (v) => `${v.toFixed(2)}%`,
    yFormat: (v) => `${v.toFixed(1)}%`,
    colorIndex: 1,
  },
  {
    key: "cpa",
    label: "CPA",
    format: (v) => `$${v.toFixed(2)}`,
    yFormat: (v) => `$${v.toFixed(1)}`,
    colorIndex: 2,
  },
];

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString("es", { month: "short", day: "numeric" });
}

export default function KpiTrendMiniCharts({ points, isLoading }: KpiTrendMiniChartsProps) {
  const [selectedKey, setSelectedKey] = useState<MetricKey>("spend");

  const metric = METRICS.find((m) => m.key === selectedKey) ?? METRICS[0];
  const color = dashboardChartColor(metric.colorIndex);

  const chartData = useMemo(
    () =>
      points.map((p) => {
        const raw = p[selectedKey];
        const value = raw == null ? null : Number(raw);
        return {
          date: p.date,
          label: formatDateLabel(p.date),
          value: value != null && Number.isFinite(value) && value > 0 ? value : null,
        };
      }),
    [points, selectedKey],
  );

  // Only show metrics that have at least one non-zero point
  const availableMetrics = useMemo(
    () =>
      METRICS.filter((m) =>
        points.some((p) => {
          const v = p[m.key];
          return v != null && Number(v) > 0;
        }),
      ),
    [points],
  );

  if (isLoading) {
    return <Skeleton className="h-[280px] w-full rounded-xl" />;
  }

  if (points.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolución de indicadores</CardTitle>
        <CardDescription>
          Tendencia diaria según el periodo y filtros activos. Cuando no hay campaña seleccionada, los valores consolidan todas las campañas y páginas de la cuenta. Las tasas (CPM, CTR, Frecuencia) se re-derivan de los totales del día. Elige la métrica en el panel derecho.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex gap-4">
          {/* Chart */}
          <div className="min-w-0 flex-1">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={`kpiGrad-${metric.colorIndex}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={metric.yFormat}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const v = payload[0].value as number | null;
                    const pt = payload[0].payload as { date: string; label: string; value: number | null };
                    if (v == null) return null;
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                        <p className="text-muted-foreground">{pt.label}</p>
                        <p className="mt-0.5 font-medium tabular-nums">{metric.format(v)}</p>
                        <p className="text-muted-foreground">{metric.label}</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#kpiGrad-${metric.colorIndex})`}
                  dot={false}
                  activeDot={{ r: 4, fill: color }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Metric selector */}
          <div className="flex w-28 flex-shrink-0 flex-col gap-1">
            {availableMetrics.map((m) => (
              <button
                key={String(m.key)}
                type="button"
                onClick={() => setSelectedKey(m.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                  selectedKey === m.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageTimeseriesRow } from "@/api/client";

interface TimeseriesChartProps {
  data: PageTimeseriesRow[] | undefined;
  isLoading: boolean;
}

const SERIES = [
  { key: "spend", label: "Gasto ($)", yAxis: "money", stroke: "#3b82f6", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "impressions", label: "Impresiones", yAxis: "count", stroke: "#8b5cf6", format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) },
  { key: "cpm", label: "CPM", yAxis: "money", stroke: "#f59e0b", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "ctr", label: "CTR (%)", yAxis: "pct", stroke: "#10b981", format: (v: number) => `${v.toFixed(2)}%` },
  { key: "cpc", label: "CPC ($)", yAxis: "money", stroke: "#ef4444", format: (v: number) => `$${v.toFixed(2)}` },
] as const;

export default function TimeseriesChart({ data, isLoading }: TimeseriesChartProps) {
  const [active, setActive] = useState<Set<string>>(new Set(["spend", "impressions"]));

  const rows = (data ?? []).map((r) => ({
    date: r.date_start ?? "",
    spend: parseFloat(r.spend ?? "0"),
    impressions: parseInt(r.impressions ?? "0"),
    cpm: parseFloat(r.cpm ?? "0"),
    ctr: parseFloat(r.ctr ?? "0"),
    cpc: parseFloat(r.cpc ?? "0"),
  }));

  function toggleSerie(key: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Cómo evolucionó?</CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSerie(s.key)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                active.has(s.key)
                  ? "border-transparent text-white"
                  : "border-border text-muted-foreground bg-background"
              }`}
              style={active.has(s.key) ? { backgroundColor: s.stroke, borderColor: s.stroke } : {}}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : rows.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Se necesitan al menos 2 días de datos para mostrar la evolución.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rows} margin={{ left: 8, right: 32 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                yAxisId="money"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `$${v}`}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                formatter={(value, name) => {
                  const v = Number(value);
                  const s = SERIES.find((x) => x.label === name);
                  return [s ? s.format(v) : String(v), name as string];
                }}
              />
              <Legend />
              {SERIES.filter((s) => active.has(s.key)).map((s) => (
                <Line
                  key={s.key}
                  yAxisId={s.yAxis as string}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.stroke}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

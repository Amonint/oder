import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { PlacementInsightRow } from "@/api/client";
import { barColorAt, dashboardChartColor } from "@/lib/dashboardColors";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const DEFAULT_PLACEMENT_MIN_SPEND_USD = 25;

type MetricMode = "pct_spend" | "cpa";

const DATE_PRESET_LABELS: Record<string, string> = {
  today: "Hoy",
  last_7d: "Últimos 7 días",
  last_30d: "Últimos 30 días",
  last_90d: "Últimos 90 días",
  custom: "Personalizado",
  maximum: "Máximo disponible",
};

type ChartDatum = {
  key: string;
  label: string;
  barValue: number;
  spend: number;
  pctSpend: number;
  cpaDerived: number | null;
  insufficient: boolean;
};

function placementLabel(row: PlacementInsightRow): string {
  const plat = String(row.publisher_platform ?? "—");
  const pos = String(row.platform_position ?? "—");
  return `${plat} · ${pos}`;
}

function buildContextFooter(
  datePreset: string | null,
  timeRange: { since: string; until: string } | null,
): string {
  const presetLabel =
    (datePreset && DATE_PRESET_LABELS[datePreset]) ?? datePreset ?? "—";
  if (timeRange?.since && timeRange?.until) {
    return `Periodo: ${presetLabel} (${timeRange.since} → ${timeRange.until})`;
  }
  return `Periodo: ${presetLabel}`;
}

const chartConfig = {
  value: {
    label: "Métrica",
    color: dashboardChartColor(0),
  },
} satisfies ChartConfig;

interface PlacementEfficiencyBarChartProps {
  rows: PlacementInsightRow[];
  datePreset: string | null;
  timeRange: { since: string; until: string } | null;
  /** Gasto mínimo (USD) para ordenar y leer CPA sin sesgo de bajo volumen. */
  minSpendUsd?: number;
  maxBars?: number;
}

export default function PlacementEfficiencyBarChart({
  rows,
  datePreset,
  timeRange,
  minSpendUsd = DEFAULT_PLACEMENT_MIN_SPEND_USD,
  maxBars = 20,
}: PlacementEfficiencyBarChartProps) {
  const [metric, setMetric] = useState<MetricMode>("pct_spend");

  const totalSpend = useMemo(
    () => rows.reduce((s, r) => s + Number(r.spend ?? 0), 0),
    [rows],
  );

  const chartData = useMemo((): ChartDatum[] => {
    if (rows.length === 0) return [];

    if (metric === "pct_spend") {
      const mapped = rows.map((row, i) => {
        const spend = Number(row.spend ?? 0);
        const pct =
          row.pct_spend != null && Number.isFinite(row.pct_spend)
            ? row.pct_spend
            : totalSpend > 0
              ? (spend / totalSpend) * 100
              : 0;
        const label = placementLabel(row);
        return {
          key: `${label}-${i}`,
          label,
          barValue: pct,
          spend,
          pctSpend: pct,
          cpaDerived: row.cpa_derived ?? null,
          insufficient: false,
        };
      });
      return mapped.sort((a, b) => b.barValue - a.barValue).slice(0, maxBars);
    }

    const eligible: ChartDatum[] = [];
    const insufficient: ChartDatum[] = [];

    rows.forEach((row, i) => {
      const spend = Number(row.spend ?? 0);
      const label = placementLabel(row);
      const cpa = row.cpa_derived != null && Number.isFinite(row.cpa_derived) ? row.cpa_derived : null;
      const base = {
        key: `${label}-${i}`,
        label,
        spend,
        pctSpend:
          row.pct_spend != null && Number.isFinite(row.pct_spend)
            ? row.pct_spend
            : totalSpend > 0
              ? (spend / totalSpend) * 100
              : 0,
        cpaDerived: cpa,
        insufficient: false,
      };

      if (spend >= minSpendUsd && cpa != null && cpa > 0) {
        eligible.push({ ...base, barValue: cpa, insufficient: false });
      } else {
        insufficient.push({ ...base, barValue: 0, insufficient: true });
      }
    });

    eligible.sort((a, b) => b.barValue - a.barValue);
    insufficient.sort((a, b) => b.spend - a.spend);
    return [...eligible, ...insufficient].slice(0, maxBars);
  }, [rows, metric, totalSpend, minSpendUsd, maxBars]);

  const contextLine = useMemo(
    () => buildContextFooter(datePreset, timeRange),
    [datePreset, timeRange],
  );

  if (rows.length === 0) {
    return null;
  }

  const cpaNote =
    "CPA derivado con la mezcla de conversiones de la cuenta (misma ventana de atribución que el resumen ejecutivo).";

  return (
    <div className="mt-6 space-y-3 border-t pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h4 className="text-foreground text-sm font-semibold">
          Eficiencia por placement
        </h4>
        <Tabs
          value={metric}
          onValueChange={(v) => setMetric(v as MetricMode)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-[280px]">
            <TabsTrigger value="pct_spend">% gasto</TabsTrigger>
            <TabsTrigger value="cpa">CPA</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {metric === "cpa" &&
      chartData.length > 0 &&
      chartData.every((d) => d.insufficient) ? (
        <p className="text-muted-foreground text-sm">
          Sin placements con volumen suficiente (≥ ${minSpendUsd} gasto) para comparar CPA de forma fiable.
        </p>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ minHeight: Math.max(200, chartData.length * 36 + 48) }}
        >
          <BarChart
            accessibilityLayer
            layout="vertical"
            data={chartData}
            margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                metric === "pct_spend" ? `${Number(v).toFixed(0)}%` : `$${Number(v).toFixed(0)}`
              }
            />
            <YAxis
              type="category"
              dataKey="label"
              width={168}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as ChartDatum;
                if (metric === "pct_spend") {
                  return (
                    <div className="border-border bg-background rounded-md border px-2 py-1.5 text-xs shadow-md">
                      <p className="font-medium">{d.label}</p>
                      <p className="text-muted-foreground tabular-nums">
                        % gasto: {d.pctSpend.toFixed(1)}%
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        Gasto: ${d.spend.toFixed(2)}
                      </p>
                    </div>
                  );
                }
                if (d.insufficient) {
                  return (
                    <div className="border-border bg-background rounded-md border px-2 py-1.5 text-xs shadow-md">
                      <p className="font-medium">{d.label}</p>
                      <p className="text-muted-foreground">Datos insuficientes</p>
                      <p className="text-muted-foreground tabular-nums">
                        Gasto: ${d.spend.toFixed(2)} (mín. ${minSpendUsd} para CPA)
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="border-border bg-background rounded-md border px-2 py-1.5 text-xs shadow-md">
                    <p className="font-medium">{d.label}</p>
                    <p className="tabular-nums">CPA: ${d.cpaDerived?.toFixed(2) ?? "—"}</p>
                    <p className="text-muted-foreground tabular-nums">
                      Gasto: ${d.spend.toFixed(2)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="barValue" radius={[0, 4, 4, 0]} minPointSize={metric === "cpa" ? 6 : 0}>
              {chartData.map((d, i) => (
                <Cell
                  key={d.key}
                  fill={
                    d.insufficient
                      ? "hsl(var(--muted-foreground) / 0.35)"
                      : barColorAt(i, d.label)
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <div className="text-muted-foreground space-y-1 text-xs">
        <p>{contextLine}</p>
        {metric === "cpa" ? <p>{cpaNote}</p> : null}
      </div>
    </div>
  );
}

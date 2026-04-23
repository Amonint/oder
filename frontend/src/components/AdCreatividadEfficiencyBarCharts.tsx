import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import type { AdPerformanceRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";
import { enrichAdRankingRows } from "@/lib/adRankingDerived";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const TOP = 10;

type Point = { label: string; value: number; key: string };

function buildCpaWorstFirst(rows: AdPerformanceRow[], minSpendUsd: number): Point[] {
  return enrichAdRankingRows(rows)
    .filter((e) => e.spend >= minSpendUsd && e.cpa != null && e.cpa > 0)
    .sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))
    .slice(0, TOP)
    .map((e, i) => ({
      label: e.label || `Anuncio ${i + 1}`,
      value: e.cpa!,
      key: String(e.row.ad_id ?? e.label ?? i),
    }));
}

function buildRoasBestFirst(rows: AdPerformanceRow[], minSpendUsd: number): Point[] {
  return enrichAdRankingRows(rows)
    .filter((e) => e.spend >= minSpendUsd && e.roas != null && e.roas > 0)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
    .slice(0, TOP)
    .map((e, i) => ({
      label: e.label || `Anuncio ${i + 1}`,
      value: e.roas!,
      key: String(e.row.ad_id ?? e.label ?? i),
    }));
}

function buildEfficiencyBestFirst(rows: AdPerformanceRow[], minSpendUsd: number): Point[] {
  return enrichAdRankingRows(rows)
    .filter((e) => e.spend >= minSpendUsd && e.results > 0)
    .map((e) => ({
      label: e.label || "Anuncio sin nombre",
      value: e.spend > 0 ? e.results / e.spend : 0,
      key: String(e.row.ad_id ?? e.label ?? "na"),
    }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP);
}

const cpaConfig = {
  value: { label: "CPA (USD)", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const roasConfig = {
  value: { label: "ROAS (×)", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

export default function AdCreatividadEfficiencyBarCharts({
  rows,
  minSpendUsd,
}: {
  rows: AdPerformanceRow[];
  minSpendUsd: number;
}) {
  const cpaData = buildCpaWorstFirst(rows, minSpendUsd);
  const roasData = buildRoasBestFirst(rows, minSpendUsd);
  const efficiencyData = buildEfficiencyBestFirst(rows, minSpendUsd);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="text-foreground text-sm font-medium">CPA — peor primero (top {TOP})</p>
        <p className="text-muted-foreground text-xs">
          Solo anuncios con gasto ≥ ${minSpendUsd.toFixed(0)} USD y CPA calculable. El resto sigue en la tabla pero no entra en este ranking para no distorsionar el orden.
        </p>
        {cpaData.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin datos suficientes para CPA con este umbral.</p>
        ) : (
          <ChartContainer config={cpaConfig} className="min-h-[320px] w-full">
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={cpaData}
              margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={4}>
                {cpaData.map((d, i) => (
                  <Cell key={d.key} fill={barColorAt(i, d.key)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-foreground text-sm font-medium">ROAS — mejor primero (top {TOP})</p>
        <p className="text-muted-foreground text-xs">
          Misma regla de volumen: gasto mínimo ${minSpendUsd.toFixed(0)} USD e ingresos de compra en <code className="text-[10px]">action_values</code> cuando aplique.
        </p>
        {roasData.length === 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Sin ROAS calculable con este umbral. Mostramos fallback por eficiencia operativa (resultados / gasto).
            </p>
            {efficiencyData.length > 0 ? (
              <ChartContainer config={roasConfig} className="min-h-[320px] w-full">
                <BarChart
                  accessibilityLayer
                  layout="vertical"
                  data={efficiencyData}
                  margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => Number(v).toFixed(3)} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={112}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={4}>
                    {efficiencyData.map((d, i) => (
                      <Cell key={d.key} fill={barColorAt(i + 3, d.key)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : null}
          </div>
        ) : (
          <ChartContainer config={roasConfig} className="min-h-[320px] w-full">
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={roasData}
              margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(2)}×`} />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={4}>
                {roasData.map((d, i) => (
                  <Cell key={d.key} fill={barColorAt(i + 3, d.key)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

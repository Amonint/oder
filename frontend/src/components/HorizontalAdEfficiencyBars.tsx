import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdPerformanceRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";
import { enrichAdRankingRows } from "@/lib/adRankingDerived";

const MIN_SPEND_USD = 15;

interface HorizontalAdEfficiencyBarsProps {
  rows: AdPerformanceRow[] | undefined;
  isLoading: boolean;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export default function HorizontalAdEfficiencyBars({ rows, isLoading }: HorizontalAdEfficiencyBarsProps) {
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;

  const enriched = enrichAdRankingRows(rows ?? []);
  const withSpend = enriched.filter((e) => e.spend >= MIN_SPEND_USD);
  const cpaVals = withSpend.map((e) => e.cpa).filter((c): c is number => c != null && c > 0 && Number.isFinite(c));
  const refCpa = median(cpaVals);
  const threshold = refCpa != null ? refCpa * 1.25 : null;

  const chartRows = [...withSpend]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 14)
    .map((e, i) => ({
      key: e.row.ad_id ?? String(i),
      label: (e.row.ad_label ?? e.row.ad_name ?? e.row.ad_id ?? "Anuncio").slice(0, 36),
      spend: e.spend,
      cpa: e.cpa ?? 0,
      cpaDisplay: e.cpa,
      bad: threshold != null && e.cpa != null && e.cpa > threshold,
      idx: i,
    }));

  if (chartRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eficiencia por anuncio (CPA)</CardTitle>
          <CardDescription>Sin datos con gasto suficiente en este periodo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Anuncios que concentran presión en el CPA</CardTitle>
        <CardDescription>
          Top por gasto (mín. ${MIN_SPEND_USD} USD). La línea vertical marca 1,25× la mediana de CPA de anuncios con
          CPA calculado. Barras en tono más intenso superan ese umbral.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(chartRows.length * 32, 200)}>
          <BarChart data={chartRows} layout="vertical" margin={{ left: 16, right: 24, top: 8 }}>
            <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(0)}`} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 10 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof chartRows)[0];
                return (
                  <div className="border-border bg-background rounded-md border px-2 py-1.5 text-xs shadow-md">
                    <p className="font-medium">{p.label}</p>
                    <p className="text-muted-foreground tabular-nums">
                      Gasto: ${p.spend.toFixed(2)} · CPA: {p.cpaDisplay != null ? `$${p.cpaDisplay.toFixed(2)}` : "—"}
                    </p>
                  </div>
                );
              }}
            />
            {threshold != null ? (
              <ReferenceLine
                x={threshold}
                stroke="hsl(var(--destructive))"
                strokeDasharray="4 4"
                label={{ value: `Umbral`, position: "top", fontSize: 10 }}
              />
            ) : null}
            <Bar dataKey="cpa" radius={[0, 4, 4, 0]}>
              {chartRows.map((r) => (
                <Cell
                  key={r.key}
                  fill={barColorAt(r.idx, r.key)}
                  fillOpacity={r.bad ? 1 : 0.55}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlacementInsightRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";
import { toFloat } from "@/lib/adRankingDerived";

interface PlacementTreemapAndMixProps {
  rows: PlacementInsightRow[] | undefined;
  isLoading: boolean;
}

type TreemapDatum = { name: string; value: number; fill?: string };

const COLORS = ["#56048C", "#D91480", "#0EA5E9", "#22C55E", "#EAB308", "#F97316"];

export default function PlacementTreemapAndMix({ rows, isLoading }: PlacementTreemapAndMixProps) {
  const { treeData, mixRows } = useMemo(() => {
    const list = rows ?? [];
    const byKey = new Map<string, { spend: number }>();
    for (const r of list) {
      const plat = String(r.publisher_platform ?? "—");
      const pos = String(r.platform_position ?? "—");
      const key = `${plat} / ${pos}`;
      const spend = toFloat(r.spend);
      const prev = byKey.get(key) ?? { spend: 0 };
      prev.spend += spend;
      byKey.set(key, prev);
    }
    const sorted = [...byKey.entries()].sort((a, b) => b[1].spend - a[1].spend);
    const treeData: TreemapDatum[] = sorted.slice(0, 40).map(([k, v], i) => ({
      name: k.length > 42 ? `${k.slice(0, 40)}…` : k,
      value: Math.max(v.spend, 0.01),
      fill: COLORS[i % COLORS.length],
    }));
    const mixRows = sorted.slice(0, 10).map(([k, v], i) => {
      const match = list.find(
        (r) =>
          `${String(r.publisher_platform ?? "—")} / ${String(r.platform_position ?? "—")}` === k
      );
      const cpaRaw = match?.cpa_derived;
      return {
        label: k.length > 36 ? `${k.slice(0, 34)}…` : k,
        spend: v.spend,
        cpa: cpaRaw != null && cpaRaw > 0 ? cpaRaw : 0,
        hasCpa: cpaRaw != null && cpaRaw > 0,
        i,
        key: k,
      };
    });
    return { treeData, mixRows };
  }, [rows]);

  if (isLoading) return <Skeleton className="h-[480px] w-full rounded-xl" />;

  if (!treeData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Placements — treemap y mix</CardTitle>
          <CardDescription>Sin datos de placement.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Treemap de gasto</CardTitle>
          <CardDescription>Superficie ∝ gasto por plataforma + posición.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <Treemap
              data={treeData}
              dataKey="value"
              nameKey="name"
              aspectRatio={4 / 3}
              stroke="hsl(var(--border))"
            >
              <Tooltip
                formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Gasto"]}
                contentStyle={{ fontSize: 12 }}
              />
            </Treemap>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top 10 — gasto y CPA</CardTitle>
          <CardDescription>Barras: gasto (colores) y CPA derivado (gris) cuando aplica.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={mixRows} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={72} />
              <YAxis yAxisId="spend" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <YAxis yAxisId="cpa" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(
                  value,
                  name,
                  _i,
                  payloadObj: { payload?: { hasCpa?: boolean } }
                ) => {
                  const v = Number(value ?? 0);
                  if (String(name) === "cpa") {
                    const has = payloadObj?.payload?.hasCpa;
                    return has ? [`$${v.toFixed(2)}`, "CPA"] : ["—", "CPA"];
                  }
                  return [`$${v.toFixed(2)}`, "Gasto"];
                }}
              />
              <Bar yAxisId="spend" dataKey="spend" name="Gasto" radius={[4, 4, 0, 0]}>
                {mixRows.map((r) => (
                  <Cell key={`${r.key}-sp`} fill={barColorAt(r.i, r.key)} fillOpacity={0.85} />
                ))}
              </Bar>
              <Bar yAxisId="cpa" dataKey="cpa" name="cpa" radius={[4, 4, 0, 0]} fill="hsl(var(--muted-foreground))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

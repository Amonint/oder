import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GeoInsightRow } from "@/api/client";
import type { GeoMapMetric } from "@/components/GeoMap";
import { barColorAt } from "@/lib/dashboardColors";

const MIN_SPEND = 20;

interface GeoRegionalEfficiencyBarsProps {
  rows: GeoInsightRow[];
  /** KPI activo en el mapa para contextualizar el texto */
  mapMetric: GeoMapMetric;
}

export default function GeoRegionalEfficiencyBars({ rows, mapMetric }: GeoRegionalEfficiencyBarsProps) {
  const scored = rows
    .map((r) => {
      const spend = parseFloat(String(r.spend ?? "0")) || 0;
      const cpa = r.cpa;
      return { label: (r.region_name || r.region || "—").slice(0, 28), spend, cpa: cpa ?? null };
    })
    .filter((r) => r.spend >= MIN_SPEND && r.cpa != null && r.cpa > 0);

  const best = [...scored].sort((a, b) => a.cpa! - b.cpa!).slice(0, 5);
  const worst = [...scored].sort((a, b) => b.cpa! - a.cpa!).slice(0, 5);

  if (scored.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay regiones con gasto ≥ ${MIN_SPEND} y CPA calculado para comparar barras.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Mejor CPA (top 5)</CardTitle>
          <CardDescription className="text-xs">
            Regiones con menor coste por resultado; filtros y métrica del mapa ({mapMetric}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={best} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(0)}`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "CPA"]} />
              <Bar dataKey="cpa" radius={[0, 4, 4, 0]}>
                {best.map((r, i) => (
                  <Cell key={r.label} fill={barColorAt(i, r.label)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">CPA más alto (vigilar)</CardTitle>
          <CardDescription className="text-xs">Útil para detectar desperdicio regional con volumen.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={worst} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(0)}`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "CPA"]} />
              <Bar dataKey="cpa" radius={[0, 4, 4, 0]}>
                {worst.map((r, i) => (
                  <Cell key={r.label} fill={barColorAt(i + 5, r.label)} fillOpacity={0.95} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

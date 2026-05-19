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

interface GeoRegionalEfficiencyBarsProps {
  rows: GeoInsightRow[];
  mapMetric: GeoMapMetric;
  minSpendUsd?: number;
}

export default function GeoRegionalEfficiencyBars({
  rows,
  mapMetric: _mapMetric,
  minSpendUsd = 25,
}: GeoRegionalEfficiencyBarsProps) {
  const scored = rows
    .map((r) => {
      const spend = parseFloat(String(r.spend ?? "0")) || 0;
      const clicks = Number(r.clicks ?? 0);
      const cpa = r.cpa;
      return {
        label: (r.region_name || r.region || "—").slice(0, 28),
        spend,
        clicks,
        cpa: cpa != null && cpa > 0 ? cpa : null,
      };
    });

  const withCpa = scored.filter((r) => r.spend >= minSpendUsd && r.cpa != null);
  const hasCpa = withCpa.length >= 2;

  if (hasCpa) {
    const best = [...withCpa].sort((a, b) => a.cpa! - b.cpa!).slice(0, 5);
    const worst = [...withCpa].sort((a, b) => b.cpa! - a.cpa!).slice(0, 5);

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Mejor CPA por región (top 5)</CardTitle>
            <CardDescription className="text-xs">
              Regiones con menor costo por resultado; gasto mínimo ${minSpendUsd}.
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
            <CardTitle className="text-sm">CPA más alto por región (vigilar)</CardTitle>
            <CardDescription className="text-xs">Regiones con mayor costo — evalúa reducir presupuesto ahí.</CardDescription>
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

  // Fallback cuando Meta no devuelve CPA por región (ej. campañas de mensajería)
  const byClicks = [...scored]
    .filter((r) => r.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 8);

  if (byClicks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Clics por región (top {byClicks.length})</CardTitle>
        <CardDescription className="text-xs">
          Meta no desglosa conversaciones de mensajería por región. Se muestra volumen de clics como señal de interés geográfico.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(180, byClicks.length * 32)}>
          <BarChart data={byClicks} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value) => [Number(value).toLocaleString("es"), "Clics"]} />
            <Bar dataKey="clicks" radius={[0, 4, 4, 0]}>
              {byClicks.map((r, i) => (
                <Cell key={r.label} fill={barColorAt(i, r.label)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdPerformanceRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";
import { toFloat } from "@/lib/adRankingDerived";

function sumOutbound(row: AdPerformanceRow): number {
  const t = row.outbound_clicks_total;
  if (t != null && t > 0) return t;
  let n = 0;
  for (const oc of row.outbound_clicks ?? []) {
    if (String(oc.action_type) === "outbound_click") n += toFloat(oc.value);
  }
  return Math.round(n);
}

function sumMessagingStarted(actions: AdPerformanceRow["actions"]): number {
  let s = 0;
  for (const a of actions ?? []) {
    const t = String(a.action_type ?? "");
    if (t.includes("messaging_conversation_started")) s += toFloat(a.value);
  }
  return s;
}

interface OutboundMessagingFunnelCardProps {
  rows: AdPerformanceRow[] | undefined;
  isLoading: boolean;
}

export default function OutboundMessagingFunnelCard({ rows, isLoading }: OutboundMessagingFunnelCardProps) {
  const chartData = useMemo(() => {
    const list = rows ?? [];
    const enriched = list
      .map((r, i) => {
        const outbound = sumOutbound(r);
        const msg = sumMessagingStarted(r.actions);
        const spend = toFloat(r.spend);
        return {
          key: String(r.ad_id ?? i),
          label: (r.ad_label ?? r.ad_name ?? r.ad_id ?? "Anuncio").slice(0, 26),
          outbound,
          msg,
          spend,
          i,
        };
      })
      .filter((r) => r.outbound > 0 || r.msg > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    return enriched.map((r) => ({
      ...r,
      /** para apilar: mostrar outbound que no convirtió en mensaje como “rebote” */
      outboundOnly: Math.max(0, r.outbound - r.msg),
    }));
  }, [rows]);

  if (isLoading) return <Skeleton className="h-80 w-full rounded-xl" />;

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Embudo outbound → conversación (top anuncios)</CardTitle>
          <CardDescription>No hay datos de clics salientes o mensajes en el ranking.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top anuncios: clics salientes vs conversaciones iniciadas</CardTitle>
        <CardDescription>
          Barras apiladas (estimación): tramo superior = conversaciones atribuidas; base = salientes adicionales.
          Sirve para ver dónde hay fugas entre clic fuera del anuncio y diálogo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-16} textAnchor="end" height={72} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="outboundOnly" name="Outbound (no mensaje)" stackId="a" radius={[0, 0, 0, 0]}>
              {chartData.map((r) => (
                <Cell key={`o-${r.key}`} fill={barColorAt(r.i + 3, `${r.key}-o`)} fillOpacity={0.5} />
              ))}
            </Bar>
            <Bar dataKey="msg" name="Conversaciones" stackId="a" radius={[4, 4, 0, 0]}>
              {chartData.map((r) => (
                <Cell key={`m-${r.key}`} fill={barColorAt(r.i, `${r.key}-m`)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

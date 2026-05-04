import { useMemo } from "react";
import {
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdPerformanceRow } from "@/api/client";
import { dashboardChartColor } from "@/lib/dashboardColors";
import { sumPurchaseValues, toFloat } from "@/lib/adRankingDerived";

function messagingConv(actions: AdPerformanceRow["actions"]): number {
  let s = 0;
  for (const a of actions ?? []) {
    const t = String(a.action_type ?? "");
    if (t.includes("messaging_conversation")) s += toFloat(a.value);
  }
  return s;
}

interface PurchaseVsMessagingScatterCardProps {
  rows: AdPerformanceRow[] | undefined;
  isLoading: boolean;
}

export default function PurchaseVsMessagingScatterCard({
  rows,
  isLoading,
}: PurchaseVsMessagingScatterCardProps) {
  const points = useMemo(() => {
    return (rows ?? [])
      .map((r, i) => {
        const purchases = sumPurchaseValues(r.action_values);
        const chats = messagingConv(r.actions);
        const spend = toFloat(r.spend);
        return {
          id: String(r.ad_id ?? i),
          label: (r.ad_label ?? r.ad_name ?? "").slice(0, 28),
          purchases,
          chats,
          spend,
          i,
        };
      })
      .filter((p) => p.spend > 15 && (p.purchases > 0 || p.chats > 0));
  }, [rows]);

  if (isLoading) return <Skeleton className="h-80 w-full rounded-xl" />;

  if (points.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compras vs conversaciones (burbuja)</CardTitle>
          <CardDescription>
            Se necesitan al menos dos anuncios con señal de compra o mensaje y gasto mínimo.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Compras vs actividad de mensajes</CardTitle>
        <CardDescription>
          Eje X = volumen vinculado a compra (action_values). Eje Y = acciones de conversación. Tamaño ~ gasto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ left: 12, right: 12, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" dataKey="purchases" name="Compras" tick={{ fontSize: 11 }} />
            <YAxis type="number" dataKey="chats" name="Mensajes" tick={{ fontSize: 11 }} />
            <ZAxis type="number" dataKey="spend" range={[60, 420]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof points)[0];
                return (
                  <div className="border-border bg-background rounded-md border px-2 py-1 text-xs shadow-md">
                    <p className="font-medium">{p.label}</p>
                    <p className="text-muted-foreground tabular-nums">
                      Compras: {p.purchases.toFixed(1)} · Mensajes: {p.chats.toFixed(1)} · Gasto: ${p.spend.toFixed(2)}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={points} fill={dashboardChartColor(0)} />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

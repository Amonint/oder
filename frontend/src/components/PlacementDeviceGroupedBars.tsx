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
import type { PlacementInsightRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";
import { toFloat } from "@/lib/adRankingDerived";

interface PlacementDeviceGroupedBarsProps {
  rows: PlacementInsightRow[] | undefined;
  isLoading: boolean;
}

export default function PlacementDeviceGroupedBars({ rows, isLoading }: PlacementDeviceGroupedBarsProps) {
  const chartData = useMemo(() => {
    const list = rows ?? [];
    const byDev = new Map<string, { spend: number; cpaNum: number; cpaW: number }>();
    for (const r of list) {
      const dev =
        String(r.impression_device ?? r.device_platform ?? r.publisher_platform ?? "desconocido").trim() ||
        "desconocido";
      const spend = toFloat(r.spend);
      const cpa = r.cpa_derived;
      const prev = byDev.get(dev) ?? { spend: 0, cpaNum: 0, cpaW: 0 };
      prev.spend += spend;
      if (cpa != null && cpa > 0 && spend > 0) {
        prev.cpaNum += cpa * spend;
        prev.cpaW += spend;
      }
      byDev.set(dev, prev);
    }
    return [...byDev.entries()].map(([device, v], i) => ({
      device: device.length > 22 ? `${device.slice(0, 20)}…` : device,
      spend: v.spend,
      cpa: v.cpaW > 0 ? v.cpaNum / v.cpaW : 0,
      hasCpa: v.cpaW > 0,
      i,
      key: device,
    }));
  }, [rows]);

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispositivo / plataforma (desglose)</CardTitle>
          <CardDescription>Activa el desglose por dispositivo en la consulta de placements.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gasto y CPA por dispositivo</CardTitle>
        <CardDescription>
          CPA como media ponderada por gasto dentro de cada categoría de dispositivo mostrada por Meta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="device" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={64} />
            <YAxis yAxisId="spend" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="cpa" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              formatter={(value, name, _i, payload) => {
                const v = Number(value ?? 0);
                const data = payload as { payload?: { hasCpa?: boolean } } | undefined;
                if (String(name).toLowerCase().includes("cpa")) {
                  return data?.payload?.hasCpa ? [`$${v.toFixed(2)}`, "CPA (ponderado)"] : ["—", "CPA"];
                }
                return [`$${v.toFixed(2)}`, "Gasto"];
              }}
            />
            <Legend />
            <Bar yAxisId="spend" dataKey="spend" name="Gasto" radius={[4, 4, 0, 0]}>
              {chartData.map((r) => (
                <Cell key={`${r.key}-s`} fill={barColorAt(r.i, r.key)} fillOpacity={0.85} />
              ))}
            </Bar>
            <Bar yAxisId="cpa" dataKey="cpa" name="CPA pond." fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

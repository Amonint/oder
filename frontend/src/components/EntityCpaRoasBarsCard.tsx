import { useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EntitySummaryResponse } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";

interface EntityCpaRoasBarsCardProps {
  campaigns: EntitySummaryResponse | undefined;
  adsets: EntitySummaryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function EntityCpaRoasBarsCard({
  campaigns,
  adsets,
  isLoading,
  isError,
  errorMessage,
}: EntityCpaRoasBarsCardProps) {
  const [metric, setMetric] = useState<"cpa" | "roas">("cpa");

  const campRows = useMemo(() => {
    const rows = campaigns?.data ?? [];
    return [...rows]
      .filter((r) => (metric === "cpa" ? r.cpa != null && r.cpa > 0 : r.roas != null && r.roas > 0))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 12)
      .map((r, i) => ({
        name: (r.name || r.entity_id).slice(0, 28),
        val: metric === "cpa" ? (r.cpa as number) : (r.roas as number),
        spend: r.spend,
        i,
        key: r.entity_id,
      }));
  }, [campaigns, metric]);

  const adsetRows = useMemo(() => {
    const rows = adsets?.data ?? [];
    return [...rows]
      .filter((r) => (metric === "cpa" ? r.cpa != null && r.cpa > 0 : r.roas != null && r.roas > 0))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 12)
      .map((r, i) => ({
        name: (r.name || r.entity_id).slice(0, 28),
        val: metric === "cpa" ? (r.cpa as number) : (r.roas as number),
        spend: r.spend,
        i,
        key: r.entity_id,
      }));
  }, [adsets, metric]);

  if (isLoading) return <Skeleton className="h-[400px] w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campañas y conjuntos — eficiencia</CardTitle>
          <CardDescription className="text-destructive">{errorMessage ?? "Error al cargar."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Presupuesto por campaña y conjunto</CardTitle>
        <CardDescription>
          Barras según objetivo del dashboard: CPA o ROAS (top 12 por gasto con métrica válida).
        </CardDescription>
        <div className="pt-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as "cpa" | "roas")}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cpa">CPA</SelectItem>
              <SelectItem value="roas">ROAS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="campaign">
          <TabsList>
            <TabsTrigger value="campaign">Campañas</TabsTrigger>
            <TabsTrigger value="adset">Conjuntos</TabsTrigger>
          </TabsList>
          <TabsContent value="campaign" className="pt-4">
            {campRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin filas para graficar.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(campRows.length * 36, 160)}>
                <BarChart data={campRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis
                    type="number"
                    tickFormatter={(v) => (metric === "cpa" ? `$${Number(v).toFixed(0)}` : Number(v).toFixed(2))}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value) =>
                      metric === "cpa"
                        ? [`$${Number(value ?? 0).toFixed(2)}`, "CPA"]
                        : [Number(value ?? 0).toFixed(2), "ROAS"]
                    }
                  />
                  <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                    {campRows.map((r) => (
                      <Cell key={r.key} fill={barColorAt(r.i, r.key)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </TabsContent>
          <TabsContent value="adset" className="pt-4">
            {adsetRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin filas para graficar.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(adsetRows.length * 36, 160)}>
                <BarChart data={adsetRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis
                    type="number"
                    tickFormatter={(v) => (metric === "cpa" ? `$${Number(v).toFixed(0)}` : Number(v).toFixed(2))}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value) =>
                      metric === "cpa"
                        ? [`$${Number(value ?? 0).toFixed(2)}`, "CPA"]
                        : [Number(value ?? 0).toFixed(2), "ROAS"]
                    }
                  />
                  <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                    {adsetRows.map((r) => (
                      <Cell key={r.key} fill={barColorAt(r.i, r.key)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

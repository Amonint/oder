import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversionTimeseriesRow } from "@/api/client";

interface RetentionModuleProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground text-xl font-semibold">{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  );
}

export default function RetentionModule({ data, isLoading }: RetentionModuleProps) {
  const rows = data ?? [];

  // Totales para KPI cards
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <section className="space-y-4">
      <h2 className="text-foreground text-lg font-semibold">Rentabilidad y Adquisición</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0,1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="CPA Promedio" value={fmt(avgCpa)} sub="Costo por resultado" />
          <KpiTile label="ROAS" value={roas > 0 ? `${roas.toFixed(2)}x` : "—"} sub="Retorno sobre inversión" />
          <KpiTile label="Conversiones" value={totalConversions.toFixed(0)} sub="Leads / Compras / Mensajes" />
          <KpiTile label="Valor generado" value={totalRevenue > 0 ? fmt(totalRevenue) : "—"} sub="Revenue total" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto diario vs CPA</CardTitle>
          <p className="text-muted-foreground text-sm">Barras = Gasto ($) · Línea = CPA ($)</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : rows.length < 2 ? (
            <p className="text-muted-foreground text-sm">
              Se necesitan al menos 2 días de datos para mostrar la evolución.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={{ left: 8, right: 32, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  yAxisId="spend"
                  orientation="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "Gasto ($)", angle: -90, position: "insideLeft", offset: -4, style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="cpa"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "CPA ($)", angle: 90, position: "insideRight", offset: 4, style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "Gasto") return [`$${value.toFixed(2)}`, name];
                    if (name === "CPA") return [`$${value.toFixed(2)}`, name];
                    return [value, name];
                  }}
                  labelFormatter={(label: string) => `Fecha: ${label}`}
                />
                <Legend />
                <Bar
                  yAxisId="spend"
                  dataKey="spend"
                  name="Gasto"
                  fill="#3b82f6"
                  opacity={0.7}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="cpa"
                  type="monotone"
                  dataKey="cpa"
                  name="CPA"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

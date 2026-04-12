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
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { ConversionTimeseriesRow } from "@/api/client";

interface RetentionModuleProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

function KpiTile({ label, value, sub, tooltip }: { label: string; value: string; sub?: string; tooltip: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 space-y-1">
      <p className="text-muted-foreground text-xs flex items-center">
        {label}
        <InfoTooltip text={tooltip} />
      </p>
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
  const totalReplied = rows.reduce((s, r) => s + (r.replied ?? 0), 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const replyRate = totalConversions > 0 ? (totalReplied / totalConversions) * 100 : 0;

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <section className="space-y-4">
      <h2 className="text-foreground text-lg font-semibold">Rentabilidad y Adquisición</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0,1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              label="CPA Promedio"
              value={fmt(avgCpa)}
              sub="Costo por resultado"
              tooltip="Costo promedio por conversión (lead, mensaje iniciado o compra). Se calcula: Gasto total ÷ Total de conversiones del período."
            />
            <KpiTile
              label="Tasa de Respuesta"
              value={replyRate > 0 ? `${replyRate.toFixed(1)}%` : "—"}
              sub="Conversaciones con respuesta"
              tooltip="Porcentaje de conversaciones donde el prospecto respondió activamente. Se calcula: Conversaciones con respuesta ÷ Conversaciones iniciadas × 100. Mide la calidad del lead."
            />
            <KpiTile
              label="Conversiones"
              value={totalConversions.toFixed(0)}
              sub="Leads / Mensajes iniciados"
              tooltip="Total de conversiones del período: leads generados, mensajes de WhatsApp o Messenger iniciados, o compras. Fuente: campo actions de la API, filtrado por tipos de conversión configurados."
            />
            <KpiTile
              label="Primeras Respuestas"
              value={totalReplied > 0 ? totalReplied.toFixed(0) : "—"}
              sub="Personas que respondieron"
              tooltip="Número de conversaciones donde el prospecto respondió al mensaje. Indica interés real del lead. Fuente: acción onsite_conversion.messaging_conversation_replied_7d de Meta."
            />
          </div>
        </TooltipProvider>
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

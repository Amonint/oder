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

interface ConversationQualityCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

export default function ConversationQualityCard({
  data,
  isLoading,
}: ConversationQualityCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Calidad de conversación</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? [])
    .filter((row) => row.conversions > 0 || row.replied > 0)
    .map((row) => ({
      date: row.date,
      iniciadas: row.conversions,
      respondidas: row.replied,
      tasa: row.conversions > 0 ? Math.round((row.replied / row.conversions) * 100) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) return null;

  const totalIniciadas = rows.reduce((sum, row) => sum + row.iniciadas, 0);
  const totalRespondidas = rows.reduce((sum, row) => sum + row.respondidas, 0);
  const tasaGlobal =
    totalIniciadas > 0 ? Math.round((totalRespondidas / totalIniciadas) * 100) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Calidad de conversación</CardTitle>
        <p className="text-xs text-muted-foreground">
          Conversaciones iniciadas vs. con respuesta bilateral. {" "}
          {tasaGlobal !== null ? (
            <span className="font-medium text-foreground">Tasa global: {tasaGlobal}%</span>
          ) : null}
          {" "}· Si la tasa baja del 20%, revisa copy, audiencia o tiempos de respuesta del negocio.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={rows} margin={{ left: 4, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) => value.slice(5)}
            />
            <YAxis
              yAxisId="vol"
              orientation="left"
              tick={{ fontSize: 10 }}
              allowDecimals={false}
              width={36}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${value}%`}
              domain={[0, 100]}
              width={44}
            />
            <Tooltip
              formatter={(value: number, name: string) =>
                name === "Tasa %" ? [`${value}%`, name] : [value, name]
              }
              labelFormatter={(label: string) => `Fecha: ${label}`}
            />
            <Legend />
            <Bar
              yAxisId="vol"
              dataKey="iniciadas"
              name="Iniciadas"
              fill="#6366f1"
              opacity={0.7}
              radius={[3, 3, 0, 0]}
            />
            <Bar
              yAxisId="vol"
              dataKey="respondidas"
              name="Respondidas"
              fill="#10b981"
              opacity={0.85}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="tasa"
              name="Tasa %"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

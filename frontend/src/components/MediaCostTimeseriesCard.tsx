import {
  LineChart,
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

interface MediaCostTimeseriesCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

function fmtDollar(value: number): string {
  return `$${value.toFixed(3)}`;
}

export default function MediaCostTimeseriesCard({
  data,
  isLoading,
}: MediaCostTimeseriesCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tendencia de costos de medios</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? [])
    .filter((row) => row.spend > 0)
    .map((row) => ({
      date: row.date,
      cpm: row.cpm ?? null,
      cpc: row.cpc ?? null,
      cpp: row.cpp ?? null,
    }))
    .filter((row) => row.cpm !== null || row.cpc !== null || row.cpp !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Tendencia de costos de medios</CardTitle>
        <p className="text-xs text-muted-foreground">
          CPM = costo por 1,000 impresiones · CPC = costo por clic · CPP = costo por persona alcanzada. Días sin gasto excluidos.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ left: 4, right: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) => value.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `$${Number(value).toFixed(2)}`}
              width={52}
            />
            <Tooltip
              formatter={(value: number, name: string) => [fmtDollar(value), name.toUpperCase()]}
              labelFormatter={(label: string) => `Fecha: ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="cpm"
              name="CPM"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cpc"
              name="CPC"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cpp"
              name="CPP"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

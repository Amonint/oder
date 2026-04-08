import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GeoInsightRow, GeoMetadata } from "@/api/client";

interface GeoMapProps {
  data: GeoInsightRow[];
  metadata: GeoMetadata;
  metric?: "impressions" | "clicks" | "spend" | "reach";
}

export default function GeoMap({ data, metadata, metric = "impressions" }: GeoMapProps) {
  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertDescription>No hay datos geográficos disponibles.</AlertDescription>
      </Alert>
    );
  }

  const chartData = data
    .map((row) => ({
      region: row.region_name || row.region,
      value: metric === "spend" ? parseFloat(row.spend) : Number((row as Record<string, unknown>)[metric]),
    }))
    .sort((a, b) => b.value - a.value);

  const maxVal = Math.max(...chartData.map((d) => d.value));
  const yDomain: [number, number] = [0, maxVal > 0 ? Math.ceil(maxVal * 1.15) : 1];

  const metricLabel =
    metric === "impressions" ? "Impresiones"
    : metric === "clicks" ? "Clicks"
    : metric === "spend" ? "Gasto"
    : "Alcance";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución Geográfica — {metricLabel}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {metadata.scope === "account" ? "Toda la cuenta" : `Anuncio: ${metadata.ad_id}`} • {metadata.total_rows} regiones
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={yDomain} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="region" width={120} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => {
                if (typeof value !== "number") return String(value);
                return metric === "spend" ? `$${value.toFixed(2)}` : value.toLocaleString("es");
              }}
            />
            <Bar dataKey="value" fill="#3b82f6" radius={[0, 3, 3, 0]}>
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={idx === 0 ? "#2563eb" : "#93c5fd"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

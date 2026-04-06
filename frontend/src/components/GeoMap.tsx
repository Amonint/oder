import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GeoInsightRow, GeoMetadata } from "@/api/client";

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

  const chartData = data.map((row) => ({
    region: row.region_name || row.region,
    value: metric === "spend" ? parseFloat(row.spend) : row[metric],
    raw: row,
  }));

  const metricLabel =
    metric === "impressions"
      ? "Impresiones"
      : metric === "clicks"
        ? "Clicks"
        : metric === "spend"
          ? "Gasto (€)"
          : "Alcance";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobertura Geográfica — {metricLabel}</CardTitle>
        <p className="text-sm text-gray-500">
          {metadata.scope === "account" ? "Toda la cuenta" : `Anuncio: ${metadata.ad_id}`} • {metadata.total_rows} regiones
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="region" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip
              formatter={(value) =>
                metric === "spend" ? `€${value.toFixed(2)}` : value.toLocaleString("es")
              }
            />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

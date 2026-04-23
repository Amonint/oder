import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdLabelRow } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";

interface AdLabelsSectionProps {
  data: AdLabelRow[] | undefined;
  isLoading: boolean;
  metric?: "spend" | "cpa" | "cpc" | "ctr";
}

export default function AdLabelsSection({
  data,
  isLoading,
  metric = "cpa",
}: AdLabelsSectionProps) {
  const rows = data ?? [];

  const chartData = rows
    .map((r) => ({
      label: r.label.length > 20 ? r.label.slice(0, 18) + "…" : r.label,
      value:
        metric === "spend" ? r.spend
        : metric === "cpa" ? (r.cpa ?? 0)
        : metric === "cpc" ? r.cpc
        : r.ctr,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const yLabel =
    metric === "spend" ? "Gasto ($)"
    : metric === "cpa" ? "Costo por Resultado ($)"
    : metric === "cpc" ? "CPC ($)"
    : "CTR (%)";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rendimiento por Etiqueta — {yLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin datos de etiquetas para este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}`, yLabel]} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={String(d.label)} fill={barColorAt(i, String(d.label))} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tabla de Etiquetas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">CPR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">${r.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.impressions.toLocaleString("es")}</TableCell>
                    <TableCell className="text-right">{r.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">${r.cpc.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {r.cpa != null ? `$${r.cpa.toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

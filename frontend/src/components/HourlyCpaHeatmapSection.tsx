import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buildHourlyCpaHeatmapCells, type HourlyHeatmapCell } from "@/lib/timeSeriesFromMeta";
import { barColorAt } from "@/lib/dashboardColors";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface HourlyCpaHeatmapSectionProps {
  rows: Record<string, unknown>[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function HourlyCpaHeatmapSection({
  rows,
  isLoading,
  isError,
  errorMessage,
}: HourlyCpaHeatmapSectionProps) {
  const { cells, maxCpa, hours } = useMemo(() => {
    const list = buildHourlyCpaHeatmapCells(rows ?? []);
    let maxCpa = 0;
    for (const c of list) {
      if (c.cpa != null && c.cpa > maxCpa) maxCpa = c.cpa;
    }
    const hourSet = new Set<number>();
    for (const c of list) hourSet.add(c.hour);
    const hours = [...hourSet].sort((a, b) => a - b);
    return { cells: list, maxCpa: maxCpa || 1, hours: hours.length ? hours : Array.from({ length: 24 }, (_, i) => i) };
  }, [rows]);

  const cellMap = useMemo(() => {
    const m = new Map<string, HourlyHeatmapCell>();
    for (const c of cells) m.set(`${c.dow}\t${c.hour}`, c);
    return m;
  }, [cells]);

  if (isLoading) return <Skeleton className="h-[420px] w-full rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapa hora × día — CPA</CardTitle>
          <CardDescription className="text-destructive">{errorMessage ?? "Error"}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (cells.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapa hora × día — CPA</CardTitle>
          <CardDescription>
            Sin filas horarias. Comprueba que el periodo tenga datos y que la cuenta permita breakdown horario.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">CPA por hora y día de la semana</CardTitle>
        <CardDescription>
          Agregación de todas las fechas del rango: cada celda agrupa el mismo día de la semana y franja horaria.
          Intensidad ∝ CPA (solo celdas con resultados &gt; 0).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Badge variant="outline" className="mb-3 text-xs font-normal text-muted-foreground">
          Escala relativa al CPA máximo observado: ${maxCpa.toFixed(2)}
        </Badge>
        <table className="w-max min-w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border-border bg-muted/50 p-1 text-left font-medium">Día \\ Hora</th>
              {hours.map((h) => (
                <th key={h} className="border-border bg-muted/50 p-1 text-center font-medium tabular-nums">
                  {h}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW.map((label, dow) => (
              <tr key={label}>
                <th className="border-border bg-muted/30 p-1 text-left font-medium">{label}</th>
                {hours.map((hour) => {
                  const c = cellMap.get(`${dow}\t${hour}`);
                  const cpa = c?.cpa;
                  const t = cpa != null && maxCpa > 0 ? Math.min(1, cpa / maxCpa) : 0;
                  const fill = barColorAt(dow + hour, `${dow}-${hour}`);
                  return (
                    <td
                      key={`${dow}-${hour}`}
                      className="border-border border p-0.5 text-center tabular-nums"
                      style={{
                        backgroundColor:
                          cpa != null && cpa > 0
                            ? `color-mix(in oklab, ${fill} ${Math.round(20 + t * 75)}%, hsl(var(--muted)))`
                            : "hsl(var(--muted) / 0.2)",
                      }}
                      title={
                        c
                          ? `CPA ~$${(c.cpa ?? 0).toFixed(2)} · Gasto $${c.spend.toFixed(2)} · Res. ${c.results.toFixed(1)}`
                          : "Sin datos"
                      }
                    >
                      {cpa != null && cpa > 0 ? `$${cpa.toFixed(0)}` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

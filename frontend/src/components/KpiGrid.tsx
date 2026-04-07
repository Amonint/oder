import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageKpiRow } from "@/api/client";

interface KpiGridProps {
  data: PageKpiRow[] | undefined;
  isLoading: boolean;
}

interface KpiDef {
  key: keyof PageKpiRow;
  label: string;
  format: (v: string) => string;
}

const KPI_DEFS: KpiDef[] = [
  { key: "spend", label: "Gasto", format: (v) => `$${parseFloat(v).toFixed(2)}` },
  { key: "reach", label: "Alcance", format: (v) => parseInt(v).toLocaleString("es-EC") },
  { key: "impressions", label: "Impresiones", format: (v) => parseInt(v).toLocaleString("es-EC") },
  { key: "cpm", label: "CPM", format: (v) => `$${parseFloat(v).toFixed(2)}` },
  { key: "ctr", label: "CTR", format: (v) => `${parseFloat(v).toFixed(2)}%` },
  { key: "frequency", label: "Frecuencia", format: (v) => parseFloat(v).toFixed(2) },
];

export default function KpiGrid({ data, isLoading }: KpiGridProps) {
  const row: PageKpiRow = data?.[0] ?? {};

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {KPI_DEFS.map((kpi) => (
        <Card key={kpi.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {kpi.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">
                {row[kpi.key] != null ? kpi.format(String(row[kpi.key])) : "—"}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

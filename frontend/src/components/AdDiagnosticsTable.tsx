import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AdDiagnosticsRow, RankingValue } from "@/api/client";

interface AdDiagnosticsTableProps {
  data: AdDiagnosticsRow[] | undefined;
  isLoading: boolean;
}

const RANKING_CONFIG: Record<RankingValue, { label: string; className: string }> = {
  ABOVE_AVERAGE: { label: "Por encima", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  AVERAGE: { label: "Promedio", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  BELOW_AVERAGE_20: { label: "Bajo (20%)", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  BELOW_AVERAGE_10: { label: "Bajo (10%)", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  BELOW_AVERAGE_5: { label: "Bajo (5%)", className: "bg-red-200 text-red-900 dark:bg-red-800/40 dark:text-red-200" },
  UNKNOWN: { label: "—", className: "bg-muted text-muted-foreground" },
};

function RankingBadge({ value }: { value: RankingValue }) {
  const cfg = RANKING_CONFIG[value] ?? RANKING_CONFIG.UNKNOWN;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export default function AdDiagnosticsTable({ data, isLoading }: AdDiagnosticsTableProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Diagnóstico de Creatividades</h2>
        <p className="text-muted-foreground text-sm">Top 5 anuncios por gasto — Relevancia vs. competencia</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Los rankings comparan tus anuncios contra los que compiten por la misma audiencia en Meta.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              Sin datos de diagnóstico en el periodo seleccionado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">Anuncio</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead>Calidad</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Conversión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.ad_id}>
                    <TableCell className="max-w-[240px]">
                      <p className="truncate text-sm font-medium">{row.ad_name}</p>
                      <p className="text-muted-foreground font-mono text-xs">{row.ad_id}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm">${row.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{row.impressions.toLocaleString("es")}</TableCell>
                    <TableCell><RankingBadge value={row.quality_ranking} /></TableCell>
                    <TableCell><RankingBadge value={row.engagement_rate_ranking} /></TableCell>
                    <TableCell><RankingBadge value={row.conversion_rate_ranking} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { AdDiagnosticsRow } from "@/api/client";

interface AdDiagnosticsTableProps {
  data: AdDiagnosticsRow[] | undefined;
  isLoading: boolean;
}

export default function AdDiagnosticsTable({ data, isLoading }: AdDiagnosticsTableProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Diagnóstico de Creatividades</h2>
        <p className="text-muted-foreground text-sm">Top 5 anuncios por gasto — Rendimiento real</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            CTR, CPM y tasa de engagement calculados sobre impresiones reales del período.
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
            <TooltipProvider delayDuration={300}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">Anuncio</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      CTR
                      <InfoTooltip text="Click-Through Rate de este anuncio específico. Porcentaje de impresiones que generaron algún clic. Mayor CTR indica que el creativo es más atractivo para la audiencia." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      CPM
                      <InfoTooltip text="Costo por cada 1.000 impresiones de este anuncio. Permite comparar eficiencia de alcance entre anuncios. Un CPM bajo con buen CTR es la combinación ideal." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      Engagement
                      <InfoTooltip text="Tasa de engagement: porcentaje de impresiones que generaron alguna interacción (reacción, comentario, guardado, clic). Se calcula: post_engagement ÷ Impresiones × 100." />
                    </span>
                  </TableHead>
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
                    <TableCell className="text-right text-sm">{(row.ctr ?? 0).toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-sm">${(row.cpm ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{(row.engagement_rate ?? 0).toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

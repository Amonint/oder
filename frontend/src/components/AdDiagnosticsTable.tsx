import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import { AdReferenceLink } from "@/components/AdReferenceLink";
import type { AdDiagnosticsRow } from "@/api/client";
import { barPaletteByRowIndex } from "@/lib/dashboardColors";

interface AdDiagnosticsTableProps {
  data: AdDiagnosticsRow[] | undefined;
  isLoading: boolean;
  adReferenceUrlById?: Map<string, string>;
}

export default function AdDiagnosticsTable({
  data,
  isLoading,
  adReferenceUrlById,
}: AdDiagnosticsTableProps) {
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
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">Anuncio</TableHead>
                  <TableHead className="w-[88px]">
                    <span className="flex items-center gap-0.5">
                      % gasto
                      <InfoTooltip text="Participación del gasto de este anuncio respecto al mayor gasto del top 5 (barra relativa)." />
                    </span>
                  </TableHead>
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
                      CPA
                      <InfoTooltip text="Costo por acción principal (primer cost_per_action_type numérico de Meta) o gasto ÷ primer resultado no trivial en acciones." />
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
                {(() => {
                  const maxSpend = Math.max(...data.map((r) => r.spend), 1e-9);
                  return data.map((row, idx) => {
                    const pct = Math.min(100, (row.spend / maxSpend) * 100);
                    const cpa = row.cpa;
                    return (
                  <TableRow key={row.ad_id}>
                    <TableCell className="max-w-[240px]">
                      <div className="min-w-0 space-y-0.5">
                      <AdReferenceLink href={adReferenceUrlById?.get(String(row.ad_id)) ?? null} compact />
                      <p className="text-sm font-medium flex items-center gap-2 min-w-0">
                        <span className="truncate block min-w-0">{row.ad_name}</span>
                        {row.ad_name_source && row.ad_name_source !== "meta_ad_name" ? (
                          <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                            Nombre inferido
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground font-mono text-xs break-all leading-tight">{row.ad_id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div
                        className="h-2 w-full max-w-[72px] rounded-full bg-muted"
                        title={`${pct.toFixed(0)}% del máximo del top 5`}
                      >
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: barPaletteByRowIndex(idx),
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">${row.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{row.impressions.toLocaleString("es")}</TableCell>
                    <TableCell className="text-right text-sm">{(row.ctr ?? 0).toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-sm">${(row.cpm ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {cpa != null && Number.isFinite(Number(cpa)) ? `$${Number(cpa).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{(row.engagement_rate ?? 0).toFixed(2)}%</TableCell>
                  </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
            </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

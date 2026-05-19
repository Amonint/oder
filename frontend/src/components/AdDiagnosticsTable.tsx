import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import { AdReferenceLink } from "@/components/AdReferenceLink";
import type { AdDiagnosticsRow } from "@/api/client";
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
  const rows = data ?? [];
  const rankingBasis = rows[0]?.ranking_basis ?? "click_efficiency";
  const hasVideo = rows.some((r) => (r.video_plays ?? 0) > 0);
  const clickLabel =
    rows[0]?.primary_click_metric === "outbound_click"
      ? "CTR salida"
      : rows[0]?.primary_click_metric === "all_click"
      ? "CTR clics"
      : "CTR enlace";
  const clickCostLabel =
    rows[0]?.primary_click_metric === "outbound_click"
      ? "Costo clic salida"
      : rows[0]?.primary_click_metric === "all_click"
      ? "Costo clic"
      : "Costo clic enlace";

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Diagnóstico de Creatividades</h2>
        <p className="text-muted-foreground text-sm">
          {rankingBasis === "objective_result"
            ? "Mejores anuncios del período según costo por resultado y volumen."
            : "Mejores anuncios del período según eficiencia de clic cuando aún no hay suficiente señal de resultados."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Comparativa entre anuncios con foco en frecuencia, eficiencia de clic y costo por resultado del objetivo activo.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
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
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      Frecuencia
                      <InfoTooltip text="Promedio de veces que una misma persona vio este anuncio durante el período. Ayuda a detectar fatiga." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      {clickLabel}
                      <InfoTooltip text="CTR del tipo de clic prioritario para esta comparación. Se usa salida desde Meta cuando existe; si no, clic enlace inline." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      {clickCostLabel}
                      <InfoTooltip text="Costo medio del clic prioritario del anuncio. Ayuda a comparar eficiencia de atracción entre creatividades." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      Resultados
                      <InfoTooltip text="Resultados del objetivo activo usados para comparar anuncios. Cuando Meta no entrega suficiente señal, el ranking cae al modo de eficiencia de clic." />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center justify-end gap-0.5">
                      Costo resultado
                      <InfoTooltip text="Costo por resultado objetivo cuando Meta lo puede alinear con claridad. Si el ranking está en modo clic, esta columna funciona como referencia secundaria." />
                    </span>
                  </TableHead>
                  {hasVideo && (
                    <>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Plays
                          <InfoTooltip text="Total de reproducciones iniciadas (cualquier duración) para este anuncio." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Completan
                          <InfoTooltip text="Porcentaje de plays que vieron el video completo (p100 / plays). Indica cuán bien retiene la atención este creativo." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          ThruPlay
                          <InfoTooltip text="Reproducciones de 15+ segundos (o completo si el video dura menos de 15s). Métrica oficial de calidad de video de Meta." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Prom.
                          <InfoTooltip text="Tiempo promedio de reproducción en segundos para este anuncio." />
                        </span>
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
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
                    <TableCell className="text-right text-sm">${row.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{row.impressions.toLocaleString("es")}</TableCell>
                    <TableCell className="text-right text-sm">{row.frequency.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{row.primary_ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-sm">
                      {row.primary_click_cost != null ? `$${row.primary_click_cost.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.results.toFixed(0)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {row.cost_per_result != null ? `$${row.cost_per_result.toFixed(2)}` : "—"}
                    </TableCell>
                    {hasVideo && (() => {
                      const plays = row.video_plays ?? 0;
                      const p100 = row.video_p100 ?? 0;
                      const completionPct = plays > 0 ? ((p100 / plays) * 100).toFixed(1) + "%" : "—";
                      const avgSec = row.video_avg_watch_sec ?? 0;
                      const avgLabel = avgSec > 0
                        ? avgSec >= 60 ? `${Math.floor(avgSec / 60)}m ${avgSec % 60}s` : `${avgSec}s`
                        : "—";
                      return (
                        <>
                          <TableCell className="text-right text-sm">{plays > 0 ? plays.toLocaleString("es") : "—"}</TableCell>
                          <TableCell className="text-right text-sm">{completionPct}</TableCell>
                          <TableCell className="text-right text-sm">{(row.video_thruplay ?? 0) > 0 ? (row.video_thruplay ?? 0).toLocaleString("es") : "—"}</TableCell>
                          <TableCell className="text-right text-sm">{avgLabel}</TableCell>
                        </>
                      );
                    })()}
                  </TableRow>
                ))}
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

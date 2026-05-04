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
import { Line, LineChart } from "recharts";

function MiniDailySpendSparkline({ values }: { values: number[] | undefined }) {
  const arr = Array.isArray(values) ? values.filter((n) => Number.isFinite(n)) : [];
  if (arr.length === 0) {
    return <span className="text-muted-foreground block text-center text-xs">—</span>;
  }
  const data =
    arr.length === 1
      ? [
          { i: 0, v: arr[0] },
          { i: 1, v: arr[0] },
        ]
      : arr.map((v, i) => ({ i, v }));
  const W = 72;
  const H = 36;
  return (
    <div
      className="mx-auto w-[72px] shrink-0"
      style={{ minWidth: W, minHeight: H }}
      title="Gasto diario en el período (Meta insights por día)."
    >
      <LineChart width={W} height={H} data={data} margin={{ top: 2, right: 2, left: 0, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}

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
                  <TableHead className="w-[80px] text-center text-xs font-normal text-muted-foreground">
                    <span className="flex flex-col items-center gap-0.5">
                      Gasto/día
                      <InfoTooltip text="Serie temporal diaria de gasto para este anuncio en el período (segunda consulta agregada solo al top 5)." />
                    </span>
                  </TableHead>
                  <TableHead className="w-[56px] text-center text-xs font-normal text-muted-foreground">
                    Señal
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const maxSpend = Math.max(...data.map((r) => r.spend), 1e-9);
                  const maxCtr = Math.max(...data.map((r) => r.ctr ?? 0), 1e-6);
                  const maxEng = Math.max(...data.map((r) => r.engagement_rate ?? 0), 1e-6);
                  const cpaNums = data.map((r) => Number(r.cpa)).filter((n) => Number.isFinite(n) && n > 0);
                  const maxCpa = cpaNums.length ? Math.max(...cpaNums) : 1;
                  return data.map((row, idx) => {
                    const pct = Math.min(100, (row.spend / maxSpend) * 100);
                    const cpa = row.cpa;
                    const ctrN = ((row.ctr ?? 0) / maxCtr) * 100;
                    const engN = ((row.engagement_rate ?? 0) / maxEng) * 100;
                    const cpaN =
                      cpa != null && Number(cpa) > 0 ? Math.max(8, (1 - Number(cpa) / maxCpa) * 100) : 8;
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
                    <TableCell className="align-middle px-1">
                      <MiniDailySpendSparkline values={row.daily_spend} />
                    </TableCell>
                    <TableCell className="align-middle px-1">
                      <div
                        className="mx-auto flex h-8 w-8 items-end justify-center gap-0.5"
                        title="Mini barras (periodo actual): CTR · engagement · eficiencia CPA inversa vs el top 5."
                      >
                        <span
                          className="w-1 rounded-sm bg-primary/80"
                          style={{ height: `${Math.round(ctrN)}%`, minHeight: "2px" }}
                        />
                        <span
                          className="w-1 rounded-sm bg-amber-500/80"
                          style={{ height: `${Math.round(engN)}%`, minHeight: "2px" }}
                        />
                        <span
                          className="w-1 rounded-sm bg-emerald-600/80"
                          style={{ height: `${Math.round(cpaN)}%`, minHeight: "2px" }}
                        />
                      </div>
                    </TableCell>
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

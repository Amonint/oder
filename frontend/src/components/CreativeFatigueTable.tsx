import { useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { FatigueRow, FatigueAlert } from "@/api/client";
import { AdReferenceLink } from "@/components/AdReferenceLink";

type SortBy = "fatigue" | "spend" | "cpa" | "response_rate" | "scale";

interface CreativeFatigueTableProps {
  data: FatigueRow[] | undefined;
  alerts: FatigueAlert[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  adReferenceUrlById?: Map<string, string>;
}

const EMPTY_PUBLICATION_RE = /^(?:publicaci[oó]n:\s*)?["“”'`]\s*["“”'`]$/i;
function safeAdName(name: string | null | undefined, id: string): string {
  const raw = String(name ?? "").trim();
  if (raw && !EMPTY_PUBLICATION_RE.test(raw)) return raw;
  return id ? `Anuncio sin nombre (ID: ${id})` : "Anuncio sin nombre";
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  healthy: { label: "Saludable", className: "border-transparent bg-[#56048C] text-white" },
  watch: { label: "Vigilar", className: "border-transparent bg-[#F2B441] text-[#150140]" },
  fatigued: { label: "Fatigado", className: "border-transparent bg-[#D91480] text-white" },
};

const SORT_OPTIONS: { value: SortBy; label: string; description: string }[] = [
  { value: "fatigue", label: "Top fatigados", description: "Anuncios con mayor riesgo de saturación (score alto)" },
  { value: "spend", label: "Top por gasto", description: "Anuncios que más gastan" },
  { value: "cpa", label: "Top por CPA", description: "Anuncios con menor costo por resultado (más eficientes)" },
  { value: "response_rate", label: "Top por tasa de respuesta", description: "Anuncios con mayor ratio resultados/impresiones" },
  { value: "scale", label: "Oportunidades de escala", description: "Alto gasto y baja fatiga (candidatos a aumentar presupuesto)" },
];

function sortRows(rows: FatigueRow[], sortBy: SortBy): FatigueRow[] {
  const copy = [...rows];
  switch (sortBy) {
    case "fatigue":
      return copy.sort((a, b) => b.fatigue_score - a.fatigue_score);
    case "spend":
      return copy.sort((a, b) => b.spend - a.spend);
    case "cpa":
      // null CPAs go to end
      return copy.sort((a, b) => {
        if (a.cpa === null && b.cpa === null) return 0;
        if (a.cpa === null) return 1;
        if (b.cpa === null) return -1;
        return a.cpa - b.cpa;
      });
    case "response_rate":
      return copy.sort((a, b) => {
        const rateA = a.impressions > 0 ? a.results / a.impressions : 0;
        const rateB = b.impressions > 0 ? b.results / b.impressions : 0;
        return rateB - rateA;
      });
    case "scale":
      // Filter non-fatigued ads (healthy or watch) then sort by spend desc
      return copy
        .filter((r) => r.fatigue_status !== "fatigued")
        .sort((a, b) => b.spend - a.spend);
    default:
      return copy;
  }
}

export default function CreativeFatigueTable({
  data,
  alerts,
  isLoading,
  isError,
  errorMessage,
  adReferenceUrlById,
}: CreativeFatigueTableProps) {
  const [sortBy, setSortBy] = useState<SortBy>("fatigue");

  const rawRows = data ?? [];
  const rows = sortRows(rawRows, sortBy);
  const activeAlerts = alerts ?? [];
  const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy)!;

  return (
    <TooltipProvider delayDuration={300}>
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Fatiga de creatividades</h2>
        <p className="text-muted-foreground text-sm">
          Score basado en frecuencia y CTR. Mayor score = mayor riesgo de saturación.
        </p>
      </div>

      {activeAlerts.length > 0 && (
        <Alert>
          <AlertTitle>Alertas de fatiga</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1 text-sm">
              {activeAlerts.map((a, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="font-medium">{safeAdName(a.ad_name, a.ad_id)}:</span>
                  <span className="text-muted-foreground">{a.message}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Diagnóstico por anuncio</CardTitle>
              <CardDescription className="flex items-center gap-1 mt-0.5">
                {currentSort.description}
                <InfoTooltip text="Score 0-100: saludable <40, vigilar 40-69, fatigado ≥70. Oportunidades de escala = baja fatiga + alto gasto." />
              </CardDescription>
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar fatiga</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              {sortBy === "scale"
                ? "Sin anuncios con baja fatiga y alto gasto en este periodo."
                : "Sin datos de creatividades en este periodo."}
            </p>
          ) : (
            <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Anuncio</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Frecuencia
                          <InfoTooltip text="Promedio de veces que una persona vio este anuncio. Frecuencia alta con CTR bajo indica saturación." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Tasa resp.
                          <InfoTooltip text="Resultados ÷ Impresiones × 100. Indica efectividad del anuncio." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CPA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const cfg = STATUS_CONFIG[row.fatigue_status] ?? STATUS_CONFIG.watch;
                      const responseRate = row.impressions > 0
                        ? ((row.results / row.impressions) * 100).toFixed(2)
                        : null;
                      return (
                        <TableRow key={row.ad_id}>
                          <TableCell>
                            <AdReferenceLink href={adReferenceUrlById?.get(String(row.ad_id)) ?? null} compact />
                            <p className="truncate text-sm font-medium max-w-[200px]">{safeAdName(row.ad_name, row.ad_id)}</p>
                            <p className="text-muted-foreground font-mono text-xs">{row.ad_id}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={cfg.className}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {row.fatigue_score}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.frequency.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.ctr.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            ${row.spend.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {responseRate !== null ? `${responseRate}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>
    </section>
    </TooltipProvider>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { DemographicsRow } from "@/api/client";

type Breakdown = "age" | "gender" | "age,gender";

interface DemographicsPanelProps {
  data: DemographicsRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  breakdown: Breakdown;
  onBreakdownChange: (b: Breakdown) => void;
}

function fmtNum(v: string | number | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("es");
}

function fmtPct(v: string | number | undefined): string {
  if (v == null) return "—";
  return `${Number(v).toFixed(2)}%`;
}

function fmtCurrency(v: string | number | undefined): string {
  if (v == null) return "—";
  return `$${Number(v).toFixed(2)}`;
}

export default function DemographicsPanel({
  data,
  isLoading,
  isError,
  errorMessage,
  breakdown,
  onBreakdownChange,
}: DemographicsPanelProps) {
  const rows = data ?? [];
  const showAge = breakdown.includes("age");
  const showGender = breakdown.includes("gender");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-foreground text-lg font-semibold">Segmentación demográfica</h2>
        <Select value={breakdown} onValueChange={(v) => onBreakdownChange(v as Breakdown)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="age">Por edad</SelectItem>
            <SelectItem value="gender">Por género</SelectItem>
            <SelectItem value="age,gender">Cruce edad + género</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
        Nota: reach excluido por limitaciones históricas de Meta en breakdowns demográficos
      </Badge>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {breakdown === "age"
              ? "Rendimiento por edad"
              : breakdown === "gender"
              ? "Rendimiento por género"
              : "Cruce edad + género"}
          </CardTitle>
          <CardDescription>
            Gasto, impresiones, CTR, CPM y CPC por segmento demográfico.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar datos demográficos</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Sin datos demográficos en este periodo.</p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {showAge && <TableHead>Edad</TableHead>}
                      {showGender && <TableHead>Género</TableHead>}
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Gasto
                          <InfoTooltip text="Inversión total en Meta para este segmento en el período." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">Impresiones</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          CTR
                          <InfoTooltip text="Click-Through Rate: porcentaje de impresiones que resultaron en clic." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          CPM
                          <InfoTooltip text="Costo por 1.000 impresiones en este segmento." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={idx}>
                        {showAge && (
                          <TableCell className="font-medium text-sm">{row.age ?? "—"}</TableCell>
                        )}
                        {showGender && (
                          <TableCell className="text-sm capitalize">{row.gender ?? "—"}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums text-sm">{fmtCurrency(row.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(row.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtPct(row.ctr)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtCurrency(row.cpm)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtCurrency(row.cpc)}</TableCell>
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

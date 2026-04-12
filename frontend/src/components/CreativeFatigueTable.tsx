import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { FatigueRow, FatigueAlert } from "@/api/client";

interface CreativeFatigueTableProps {
  data: FatigueRow[] | undefined;
  alerts: FatigueAlert[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  healthy: { label: "Saludable", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  watch: { label: "Vigilar", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  fatigued: { label: "Fatigado", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export default function CreativeFatigueTable({
  data,
  alerts,
  isLoading,
  isError,
  errorMessage,
}: CreativeFatigueTableProps) {
  const rows = data ?? [];
  const activeAlerts = alerts ?? [];

  return (
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
                  <span className="font-medium">{a.ad_name}:</span>
                  <span className="text-muted-foreground">{a.message}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Diagnóstico por anuncio</CardTitle>
          <CardDescription>
            Score 0-100 (saludable &lt;40, vigilar 40-69, fatigado &ge;70). Ordenado de mayor a menor fatiga.
          </CardDescription>
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
            <p className="text-muted-foreground p-4 text-sm">Sin datos de creatividades en este periodo.</p>
          ) : (
            <TooltipProvider delayDuration={300}>
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
                      <TableHead className="text-right">CPA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const cfg = STATUS_CONFIG[row.fatigue_status] ?? STATUS_CONFIG.watch;
                      return (
                        <TableRow key={row.ad_id}>
                          <TableCell>
                            <p className="truncate text-sm font-medium max-w-[200px]">{row.ad_name}</p>
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
                            {row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

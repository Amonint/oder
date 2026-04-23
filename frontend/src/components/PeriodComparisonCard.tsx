import type { DashboardResponse } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deltaPercent } from "@/lib/periodCompare";

interface PeriodComparisonCardProps {
  data: DashboardResponse;
  prev: DashboardResponse | undefined;
  prevPeriod: { dateStart: string; dateStop: string };
  prevLoading: boolean;
}

export default function PeriodComparisonCard({
  data,
  prev,
  prevPeriod,
  prevLoading,
}: PeriodComparisonCardProps) {
  /** Evita mostrar ceros falsos mientras React Query aún no ha entregado la respuesta del periodo anterior. */
  const awaitingPrev = prevLoading && prev == null;

  const prevSpend = Number(prev?.summary?.spend ?? 0);
  const prevEmpty =
    !prevLoading &&
    prev != null &&
    (prev.insights_empty ||
      (prevSpend === 0 &&
        Number(prev.summary?.impressions ?? 0) === 0 &&
        Number(data.summary?.spend ?? 0) > 0));

  const rows: { label: string; cur: number; prev: number; fmt: (n: number) => string }[] = [
    {
      label: "Gasto",
      cur: Number(data.summary.spend ?? 0),
      prev: Number(prev?.summary?.spend ?? 0),
      fmt: (n) => `$${n.toFixed(2)}`,
    },
    {
      label: "Impresiones",
      cur: Number(data.summary.impressions ?? 0),
      prev: Number(prev?.summary?.impressions ?? 0),
      fmt: (n) => n.toLocaleString("es"),
    },
    {
      label: "CTR (%)",
      cur: Number(data.summary.ctr ?? 0),
      prev: Number(prev?.summary?.ctr ?? 0),
      fmt: (n) => `${n.toFixed(2)}%`,
    },
    {
      label: "Resultados (derivado)",
      cur: Number(data.derived?.results ?? 0),
      prev: Number(prev?.derived?.results ?? 0),
      fmt: (n) => n.toLocaleString("es", { maximumFractionDigits: 0 }),
    },
  ];

  const fmtOpt = (n: number | null | undefined) =>
    n != null && Number.isFinite(Number(n)) ? Number(n) : null;

  const pairCpa = (cur: number | null | undefined, p: number | null | undefined) => {
    const cn = fmtOpt(cur);
    const pn = fmtOpt(p);
    const d =
      awaitingPrev || cn == null || pn == null || pn === 0 ? null : deltaPercent(cn, pn);
    return (
      <TableRow key="cpa">
        <TableCell className="text-sm">CPA (derivado)</TableCell>
        <TableCell className="text-right tabular-nums text-sm">
          {cn != null ? `$${cn.toFixed(2)}` : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm">
          {awaitingPrev ? "—" : pn != null ? `$${pn.toFixed(2)}` : "—"}
        </TableCell>
        <TableCell className="text-right text-sm tabular-nums">
          {d === null ? "—" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`}
        </TableCell>
      </TableRow>
    );
  };

  const pairRoas = (cur: number | null | undefined, p: number | null | undefined) => {
    const cn = fmtOpt(cur);
    const pn = fmtOpt(p);
    const d =
      awaitingPrev || cn == null || pn == null || pn === 0 ? null : deltaPercent(cn, pn);
    return (
      <TableRow key="roas">
        <TableCell className="text-sm">ROAS (derivado)</TableCell>
        <TableCell className="text-right tabular-nums text-sm">
          {cn != null ? `${cn.toFixed(2)}×` : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm">
          {awaitingPrev ? "—" : pn != null ? `${pn.toFixed(2)}×` : "—"}
        </TableCell>
        <TableCell className="text-right text-sm tabular-nums">
          {d === null ? "—" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparación de periodos</CardTitle>
        <CardDescription>
          Actual:{" "}
          <span className="font-medium tabular-nums">
            {data.date_start} → {data.date_stop}
          </span>
          {" · "}
          Anterior (misma duración):{" "}
          <span className="font-medium tabular-nums">
            {prevPeriod.dateStart} → {prevPeriod.dateStop}
          </span>
          . Dos llamadas a <code className="text-xs">/dashboard</code>.
          {prevLoading ? <span className="text-muted-foreground"> Cargando periodo anterior…</span> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {prevEmpty && !prevLoading ? (
          <Alert>
            <AlertTitle>Periodo anterior sin datos en Meta</AlertTitle>
            <AlertDescription className="text-sm">
              Para {prevPeriod.dateStart} → {prevPeriod.dateStop} la API devolvió gasto e impresiones en cero (sin
              actividad o fuera de la ventana útil de retención). Los porcentajes de cambio aparecen como «—»; no
              indica un fallo del tablero.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead className="text-right">Δ %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const d = awaitingPrev ? null : deltaPercent(r.cur, r.prev);
                return (
                  <TableRow key={r.label}>
                    <TableCell className="text-sm">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{r.fmt(r.cur)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {awaitingPrev ? "—" : r.fmt(r.prev)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {d === null ? "—" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
              {pairCpa(data.derived?.cpa, prev?.derived?.cpa)}
              {pairRoas(data.derived?.roas, prev?.derived?.roas)}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

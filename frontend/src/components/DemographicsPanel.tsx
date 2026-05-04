import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
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
import type { DemographicsRow, InsightActionItem } from "@/api/client";
import { barColorAt, barPaletteByRowIndex } from "@/lib/dashboardColors";

type Breakdown = "age" | "gender" | "age,gender";

/** Alineado a `backend/.../pages.py` `_extract_cpa` (CONVERSION_TYPES). */
const CONVERSION_ACTION_TYPES = new Set<string>([
  "lead",
  "purchase",
  "onsite_conversion.messaging_conversation_started_7d",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_purchase",
]);

/** Umbral de gasto (USD) por segmento: por debajo, barra atenuada + aviso en tooltip. */
const DEMOGRAPHICS_MIN_SPEND_USD = 25;

interface DemographicsPanelProps {
  /** Si se pasa, sustituye el título de sección (p. ej. dashboard de página). */
  sectionTitle?: string;
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

function segmentLabel(row: DemographicsRow, bd: "age" | "gender"): string {
  if (bd === "age") return (row.age ?? "").trim() || "—";
  const g = (row.gender ?? "—").trim();
  if (!g || g === "—") return "—";
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
}

function firstNumericCostPerAction(items: InsightActionItem[] | undefined): number | null {
  if (!items?.length) return null;
  for (const item of items) {
    const v = Number(item.value ?? NaN);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function sumConversionActions(actions: InsightActionItem[] | undefined): number {
  if (!actions?.length) return 0;
  let s = 0;
  for (const a of actions) {
    if (CONVERSION_ACTION_TYPES.has(String(a.action_type ?? ""))) {
      s += Number(a.value ?? 0) || 0;
    }
  }
  return s;
}

function segmentCpa(row: DemographicsRow): number | null {
  if (typeof row.cpa === "number" && Number.isFinite(row.cpa) && row.cpa > 0) return row.cpa;
  const fromMeta = firstNumericCostPerAction(row.cost_per_action_type);
  if (fromMeta != null) return fromMeta;
  const spend = parseFloat(String(row.spend ?? "0"));
  const conv = sumConversionActions(row.actions);
  if (spend > 0 && conv > 0) return spend / conv;
  return null;
}

type DemographicsBarRow = {
  label: string;
  spend: number;
  cpa: number | null;
  /** Valor para ancho de barra (0 si no hay CPA). */
  cpaValue: number;
  insufficient: boolean;
};

function buildBarRows(rows: DemographicsRow[], bd: "age" | "gender"): DemographicsBarRow[] {
  return rows
    .map((row) => {
      const spend = parseFloat(String(row.spend ?? "0")) || 0;
      const cpa = segmentCpa(row);
      return {
        label: segmentLabel(row, bd),
        spend,
        cpa,
        cpaValue: cpa != null && Number.isFinite(cpa) && cpa > 0 ? cpa : 0,
        insufficient: spend < DEMOGRAPHICS_MIN_SPEND_USD,
      };
    })
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 12);
}

function DemographicsSpendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DemographicsBarRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{row.label}</p>
      {row.insufficient && (
        <p className="text-muted-foreground mt-1">Datos insuficientes</p>
      )}
      <p className="tabular-nums">Gasto: ${row.spend.toFixed(2)}</p>
    </div>
  );
}

function DemographicsCpaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DemographicsBarRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{row.label}</p>
      {row.insufficient && (
        <p className="text-muted-foreground mt-1">Datos insuficientes</p>
      )}
      <p className="tabular-nums">
        CPA: {row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {typeof row.cpa === "number"
          ? "Alineado con el objetivo activo del dashboard."
          : "Primer cost_per_action_type numérico de Meta, o gasto ÷ suma de conversiones (lead, compra, mensaje iniciado, píxel)."}
      </p>
    </div>
  );
}

function DemographicsAgeGenderHeatmap({ rows }: { rows: DemographicsRow[] }) {
  const [colorBy, setColorBy] = useState<"spend" | "cpa">("cpa");

  const model = useMemo(() => {
    const ages = [...new Set(rows.map((row) => (row.age ?? "").trim()).filter(Boolean))];
    const genders = [...new Set(rows.map((row) => (row.gender ?? "").trim()).filter(Boolean))];
    ages.sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    genders.sort((a, b) => a.localeCompare(b, "es"));

    const spendMap = new Map<string, number>();
    const cpaMap = new Map<string, number | null>();
    for (const r of rows) {
      const age = (r.age ?? "").trim();
      const gender = (r.gender ?? "").trim();
      if (!age || !gender) continue;
      const k = `${age}\t${gender}`;
      const prevSpend = spendMap.get(k) ?? 0;
      const add = parseFloat(String(r.spend ?? "0")) || 0;
      spendMap.set(k, prevSpend + add);
      if (prevSpend === 0) cpaMap.set(k, segmentCpa(r));
      else cpaMap.set(k, null);
    }

    let maxSpend = 0;
    let maxCpa = 0;
    for (const v of spendMap.values()) maxSpend = Math.max(maxSpend, v);
    for (const c of cpaMap.values()) {
      if (c != null && c > maxCpa) maxCpa = c;
    }
    const max = colorBy === "spend" ? (maxSpend > 0 ? maxSpend : 1) : (maxCpa > 0 ? maxCpa : 1);
    return { ages, genders, spendMap, cpaMap, max };
  }, [rows, colorBy]);

  if (model.ages.length === 0 || model.genders.length === 0) {
    return (
      <p className="text-muted-foreground border-border border-t px-4 py-3 text-sm">
        No hay celdas edad × género con gasto en este periodo.
      </p>
    );
  }

  return (
    <div className="border-border space-y-2 border-t px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-foreground text-sm font-semibold">
          Mapa de calor — {colorBy === "cpa" ? "CPA por celda" : "Gasto (edad × género)"}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Colorear por</span>
          <select
            className="border-border bg-background rounded-md border px-2 py-1 text-xs"
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as "spend" | "cpa")}
          >
            <option value="cpa">CPA (decisiones)</option>
            <option value="spend">Gasto</option>
          </select>
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Intensidad relativa al máximo de la tabla
          </Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border-border bg-muted/50 p-2 text-left font-medium">Edad</th>
              {model.genders.map((g) => (
                <th key={g} className="border-border bg-muted/50 p-2 text-center font-medium capitalize">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.ages.map((age, ri) => (
              <tr key={age}>
                <th className="border-border bg-muted/30 p-2 text-left font-medium tabular-nums">{age}</th>
                {model.genders.map((g, ci) => {
                  const k = `${age}\t${g}`;
                  const spend = model.spendMap.get(k) ?? 0;
                  const cpa = model.cpaMap.get(k) ?? null;
                  const val = colorBy === "spend" ? spend : cpa != null && cpa > 0 ? cpa : 0;
                  const t = model.max > 0 ? val / model.max : 0;
                  const fill = barColorAt(ri + ci, `${age}-${g}`);
                  const display =
                    colorBy === "spend"
                      ? spend > 0
                        ? `$${spend.toFixed(0)}`
                        : "—"
                      : cpa != null && cpa > 0
                        ? `$${cpa.toFixed(0)}`
                        : "—";
                  return (
                    <td
                      key={`${age}-${g}`}
                      className="border-border border p-1 text-center tabular-nums"
                      style={{
                        backgroundColor:
                          val > 0
                            ? `color-mix(in oklab, ${fill} ${Math.round(18 + t * 72)}%, hsl(var(--muted)))`
                            : "hsl(var(--muted) / 0.25)",
                      }}
                      title={
                        `${age} · ${g}: gasto $${spend.toFixed(2)}` +
                        (cpa != null ? ` · CPA $${cpa.toFixed(2)}` : "")
                      }
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DemographicsPanel({
  sectionTitle,
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

  const barBreakdown: "age" | "gender" | null =
    breakdown === "age" || breakdown === "gender" ? breakdown : null;

  const barRows = useMemo(
    () => (barBreakdown ? buildBarRows(data ?? [], barBreakdown) : []),
    [data, barBreakdown],
  );

  const chartHeight = Math.max(barRows.length * 36, 120);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-foreground text-lg font-semibold">
          {sectionTitle ?? "Segmentación demográfica"}
        </h2>
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

              {breakdown === "age,gender" && rows.length > 0 ? (
                <DemographicsAgeGenderHeatmap rows={rows} />
              ) : null}

              {barBreakdown && barRows.length > 0 && (
                <div className="border-border space-y-6 border-t px-4 py-6">
                  <p className="text-muted-foreground text-xs">
                    Top 12 por gasto. Barras atenuadas si el gasto del segmento es menor a ${DEMOGRAPHICS_MIN_SPEND_USD}{" "}
                    (umbral de volumen).
                  </p>

                  <div>
                    <h3 className="text-foreground mb-2 text-sm font-semibold">
                      Gasto por {barBreakdown === "age" ? "franja de edad" : "género"}
                    </h3>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart data={barRows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip content={<DemographicsSpendTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                        <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                          {barRows.map((r, i) => (
                            <Cell
                              key={`spend-${r.label}-${i}`}
                              fill={barPaletteByRowIndex(i)}
                              fillOpacity={r.insufficient ? 0.38 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-2 text-sm font-semibold">CPA por segmento</h3>
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart data={barRows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <XAxis
                          type="number"
                          tickFormatter={(v) => `$${v.toFixed(0)}`}
                          tick={{ fontSize: 11 }}
                          domain={[0, "dataMax"]}
                        />
                        <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip content={<DemographicsCpaTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                        <Bar dataKey="cpaValue" radius={[0, 4, 4, 0]}>
                          {barRows.map((r, i) => (
                            <Cell
                              key={`cpa-${r.label}-${i}`}
                              fill={barPaletteByRowIndex(i)}
                              fillOpacity={r.insufficient ? 0.38 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

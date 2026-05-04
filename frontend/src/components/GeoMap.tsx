import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { GeoInsightRow, GeoMetadata } from "@/api/client";
import { barColorAt } from "@/lib/dashboardColors";
import { AdReferenceLink } from "@/components/AdReferenceLink";

export type GeoMapMetric = "impressions" | "clicks" | "spend" | "reach" | "cpa" | "results";

const INSUFFICIENT_FILL = "#94a3b8";

function spendUsd(row: GeoInsightRow): number {
  const n = parseFloat(String(row.spend ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function isCpaInsufficient(row: GeoInsightRow, minSpendUsd: number): boolean {
  if (spendUsd(row) < minSpendUsd) return true;
  const cpa = row.cpa;
  if (cpa == null || !Number.isFinite(cpa) || cpa <= 0) return true;
  return false;
}

/** Misma ordenación que el gráfico geo (alineada a la tabla cuando se usa esta función allí). */
export function compareGeoInsightRowsForMetric(
  a: GeoInsightRow,
  b: GeoInsightRow,
  metric: GeoMapMetric,
  minSpendUsd = 25,
): number {
  if (metric === "impressions") return Number(b.impressions ?? 0) - Number(a.impressions ?? 0);
  if (metric === "spend") return spendUsd(b) - spendUsd(a);
  if (metric === "reach") return Number(b.reach ?? 0) - Number(a.reach ?? 0);
  if (metric === "clicks") return Number(b.clicks ?? 0) - Number(a.clicks ?? 0);
  if (metric === "results") {
    return Number(b.results ?? 0) - Number(a.results ?? 0);
  }
  if (metric === "cpa") {
    const ia = isCpaInsufficient(a, minSpendUsd);
    const ib = isCpaInsufficient(b, minSpendUsd);
    if (ia !== ib) return ia ? 1 : -1;
    if (ia) return spendUsd(b) - spendUsd(a);
    return Number(b.cpa) - Number(a.cpa);
  }
  return 0;
}

interface GeoMapProps {
  data: GeoInsightRow[];
  metadata: GeoMetadata;
  metric?: GeoMapMetric;
  /** Gasto mínimo (USD) para considerar CPA fiable; filas por debajo van al final (gris). */
  minSpendUsd?: number;
  /** Texto adicional bajo el subtítulo (p. ej. alineación CPA con KPI). */
  extraCaption?: string;
  /** Enlace opcional al anuncio cuando metadata.scope === "ad". */
  adReferenceUrl?: string | null;
}

type GeoChartDatum = {
  region: string;
  value: number;
  insufficient: boolean;
};

function formatTooltipValue(metric: GeoMapMetric, value: number, insufficient: boolean): string {
  if (insufficient) return "Datos insuficientes";
  if (metric === "spend" || metric === "cpa") return `$${value.toFixed(2)}`;
  if (metric === "results") return Math.round(value).toLocaleString("es");
  return value.toLocaleString("es");
}

function axisTickFormatter(metric: GeoMapMetric, v: number): string {
  if (!Number.isFinite(v)) return "";
  if (metric === "spend" || metric === "cpa") return `$${v.toLocaleString("es", { maximumFractionDigits: 2 })}`;
  if (metric === "results") return Math.round(v).toLocaleString("es");
  return v.toLocaleString("es");
}

function buildChartData(
  data: GeoInsightRow[],
  metric: GeoMapMetric,
  minSpendUsd: number,
): GeoChartDatum[] {
  const enriched = data.map((row) => {
    const region = String(row.region_name || row.region || "Desconocido");
    if (metric === "cpa") {
      const insufficient = isCpaInsufficient(row, minSpendUsd);
      const value = insufficient ? 0 : Number(row.cpa);
      return { region, value, insufficient, row };
    }
    if (metric === "results") {
      const unavailable = row.results == null;
      const value = unavailable ? 0 : Number(row.results ?? 0);
      return { region, value, insufficient: unavailable, row };
    }
    let value: number;
    if (metric === "spend") value = spendUsd(row);
    else if (metric === "impressions") value = Number(row.impressions ?? 0);
    else if (metric === "clicks") value = Number(row.clicks ?? 0);
    else value = Number(row.reach ?? 0);
    return { region, value, insufficient: false, row };
  });

  enriched.sort((a, b) => compareGeoInsightRowsForMetric(a.row, b.row, metric, minSpendUsd));

  return enriched.map(({ region, value, insufficient }) => ({ region, value, insufficient }));
}

function GeoMapTooltipContent({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: readonly { payload?: GeoChartDatum }[];
  metric: GeoMapMetric;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const line = formatTooltipValue(metric, p.value, p.insufficient);
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-md">
      <p className="font-medium leading-none">{p.region}</p>
      <p className="text-muted-foreground mt-1 tabular-nums">{line}</p>
    </div>
  );
}

export default function GeoMap({
  data,
  metadata,
  metric = "impressions",
  minSpendUsd = 25,
  extraCaption,
  adReferenceUrl,
}: GeoMapProps) {
  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertDescription>No hay datos geográficos disponibles.</AlertDescription>
      </Alert>
    );
  }

  const chartData = buildChartData(data, metric, minSpendUsd);

  const maxAmong = (vals: number[]) => {
    const m = Math.max(0, ...vals);
    return m > 0 ? Math.ceil(m * 1.15) : 1;
  };

  const maxVal =
    metric === "cpa"
      ? maxAmong(chartData.filter((d) => !d.insufficient).map((d) => d.value))
      : maxAmong(chartData.map((d) => d.value));

  const yDomain: [number, number] = [0, maxVal];

  const metricLabel =
    metric === "impressions" ? "Impresiones"
    : metric === "clicks" ? "Clicks"
    : metric === "spend" ? "Gasto"
    : metric === "reach" ? "Alcance"
    : metric === "cpa" ? "CPA"
    : "Resultados";

  const alignmentNote =
    metric === "cpa" || metric === "results"
      ? " CPA y resultados usan la misma lógica que la tabla (ventana / definición alineadas al endpoint geo)."
      : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución Geográfica — {metricLabel}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {metadata.scope === "account" ? "Toda la cuenta" : `Anuncio: ${metadata.ad_id}`} •{" "}
          {metadata.total_rows} regiones.
          {alignmentNote}
          {extraCaption ? ` ${extraCaption}` : null}
        </p>
        {metadata.warning ? (
          <Alert className="mt-3">
            <AlertTitle>Breakdown incompleto</AlertTitle>
            <AlertDescription>{metadata.warning}</AlertDescription>
          </Alert>
        ) : null}
        {metadata.scope === "ad" ? (
          <AdReferenceLink href={adReferenceUrl ?? null} />
        ) : null}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={yDomain}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => axisTickFormatter(metric, Number(v))}
            />
            <YAxis type="category" dataKey="region" width={120} tick={{ fontSize: 11 }} />
            <Tooltip content={(props) => <GeoMapTooltipContent {...props} metric={metric} />} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {chartData.map((d, idx) => (
                <Cell
                  key={`${d.region}-${idx}`}
                  fill={d.insufficient ? INSUFFICIENT_FILL : barColorAt(idx, d.region)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

import type { AdPerformanceRow, InsightActionItem } from "@/api/client";

const TRIVIAL = new Set(["post_engagement", "page_engagement", "photo_view", "video_view"]);

export function toFloat(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : 0;
}

/** Primer `action_type` con volumen no trivial (misma idea que backend `_derive_result_value`). */
export function deriveResultValue(actions: InsightActionItem[] | undefined): number {
  if (!actions?.length) return 0;
  for (const item of actions) {
    const actionType = String(item.action_type ?? "");
    if (TRIVIAL.has(actionType)) continue;
    return toFloat(item.value);
  }
  return 0;
}

/** Suma valores de acciones cuyo tipo contiene `purchase` (alineado a `_sum_purchase_values`). */
export function sumPurchaseValues(actionValues: InsightActionItem[] | undefined): number {
  if (!actionValues?.length) return 0;
  let total = 0;
  for (const item of actionValues) {
    const actionType = String(item.action_type ?? "");
    if (actionType.includes("purchase")) total += toFloat(item.value);
  }
  return total;
}

/**
 * CPA: respuesta del backend si existe; si no, primer `cost_per_action_type` numérico;
 * si no, gasto ÷ resultados cuando hay resultados.
 */
export function deriveCpa(row: AdPerformanceRow, results: number): number | null {
  if (row.cpa != null && Number.isFinite(row.cpa)) return row.cpa;
  const spend = toFloat(row.spend);
  const first = row.cost_per_action_type?.[0];
  if (first?.value != null) {
    const v = toFloat(first.value);
    if (v > 0) return v;
  }
  if (results > 0 && spend > 0) return spend / results;
  return null;
}

/** ROAS: backend / `purchase_roas` / ingresos de compra ÷ gasto. */
export function deriveRoas(row: AdPerformanceRow, spend: number): number | null {
  if (row.roas != null && Number.isFinite(row.roas)) return row.roas;
  const purchaseRoas = toFloat(row.purchase_roas);
  if (purchaseRoas > 0) return purchaseRoas;
  if (spend > 0) {
    const d = sumPurchaseValues(row.action_values) / spend;
    return d > 0 ? d : null;
  }
  return null;
}

export function ctrNumber(row: AdPerformanceRow): number {
  const c = row.ctr;
  if (c == null) return 0;
  return toFloat(String(c).replace("%", "").trim());
}

export type EnrichedAdRankingRow = {
  row: AdPerformanceRow;
  label: string;
  spend: number;
  results: number;
  cpa: number | null;
  roas: number | null;
};

export function enrichAdRankingRows(rows: AdPerformanceRow[]): EnrichedAdRankingRow[] {
  return rows.map((row) => {
    const spend = toFloat(row.spend);
    const results = row.results ?? deriveResultValue(row.actions);
    const cpa = deriveCpa(row, results);
    const roas = deriveRoas(row, spend);
    const label = String(row.ad_label ?? row.ad_name ?? row.ad_id ?? "").slice(0, 28);
    return { row, label, spend, results, cpa, roas };
  });
}

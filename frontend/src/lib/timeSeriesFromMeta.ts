/** Filas diarias de `/insights/time` (Meta) → puntos para Recharts. */

export interface DailyInsightPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpm: number;
  /** Derivado: (spend / reach) * 1000 */
  cpp: number;
  /** Derivado: spend / results (null si sin resultados). */
  cpa: number | null;
  /** Primer valor de acción no trivial (misma idea que el dashboard). */
  results: number;
  /** Suma de action_values con tipo que contiene "purchase". */
  purchaseValue: number;
  roas: number | null;
}

const TRIVIAL = new Set(["post_engagement", "page_engagement", "photo_view", "video_view"]);

/** Con `action_attribution_windows`, Graph v25 suele rellenar `7d_click` / `1d_click` además de `value`. */
const ACTION_STAT_VALUE_KEYS = ["value", "7d_click", "28d_click", "1d_click", "7d_view", "1d_view", "28d_view"] as const;

function firstNonTrivialActionValue(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as { action_type?: string; value?: string | number };
    const at = String(a.action_type ?? "");
    if (TRIVIAL.has(at)) continue;
    const v = Number(a.value ?? 0);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

function sumActionsByTypes(actions: unknown, actionTypes: string[]): number {
  if (!Array.isArray(actions) || actionTypes.length === 0) return 0;
  const accepted = new Set(actionTypes);
  let total = 0;
  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as { action_type?: string; value?: string | number };
    if (!accepted.has(String(a.action_type ?? ""))) continue;
    const v = Number(a.value ?? 0);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

/** Un único número por fila tipo Ads Action Stats (evita duplicar ventanas). */
function primaryNumericFromActionStat(row: Record<string, unknown>): number {
  for (const k of ACTION_STAT_VALUE_KEYS) {
    if (!(k in row)) continue;
    const raw = row[k];
    if (raw == null || raw === "") continue;
    const n = typeof raw === "number" && Number.isFinite(raw) ? raw : Number.parseFloat(String(raw).trim());
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function sumPurchaseValues(actionValues: unknown): number {
  if (!Array.isArray(actionValues)) return 0;
  let s = 0;
  for (const raw of actionValues) {
    if (!raw || typeof raw !== "object") continue;
    const av = raw as Record<string, unknown>;
    const at = String(av.action_type ?? "");
    if (at.includes("purchase")) s += primaryNumericFromActionStat(av) || 0;
  }
  return s;
}

function metaRoasFromList(raw: unknown): number {
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  let best = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const n = primaryNumericFromActionStat(item as Record<string, unknown>);
    if (n > best) best = n;
  }
  return best;
}

/** ROAS que devuelve Meta (`purchase_roas`, etc.): escalar o lista Ads Action Stats (Graph v25). */
function metaPurchaseRoas(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.trim());
    return Number.isFinite(n) ? n : 0;
  }
  if (Array.isArray(raw)) return metaRoasFromList(raw);
  if (typeof raw === "object") return primaryNumericFromActionStat(raw as Record<string, unknown>);
  const n = Number.parseFloat(String(raw).trim());
  return Number.isFinite(n) ? n : 0;
}

function combinedPurchaseRoasFromRow(row: Record<string, unknown>): number {
  const a = metaPurchaseRoas(row.purchase_roas);
  if (a > 0) return a;
  const b = metaPurchaseRoas(row.website_purchase_roas);
  if (b > 0) return b;
  return metaPurchaseRoas(row.mobile_app_purchase_roas);
}

export function parseTimeInsightRows(
  rows: Record<string, unknown>[],
  objectiveActionTypes: string[] = [],
): DailyInsightPoint[] {
  // Aggregate by date — Meta returns 1 row/date at account level, but defensive
  // against edge cases where the same date appears in multiple rows.
  const byDate = new Map<string, {
    spend: number; impressions: number; clicks: number; reach: number;
    results: number; purchaseValue: number; metaRoas: number;
  }>();

  for (const row of rows) {
    const date = String(row.date_start ?? row.date_stop ?? "").trim();
    if (!date) continue;
    const spend = Number.parseFloat(String(row.spend ?? "0")) || 0;
    const impressions = Number.parseFloat(String(row.impressions ?? "0")) || 0;
    const clicks = Number.parseFloat(String(row.clicks ?? "0")) || 0;
    const reach = Number.parseFloat(String(row.reach ?? "0")) || 0;
    const results = objectiveActionTypes.length > 0
      ? sumActionsByTypes(row.actions, objectiveActionTypes)
      : firstNonTrivialActionValue(row.actions);
    const purchaseValue = sumPurchaseValues(row.action_values);
    const metaRoas = combinedPurchaseRoasFromRow(row);
    const prev = byDate.get(date);
    if (!prev) {
      byDate.set(date, { spend, impressions, clicks, reach, results, purchaseValue, metaRoas });
    } else {
      prev.spend += spend;
      prev.impressions += impressions;
      prev.clicks += clicks;
      prev.reach += reach;
      prev.results += results;
      prev.purchaseValue += purchaseValue;
      if (metaRoas > 0) prev.metaRoas = Math.max(prev.metaRoas, metaRoas);
    }
  }

  const out: DailyInsightPoint[] = [];
  for (const [date, v] of byDate) {
    // Re-derive rate metrics from volume totals — more accurate than averaging per-row rates.
    const ctr = v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0;
    const cpm = v.impressions > 0 ? (v.spend / v.impressions) * 1000 : 0;
    const frequency = v.reach > 0 ? v.impressions / v.reach : 0;
    const cpp = v.reach > 0 ? (v.spend / v.reach) * 1000 : 0;
    const cpa = v.results > 0 ? v.spend / v.results : null;
    const derivedRoas = v.spend > 0 && v.purchaseValue > 0 ? v.purchaseValue / v.spend : null;
    const roas = v.spend > 0 && v.metaRoas > 0 ? v.metaRoas : derivedRoas;
    out.push({ date, spend: v.spend, impressions: v.impressions, clicks: v.clicks, reach: v.reach, frequency, ctr, cpm, cpp, cpa, results: v.results, purchaseValue: v.purchaseValue, roas });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const TRIVIAL_HOURLY = new Set(["post_engagement", "page_engagement", "photo_view", "video_view"]);

function hourFromHourlyBreakdown(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Prefer explicit hour:MM patterns (e.g. "14:00", "14:00:00")
  let m = s.match(/(\d{1,2}):\d{2}(?::\d{2})?/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  // ISO-like timestamps (e.g. 2023-09-01T14:00:00) — capture after 'T'
  m = s.match(/T(\d{1,2}):\d{2}/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  // Trailing hour number (e.g. "14" or "14 h")
  const tail = s.match(/(\d{1,2})\s*(?:h(?:ours?)?)?$/i);
  if (tail) {
    const h = parseInt(tail[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  return null;
}

/** Lunes = 0 … Domingo = 6 (timezone local del navegador). */
export function isoWeekdayMon0(isoDate: string): number | null {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const w = d.getDay();
  return w === 0 ? 6 : w - 1;
}

function hourlyBreakdownRaw(row: Record<string, unknown>): unknown {
  return (
    row.hourly_start_time ??
    row.hourly_stats_aggregated_by_advertiser_time_zone ??
    row.hourly_stats_aggregated_by_audience_time_zone
  );
}

function hourlyBreakdownDate(raw: unknown): string | null {
  const slot = String(raw ?? "").trim();
  if (!slot) return null;
  const stamp = slot.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):/);
  return stamp ? stamp[1] : null;
}

function dayHourFromHourlyRow(row: Record<string, unknown>): { dow: number; hour: number } | null {
  const raw = hourlyBreakdownRaw(row);
  const stampedDate = hourlyBreakdownDate(raw);
  if (stampedDate) {
    const dow = isoWeekdayMon0(stampedDate);
    const hour = hourFromHourlyBreakdown(raw);
    if (dow != null && hour != null) return { dow, hour };
  }

  const date = String(row.date_start ?? row.date_stop ?? "").trim();
  const hour = hourFromHourlyBreakdown(raw);
  const dow = isoWeekdayMon0(date);
  if (!date || hour == null || dow == null) return null;
  return { dow, hour };
}

export type HourlyHeatmapCell = {
  dow: number;
  hour: number;
  spend: number;
  results: number;
  cpa: number | null;
};

export type HourlyOnlyCell = {
  hour: number;
  spend: number;
  results: number;
  cpa: number | null;
};

export type HourlyOpportunityPoint = {
  hour: number;
  spend: number;
  results: number;
  cpa: number | null;
  hasData: boolean;
  spendWithoutResults: boolean;
  reliable: boolean;
};

export type HourlyDecisionReadiness = {
  ready: boolean;
  failedBy: "active_hours" | "total_results" | "both" | null;
};

function hourlyCellData(
  row: Record<string, unknown>,
  accepted: Set<string>,
): { hour: number; spend: number; results: number } | null {
  const hour = hourFromHourlyBreakdown(hourlyBreakdownRaw(row));
  if (hour == null) return null;
  const spend = Number.parseFloat(String(row.spend ?? "0")) || 0;
  let results = 0;
  const actions = row.actions;
  if (Array.isArray(actions)) {
    for (const raw of actions) {
      if (!raw || typeof raw !== "object") continue;
      const a = raw as { action_type?: string; value?: string | number };
      const at = String(a.action_type ?? "");
      if (TRIVIAL_HOURLY.has(at) || !accepted.has(at)) continue;
      const v = Number(a.value ?? 0);
      if (Number.isFinite(v)) results += v;
    }
  }
  return { hour, spend, results };
}

export function shouldUseHourlyOnlyView(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  let hasHourlyRows = false;
  for (const row of rows) {
    const raw = hourlyBreakdownRaw(row);
    if (hourFromHourlyBreakdown(raw) == null) continue;
    hasHourlyRows = true;
    if (hourlyBreakdownDate(raw)) return false;
  }
  return hasHourlyRows;
}

/** Agrega filas `/insights/time` con breakdown horario para mapa día×hora. */
export function buildHourlyCpaHeatmapCells(
  rows: Record<string, unknown>[],
  objectiveActionTypes: string[] = [],
): HourlyHeatmapCell[] {
  if (objectiveActionTypes.length !== 1) return [];
  const accepted = new Set(objectiveActionTypes);
  const map = new Map<string, { spend: number; results: number }>();
  for (const row of rows) {
    const slot = dayHourFromHourlyRow(row);
    if (!slot) continue;
    const { dow, hour } = slot;
    const k = `${dow}\t${hour}`;
    const cell = hourlyCellData(row, accepted);
    if (!cell) continue;
    const prev = map.get(k) ?? { spend: 0, results: 0 };
    prev.spend += cell.spend;
    prev.results += cell.results;
    map.set(k, prev);
  }
  const out: HourlyHeatmapCell[] = [];
  for (const [k, v] of map) {
    const [ds, hs] = k.split("\t");
    const dow = parseInt(ds, 10);
    const hour = parseInt(hs, 10);
    const cpa = v.results > 0 ? v.spend / v.results : null;
    out.push({ dow, hour, spend: v.spend, results: v.results, cpa });
  }
  return out;
}

export function buildHourlyCpaByHour(
  rows: Record<string, unknown>[],
  objectiveActionTypes: string[] = [],
): HourlyOnlyCell[] {
  if (objectiveActionTypes.length !== 1) return [];
  const accepted = new Set(objectiveActionTypes);
  const map = new Map<number, { spend: number; results: number }>();
  for (const row of rows) {
    const cell = hourlyCellData(row, accepted);
    if (!cell) continue;
    const prev = map.get(cell.hour) ?? { spend: 0, results: 0 };
    prev.spend += cell.spend;
    prev.results += cell.results;
    map.set(cell.hour, prev);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, value]) => ({
      hour,
      spend: value.spend,
      results: value.results,
      cpa: value.results > 0 ? value.spend / value.results : null,
    }));
}

export function buildHourlyOpportunityPoints(
  rows: Record<string, unknown>[],
  objectiveActionTypes: string[] = [],
  minResultsForConfidence = 2,
): HourlyOpportunityPoint[] {
  const hourly = buildHourlyCpaByHour(rows, objectiveActionTypes);
  const map = new Map<number, HourlyOnlyCell>();
  for (const point of hourly) map.set(point.hour, point);
  return Array.from({ length: 24 }, (_, hour) => {
    const point = map.get(hour);
    const spend = point?.spend ?? 0;
    const results = point?.results ?? 0;
    return {
      hour,
      spend,
      results,
      cpa: point?.cpa ?? null,
      hasData: spend > 0 || results > 0,
      spendWithoutResults: spend > 0 && results <= 0,
      reliable: results >= minResultsForConfidence,
    };
  });
}

export function evaluateHourlyDecisionReadiness(input: {
  activeHours: number;
  totalResults: number;
  minActiveHours: number;
  minTotalResults: number;
}): HourlyDecisionReadiness {
  const activeHoursOk = input.activeHours >= input.minActiveHours;
  const totalResultsOk = input.totalResults >= input.minTotalResults;
  if (activeHoursOk && totalResultsOk) return { ready: true, failedBy: null };
  if (!activeHoursOk && !totalResultsOk) return { ready: false, failedBy: "both" };
  return { ready: false, failedBy: activeHoursOk ? "total_results" : "active_hours" };
}

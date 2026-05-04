/** Filas diarias de `/insights/time` (Meta) → puntos para Recharts. */

export interface DailyInsightPoint {
  date: string;
  spend: number;
  impressions: number;
  ctr: number;
  cpm: number;
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
  const out: DailyInsightPoint[] = [];
  for (const row of rows) {
    const date = String(row.date_start ?? row.date_stop ?? "").trim();
    if (!date) continue;
    const spend = Number.parseFloat(String(row.spend ?? "0")) || 0;
    const impressions = Number.parseFloat(String(row.impressions ?? "0")) || 0;
    const ctr = Number.parseFloat(String(row.ctr ?? "0")) || 0;
    const cpm = Number.parseFloat(String(row.cpm ?? "0")) || 0;
    const results = objectiveActionTypes.length > 0
      ? sumActionsByTypes(row.actions, objectiveActionTypes)
      : firstNonTrivialActionValue(row.actions);
    const purchaseValue = sumPurchaseValues(row.action_values);
    const fromMeta = combinedPurchaseRoasFromRow(row);
    const derivedRoas = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : null;
    const roas = spend > 0 && fromMeta > 0 ? fromMeta : derivedRoas;
    out.push({ date, spend, impressions, ctr, cpm, results, purchaseValue, roas });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const TRIVIAL_HOURLY = new Set(["post_engagement", "page_engagement", "photo_view", "video_view"]);

function hourFromHourlyBreakdown(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  const tail = s.match(/(\d{1,2})\s*$/);
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

export type HourlyHeatmapCell = {
  dow: number;
  hour: number;
  spend: number;
  results: number;
  cpa: number | null;
};

/** Agrega filas `/insights/time` con breakdown horario para mapa día×hora. */
export function buildHourlyCpaHeatmapCells(rows: Record<string, unknown>[]): HourlyHeatmapCell[] {
  const map = new Map<string, { spend: number; results: number }>();
  for (const row of rows) {
    const date = String(row.date_start ?? row.date_stop ?? "").trim();
    const hourRaw = row.hourly_stats_aggregated_by_advertiser_time_zone;
    const hour = hourFromHourlyBreakdown(hourRaw);
    const dow = isoWeekdayMon0(date);
    if (!date || hour == null || dow == null) continue;
    const k = `${dow}\t${hour}`;
    const spend = Number.parseFloat(String(row.spend ?? "0")) || 0;
    let results = 0;
    const actions = row.actions;
    if (Array.isArray(actions)) {
      for (const raw of actions) {
        if (!raw || typeof raw !== "object") continue;
        const a = raw as { action_type?: string; value?: string | number };
        const at = String(a.action_type ?? "");
        if (TRIVIAL_HOURLY.has(at)) continue;
        const v = Number(a.value ?? 0);
        if (Number.isFinite(v)) {
          results = v;
          break;
        }
      }
    }
    const prev = map.get(k) ?? { spend: 0, results: 0 };
    prev.spend += spend;
    prev.results += results;
    map.set(k, prev);
  }
  const out: HourlyHeatmapCell[] = [];
  for (const [k, v] of map) {
    const [ds, hs] = k.split("\t");
    const dow = parseInt(ds, 10);
    const hour = parseInt(hs, 10);
    const cpa = v.results > 0 && v.spend > 0 ? v.spend / v.results : null;
    out.push({ dow, hour, spend: v.spend, results: v.results, cpa });
  }
  return out;
}

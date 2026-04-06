/**
 * Base para `fetch`: cadena vacía = mismo origen (solo en dev con proxy en `vite.config`).
 * Si defines `VITE_API_BASE_URL`, debe ser el origen del API sin `/api/v1` (se normaliza si lo incluyes).
 */
function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const trimmed = raw === undefined || raw === null ? "" : String(raw).trim();

  // Dev sin variable: /api/* lo reenvía Vite a :8000 (evita 404 por URL mal puesta).
  if (import.meta.env.DEV && trimmed === "") {
    return "";
  }

  const fallback = "http://127.0.0.1:8000";
  if (trimmed === "") return fallback;

  let origin = trimmed.replace(/\/+$/, "");
  if (origin.endsWith("/api/v1")) origin = origin.slice(0, -"/api/v1".length);
  else if (origin.endsWith("/api")) origin = origin.slice(0, -"/api".length);
  origin = origin.replace(/\/+$/, "");
  return origin || fallback;
}

const base = resolveApiBase();

if (import.meta.env.DEV) {
  console.info(
    "[oderbiz api]",
    base === ""
      ? "Mismo origen + proxy Vite → http://127.0.0.1:8000 (reiniciá Vite si cambiaste .env)"
      : `Origen directo: ${base} (sin proxy; revisá VITE_API_BASE_URL)`,
  );
}

export const META_TOKEN_STORAGE_KEY = "meta_access_token";

export interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string | null;
}

export interface DashboardResponse {
  ad_account_id: string;
  date_preset: string;
  insights_empty: boolean;
  summary: Record<string, number>;
  actions: { action_type: unknown; value: number }[];
  cost_per_action_type: { action_type: unknown; value: number }[];
  date_start: string | null;
  date_stop: string | null;
}

export function getMetaAccessToken(): string | null {
  const raw = sessionStorage.getItem(META_TOKEN_STORAGE_KEY);
  const t = raw?.trim();
  return t || null;
}

export function setMetaAccessToken(token: string): void {
  sessionStorage.setItem(META_TOKEN_STORAGE_KEY, token.trim());
}

export function clearMetaAccessToken(): void {
  sessionStorage.removeItem(META_TOKEN_STORAGE_KEY);
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getMetaAccessToken();
  if (!token) {
    throw new Error(
      "Falta el token de acceso. Conéctate desde la pantalla inicial."
    );
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const url = `${base}${path}`;
  try {
    return await fetch(url, { ...init, headers });
  } catch (e) {
    // Red/proxy/backend caído: el navegador lanza TypeError, no hay Response.
    if (e instanceof TypeError) {
      throw new Error(
        "No se pudo conectar con la API. En local: deja el backend en " +
          "http://127.0.0.1:8000 (uvicorn), el frontend en Vite (:5173) y sin " +
          "VITE_API_BASE_URL para usar el proxy /api → :8000."
      );
    }
    throw e;
  }
}

async function readErrorMessage(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") {
      if (r.status === 404 && j.detail === "Not Found") {
        return (
          "Ruta no encontrada (404). En local: deja sin definir VITE_API_BASE_URL y usa el proxy " +
          "de Vite, o pon solo el origen (p. ej. http://127.0.0.1:8000) sin /api/v1. " +
          "Comprueba que el backend esté en marcha."
        );
      }
      return j.detail;
    }
    if (Array.isArray(j.detail)) {
      const first = j.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  } catch {
    /* not JSON */
  }
  if (text.length > 0 && text.length < 400) return text;
  return r.statusText || "Error al llamar a la API";
}

export interface AdPerformanceRow {
  ad_id: string;
  ad_name: string;
  ad_label: string;
  campaign_name: string;
  impressions: number;
  clicks: number;
  spend: string;
  reach: number;
  frequency: number;
  cpm: string;
  cpp: string;
  ctr: string;
}

export interface AdsPerformanceResponse {
  data: AdPerformanceRow[];
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
}

export interface GeoMetadata {
  scope: "account" | "ad";
  ad_id: string | null;
  total_rows: number;
  complete_coverage: boolean;
  note: string;
}

export interface GeoInsightRow {
  region: string;
  region_name: string;
  impressions: number;
  clicks: number;
  spend: string;
  reach: number;
}

export interface GeoInsightsResponse {
  data: GeoInsightRow[];
  metadata: GeoMetadata;
  scope: "account" | "ad";
  date_preset?: string;
  time_range?: { since: string; until: string };
}

export interface LocationSpec {
  code?: string;
  name?: string;
  radius_km?: number;
  countries?: string[];
}

export interface AudienceItem {
  id: string;
  name: string;
}

export interface FormattedTargeting {
  age_range: string;
  genders: string[];
  locations: {
    countries?: string[];
    regions?: Array<{ code: string; name: string; radius_km?: number }>;
    cities?: LocationSpec[];
  };
  audiences: Record<string, AudienceItem[]>;
  raw_json: Record<string, any>;
}

export interface TargetingResponse {
  targeting: FormattedTargeting;
}

export async function fetchAdAccounts(): Promise<{ data: AdAccount[] }> {
  const r = await apiFetch("/api/v1/accounts");
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

/** Usuario de Graph asociado al token (`/me`). Sirve para diagnosticar listas vacías de cuentas. */
export async function fetchGraphMe(): Promise<{ id?: string; name?: string }> {
  const r = await apiFetch("/api/v1/me");
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchAccountDashboard(
  adAccountId: string,
  datePreset: string
): Promise<DashboardResponse> {
  const q = new URLSearchParams({ date_preset: datePreset });
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/dashboard?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchAdsPerformance(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
  }
): Promise<AdsPerformanceResponse> {
  const q = new URLSearchParams();
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.dateStart) q.set("date_start", opts.dateStart);
  if (opts.dateStop) q.set("date_stop", opts.dateStop);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/ads/performance?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchGeoInsights(
  adAccountId: string,
  opts: {
    scope: "account" | "ad";
    adId?: string;
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
  }
): Promise<GeoInsightsResponse> {
  const q = new URLSearchParams({ scope: opts.scope });
  if (opts.adId) q.set("ad_id", opts.adId);
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.dateStart) q.set("date_start", opts.dateStart);
  if (opts.dateStop) q.set("date_stop", opts.dateStop);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/geo?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchAdTargeting(
  adAccountId: string,
  adId: string
): Promise<TargetingResponse> {
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/ads/${encodeURIComponent(adId)}/targeting`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

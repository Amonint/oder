const base =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

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
  return fetch(`${base}${path}`, { ...init, headers });
}

async function readErrorMessage(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
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

export interface AdsPerformanceResponse {
  data: Record<string, unknown>[];
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
}

export interface GeoInsightsResponse {
  data: Record<string, unknown>[];
  scope: "account" | "ad";
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
}

export interface TargetingResponse {
  targeting: Record<string, unknown>;
}

export async function fetchAdAccounts(): Promise<{ data: AdAccount[] }> {
  const r = await apiFetch("/api/v1/accounts");
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

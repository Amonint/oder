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

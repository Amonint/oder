import { SITE_SESSION_HEADER, getSiteSessionToken } from "./siteSession";

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

/** Origen de la API (mismo criterio que las llamadas a Meta en esta app). */
export function getApiBase(): string {
  return resolveApiBase();
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
  /** `account` = toda la cuenta; `campaign` = solo la campaña en `campaign_id`. */
  scope?: "account" | "campaign";
  campaign_id?: string | null;
  insights_empty: boolean;
  context?: {
    level: "account" | "campaign";
    entity_id: string;
    date_start: string | null;
    date_stop: string | null;
    attribution_window: string | null;
  };
  summary: Record<string, number>;
  derived?: {
    results: number;
    cpa: number | null;
    roas: number | null;
  };
  diagnostic_inputs?: Record<string, number | null>;
  actions: { action_type: unknown; value: number }[];
  action_values?: { action_type: unknown; value: number }[];
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
  const appSessionToken = getSiteSessionToken();
  if (appSessionToken) {
    headers.set(SITE_SESSION_HEADER, appSessionToken);
  }
  const url = `${base}${path}`;
  try {
    return await fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });
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

export interface InsightActionItem {
  action_type?: string;
  value?: string | number;
}

export interface AdPerformanceRow {
  ad_id: string;
  ad_name: string;
  ad_label: string;
  ad_label_source?: "meta_ad_name" | "creative_name" | "story_id" | "ad_id_fallback";
  campaign_id?: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  impressions?: number | string;
  clicks?: number | string;
  spend?: string;
  reach?: number | string;
  frequency?: number | string;
  cpm?: string;
  cpp?: string;
  ctr?: string;
  cpc?: string;
  actions?: InsightActionItem[];
  action_values?: InsightActionItem[];
  cost_per_action_type?: InsightActionItem[];
  /** Meta: costo por resultado principal (si existe). */
  cost_per_result?: string | number;
  purchase_roas?: string | number;
  /** Derivados en backend (`ads_ranking.py`): primer resultado no trivial, CPA y ROAS. */
  results?: number;
  cpa?: number | null;
  roas?: number | null;
  date_start?: string;
  date_stop?: string;
}

export interface AdsPerformanceResponse {
  data: AdPerformanceRow[];
  raw_rows?: AdPerformanceRow[] | null;
  aggregated_by_ad?: AdPerformanceRow[] | null;
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  time_increment?: number | null;
  messaging_actions_summary?: Record<string, number>;
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
  results?: number;
  cpa?: number | null;
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

export interface CampaignRow {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
}

export async function fetchCampaigns(
  adAccountId: string
): Promise<{ data: CampaignRow[] }> {
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/campaigns`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface AdsetRow {
  id: string;
  name: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
  created_time?: string;
  updated_time?: string;
}

export async function fetchAdsets(
  adAccountId: string,
  campaignId?: string
): Promise<{ data: AdsetRow[] }> {
  const q = new URLSearchParams();
  if (campaignId) q.set("campaign_id", campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/adsets?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface AdRow {
  id: string;
  name: string;
  name_source?: "meta_ad_name" | "creative_name" | "story_id" | "ad_id_fallback";
  adset_id: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  creative?: {
    id?: string;
    name?: string;
    title?: string;
    body?: string;
    call_to_action_type?: string;
    object_story_spec?: Record<string, unknown>;
  };
  created_time?: string;
  updated_time?: string;
}

export async function fetchAdsList(
  adAccountId: string,
  opts?: { campaignId?: string; adsetId?: string }
): Promise<{ data: AdRow[] }> {
  const q = new URLSearchParams();
  if (opts?.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts?.adsetId) q.set("adset_id", opts.adsetId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/ads?${q}`;
  const r = await apiFetch(path);
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
  datePreset: string,
  opts?: {
    campaignId?: string | null;
    dateStart?: string;
    dateStop?: string;
  }
): Promise<DashboardResponse> {
  const q = new URLSearchParams();
  if (opts?.dateStart && opts?.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else {
    q.set("date_preset", datePreset);
  }
  if (opts?.campaignId) q.set("campaign_id", opts.campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/dashboard?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface BusinessPortfolioRow {
  business_id: string;
  business_name: string;
  ad_accounts: AdAccount[];
}

export async function fetchBusinessPortfolio(): Promise<{
  data: BusinessPortfolioRow[];
  warning?: string | null;
}> {
  const r = await apiFetch("/api/v1/businesses/portfolio");
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchAdsPerformance(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
    /** 1 = filas diarias por anuncio; el backend devuelve ranking agregado en `data`. */
    timeIncrement?: number;
  }
): Promise<AdsPerformanceResponse> {
  const q = new URLSearchParams();
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.dateStart) q.set("date_start", opts.dateStart);
  if (opts.dateStop) q.set("date_stop", opts.dateStop);
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  if (opts.timeIncrement != null) q.set("time_increment", String(opts.timeIncrement));
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/ads/performance?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface PlacementInsightRow extends AdPerformanceRow {
  publisher_platform?: string;
  platform_position?: string;
  device_platform?: string;
  impression_device?: string;
  pct_spend?: number;
  cpa_derived?: number | null;
}

export interface PlacementInsightsResponse {
  data: PlacementInsightRow[];
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  time_increment?: number | null;
  breakdowns: string[];
}

export async function fetchPlacementInsights(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
    timeIncrement?: number;
    includeDeviceBreakdowns?: boolean;
  }
): Promise<PlacementInsightsResponse> {
  const q = new URLSearchParams();
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.dateStart) q.set("date_start", opts.dateStart);
  if (opts.dateStop) q.set("date_stop", opts.dateStop);
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  if (opts.timeIncrement != null) q.set("time_increment", String(opts.timeIncrement));
  if (opts.includeDeviceBreakdowns) q.set("include_device_breakdowns", "true");
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/placements?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchGeoInsights(
  adAccountId: string,
  opts: {
    scope: "account" | "ad";
    adId?: string;
    campaignId?: string;
    adsetId?: string;
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    geoBreakdown?: "region" | "country";
  }
): Promise<GeoInsightsResponse> {
  const q = new URLSearchParams({ scope: opts.scope });
  if (opts.adId) q.set("ad_id", opts.adId);
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.dateStart) q.set("date_start", opts.dateStart);
  if (opts.dateStop) q.set("date_stop", opts.dateStop);
  if (opts.geoBreakdown) q.set("geo_breakdown", opts.geoBreakdown);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/geo?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface TimeInsightsResponse {
  data: Record<string, unknown>[];
  time_increment: string;
  breakdowns: string[];
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  attribution_window_requested?: string | null;
  /** Ventanas enviadas a Meta (`7d_click`, …); null = default de la API. */
  attribution_windows_sent?: string[] | null;
}

export async function fetchTimeInsights(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
    timeIncrement?: "1" | "7" | "monthly" | "hourly";
    /** Alineado con panel de atribución (`click_7d`, …); el backend lo traduce a `7d_click` para Graph v25. */
    attributionWindow?: string | null;
  }
): Promise<TimeInsightsResponse> {
  const q = new URLSearchParams();
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.dateStart) q.set("date_start", opts.dateStart);
  if (opts.dateStop) q.set("date_stop", opts.dateStop);
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  if (opts.timeIncrement) q.set("time_increment", opts.timeIncrement);
  if (opts.attributionWindow) q.set("attribution_window", opts.attributionWindow);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/time?${q}`;
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

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard "Página Primero" — tipos y funciones API
// ─────────────────────────────────────────────────────────────────────────────

export interface PageRow {
  page_id: string;
  name: string;
  category: string;
  spend: number;
  impressions: number;
  date_preset: string;
}

export interface PagesListResponse {
  data: PageRow[];
  date_preset: string;
}

export interface PageKpiRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  ctr?: string;
}

export interface PageInsightsResponse {
  data: PageKpiRow[];
  page_id: string;
  date_preset: string;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
}

export interface PagePlacementRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  publisher_platform?: string;
  platform_position?: string;
}

export interface PagePlacementsResponse {
  data: PagePlacementRow[];
  page_id: string;
  date_preset: string;
  breakdowns: string[];
}

export interface PageGeoRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string | number;
  region?: string;
  region_name?: string;
  results?: number;
  cpa?: number | null;
}

export interface PageGeoResponse {
  data: PageGeoRow[];
  page_id: string;
  date_preset: string;
  breakdowns: string[];
}

export interface PageActionRow {
  category: string;
  value: number;
}

export interface PageActionsResponse {
  data: PageActionRow[];
  spend: string;
  page_id: string;
  date_preset: string;
}

export interface PageTimeseriesRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  cpm?: string;
  ctr?: string;
  cpc?: string;
  date_start?: string;
  date_stop?: string;
}

export interface PageTimeseriesResponse {
  data: PageTimeseriesRow[];
  page_id: string;
  date_preset: string;
  time_increment: number;
}

type PageFilterOpts = {
  datePreset?: string;
  dateStart?: string;
  dateStop?: string;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
};

function buildPageQuery(opts: PageFilterOpts): URLSearchParams {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  return q;
}

export async function fetchPages(
  adAccountId: string,
  opts: { datePreset?: string; dateStart?: string; dateStop?: string } = {}
): Promise<PagesListResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageInsights(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageInsightsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/insights?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPagePlacements(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PagePlacementsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/placements?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageGeo(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageGeoResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/geo?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageActions(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageActionsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/actions?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageTimeseries(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageTimeseriesResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/timeseries?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface OrganicMetric {
  total: number;
  daily: Array<{ date: string; value: number }>;
}

export interface OrganicInsightsResponse {
  page_id: string;
  date_preset: string;
  metrics: Record<string, OrganicMetric>;
}

export async function fetchOrganicInsights(
  pageId: string,
  opts: { datePreset?: string; dateStart?: string; dateStop?: string } = {}
): Promise<OrganicInsightsResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  const path = `/api/v1/pages/${encodeURIComponent(pageId)}/organic-insights?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface AdLabelRow {
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpa: number | null;
}

export interface AdLabelsResponse {
  data: AdLabelRow[];
  date_preset: string;
  time_range: { since: string; until: string } | null;
  ad_account_id: string;
}

export async function fetchAdLabelsPerformance(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
  }
): Promise<AdLabelsResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/ads/labels/performance?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Rentabilidad — Conversion Timeseries
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversionTimeseriesRow {
  date: string;
  spend: number;
  cpa: number;
  conversions: number;
  revenue: number;
  replied: number;
  depth2: number;
}

export interface ConversionTimeseriesResponse {
  data: ConversionTimeseriesRow[];
  page_id: string;
  date_preset: string;
}

export async function fetchPageConversionTimeseries(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<ConversionTimeseriesResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/conversion-timeseries?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Calidad de Tráfico
// ─────────────────────────────────────────────────────────────────────────────

export interface TrafficQualityResponse {
  outbound_clicks: number;
  cost_per_outbound_click: number;
  unique_clicks: number;
  unique_ctr: number;
  cost_per_unique_click: number;
  spend: number;
  page_id: string;
  date_preset: string;
}

export async function fetchPageTrafficQuality(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<TrafficQualityResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/traffic-quality?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Diagnóstico de Creatividades
// ─────────────────────────────────────────────────────────────────────────────

export interface AdDiagnosticsRow {
  ad_id: string;
  ad_name: string;
  ad_name_source?: "meta_ad_name" | "creative_name" | "story_id" | "ad_id_fallback";
  impressions: number;
  spend: number;
  ctr: number;
  cpm: number;
  engagement_rate: number;
  cpa?: number | null;
}

export interface AdDiagnosticsResponse {
  data: AdDiagnosticsRow[];
  page_id: string;
  date_preset: string;
}

export async function fetchPageAdDiagnostics(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<AdDiagnosticsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/ad-diagnostics?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Embudo de Conversión
// ─────────────────────────────────────────────────────────────────────────────

export interface PageFunnelResponse {
  impressions: number;
  reach: number;
  unique_clicks: number;
  outbound_clicks: number;
  conversations_started: number;
  first_replies: number;
  page_id: string;
  date_preset: string;
}

export async function fetchPageFunnel(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageFunnelResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/funnel?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Inteligencia Competitiva
// ─────────────────────────────────────────────────────────────────────────────

export interface CompetitorPageSuggestion {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
}

export interface CompetitorAdItem {
  id: string;
  ad_creation_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string | null;
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  languages?: string[];
  page_name?: string;
  page_id?: string;
}

export interface CompetitorAdsResponse {
  data: CompetitorAdItem[];
  page_name: string;
  page_id: string;
}

export async function searchCompetitorPages(
  query: string
): Promise<{ data: CompetitorPageSuggestion[] }> {
  const q = new URLSearchParams({ q: query });
  const r = await apiFetch(`/api/v1/competitor/search?${q}`);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface CompetitorResolvedDirect {
  platform: "facebook" | "instagram";
  page_id: string;
  name: string;
  fan_count?: number;
  category?: string | null;
  is_approximate: false;
}

export interface CompetitorResolvedSuggestion {
  page_id: string;
  name: string;
  is_approximate: true;
}

export interface CompetitorResolveResponse {
  platform: "facebook" | "instagram";
  page_id?: string;
  name?: string;
  fan_count?: number;
  category?: string | null;
  is_approximate?: boolean;
  results?: CompetitorResolvedSuggestion[];
}

export async function resolveCompetitor(
  input: string,
  pageId?: string,
): Promise<CompetitorResolveResponse> {
  const r = await apiFetch("/api/v1/competitor/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, page_id: pageId ?? null }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchCompetitorAds(
  pageId: string
): Promise<CompetitorAdsResponse> {
  const r = await apiFetch(`/api/v1/competitor/${encodeURIComponent(pageId)}/ads`);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─── Market Radar ────────────────────────────────────────────────────────────

export interface MarketRadarCompetitor {
  page_id: string;
  name: string;
  active_ads: number;
  total_ads: number;
  platforms: string[];
  languages: string[];
  media_types: string[];
  latest_ad_date: string | null;
  monthly_activity: Record<string, number>; // { "2026-01": 3, ... }
}

export interface MarketRadarResponse {
  client_page: {
    page_id: string;
    name: string;
    category: string;
    keywords_used: string[];
  };
  competitors: MarketRadarCompetitor[];
  market_summary: {
    top_countries: { country: string; advertiser_count: number }[];
    top_platforms: { platform: string; ad_count: number }[];
    top_words: { word: string; count: number }[];
  };
}

export async function fetchMarketRadar(pageId: string): Promise<MarketRadarResponse> {
  const token = getMetaAccessToken();
  const res = await fetch(
    `${base}/api/v1/competitor/market-radar?page_id=${encodeURIComponent(pageId)}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Error al cargar Radar de Mercado");
  }
  return res.json();
}

// ─── Market Radar Extended ────────────────────────────────────────────────────

export interface MarketRadarExtendedCompetitor {
  rank: number;
  page_id: string;
  name: string;
  province: string | null;
  province_confidence: number;
  province_source: string;
  active_ads: number;
  total_ads: number;
  platforms: string[];
  languages: string[];
  ads: CompetitorAdItem[];
  last_detected: string;
}

export interface MarketRadarExtendedResponse {
  client_page: {
    page_id: string;
    name: string;
    category: string;
    province: string | null;
    province_confidence: number;
    province_source: string;
  };
  ecuador_top5: MarketRadarExtendedCompetitor[];
  province_top5: MarketRadarExtendedCompetitor[];
  metadata: {
    total_competitors_detected: number;
    ecuador_competitors: number;
    province_competitors: number;
    last_sync: string;
    sync_duration_seconds: number;
  };
}

export async function fetchMarketRadarExtended(pageId: string): Promise<MarketRadarExtendedResponse> {
  const token = getMetaAccessToken();
  const res = await fetch(
    `${base}/api/v1/competitor/market-radar-extended?page_id=${encodeURIComponent(pageId)}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Error al cargar Radar de Mercado Extendido");
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Demographics
// ─────────────────────────────────────────────────────────────────────────────

export interface DemographicsRow {
  age?: string;
  gender?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: InsightActionItem[];
  cost_per_action_type?: InsightActionItem[];
}

export interface DemographicsResponse {
  data: DemographicsRow[];
  breakdown: string;
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  note: string;
}

export async function fetchDemographicsInsights(
  adAccountId: string,
  opts: {
    breakdown?: "age" | "gender" | "age,gender";
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
  }
): Promise<DemographicsResponse> {
  const q = new URLSearchParams();
  if (opts.breakdown) q.set("breakdown", opts.breakdown);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/demographics?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface PageDemographicsResponse extends DemographicsResponse {
  page_id: string;
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_id?: string | null;
}

export async function fetchPageDemographics(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts & { breakdown?: "age" | "gender" | "age,gender" } = {}
): Promise<PageDemographicsResponse> {
  const q = buildPageQuery(opts);
  if (opts.breakdown) q.set("breakdown", opts.breakdown);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/demographics?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribution Windows
// ─────────────────────────────────────────────────────────────────────────────

export interface AttributionResponse {
  data: { spend?: string; actions?: InsightActionItem[]; cost_per_action_type?: InsightActionItem[] }[];
  window: string;
  window_label: string;
  window_sent_to_meta?: string;
  available_windows: Record<string, string>;
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  degraded?: boolean;
  warning?: string | null;
  note: string;
}

export async function fetchAttributionInsights(
  adAccountId: string,
  opts: {
    window?: string;
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
  }
): Promise<AttributionResponse> {
  const q = new URLSearchParams();
  if (opts.window) q.set("window", opts.window);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/attribution?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadsRow {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  leads_insights: number;
  cpa_lead: number | null;
  actions?: InsightActionItem[];
}

export interface LeadsResponse {
  data: LeadsRow[];
  summary: {
    total_leads_insights: number;
    total_spend: number;
    avg_cpa_lead: number | null;
  };
  level: string;
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  note: string;
}

export interface AudiencePerformanceRow {
  category: string;
  audience_id: string | null;
  audience_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  results: number;
  leads_insights: number;
  conversations_started: number;
  cpa_like: number | null;
  ads_count: number;
  campaigns_count: number;
}

export interface AudiencePerformanceResponse {
  data: AudiencePerformanceRow[];
  summary: {
    rows_considered: number;
    rows_with_targeting: number;
    distinct_audiences: number;
    total_spend: number;
  };
  filters: {
    category: string;
    min_spend: number;
    limit: number;
    date_preset: string | null;
    time_range: { since: string; until: string } | null;
    campaign_id?: string | null;
    adset_id?: string | null;
    ad_id?: string | null;
  };
  note: string;
}

export async function fetchLeadsInsights(
  adAccountId: string,
  opts: {
    level?: "account" | "campaign" | "ad";
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
  }
): Promise<LeadsResponse> {
  const q = new URLSearchParams();
  if (opts.level) q.set("level", opts.level);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/leads?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchAudiencePerformance(
  adAccountId: string,
  opts: {
    category?: "all" | "interests" | "behaviors" | "education_majors" | "family_statuses" | "life_events" | "work_positions";
    minSpend?: number;
    limit?: number;
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
  }
): Promise<AudiencePerformanceResponse> {
  const q = new URLSearchParams();
  if (opts.category) q.set("category", opts.category);
  if (opts.minSpend != null) q.set("min_spend", String(opts.minSpend));
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/audiences?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Creative Fatigue
// ─────────────────────────────────────────────────────────────────────────────

export interface FatigueRow {
  ad_id: string;
  ad_name: string;
  impressions: number;
  frequency: number;
  spend: number;
  ctr: number;
  results: number;
  cpa: number | null;
  fatigue_score: number;
  fatigue_status: "healthy" | "watch" | "fatigued";
}

export interface FatigueAlert {
  ad_id: string;
  ad_name: string;
  type: string;
  message: string;
}

export interface CreativeFatigueResponse {
  data: FatigueRow[];
  alerts: FatigueAlert[];
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
}

export async function fetchCreativeFatigue(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
  }
): Promise<CreativeFatigueResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/creative-fatigue?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual CRM Data
// ─────────────────────────────────────────────────────────────────────────────

export interface ManualDataRecord {
  id?: string;
  account_id: string;
  campaign_id?: string | null;
  ad_id?: string | null;
  page_id?: string | null;
  snapshot_date?: string | null;
  segment_key?: string | null;
  useful_messages: number;
  accepted_leads: number;
  quotes_sent: number;
  sales_closed: number;
  avg_days_to_close?: number;
  sla_target_hours?: number;
  avg_first_response_hours?: number;
  cac_target?: number;
  avg_ticket: number;
  estimated_revenue: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface ManualDataResponse {
  data: ManualDataRecord[];
  account_id: string;
}

export async function saveManualData(
  adAccountId: string,
  record: Omit<ManualDataRecord, "id" | "created_at" | "updated_at">
): Promise<ManualDataRecord> {
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/manual-data`;
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchManualData(
  adAccountId: string,
  opts: {
    campaignId?: string;
    pageId?: string;
    segmentKey?: string;
    snapshotDateFrom?: string;
    snapshotDateTo?: string;
  } = {}
): Promise<ManualDataResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.pageId) q.set("page_id", opts.pageId);
  if (opts.segmentKey) q.set("segment_key", opts.segmentKey);
  if (opts.snapshotDateFrom) q.set("snapshot_date_from", opts.snapshotDateFrom);
  if (opts.snapshotDateTo) q.set("snapshot_date_to", opts.snapshotDateTo);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/manual-data?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface CampaignCloseSpeedRow {
  campaign_id: string;
  campaign_name: string;
  sales_closed: number;
  avg_days_to_close: number;
  close_days_p25: number;
  close_days_p50: number;
  close_days_p75: number;
}

export interface CampaignCloseSpeedResponse {
  data: CampaignCloseSpeedRow[];
}

export async function fetchCampaignCloseSpeed(
  adAccountId: string,
  opts: { campaignId?: string } = {}
): Promise<CampaignCloseSpeedResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/business-questions/close-speed?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface BottleneckRow {
  stage: string;
  from_volume: number;
  to_volume: number;
  drop_abs: number;
  drop_pct: number;
  conversion_rate: number;
}

export interface BottleneckResponse {
  data: BottleneckRow[];
  primary_bottleneck: string | null;
}

export async function fetchBottleneckAnalysis(
  adAccountId: string,
  opts: { campaignId?: string } = {}
): Promise<BottleneckResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/business-questions/bottleneck?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface SegmentNoQuoteRow {
  segment_key: string;
  accepted_leads: number;
  quotes_sent: number;
  quote_rate: number;
  no_quote_rate: number;
  is_misaligned: boolean;
}

export interface SegmentNoQuoteResponse {
  data: SegmentNoQuoteRow[];
  threshold: number;
}

export async function fetchSegmentNoQuote(
  adAccountId: string,
  opts: { campaignId?: string; threshold?: number } = {}
): Promise<SegmentNoQuoteResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.threshold != null) q.set("threshold", String(opts.threshold));
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/business-questions/segment-no-quote?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface CacOutTargetRow {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  sales_closed: number;
  cac_actual: number | null;
  cac_target: number | null;
  is_outside_target: boolean;
  outside_spend: number;
}

export interface CacOutTargetResponse {
  data: CacOutTargetRow[];
  summary: {
    total_spend: number;
    outside_spend: number;
    outside_spend_pct: number;
  };
}

export async function fetchCacOutOfTarget(
  adAccountId: string,
  opts: { campaignId?: string; datePreset?: string; dateStart?: string; dateStop?: string } = {}
): Promise<CacOutTargetResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/business-questions/cac-out-of-target?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface SlaLostRevenueRow {
  campaign_id: string;
  campaign_name: string;
  estimated_revenue: number;
  avg_first_response_hours: number;
  sla_target_hours: number;
  delay_hours: number;
  lost_revenue_est: number;
  lost_ratio: number;
}

export interface SlaLostRevenueResponse {
  data: SlaLostRevenueRow[];
  summary: {
    total_lost_revenue_est: number;
    alpha: number;
  };
}

export async function fetchSlaLostRevenue(
  adAccountId: string,
  opts: { campaignId?: string; alpha?: number } = {}
): Promise<SlaLostRevenueResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.alpha != null) q.set("alpha", String(opts.alpha));
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/business-questions/sla-lost-revenue?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export interface StabilityPoint {
  date: string;
  cac: number;
  close_rate: number;
  roas: number;
  metric_value: number;
  mean: number;
  ucl: number;
  lcl: number;
  is_outlier: boolean;
}

export interface StabilityResponse {
  metric: "cac" | "close_rate" | "roas";
  page_id?: string;
  data: StabilityPoint[];
  summary: {
    mean: number;
    std: number;
    cv: number;
    stability_score: number;
  };
}

export async function fetchAccountStability(
  adAccountId: string,
  opts: { campaignId?: string; metric?: "cac" | "close_rate" | "roas" } = {}
): Promise<StabilityResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.metric) q.set("metric", opts.metric);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/business-questions/stability?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageStability(
  adAccountId: string,
  pageId: string,
  opts: { campaignId?: string; metric?: "cac" | "close_rate" | "roas" } = {}
): Promise<StabilityResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.metric) q.set("metric", opts.metric);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/business-questions/stability?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

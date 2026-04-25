const PRESET_LABELS: Record<string, string> = {
  today: "Hoy",
  last_7d: "Últimos 7 días",
  last_30d: "30 días",
  last_90d: "90 días",
  custom: "Personalizado",
  maximum: "Máximo disponible",
};

/** Short Spanish labels for dashboard / Meta-style attribution codes. */
const ATTRIBUTION_LABELS: Record<string, string> = {
  click_1d: "1 d tras clic",
  click_7d: "7 d tras clic",
  click_28d: "28 d tras clic",
  view_1d: "1 d tras impresión",
  view_7d: "7 d tras impresión",
  "1d_click": "1 d tras clic",
  "7d_click": "7 d tras clic",
  "28d_click": "28 d tras clic",
  "1d_view": "1 d tras impresión",
  "7d_view": "7 d tras impresión",
};

export function attributionWindowLabelEs(code: string | null | undefined): string | null {
  if (code == null || code === "") return null;
  const trimmed = code.trim();
  return ATTRIBUTION_LABELS[trimmed] ?? trimmed;
}

/** `status` / `effective_status` de campañas, conjuntos o anuncios (Marketing API). */
const META_OBJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  PAUSED: "Pausada",
  DELETED: "Eliminada",
  ARCHIVED: "Archivada",
  PENDING_REVIEW: "En revisión",
  DISAPPROVED: "Rechazada",
  PREAPPROVED: "Preaprobada",
  PENDING_BILLING_INFO: "Falta facturación",
  CAMPAIGN_PAUSED: "Campaña pausada",
  ADSET_PAUSED: "Conjunto pausado",
  AD_PAUSED: "Anuncio pausado",
  IN_PROCESS: "Procesando",
  WITH_ISSUES: "Con incidencias",
  PAUSED_INVENTORY: "Pausada (inventario)",
  PAUSED_DAILY_BUDGET: "Pausada (presupuesto diario)",
  PAUSED_BUDGET: "Pausada (presupuesto)",
  PAUSED_MUSIC: "Pausada (música)",
  PAUSED_FUNDING: "Pausada (fondos)",
};

/** Nombre de estado de Meta en español; si no conocemos el código, se devuelve el original. */
export function metaObjectStatusLabelEs(status: string | null | undefined): string {
  if (status == null || status === "") return "—";
  const k = status.trim();
  return META_OBJECT_STATUS_LABELS[k] ?? k;
}

export function dashboardPeriodSummary(
  datePreset: string,
  dateStart: string | null | undefined,
  dateStop: string | null | undefined,
): string {
  const preset = PRESET_LABELS[datePreset] ?? datePreset;
  if (dateStart && dateStop) {
    return `${preset} · ${dateStart} → ${dateStop}`;
  }
  return preset;
}

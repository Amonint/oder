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

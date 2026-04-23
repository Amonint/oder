/** Paleta marca (chips, gráficas por etiqueta). */
export const DASHBOARD_COLORS = [
  "#D91480",
  "#56048C",
  "#150140",
  "#F2B441",
  "#E86E53",
] as const;

function parseHex(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa WCAG 0–1. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** Texto legible sobre fondo sólido (oscuro → blanco, claro → #150140). */
export function contrastingForeground(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.5 ? "#150140" : "#ffffff";
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickDashboardColor(seed: string, offset = 0): string {
  if (!seed) return DASHBOARD_COLORS[offset % DASHBOARD_COLORS.length];
  const index = (hashString(seed) + offset) % DASHBOARD_COLORS.length;
  return DASHBOARD_COLORS[index];
}

export function dashboardChartColor(offset = 0): string {
  return DASHBOARD_COLORS[offset % DASHBOARD_COLORS.length];
}

/** Color de barra distinto por fila, estable si cambia el orden de datos. */
export function barColorAt(index: number, label: string): string {
  return pickDashboardColor(String(label), index);
}

/** Una entrada de la paleta por posición (0, 1, 2…); cicla cada 5 filas. */
export function barPaletteByRowIndex(index: number): string {
  return DASHBOARD_COLORS[index % DASHBOARD_COLORS.length];
}

/** Meta dejó de ofrecer ciertas ventanas view largas desde esta fecha (Ads Insights). */
export const META_ATTRIBUTION_CHANGE_ISO = "2026-01-12";

/** Inicio/fin del periodo anterior con la misma duración (días inclusivos) que [dateStart, dateStop]. */
export function computePrevPeriod(dateStart: string, dateStop: string): { dateStart: string; dateStop: string } {
  const start = new Date(dateStart + "T00:00:00Z");
  const stop = new Date(dateStop + "T00:00:00Z");
  const diffMs = stop.getTime() - start.getTime() + 86_400_000;
  const prevStop = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevStop.getTime() - diffMs + 86_400_000);
  return {
    dateStart: prevStart.toISOString().slice(0, 10),
    dateStop: prevStop.toISOString().slice(0, 10),
  };
}

function noonUtc(isoDate: string): number {
  return new Date(isoDate + "T12:00:00Z").getTime();
}

/**
 * True si el rango unión (periodo actual ± anterior) cruza la fecha de cambio de disponibilidad
 * de métricas/ventanas en Ads (comparaciones mezclan definiciones distintas).
 */
/** % de cambio; null si el anterior es 0. */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function unionCrossesMetaAttributionChange(
  currStart: string,
  currEnd: string,
  prevStart?: string | null,
  prevEnd?: string | null,
): boolean {
  const cut = noonUtc(META_ATTRIBUTION_CHANGE_ISO);
  const times = [noonUtc(currStart), noonUtc(currEnd)];
  if (prevStart && prevEnd) {
    times.push(noonUtc(prevStart), noonUtc(prevEnd));
  }
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  return minT < cut && maxT >= cut;
}

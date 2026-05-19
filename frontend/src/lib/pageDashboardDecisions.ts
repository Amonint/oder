type PeriodComparisonInput = {
  loadedCurrentDays: number;
  loadedPreviousDays: number;
  totalCurrentDays: number;
  minCoverage?: number;
};

type ControlChartPoint = {
  cpa: number | null;
};

type TrafficQualityPoint = {
  outbound_clicks: number;
};

type CreativeComparable = {
  ad_id: string;
};

type FunnelInput = {
  impressions: number;
  unique_clicks: number;
  outbound_clicks: number;
  conversations_started: number;
  first_replies: number;
  depth2: number;
  depth3: number;
  depth5: number;
};

export type FunnelDisplayStep = {
  label: string;
  value: number;
  sub: string;
};

export function shouldShowPeriodComparison({
  loadedCurrentDays,
  loadedPreviousDays,
  totalCurrentDays,
  minCoverage = 0.6,
}: PeriodComparisonInput): boolean {
  if (totalCurrentDays <= 0) return false;
  return (
    loadedCurrentDays / totalCurrentDays >= minCoverage &&
    loadedPreviousDays / totalCurrentDays >= minCoverage
  );
}

export function shouldShowControlChart(
  rows: ControlChartPoint[],
  minValidDays = 7,
): boolean {
  return rows.filter((row) => row.cpa != null && Number.isFinite(row.cpa) && row.cpa > 0).length >= minValidDays;
}

export function shouldShowTrafficQualityTimeseries(
  rows: TrafficQualityPoint[],
  minDays = 2,
  minOutboundClicks = 5,
): boolean {
  if (rows.length < minDays) return false;
  const totalOutbound = rows.reduce((sum, row) => sum + Math.max(0, row.outbound_clicks), 0);
  return totalOutbound >= minOutboundClicks;
}

export function shouldShowCreativeDiagnostics(
  rows: CreativeComparable[],
  minAds = 1,
): boolean {
  return rows.length >= minAds;
}

export function buildMessagingFunnelSteps(data: FunnelInput): FunnelDisplayStep[] {
  const steps: FunnelDisplayStep[] = [
    {
      label: "Impresiones",
      value: data.impressions,
      sub: "Veces mostrado",
    },
    {
      label: "Clics únicos",
      value: data.unique_clicks,
      sub: "Personas que hicieron clic",
    },
    {
      label: "Conversaciones",
      value: data.conversations_started,
      sub: "Iniciadas (Meta)",
    },
    {
      label: "1ª Respuesta",
      value: data.first_replies,
      sub: "Respondieron al mensaje",
    },
  ];

  if (data.depth2 > 0) {
    steps.push({ label: "Profundidad 2", value: data.depth2, sub: "2+ mensajes enviados" });
  }
  if (data.depth3 > 0) {
    steps.push({ label: "Profundidad 3", value: data.depth3, sub: "3+ mensajes — interés real" });
  }
  if (data.depth5 > 0) {
    steps.push({ label: "Profundidad 5", value: data.depth5, sub: "5+ mensajes — lead calificado" });
  }

  return steps;
}

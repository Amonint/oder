export type InsightSeverity = "high" | "medium" | "low";

export interface InsightItem {
  severity: InsightSeverity;
  finding: string;
  evidence: string[];
  recommendation: string;
}

export interface DiagnosticInput {
  cpmDelta?: number | null;
  ctrDelta?: number | null;
  conversionDelta?: number | null;
  frequency?: number | null;
}

export function buildDashboardInsights(input: DiagnosticInput): InsightItem[] {
  const out: InsightItem[] = [];
  const cpm = input.cpmDelta ?? null;
  const ctr = input.ctrDelta ?? null;
  const conv = input.conversionDelta ?? null;
  const frequency = input.frequency ?? null;

  if (cpm !== null && ctr !== null && cpm > 10 && Math.abs(ctr) < 5) {
    out.push({
      severity: "medium",
      finding: "CPM sube con CTR estable",
      evidence: [`CPM: ${cpm.toFixed(1)}%`, `CTR: ${ctr.toFixed(1)}%`],
      recommendation: "Mercado mas caro o audiencia competida. Ajustar segmentacion y puja.",
    });
  }
  if (ctr !== null && cpm !== null && ctr < -10 && Math.abs(cpm) < 5) {
    out.push({
      severity: "high",
      finding: "CTR cae con CPM estable",
      evidence: [`CTR: ${ctr.toFixed(1)}%`, `CPM: ${cpm.toFixed(1)}%`],
      recommendation: "Problema creativo/mensaje. Probar nuevos copies y formatos.",
    });
  }
  if (frequency !== null && frequency >= 3.5 && ctr !== null && ctr < -5) {
    out.push({
      severity: "high",
      finding: "Frecuencia alta con CTR en caida",
      evidence: [`Frecuencia: ${frequency.toFixed(2)}`, `CTR: ${ctr.toFixed(1)}%`],
      recommendation: "Fatiga probable. Rotar creatividades y limitar exposicion.",
    });
  }
  if (conv !== null && conv < -10 && ctr !== null && ctr >= 0) {
    out.push({
      severity: "medium",
      finding: "CTR estable pero conversion en baja",
      evidence: [`Conversion: ${conv.toFixed(1)}%`, `CTR: ${ctr.toFixed(1)}%`],
      recommendation: "Revisar landing, checkout y tracking de conversion.",
    });
  }

  return out;
}


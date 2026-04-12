import type { ManualKpis } from "./manualKpis";
import { evaluateSemaphore, type ThresholdsMap } from "./semaphoreRules";

export interface HealthScoreResult {
  score: number;
  status: "healthy" | "watch" | "critical";
  breakdown: Record<string, { score: number; weight: number; status: string }>;
}

interface ScoringInput {
  ctr?: number | null;
  frequency?: number | null;
  manualKpis: ManualKpis | null;
}

export function computeHealthScore(
  input: ScoringInput,
  thresholds: ThresholdsMap
): HealthScoreResult {
  const semaphoreScore = (status: string): number => {
    if (status === "green") return 100;
    if (status === "yellow") return 50;
    if (status === "red") return 0;
    return 50;
  };

  const components: Record<string, { score: number; weight: number; status: string }> = {
    ctr: {
      weight: 20,
      status: evaluateSemaphore(input.ctr ?? null, thresholds.ctr),
      score: semaphoreScore(evaluateSemaphore(input.ctr ?? null, thresholds.ctr)),
    },
    frequency: {
      weight: 20,
      status: evaluateSemaphore(input.frequency ?? null, thresholds.frequency),
      score: semaphoreScore(evaluateSemaphore(input.frequency ?? null, thresholds.frequency)),
    },
    acceptance_rate: {
      weight: 20,
      status: evaluateSemaphore(input.manualKpis?.acceptance_rate ?? null, thresholds.acceptance_rate),
      score: semaphoreScore(evaluateSemaphore(input.manualKpis?.acceptance_rate ?? null, thresholds.acceptance_rate)),
    },
    close_rate: {
      weight: 20,
      status: evaluateSemaphore(input.manualKpis?.close_rate ?? null, thresholds.close_rate),
      score: semaphoreScore(evaluateSemaphore(input.manualKpis?.close_rate ?? null, thresholds.close_rate)),
    },
    roas: {
      weight: 20,
      status: evaluateSemaphore(input.manualKpis?.estimated_roas ?? null, thresholds.roas),
      score: semaphoreScore(evaluateSemaphore(input.manualKpis?.estimated_roas ?? null, thresholds.roas)),
    },
  };

  const totalWeight = Object.values(components).reduce((s, c) => s + c.weight, 0);
  const weightedScore = Object.values(components).reduce(
    (s, c) => s + (c.score * c.weight) / totalWeight,
    0
  );

  const score = Math.round(weightedScore);
  const status = score >= 80 ? "healthy" : score >= 60 ? "watch" : "critical";

  return { score, status, breakdown: components };
}

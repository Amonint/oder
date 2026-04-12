export type SemaphoreStatus = "green" | "yellow" | "red" | "gray";

export interface ThresholdConfig {
  greenMin?: number;
  greenMax?: number;
  yellowMin?: number;
  yellowMax?: number;
  redMin?: number;
  redMax?: number;
  /** true = lower is better (CPA, cost) */
  lowerIsBetter?: boolean;
}

const STORAGE_KEY = "dashboard_thresholds";

export interface ThresholdsMap {
  ctr: ThresholdConfig;
  frequency: ThresholdConfig;
  cpa: ThresholdConfig;
  cost_per_replied: ThresholdConfig;
  acceptance_rate: ThresholdConfig;
  close_rate: ThresholdConfig;
  cost_per_accepted_lead: ThresholdConfig;
  cost_per_sale: ThresholdConfig;
  roas: ThresholdConfig;
}

export const DEFAULT_THRESHOLDS: ThresholdsMap = {
  ctr: { greenMin: 2, yellowMin: 1, lowerIsBetter: false },
  frequency: { greenMax: 3, yellowMax: 5, lowerIsBetter: true },
  cpa: { greenMax: 10, yellowMax: 25, lowerIsBetter: true },
  cost_per_replied: { greenMax: 5, yellowMax: 15, lowerIsBetter: true },
  acceptance_rate: { greenMin: 0.5, yellowMin: 0.25, lowerIsBetter: false },
  close_rate: { greenMin: 0.3, yellowMin: 0.15, lowerIsBetter: false },
  cost_per_accepted_lead: { greenMax: 20, yellowMax: 50, lowerIsBetter: true },
  cost_per_sale: { greenMax: 50, yellowMax: 120, lowerIsBetter: true },
  roas: { greenMin: 3, yellowMin: 1.5, lowerIsBetter: false },
};

export function loadThresholds(): ThresholdsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_THRESHOLDS };
}

export function saveThresholds(t: Partial<ThresholdsMap>): void {
  const current = loadThresholds();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...t }));
}

export function evaluateSemaphore(
  value: number | null,
  config: ThresholdConfig
): SemaphoreStatus {
  if (value == null) return "gray";
  const { lowerIsBetter, greenMin, greenMax, yellowMin, yellowMax } = config;

  if (lowerIsBetter) {
    if (greenMax != null && value <= greenMax) return "green";
    if (yellowMax != null && value <= yellowMax) return "yellow";
    return "red";
  } else {
    if (greenMin != null && value >= greenMin) return "green";
    if (yellowMin != null && value >= yellowMin) return "yellow";
    return "red";
  }
}

export const STATUS_COLORS: Record<SemaphoreStatus, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  gray: "bg-muted text-muted-foreground",
};

export const STATUS_DOT: Record<SemaphoreStatus, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  gray: "bg-gray-400",
};

export interface CalibrationTarget {
  id: string;
  x: number;
  y: number;
}

export interface CalibrationViewport {
  width: number;
  height: number;
}

export interface CalibrationSample {
  x: number;
  y: number;
  t: number;
  confidence: number;
}

export type PointValidationReasonCode =
  | "ok"
  | "insufficient_samples"
  | "high_error"
  | "high_spread";

export interface PointValidationResult {
  pointId: string;
  passed: boolean;
  sampleCount: number;
  usedSampleCount: number;
  medianErrorPx: number;
  spreadPx: number;
  medianDxPx: number;
  medianDyPx: number;
  reasonCode: PointValidationReasonCode;
  target: CalibrationTarget;
}

export type CalibrationSummaryReasonCode = "ok" | "insufficient_valid_points";
export type CalibrationBiasLabel =
  | "centered"
  | "slight_right_up"
  | "slight_right_down"
  | "slight_left_up"
  | "slight_left_down"
  | "strong_right_up"
  | "strong_right_down"
  | "strong_left_up"
  | "strong_left_down";

export interface CalibrationSummaryResult {
  passed: boolean;
  passCount: number;
  requiredPassCount: number;
  failedPointIds: string[];
  biasDxPx: number;
  biasDyPx: number;
  biasLabel: CalibrationBiasLabel;
  medianErrorPx: number;
  validations: PointValidationResult[];
  reasonCode: CalibrationSummaryReasonCode;
}

interface EvaluatePointValidationInput {
  samples: CalibrationSample[];
  target: CalibrationTarget;
  viewport: CalibrationViewport;
  minSamples: number;
  maxErrorPx: number;
  maxSpreadPx: number;
}

interface EvaluateCalibrationSummaryInput {
  validations: PointValidationResult[];
  requiredPassCount: number;
}

interface SamplePx {
  px: number;
  py: number;
  dx: number;
  dy: number;
  error: number;
}

export function calibrationProgress(
  hitPoints: Set<string>,
  totalPoints: number,
): number {
  if (totalPoints <= 0) return 0;
  const ratio = hitPoints.size / totalPoints;
  return Math.floor(ratio * 100) / 100;
}

export function calibrationCompleted(
  hitPoints: Set<string>,
  totalPoints: number,
): boolean {
  return totalPoints > 0 && hitPoints.size >= totalPoints;
}

export function registerCalibrationClick(
  currentCount: number,
  targetCount: number,
): { nextCount: number; reachedTarget: boolean } {
  const nextCount = Math.min(targetCount, currentCount + 1);
  return {
    nextCount,
    reachedTarget: nextCount >= targetCount,
  };
}

export function evaluatePointValidation({
  samples,
  target,
  viewport,
  minSamples,
  maxErrorPx,
  maxSpreadPx,
}: EvaluatePointValidationInput): PointValidationResult {
  const normalized = normalizeSamples(samples, target, viewport);
  if (normalized.length < minSamples) {
    return buildFailedPointValidation(
      target,
      normalized.length,
      normalized.length,
      "insufficient_samples",
    );
  }

  const filtered = filterOutliers(normalized);
  const stableSamples =
    filtered.length >= minSamples || normalized.length < minSamples ? filtered : normalized;
  if (stableSamples.length < minSamples) {
    return buildFailedPointValidation(
      target,
      normalized.length,
      stableSamples.length,
      "insufficient_samples",
    );
  }

  const medianDxPx = median(stableSamples.map((sample) => sample.dx));
  const medianDyPx = median(stableSamples.map((sample) => sample.dy));
  const medianErrorPx = median(stableSamples.map((sample) => sample.error));
  const spreadPx = radialSpread(stableSamples, medianDxPx, medianDyPx);

  const reasonCode =
    spreadPx > maxSpreadPx
      ? "high_spread"
      : medianErrorPx > maxErrorPx
        ? "high_error"
        : "ok";

  return {
    pointId: target.id,
    passed: reasonCode === "ok",
    sampleCount: normalized.length,
    usedSampleCount: stableSamples.length,
    medianErrorPx,
    spreadPx,
    medianDxPx,
    medianDyPx,
    reasonCode,
    target,
  };
}

export function evaluateCalibrationSummary({
  validations,
  requiredPassCount,
}: EvaluateCalibrationSummaryInput): CalibrationSummaryResult {
  const passCount = validations.filter((item) => item.passed).length;
  const failedPointIds = validations.filter((item) => !item.passed).map((item) => item.pointId);
  const biasDxPx = median(validations.map((item) => item.medianDxPx));
  const biasDyPx = median(validations.map((item) => item.medianDyPx));
  const medianErrorPx = median(validations.map((item) => item.medianErrorPx));
  return {
    passed: passCount >= requiredPassCount,
    passCount,
    requiredPassCount,
    failedPointIds,
    biasDxPx,
    biasDyPx,
    biasLabel: classifyBias(biasDxPx, biasDyPx),
    medianErrorPx,
    validations,
    reasonCode: passCount >= requiredPassCount ? "ok" : "insufficient_valid_points",
  };
}

function buildFailedPointValidation(
  target: CalibrationTarget,
  sampleCount: number,
  usedSampleCount: number,
  reasonCode: Exclude<PointValidationReasonCode, "ok">,
): PointValidationResult {
  return {
    pointId: target.id,
    passed: false,
    sampleCount,
    usedSampleCount,
    medianErrorPx: Number.POSITIVE_INFINITY,
    spreadPx: Number.POSITIVE_INFINITY,
    medianDxPx: Number.POSITIVE_INFINITY,
    medianDyPx: Number.POSITIVE_INFINITY,
    reasonCode,
    target,
  };
}

function normalizeSamples(
  samples: CalibrationSample[],
  target: CalibrationTarget,
  viewport: CalibrationViewport,
): SamplePx[] {
  if (viewport.width <= 0 || viewport.height <= 0) return [];
  return samples
    .filter(
      (sample) =>
        Number.isFinite(sample.x) &&
        Number.isFinite(sample.y) &&
        Number.isFinite(sample.confidence),
    )
    .map((sample) => {
      const px = sample.x * viewport.width;
      const py = sample.y * viewport.height;
      const dx = px - target.x;
      const dy = py - target.y;
      return {
        px,
        py,
        dx,
        dy,
        error: Math.hypot(dx, dy),
      };
    });
}

function filterOutliers(samples: SamplePx[]): SamplePx[] {
  if (samples.length <= 4) return samples;
  const centerPx = median(samples.map((sample) => sample.px));
  const centerPy = median(samples.map((sample) => sample.py));
  const distances = samples.map((sample) => Math.hypot(sample.px - centerPx, sample.py - centerPy));
  const distanceMedian = median(distances);
  const mad = median(distances.map((distance) => Math.abs(distance - distanceMedian)));
  const threshold = Math.max(60, distanceMedian + Math.max(20, mad * 2.5));
  return samples.filter(
    (sample) => Math.hypot(sample.px - centerPx, sample.py - centerPy) <= threshold,
  );
}

function radialSpread(samples: SamplePx[], centerDxPx: number, centerDyPx: number): number {
  if (samples.length === 0) return Number.POSITIVE_INFINITY;
  const distances = samples.map((sample) =>
    Math.hypot(sample.dx - centerDxPx, sample.dy - centerDyPx),
  );
  return median(distances);
}

function median(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function classifyBias(dxPx: number, dyPx: number): CalibrationBiasLabel {
  const horizontal =
    dxPx >= 15 ? "right" : dxPx <= -15 ? "left" : "";
  const vertical =
    dyPx >= 8 ? "down" : dyPx <= -8 ? "up" : "";
  const strength =
    Math.abs(dxPx) >= 120 || Math.abs(dyPx) >= 120 ? "strong" : "slight";

  if (!horizontal && !vertical) return "centered";
  if (horizontal && vertical) {
    return `${strength}_${horizontal}_${vertical}` as CalibrationBiasLabel;
  }
  if (horizontal) {
    return `${strength}_${horizontal}_${dyPx < 0 ? "up" : "down"}` as CalibrationBiasLabel;
  }
  return `${strength}_${dxPx < 0 ? "left" : "right"}_${vertical}` as CalibrationBiasLabel;
}

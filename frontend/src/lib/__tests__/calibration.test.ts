/// <reference types="node" />
import assert from "node:assert/strict";
import {
  calibrationCompleted,
  calibrationProgress,
  evaluateCalibrationSummary,
  evaluatePointValidation,
  registerCalibrationClick,
} from "../eyeTracking/calibration";

const pointsHit = new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
assert.equal(calibrationProgress(pointsHit, 9), 0.88);
assert.equal(calibrationCompleted(pointsHit, 9), false);
pointsHit.add("p9");
assert.equal(calibrationCompleted(pointsHit, 9), true);

assert.deepEqual(registerCalibrationClick(0, 3), {
  nextCount: 1,
  reachedTarget: false,
});
assert.deepEqual(registerCalibrationClick(2, 3), {
  nextCount: 3,
  reachedTarget: true,
});
assert.deepEqual(registerCalibrationClick(3, 3), {
  nextCount: 3,
  reachedTarget: true,
});

const clusteredCenterSamples = Array.from({ length: 14 }, (_, index) => ({
  x: 0.49 + (index % 2) * 0.004,
  y: 0.5 + (index % 3) * 0.003,
  t: index * 16,
  confidence: 1,
}));
const centerTarget = { id: "p5", x: 500, y: 500 };
const centerValidation = evaluatePointValidation({
  samples: clusteredCenterSamples,
  target: centerTarget,
  viewport: { width: 1000, height: 1000 },
  minSamples: 12,
  maxErrorPx: 100,
  maxSpreadPx: 90,
});
assert.equal(centerValidation.passed, true);
assert.equal(centerValidation.reasonCode, "ok");
assert.ok(centerValidation.medianErrorPx <= 15);
assert.ok(centerValidation.sampleCount >= 12);

const withOutliers = [
  ...clusteredCenterSamples,
  { x: 0.95, y: 0.9, t: 999, confidence: 1 },
  { x: 0.1, y: 0.1, t: 1000, confidence: 1 },
];
const outlierValidation = evaluatePointValidation({
  samples: withOutliers,
  target: centerTarget,
  viewport: { width: 1000, height: 1000 },
  minSamples: 12,
  maxErrorPx: 100,
  maxSpreadPx: 90,
});
assert.equal(outlierValidation.passed, true);
assert.equal(outlierValidation.reasonCode, "ok");
assert.ok(outlierValidation.usedSampleCount < withOutliers.length);

const sparseValidation = evaluatePointValidation({
  samples: clusteredCenterSamples.slice(0, 8),
  target: centerTarget,
  viewport: { width: 1000, height: 1000 },
  minSamples: 12,
  maxErrorPx: 100,
  maxSpreadPx: 90,
});
assert.equal(sparseValidation.passed, false);
assert.equal(sparseValidation.reasonCode, "insufficient_samples");

const spreadSamples = Array.from({ length: 14 }, (_, index) => ({
  x: index % 2 === 0 ? 0.3 : 0.7,
  y: index % 3 === 0 ? 0.3 : 0.7,
  t: index * 16,
  confidence: 1,
}));
const spreadValidation = evaluatePointValidation({
  samples: spreadSamples,
  target: centerTarget,
  viewport: { width: 1000, height: 1000 },
  minSamples: 12,
  maxErrorPx: 140,
  maxSpreadPx: 90,
});
assert.equal(spreadValidation.passed, false);
assert.equal(spreadValidation.reasonCode, "high_spread");

const biasedSamples = Array.from({ length: 14 }, (_, index) => ({
  x: 0.82 + (index % 2) * 0.002,
  y: 0.82 + (index % 3) * 0.002,
  t: index * 16,
  confidence: 1,
}));
const biasedValidation = evaluatePointValidation({
  samples: biasedSamples,
  target: centerTarget,
  viewport: { width: 1000, height: 1000 },
  minSamples: 12,
  maxErrorPx: 100,
  maxSpreadPx: 90,
});
assert.equal(biasedValidation.passed, false);
assert.equal(biasedValidation.reasonCode, "high_error");

const finalSummary = evaluateCalibrationSummary({
  validations: [
    {
      pointId: "p2",
      passed: true,
      sampleCount: 16,
      usedSampleCount: 14,
      medianErrorPx: 48,
      spreadPx: 42,
      medianDxPx: 22,
      medianDyPx: -12,
      reasonCode: "ok",
      target: { id: "p2", x: 500, y: 160 },
    },
    {
      pointId: "p4",
      passed: true,
      sampleCount: 16,
      usedSampleCount: 14,
      medianErrorPx: 52,
      spreadPx: 40,
      medianDxPx: 25,
      medianDyPx: -10,
      reasonCode: "ok",
      target: { id: "p4", x: 140, y: 500 },
    },
    {
      pointId: "p5",
      passed: true,
      sampleCount: 16,
      usedSampleCount: 14,
      medianErrorPx: 44,
      spreadPx: 38,
      medianDxPx: 20,
      medianDyPx: -8,
      reasonCode: "ok",
      target: { id: "p5", x: 500, y: 500 },
    },
    {
      pointId: "p6",
      passed: true,
      sampleCount: 16,
      usedSampleCount: 14,
      medianErrorPx: 58,
      spreadPx: 45,
      medianDxPx: 24,
      medianDyPx: -11,
      reasonCode: "ok",
      target: { id: "p6", x: 860, y: 500 },
    },
    {
      pointId: "p8",
      passed: false,
      sampleCount: 16,
      usedSampleCount: 14,
      medianErrorPx: 155,
      spreadPx: 52,
      medianDxPx: 90,
      medianDyPx: 120,
      reasonCode: "high_error",
      target: { id: "p8", x: 500, y: 840 },
    },
  ],
  requiredPassCount: 4,
});
assert.equal(finalSummary.passed, true);
assert.equal(finalSummary.passCount, 4);
assert.equal(finalSummary.failedPointIds.includes("p8"), true);
assert.equal(finalSummary.biasLabel, "slight_right_up");

const failingSummary = evaluateCalibrationSummary({
  validations: finalSummary.validations.map((item, index) =>
    index < 3 ? item : { ...item, passed: false, reasonCode: "high_error" as const },
  ),
  requiredPassCount: 4,
});
assert.equal(failingSummary.passed, false);
assert.equal(failingSummary.reasonCode, "insufficient_valid_points");

console.log("calibration.test.ts passed");

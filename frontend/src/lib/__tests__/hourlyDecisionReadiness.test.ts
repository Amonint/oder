/// <reference types="node" />

import assert from "node:assert/strict";
import { evaluateHourlyDecisionReadiness } from "../timeSeriesFromMeta";

assert.deepEqual(
  evaluateHourlyDecisionReadiness({
    activeHours: 8,
    totalResults: 14,
    minActiveHours: 6,
    minTotalResults: 10,
  }),
  {
    ready: true,
    failedBy: null,
  },
  "should be ready when both thresholds are met",
);

assert.deepEqual(
  evaluateHourlyDecisionReadiness({
    activeHours: 5,
    totalResults: 14,
    minActiveHours: 6,
    minTotalResults: 10,
  }),
  {
    ready: false,
    failedBy: "active_hours",
  },
  "should fail when active hours are below threshold",
);

assert.deepEqual(
  evaluateHourlyDecisionReadiness({
    activeHours: 8,
    totalResults: 9,
    minActiveHours: 6,
    minTotalResults: 10,
  }),
  {
    ready: false,
    failedBy: "total_results",
  },
  "should fail when total results are below threshold",
);

assert.deepEqual(
  evaluateHourlyDecisionReadiness({
    activeHours: 4,
    totalResults: 3,
    minActiveHours: 6,
    minTotalResults: 10,
  }),
  {
    ready: false,
    failedBy: "both",
  },
  "should report both constraints when neither threshold is met",
);

console.log("hourlyDecisionReadiness.test.ts passed");

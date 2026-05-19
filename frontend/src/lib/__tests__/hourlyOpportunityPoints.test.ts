/// <reference types="node" />

import assert from "node:assert/strict";
import { buildHourlyOpportunityPoints } from "../timeSeriesFromMeta";

const objectiveActionTypes = ["onsite_conversion.messaging_conversation_started_7d"];

const rows = [
  {
    spend: "4",
    hourly_start_time: "2026-05-12T03:00:00+0000",
    actions: [{ action_type: objectiveActionTypes[0], value: "2" }],
  },
  {
    spend: "2",
    hourly_start_time: "2026-05-13T03:00:00+0000",
    actions: [{ action_type: objectiveActionTypes[0], value: "1" }],
  },
  {
    spend: "5",
    hourly_start_time: "2026-05-13T05:00:00+0000",
    actions: [{ action_type: objectiveActionTypes[0], value: "0" }],
  },
];

const points = buildHourlyOpportunityPoints(rows, objectiveActionTypes, 2);

assert.equal(points.length, 24, "the opportunity chart should cover all 24 hours");

assert.deepEqual(
  points[3],
  {
    hour: 3,
    spend: 6,
    results: 3,
    cpa: 2,
    hasData: true,
    spendWithoutResults: false,
    reliable: true,
  },
  "hours with enough results should be marked reliable",
);

assert.deepEqual(
  points[5],
  {
    hour: 5,
    spend: 5,
    results: 0,
    cpa: null,
    hasData: true,
    spendWithoutResults: true,
    reliable: false,
  },
  "hours with spend but no results should be flagged explicitly",
);

assert.equal(points[4].hasData, false, "hours without rows should remain empty");

console.log("hourlyOpportunityPoints.test.ts passed");

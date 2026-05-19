/// <reference types="node" />

import assert from "node:assert/strict";
import {
  buildHourlyCpaByHour,
  shouldUseHourlyOnlyView,
} from "../timeSeriesFromMeta";

const objectiveActionTypes = ["onsite_conversion.messaging_conversation_started_7d"];

const rowsWithoutPerRowDate = [
  {
    date_start: "2026-05-12",
    spend: "10",
    hourly_stats_aggregated_by_advertiser_time_zone: "00:00:00",
    actions: [{ action_type: objectiveActionTypes[0], value: "2" }],
  },
  {
    date_start: "2026-05-12",
    spend: "6",
    hourly_stats_aggregated_by_advertiser_time_zone: "01:00:00",
    actions: [{ action_type: objectiveActionTypes[0], value: "0" }],
  },
];

assert.equal(
  shouldUseHourlyOnlyView(rowsWithoutPerRowDate),
  true,
  "rows without a per-row date should fall back to hourly-only view",
);

assert.deepEqual(
  buildHourlyCpaByHour(rowsWithoutPerRowDate, objectiveActionTypes),
  [
    { hour: 0, spend: 10, results: 2, cpa: 5 },
    { hour: 1, spend: 6, results: 0, cpa: null },
  ],
  "hour-only aggregation should preserve hourly spend and results",
);

const rowsWithPerRowDate = [
  {
    spend: "8",
    hourly_start_time: "2026-05-12T10:00:00+0000",
    actions: [{ action_type: objectiveActionTypes[0], value: "4" }],
  },
  {
    spend: "4",
    hourly_start_time: "2026-05-13T10:00:00+0000",
    actions: [{ action_type: objectiveActionTypes[0], value: "1" }],
  },
];

assert.equal(
  shouldUseHourlyOnlyView(rowsWithPerRowDate),
  false,
  "rows with explicit dates in the hourly slot should keep the weekday view",
);

console.log("hourlyHeatmapMode.test.ts passed");

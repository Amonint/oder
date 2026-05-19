/// <reference types="node" />

import assert from "node:assert/strict";
import { resolvePageDateFilter } from "../pageDateFilter";

const TODAY = "2026-05-18";

assert.deepEqual(
  resolvePageDateFilter({
    datePreset: "today",
    todayIso: TODAY,
  }),
  {
    requestParams: { datePreset: "today" },
    calendarWindow: { dateStart: TODAY, dateStop: TODAY },
    compareAgainstPreviousPeriod: true,
  },
  "today should be sent as date_preset while keeping an explicit calendar window for charts",
);

assert.deepEqual(
  resolvePageDateFilter({
    datePreset: "last_30d",
    todayIso: TODAY,
  }),
  {
    requestParams: { datePreset: "last_30d" },
    calendarWindow: { dateStart: "2026-04-19", dateStop: "2026-05-18" },
    compareAgainstPreviousPeriod: true,
  },
  "last_30d should preserve backend preset semantics and still expose the 30-day chart window",
);

assert.deepEqual(
  resolvePageDateFilter({
    datePreset: "custom",
    customDateStart: "2026-05-01",
    customDateStop: "2026-05-10",
    todayIso: TODAY,
  }),
  {
    requestParams: { dateStart: "2026-05-01", dateStop: "2026-05-10" },
    calendarWindow: { dateStart: "2026-05-01", dateStop: "2026-05-10" },
    compareAgainstPreviousPeriod: true,
  },
  "custom should use explicit dates everywhere once both bounds exist",
);

assert.deepEqual(
  resolvePageDateFilter({
    datePreset: "maximum",
    todayIso: TODAY,
  }),
  {
    requestParams: { datePreset: "maximum" },
    calendarWindow: null,
    compareAgainstPreviousPeriod: false,
  },
  "maximum should stay as preset and disable previous-period comparison",
);

console.log("pageDateFilter.test.ts passed");

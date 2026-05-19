/// <reference types="node" />

import assert from "node:assert/strict";
import {
  buildMessagingFunnelSteps,
  shouldShowControlChart,
  shouldShowCreativeDiagnostics,
  shouldShowPeriodComparison,
  shouldShowTrafficQualityTimeseries,
} from "../pageDashboardDecisions";

assert.equal(
  shouldShowPeriodComparison({
    loadedCurrentDays: 3,
    loadedPreviousDays: 7,
    totalCurrentDays: 30,
  }),
  false,
  "comparison should stay hidden when coverage is too low",
);

assert.equal(
  shouldShowPeriodComparison({
    loadedCurrentDays: 24,
    loadedPreviousDays: 22,
    totalCurrentDays: 30,
  }),
  true,
  "comparison should render when both periods clear the coverage threshold",
);

assert.equal(
  shouldShowControlChart([
    { cpa: 2 },
    { cpa: 3 },
    { cpa: 4 },
    { cpa: 5 },
    { cpa: 6 },
    { cpa: 7 },
  ]),
  false,
  "control chart should require at least seven valid daily CPA points",
);

assert.equal(
  shouldShowTrafficQualityTimeseries([
    { outbound_clicks: 1 },
    { outbound_clicks: 2 },
    { outbound_clicks: 1 },
  ]),
  false,
  "traffic quality series should stay hidden when outbound volume is negligible",
);

assert.equal(
  shouldShowTrafficQualityTimeseries([
    { outbound_clicks: 2 },
    { outbound_clicks: 3 },
    { outbound_clicks: 2 },
  ]),
  true,
  "traffic quality series should show once outbound volume is meaningful",
);

assert.equal(
  shouldShowCreativeDiagnostics([{ ad_id: "1" }, { ad_id: "2" }]),
  false,
  "creative diagnostics should require at least three comparable ads",
);

assert.deepEqual(
  buildMessagingFunnelSteps({
    impressions: 1000,
    unique_clicks: 60,
    outbound_clicks: 25,
    conversations_started: 8,
    first_replies: 3,
    depth2: 0,
    depth3: 0,
    depth5: 0,
  }),
  [
    { label: "Impresiones", value: 1000, sub: "Veces mostrado" },
    { label: "Clics salientes", value: 25, sub: "Salida desde Meta" },
    { label: "Conversaciones", value: 8, sub: "Mensajes iniciados (Meta)" },
  ],
  "funnel should prefer outbound clicks when they exist",
);

assert.deepEqual(
  buildMessagingFunnelSteps({
    impressions: 1000,
    unique_clicks: 60,
    outbound_clicks: 0,
    conversations_started: 8,
    first_replies: 3,
    depth2: 0,
    depth3: 0,
    depth5: 0,
  }),
  [
    { label: "Impresiones", value: 1000, sub: "Veces mostrado" },
    { label: "Clics únicos", value: 60, sub: "Personas que hicieron clic" },
    { label: "Conversaciones", value: 8, sub: "Mensajes iniciados (Meta)" },
  ],
  "funnel should fall back to unique clicks when outbound is unavailable",
);

console.log("pageDashboardDecisions.test.ts passed");

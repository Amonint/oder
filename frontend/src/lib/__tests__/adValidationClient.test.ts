/// <reference types="node" />
import assert from "node:assert/strict";
import { buildParticipantSessionPayload } from "../../api/adValidation";

const payload = buildParticipantSessionPayload({
  participantId: "anon-123",
  deviceType: "desktop",
  browser: "Chrome",
  calibrationScore: 0.83,
});

assert.equal(payload.participant_id, "anon-123");
assert.equal(payload.calibration_score, 0.83);
console.log("adValidationClient.test.ts passed");

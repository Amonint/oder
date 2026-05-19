/// <reference types="node" />
import assert from "node:assert/strict";
import { createWebGazerClient } from "../eyeTracking/webgazerClient";

type ToggleName =
  | "showVideoPreview"
  | "showVideo"
  | "showFaceOverlay"
  | "showFaceFeedbackBox"
  | "showPredictionPoints"
  | "showGazeDot";

const toggleCalls: Array<{ name: ToggleName; value: boolean }> = [];
let beginSawPreviewEnabled = false;

const videoFeed = {
  id: "webgazerVideoFeed",
  readyState: 4,
  videoWidth: 640,
  videoHeight: 480,
  paused: false,
  currentTime: 12.5,
};

const elementById = new Map<string, unknown>([
  ["webgazerVideoFeed", videoFeed],
  ["webgazerFaceOverlay", { id: "webgazerFaceOverlay" }],
  ["webgazerFaceFeedbackBox", { id: "webgazerFaceFeedbackBox" }],
  ["webgazerGazeDot", { id: "webgazerGazeDot" }],
]);

const documentStub = {
  getElementById(id: string) {
    return elementById.get(id) ?? null;
  },
  createElement() {
    return {};
  },
  head: {
    appendChild() {},
  },
};

function mountDebugDom(): void {
  elementById.set("webgazerVideoFeed", videoFeed);
  elementById.set("webgazerFaceOverlay", { id: "webgazerFaceOverlay" });
  elementById.set("webgazerFaceFeedbackBox", { id: "webgazerFaceFeedbackBox" });
  elementById.set("webgazerGazeDot", { id: "webgazerGazeDot" });
}

function clearDebugDom(): void {
  elementById.delete("webgazerVideoFeed");
  elementById.delete("webgazerFaceOverlay");
  elementById.delete("webgazerFaceFeedbackBox");
  elementById.delete("webgazerGazeDot");
}

clearDebugDom();

const windowStub = {
  innerWidth: 1000,
  innerHeight: 500,
  setTimeout,
  webgazer: {
    params: {
      showVideoPreview: false,
    },
    setGazeListener() {
      return this;
    },
    showVideoPreview(value: boolean) {
      toggleCalls.push({ name: "showVideoPreview", value });
      return this;
    },
    showVideo(value: boolean) {
      toggleCalls.push({ name: "showVideo", value });
      return this;
    },
    showFaceOverlay(value: boolean) {
      toggleCalls.push({ name: "showFaceOverlay", value });
      return this;
    },
    showFaceFeedbackBox(value: boolean) {
      toggleCalls.push({ name: "showFaceFeedbackBox", value });
      return this;
    },
    showPredictionPoints(value: boolean) {
      toggleCalls.push({ name: "showPredictionPoints", value });
      return this;
    },
    showGazeDot(value: boolean) {
      toggleCalls.push({ name: "showGazeDot", value });
      return this;
    },
    recordScreenPosition() {
      return this;
    },
    clearData() {
      return Promise.resolve();
    },
    getCurrentPrediction() {
      return Promise.resolve({ x: 250, y: 100 });
    },
    begin() {
      beginSawPreviewEnabled = this.params.showVideoPreview === true;
      if (beginSawPreviewEnabled) {
        mountDebugDom();
      }
      return Promise.resolve(this);
    },
    end() {
      return Promise.resolve(this);
    },
    isReady() {
      return beginSawPreviewEnabled;
    },
  },
};

Object.assign(globalThis, {
  window: windowStub,
  document: documentStub,
});

const client = createWebGazerClient();
await client.ensureReady();
await client.start();
client.setCalibrationVisualMode(true);
const snapshot = client.getDebugSnapshot() as unknown as Record<string, unknown>;
const methodSupport = snapshot.methodSupport as Record<string, unknown>;
const dom = snapshot.dom as Record<string, unknown>;

assert.equal(methodSupport.showGazeDot, true);
assert.equal(beginSawPreviewEnabled, true);
assert.equal(dom.videoPresent, true);
assert.equal(dom.videoReadyState, 4);
assert.equal(dom.videoWidth, 640);
assert.equal(dom.videoHeight, 480);
assert.equal(dom.gazeDotPresent, true);
assert.equal(
  toggleCalls.some((call) => call.name === "showGazeDot" && call.value === true),
  true,
);

const sampled = await client.sampleCurrentPrediction();
assert.deepEqual(sampled, {
  x: 0.25,
  y: 0.2,
  t: sampled?.t,
  confidence: 1,
});

console.log("webgazerClient.test.ts passed");

/// <reference types="node" />
import assert from "node:assert/strict";
import { intensityToRgba } from "../heatmap/heatmapRenderer";

assert.equal(intensityToRgba(0), "rgba(0,0,255,0.00)");
assert.equal(intensityToRgba(0.5), "rgba(255,165,0,0.50)");
assert.equal(intensityToRgba(1), "rgba(255,0,0,0.85)");
console.log("heatmapRenderer.test.ts passed");

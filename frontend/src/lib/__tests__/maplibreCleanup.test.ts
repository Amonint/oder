/// <reference types="node" />

import assert from "node:assert/strict";
import { clearMapArtifactsSafely } from "../maplibreCleanup";

{
  let touchedLayerApi = false;
  const removedMap = {
    getStyle: () => undefined,
    getLayer: (_id: string) => {
      touchedLayerApi = true;
      throw new Error("getLayer should not run without an active style");
    },
    removeLayer: (_id: string) => {
      touchedLayerApi = true;
    },
    getSource: (_id: string) => {
      touchedLayerApi = true;
      return undefined;
    },
    removeSource: (_id: string) => {
      touchedLayerApi = true;
    },
  };

  assert.doesNotThrow(() =>
    clearMapArtifactsSafely(removedMap, {
      layerIds: ["ecuador-provinces-fill", "ecuador-provinces-outline"],
      sourceId: "ecuador-provinces-source",
    }),
  );
  assert.equal(
    touchedLayerApi,
    false,
    "cleanup should exit before touching layer APIs when style is already gone",
  );
}

{
  const removed: string[] = [];
  const activeMap = {
    getStyle: () => ({ version: 8 }),
    getLayer: (id: string) => (id === "fill" ? { id } : undefined),
    removeLayer: (id: string) => {
      removed.push(`layer:${id}`);
    },
    getSource: (id: string) => (id === "source" ? { id } : undefined),
    removeSource: (id: string) => {
      removed.push(`source:${id}`);
    },
  };

  clearMapArtifactsSafely(activeMap, {
    layerIds: ["fill", "outline"],
    sourceId: "source",
  });

  assert.deepEqual(removed, ["layer:fill", "source:source"]);
}

console.log("maplibreCleanup.test.ts passed");

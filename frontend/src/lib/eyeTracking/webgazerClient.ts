export interface GazePoint {
  x: number;
  y: number;
  t: number;
  confidence: number;
}

export type TrackingMode = "ready" | "partial" | "fallback";

export interface WebGazerDebugSnapshot {
  mode: TrackingMode;
  running: boolean;
  listenerBound: boolean;
  methodSupport: {
    showVideoPreview: boolean;
    showVideo: boolean;
    showFaceOverlay: boolean;
    showFaceFeedbackBox: boolean;
    showPredictionPoints: boolean;
    showGazeDot: boolean;
    getCurrentPrediction: boolean;
    recordScreenPosition: boolean;
    clearData: boolean;
  };
  dom: {
    videoPresent: boolean;
    videoReadyState: number | null;
    videoWidth: number | null;
    videoHeight: number | null;
    videoPaused: boolean | null;
    videoCurrentTime: number | null;
    faceOverlayPresent: boolean;
    faceFeedbackPresent: boolean;
    gazeDotPresent: boolean;
  };
  counters: {
    listenerFrames: number;
    listenerPoints: number;
    listenerNullFrames: number;
    flushCalls: number;
    flushPointsTotal: number;
    sampleCalls: number;
    sampleSuccess: number;
    sampleNull: number;
    sampleTimeout: number;
    sampleErrors: number;
  };
  lastSampleReason: string;
  lastError: string;
}

export interface WebGazerClient {
  isAvailable: boolean;
  start: () => Promise<TrackingMode>;
  stop: () => Promise<void>;
  flush: () => GazePoint[];
  sampleCurrentPrediction: () => Promise<GazePoint | null>;
  getDebugSnapshot: () => WebGazerDebugSnapshot;
  ensureReady: () => Promise<TrackingMode>;
  recordCalibrationPoint: (x: number, y: number) => void;
  resetCalibration: () => Promise<void>;
  setSessionPersistence: (enabled: boolean) => void;
  setCalibrationVisualMode: (enabled: boolean) => void;
}

type ToggleFn = (show: boolean) => unknown;

type WindowWithWebGazer = Window & {
  webgazer?: {
    params?: {
      showVideoPreview?: boolean;
    };
    setGazeListener: (
      cb: (data: { x: number; y: number } | null, timestamp: number) => void,
    ) => unknown;
    showVideoPreview?: ToggleFn;
    showPredictionPoints?: ToggleFn;
    showVideo?: ToggleFn;
    showFaceOverlay?: ToggleFn;
    showFaceFeedbackBox?: ToggleFn;
    showGazeDot?: ToggleFn;
    stopVideo?: () => unknown;
    recordScreenPosition?: (x: number, y: number, eventType?: string) => unknown;
    saveDataAcrossSessions?: (enabled: boolean) => unknown;
    clearData?: () => Promise<unknown> | unknown;
    getCurrentPrediction?: () => Promise<{ x: number; y: number } | null>;
    isReady?: () => boolean;
    begin: () => Promise<unknown>;
    end: () => Promise<unknown> | unknown;
  };
};

const WEBGAZER_SCRIPT_ID = "oderbiz-webgazer-script";
const WEBGAZER_CDN =
  "https://cdn.jsdelivr.net/npm/webgazer@2.0.1/dist/webgazer.min.js";
const DEBUG_PREFIX = "[ad-validation][webgazer]";

async function ensureWebGazerLoaded(): Promise<boolean> {
  const win = window as WindowWithWebGazer;
  if (win.webgazer) return true;

  const existing = document.getElementById(
    WEBGAZER_SCRIPT_ID,
  ) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve) => {
      if ((window as WindowWithWebGazer).webgazer) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
    });
    return Boolean((window as WindowWithWebGazer).webgazer);
  }

  await new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.id = WEBGAZER_SCRIPT_ID;
    script.src = WEBGAZER_CDN;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return Boolean((window as WindowWithWebGazer).webgazer);
}

function hasCoreMethods(
  webgazer: WindowWithWebGazer["webgazer"],
): webgazer is NonNullable<WindowWithWebGazer["webgazer"]> {
  return Boolean(
    webgazer &&
      typeof webgazer.setGazeListener === "function" &&
      typeof webgazer.begin === "function",
  );
}

function isFn<T extends (...args: never[]) => unknown>(
  value: unknown,
): value is T {
  return typeof value === "function";
}

function applyWebGazerDebugUi(
  webgazer: NonNullable<WindowWithWebGazer["webgazer"]>,
  enabled: boolean,
): TrackingMode {
  let usedAnyToggle = false;

  if (isFn<ToggleFn>(webgazer.showVideoPreview)) {
    webgazer.showVideoPreview(enabled);
    usedAnyToggle = true;
  }
  if (isFn<ToggleFn>(webgazer.showVideo)) {
    webgazer.showVideo(enabled);
    usedAnyToggle = true;
  }
  if (isFn<ToggleFn>(webgazer.showFaceOverlay)) {
    webgazer.showFaceOverlay(enabled);
    usedAnyToggle = true;
  }
  if (isFn<ToggleFn>(webgazer.showFaceFeedbackBox)) {
    webgazer.showFaceFeedbackBox(enabled);
    usedAnyToggle = true;
  }

  if (isFn<ToggleFn>(webgazer.showPredictionPoints)) {
    webgazer.showPredictionPoints(enabled);
    usedAnyToggle = true;
  }
  if (isFn<ToggleFn>(webgazer.showGazeDot)) {
    webgazer.showGazeDot(enabled);
    usedAnyToggle = true;
  }

  if (usedAnyToggle) return "partial";
  return "partial";
}

function readDomDiagnostics(): WebGazerDebugSnapshot["dom"] {
  const video = document.getElementById("webgazerVideoFeed") as
    | HTMLVideoElement
    | null;
  return {
    videoPresent: Boolean(video),
    videoReadyState: typeof video?.readyState === "number" ? video.readyState : null,
    videoWidth: typeof video?.videoWidth === "number" ? video.videoWidth : null,
    videoHeight: typeof video?.videoHeight === "number" ? video.videoHeight : null,
    videoPaused: typeof video?.paused === "boolean" ? video.paused : null,
    videoCurrentTime:
      typeof video?.currentTime === "number" ? Number(video.currentTime) : null,
    faceOverlayPresent: Boolean(document.getElementById("webgazerFaceOverlay")),
    faceFeedbackPresent: Boolean(document.getElementById("webgazerFaceFeedbackBox")),
    gazeDotPresent: Boolean(document.getElementById("webgazerGazeDot")),
  };
}

async function waitForTrackerReady(
  webgazer: NonNullable<WindowWithWebGazer["webgazer"]>,
  timeoutMs = 4000,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const dom = readDomDiagnostics();
    const readyFromApi = isFn<() => boolean>(webgazer.isReady)
      ? webgazer.isReady()
      : false;
    const readyFromDom =
      dom.videoPresent &&
      (dom.videoReadyState ?? 0) > 0 &&
      (dom.videoWidth ?? 0) > 0 &&
      (dom.videoHeight ?? 0) > 0;
    if (readyFromApi || readyFromDom) {
      return true;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100);
    });
  }
  return false;
}

export function createWebGazerClient(): WebGazerClient {
  const points: GazePoint[] = [];
  let trackingMode: TrackingMode = "fallback";
  let running = false;
  let listenerBound = false;
  let lastSampleReason = "none";
  let lastError = "";
  const counters = {
    listenerFrames: 0,
    listenerPoints: 0,
    listenerNullFrames: 0,
    flushCalls: 0,
    flushPointsTotal: 0,
    sampleCalls: 0,
    sampleSuccess: 0,
    sampleNull: 0,
    sampleTimeout: 0,
    sampleErrors: 0,
  };
  const methodSupport = {
    showVideoPreview: false,
    showVideo: false,
    showFaceOverlay: false,
    showFaceFeedbackBox: false,
    showPredictionPoints: false,
    showGazeDot: false,
    getCurrentPrediction: false,
    recordScreenPosition: false,
    clearData: false,
  };

  function logDebug(message: string, details?: unknown): void {
    if (details !== undefined) {
      console.debug(`${DEBUG_PREFIX} ${message}`, details);
      return;
    }
    console.debug(`${DEBUG_PREFIX} ${message}`);
  }

  function getWebgazer(): WindowWithWebGazer["webgazer"] {
    return (window as WindowWithWebGazer).webgazer;
  }

  function refreshMethodSupport(webgazer: WindowWithWebGazer["webgazer"]): void {
    methodSupport.showVideoPreview = Boolean(webgazer && isFn(webgazer.showVideoPreview));
    methodSupport.showVideo = Boolean(webgazer && isFn(webgazer.showVideo));
    methodSupport.showFaceOverlay = Boolean(webgazer && isFn(webgazer.showFaceOverlay));
    methodSupport.showFaceFeedbackBox = Boolean(
      webgazer && isFn(webgazer.showFaceFeedbackBox),
    );
    methodSupport.showPredictionPoints = Boolean(
      webgazer && isFn(webgazer.showPredictionPoints),
    );
    methodSupport.showGazeDot = Boolean(webgazer && isFn(webgazer.showGazeDot));
    methodSupport.getCurrentPrediction = Boolean(
      webgazer && isFn(webgazer.getCurrentPrediction),
    );
    methodSupport.recordScreenPosition = Boolean(
      webgazer && isFn(webgazer.recordScreenPosition),
    );
    methodSupport.clearData = Boolean(webgazer && isFn(webgazer.clearData));
  }

  return {
    isAvailable: Boolean(getWebgazer()),
    ensureReady: async () => {
      const loaded = await ensureWebGazerLoaded();
      const webgazer = getWebgazer();
      refreshMethodSupport(webgazer);
      if (!loaded || !hasCoreMethods(webgazer)) {
        trackingMode = "fallback";
        logDebug("ensureReady fallback", { loaded, hasCoreMethods: false, methodSupport });
        return trackingMode;
      }
      trackingMode = applyWebGazerDebugUi(webgazer, false);
      logDebug("ensureReady success", { loaded, mode: trackingMode, methodSupport });
      return trackingMode;
    },
    start: async () => {
      if (trackingMode === "fallback") {
        await ensureWebGazerLoaded();
      }
      const webgazer = getWebgazer();
      refreshMethodSupport(webgazer);
      if (!hasCoreMethods(webgazer)) {
        trackingMode = "fallback";
        logDebug("start fallback: missing core methods", { methodSupport });
        return trackingMode;
      }
      if (trackingMode === "fallback") {
        trackingMode = applyWebGazerDebugUi(webgazer, false);
      }
      if (!listenerBound) {
        webgazer.setGazeListener((data, timestamp) => {
          counters.listenerFrames += 1;
          if (!data || window.innerWidth <= 0 || window.innerHeight <= 0) {
            counters.listenerNullFrames += 1;
            if (counters.listenerNullFrames % 90 === 0) {
              logDebug("listener null frames rising", {
                listenerNullFrames: counters.listenerNullFrames,
                listenerFrames: counters.listenerFrames,
              });
            }
            return;
          }
          points.push({
            x: Math.max(0, Math.min(1, data.x / window.innerWidth)),
            y: Math.max(0, Math.min(1, data.y / window.innerHeight)),
            t: Math.max(0, Math.floor(timestamp)),
            confidence: 1,
          });
          counters.listenerPoints += 1;
        });
        listenerBound = true;
        logDebug("setGazeListener bound");
      }
      if (!running) {
        if (webgazer.params) {
          webgazer.params.showVideoPreview = true;
        }
        await webgazer.begin();
        const trackerReady = await waitForTrackerReady(webgazer);
        running = true;
        logDebug("webgazer.begin resolved", {
          mode: trackingMode,
          trackerReady,
          dom: readDomDiagnostics(),
        });
      }
      return trackingMode;
    },
    stop: async () => {
      const webgazer = getWebgazer();
      if (!webgazer) return;
      if (running) {
        await webgazer.end();
        running = false;
        logDebug("webgazer.end resolved");
      }
      if (isFn<() => unknown>(webgazer.stopVideo)) {
        webgazer.stopVideo();
      }
    },
    recordCalibrationPoint: (x: number, y: number) => {
      const webgazer = getWebgazer();
      if (!webgazer || !isFn(webgazer.recordScreenPosition)) return;
      webgazer.recordScreenPosition(x, y, "click");
    },
    resetCalibration: async () => {
      const webgazer = getWebgazer();
      if (!webgazer || !isFn(webgazer.clearData)) return;
      await webgazer.clearData();
    },
    setSessionPersistence: (enabled: boolean) => {
      const webgazer = getWebgazer();
      if (!webgazer || !isFn(webgazer.saveDataAcrossSessions)) return;
      webgazer.saveDataAcrossSessions(enabled);
    },
    setCalibrationVisualMode: (enabled: boolean) => {
      const webgazer = getWebgazer();
      if (!hasCoreMethods(webgazer)) return;
      trackingMode = applyWebGazerDebugUi(webgazer, enabled);
      logDebug("setCalibrationVisualMode", { enabled, mode: trackingMode });
    },
    flush: () => {
      const out = [...points];
      points.length = 0;
      counters.flushCalls += 1;
      counters.flushPointsTotal += out.length;
      logDebug("flush", { points: out.length, flushCalls: counters.flushCalls });
      return out;
    },
    sampleCurrentPrediction: async () => {
      const webgazer = getWebgazer();
      counters.sampleCalls += 1;
      if (!webgazer || !isFn(webgazer.getCurrentPrediction)) {
        counters.sampleErrors += 1;
        lastSampleReason = "unsupported_getCurrentPrediction";
        return null;
      }
      const timeoutMs = 350;
      const timeoutMarker = "__prediction_timeout__" as const;
      const prediction = await Promise.race<
        { x: number; y: number } | null | typeof timeoutMarker
      >([
        webgazer.getCurrentPrediction(),
        new Promise<typeof timeoutMarker>((resolve) => {
          window.setTimeout(() => resolve(timeoutMarker), timeoutMs);
        }),
      ]).catch((err: unknown) => {
        counters.sampleErrors += 1;
        lastSampleReason = "prediction_exception";
        lastError = err instanceof Error ? err.message : String(err);
        return null;
      });
      if (prediction === timeoutMarker) {
        counters.sampleTimeout += 1;
        lastSampleReason = "prediction_timeout";
        return null;
      }
      if (!prediction || window.innerWidth <= 0 || window.innerHeight <= 0) {
        counters.sampleNull += 1;
        lastSampleReason = "prediction_null";
        return null;
      }
      counters.sampleSuccess += 1;
      lastSampleReason = "prediction_ok";
      return {
        x: Math.max(0, Math.min(1, prediction.x / window.innerWidth)),
        y: Math.max(0, Math.min(1, prediction.y / window.innerHeight)),
        t: Date.now(),
        confidence: 1,
      };
    },
    getDebugSnapshot: () => ({
      mode: trackingMode,
      running,
      listenerBound,
      methodSupport: { ...methodSupport },
      dom: readDomDiagnostics(),
      counters: { ...counters },
      lastSampleReason,
      lastError,
    }),
  };
}

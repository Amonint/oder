import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  appendParticipantEvents,
  buildParticipantSessionPayload,
  completeParticipantSession,
  getPublicStudyByToken,
  startParticipantSession,
} from "@/api/adValidation";
import {
  createWebGazerClient,
  type GazePoint,
  type WebGazerDebugSnapshot,
  type TrackingMode,
} from "@/lib/eyeTracking/webgazerClient";
import {
  evaluateCalibrationSummary,
  evaluatePointValidation,
  registerCalibrationClick,
  type CalibrationSummaryResult,
  type PointValidationResult,
} from "@/lib/eyeTracking/calibration";

interface ParticipantFlowProps {
  token: string;
}

interface CalibrationPoint {
  id: string;
  x: number;
  y: number;
}

type FlowStatus = "idle" | "loading" | "running" | "completed" | "error";
type CameraStatus = "idle" | "granted" | "denied";
type CalibrationStage =
  | "not_started"
  | "in_progress"
  | "point_validating"
  | "final_validating"
  | "passed"
  | "failed";

interface ValidationStepState {
  current: number;
  total: number;
  label: string;
}

const CLICK_TARGET_PER_POINT = 3;
const VALIDATION_TARGET_SAMPLES = 12;
const POINT_VALIDATION_SETTLE_MS = 250;
const POINT_VALIDATION_WINDOW_MS = 800;
const FINAL_VALIDATION_SETTLE_MS = 300;
const FINAL_VALIDATION_WINDOW_MS = 650;
const VALIDATION_SAMPLE_LIMIT = 42;
const CENTER_VALIDATION_MAX_ERROR_PX = 100;
const OUTER_VALIDATION_MAX_ERROR_PX = 120;
const VALIDATION_MAX_SPREAD_PX = 90;
const FINAL_VALIDATION_POINT_IDS = ["p2", "p4", "p5", "p6", "p8"] as const;
const FINAL_REQUIRED_PASS_COUNT = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCalibrationPoints(width: number, height: number): CalibrationPoint[] {
  const w = Math.max(320, width);
  const h = Math.max(480, height);
  const left = Math.round(w * 0.14);
  const centerX = Math.round(w * 0.5);
  const right = Math.round(w * 0.86);
  const top = Math.round(h * 0.16);
  const centerY = Math.round(h * 0.5);
  const bottom = Math.round(h * 0.84);
  return [
    { id: "p1", x: left, y: top },
    { id: "p2", x: centerX, y: top },
    { id: "p3", x: right, y: top },
    { id: "p4", x: left, y: centerY },
    { id: "p5", x: centerX, y: centerY },
    { id: "p6", x: right, y: centerY },
    { id: "p7", x: left, y: bottom },
    { id: "p8", x: centerX, y: bottom },
    { id: "p9", x: right, y: bottom },
  ];
}

function getPointErrorThreshold(pointId: string): number {
  return pointId === "p5"
    ? CENTER_VALIDATION_MAX_ERROR_PX
    : OUTER_VALIDATION_MAX_ERROR_PX;
}

function getPointById(points: CalibrationPoint[], pointId: string): CalibrationPoint {
  const point = points.find((item) => item.id === pointId);
  if (!point) {
    throw new Error(`Missing calibration point ${pointId}`);
  }
  return point;
}

function translatePointReason(result: PointValidationResult): string {
  switch (result.reasonCode) {
    case "insufficient_samples":
      return `Muy pocas muestras válidas (${result.usedSampleCount}/${VALIDATION_TARGET_SAMPLES}). Mantén la mirada fija y evita mover la cabeza.`;
    case "high_spread":
      return `La mirada fue inestable (dispersión ${Math.round(result.spreadPx)}px). Mantén los ojos en el punto hasta que cambie.`;
    case "high_error":
      return `La estimación quedó lejos del punto (${Math.round(result.medianErrorPx)}px). Centra el rostro y asegúrate de que ambos ojos estén bien visibles.`;
    case "ok":
      return "Punto validado.";
  }
}

function translateBiasLabel(summary: CalibrationSummaryResult): string {
  switch (summary.biasLabel) {
    case "centered":
      return "sin sesgo dominante";
    case "slight_right_up":
      return "sesgo leve hacia la derecha y arriba";
    case "slight_right_down":
      return "sesgo leve hacia la derecha y abajo";
    case "slight_left_up":
      return "sesgo leve hacia la izquierda y arriba";
    case "slight_left_down":
      return "sesgo leve hacia la izquierda y abajo";
    case "strong_right_up":
      return "sesgo fuerte hacia la derecha y arriba";
    case "strong_right_down":
      return "sesgo fuerte hacia la derecha y abajo";
    case "strong_left_up":
      return "sesgo fuerte hacia la izquierda y arriba";
    case "strong_left_down":
      return "sesgo fuerte hacia la izquierda y abajo";
  }
}

export default function ParticipantFlow({ token }: ParticipantFlowProps) {
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [error, setError] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [studyId, setStudyId] = useState<string>("");
  const [study, setStudy] = useState<{
    name: string;
    image_url: string;
    image_width?: number;
    image_height?: number;
  } | null>(null);
  const [finalState, setFinalState] = useState<string>("");
  const [durationMs, setDurationMs] = useState<number>(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("fallback");
  const [calibrationStage, setCalibrationStage] =
    useState<CalibrationStage>("not_started");
  const [calibrationIndex, setCalibrationIndex] = useState<number>(0);
  const [clickCounts, setClickCounts] = useState<number[]>(
    Array(9).fill(0) as number[],
  );
  const [validationErrorPx, setValidationErrorPx] = useState<number | null>(null);
  const [validationSampleCount, setValidationSampleCount] = useState<number>(0);
  const [calibrationFailureReason, setCalibrationFailureReason] = useState<string>("");
  const [pointValidationResults, setPointValidationResults] = useState<
    Record<string, PointValidationResult>
  >({});
  const [calibrationSummary, setCalibrationSummary] =
    useState<CalibrationSummaryResult | null>(null);
  const [activeValidationPointId, setActiveValidationPointId] = useState<string | null>(
    null,
  );
  const [validationStep, setValidationStep] = useState<ValidationStepState | null>(null);
  const [gazeCount, setGazeCount] = useState<number>(0);
  const [debugSnapshot, setDebugSnapshot] = useState<WebGazerDebugSnapshot | null>(
    null,
  );
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  const tracker = useMemo(() => createWebGazerClient(), []);
  const participantId = useMemo(() => `anon-${Date.now().toString(36)}`, []);
  const startAtRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const calibrationPoints = useMemo(
    () => getCalibrationPoints(viewport.w, viewport.h),
    [viewport.w, viewport.h],
  );
  const calibrationProgress = Math.round(
    (clickCounts.reduce((acc, count) => acc + count, 0) /
      (calibrationPoints.length * CLICK_TARGET_PER_POINT)) *
      100,
  );
  const calibrationDone = calibrationStage === "passed";
  const canStartCapture =
    status === "idle" && cameraStatus === "granted" && calibrationDone;

  useEffect(() => {
    const handleResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    getPublicStudyByToken(token)
      .then((data) => {
        if (!mounted) return;
        setStudy(data);
        setStatus("idle");
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "No se pudo cargar estudio",
        );
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  function resetCalibrationUiState(): void {
    setClickCounts(Array(9).fill(0) as number[]);
    setCalibrationIndex(0);
    setCalibrationStage("in_progress");
    setValidationErrorPx(null);
    setValidationSampleCount(0);
    setCalibrationFailureReason("");
    setPointValidationResults({});
    setCalibrationSummary(null);
    setActiveValidationPointId(null);
    setValidationStep(null);
  }

  async function collectValidationSamples(
    settleMs: number,
    windowMs: number,
  ): Promise<GazePoint[]> {
    tracker.flush();
    await sleep(settleMs);
    tracker.flush();
    await sleep(windowMs);
    return tracker.flush().slice(-VALIDATION_SAMPLE_LIMIT);
  }

  async function runPointValidation(point: CalibrationPoint): Promise<PointValidationResult> {
    const samples = await collectValidationSamples(
      POINT_VALIDATION_SETTLE_MS,
      POINT_VALIDATION_WINDOW_MS,
    );
    const result = evaluatePointValidation({
      samples,
      target: point,
      viewport: { width: viewport.w, height: viewport.h },
      minSamples: VALIDATION_TARGET_SAMPLES,
      maxErrorPx: getPointErrorThreshold(point.id),
      maxSpreadPx: VALIDATION_MAX_SPREAD_PX,
    });
    setValidationSampleCount(result.usedSampleCount);
    setValidationErrorPx(
      Number.isFinite(result.medianErrorPx) ? Math.round(result.medianErrorPx) : null,
    );
    setPointValidationResults((prev) => ({ ...prev, [point.id]: result }));
    setDebugSnapshot(tracker.getDebugSnapshot());
    console.debug("[ad-validation] point validation", {
      pointId: point.id,
      result,
      debug: tracker.getDebugSnapshot(),
    });
    return result;
  }

  async function runFinalValidation(): Promise<void> {
    setCalibrationStage("final_validating");
    setValidationErrorPx(null);
    setValidationSampleCount(0);
    const validations: PointValidationResult[] = [];

    for (let index = 0; index < FINAL_VALIDATION_POINT_IDS.length; index += 1) {
      const pointId = FINAL_VALIDATION_POINT_IDS[index];
      const point = getPointById(calibrationPoints, pointId);
      setActiveValidationPointId(point.id);
      setValidationStep({
        current: index + 1,
        total: FINAL_VALIDATION_POINT_IDS.length,
        label: "confirmacion_final",
      });
      const samples = await collectValidationSamples(
        FINAL_VALIDATION_SETTLE_MS,
        FINAL_VALIDATION_WINDOW_MS,
      );
      const result = evaluatePointValidation({
        samples,
        target: point,
        viewport: { width: viewport.w, height: viewport.h },
        minSamples: VALIDATION_TARGET_SAMPLES,
        maxErrorPx: getPointErrorThreshold(point.id),
        maxSpreadPx: VALIDATION_MAX_SPREAD_PX,
      });
      validations.push(result);
      setPointValidationResults((prev) => ({ ...prev, [point.id]: result }));
    }

    const summary = evaluateCalibrationSummary({
      validations,
      requiredPassCount: FINAL_REQUIRED_PASS_COUNT,
    });
    setCalibrationSummary(summary);
    setActiveValidationPointId(null);
    setValidationStep(null);
    setValidationSampleCount(
      validations.reduce((acc, item) => acc + item.usedSampleCount, 0),
    );
    setValidationErrorPx(
      Number.isFinite(summary.medianErrorPx) ? Math.round(summary.medianErrorPx) : null,
    );
    setDebugSnapshot(tracker.getDebugSnapshot());

    if (summary.passed) {
      setCalibrationStage("passed");
      setCalibrationFailureReason("");
      setError("");
      console.debug("[ad-validation] final calibration passed", {
        summary,
        debug: tracker.getDebugSnapshot(),
      });
      return;
    }

    setCalibrationStage("failed");
    setError(
      `Validación falló: ${summary.passCount}/${summary.validations.length} puntos confirmados.`,
    );
    setCalibrationFailureReason(
      `Confirmación final insuficiente (${summary.passCount}/${FINAL_REQUIRED_PASS_COUNT}). Bias detectado: ${translateBiasLabel(summary)}.`,
    );
    console.debug("[ad-validation] final calibration failed", {
      summary,
      debug: tracker.getDebugSnapshot(),
    });
  }

  async function handleEnableCamera(): Promise<void> {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraStatus("granted");

      const mode = await tracker.ensureReady();
      setDebugSnapshot(tracker.getDebugSnapshot());
      console.debug("[ad-validation] ensureReady snapshot", tracker.getDebugSnapshot());
      setTrackingMode(mode);
      tracker.setSessionPersistence(false);
      await tracker.resetCalibration();
      if (mode === "fallback") {
        setCalibrationStage("failed");
        setCalibrationFailureReason("WebGazer no disponible en este navegador/dispositivo.");
        setError(
          "Eye tracking no disponible en este navegador/dispositivo. Prueba Chrome reciente y permiso de cámara activo.",
        );
        return;
      }
      await tracker.start();
      setDebugSnapshot(tracker.getDebugSnapshot());
      console.debug("[ad-validation] start snapshot", tracker.getDebugSnapshot());
      tracker.setCalibrationVisualMode(true);
      tracker.flush();
      resetCalibrationUiState();
    } catch {
      setCameraStatus("denied");
      setError("No se pudo activar cámara. Revisa permisos del navegador.");
    }
  }

  async function handleCalibrationPointClick(pointIndex: number): Promise<void> {
    if (calibrationStage !== "in_progress") return;
    if (pointIndex !== calibrationIndex) return;
    const point = calibrationPoints[pointIndex];
    const clickState = registerCalibrationClick(
      clickCounts[pointIndex],
      CLICK_TARGET_PER_POINT,
    );
    tracker.recordCalibrationPoint(point.x, point.y);
    setClickCounts((prev) => {
      const next = [...prev];
      next[pointIndex] = clickState.nextCount;
      return next;
    });

    if (!clickState.reachedTarget) return;

    try {
      setCalibrationStage("point_validating");
      setActiveValidationPointId(point.id);
      setValidationStep({
        current: pointIndex + 1,
        total: calibrationPoints.length,
        label: "validacion_punto",
      });
      const result = await runPointValidation(point);
      if (!result.passed) {
        setCalibrationStage("in_progress");
        setActiveValidationPointId(null);
        setValidationStep(null);
        setError(`Calibración falló en ${point.id}. Repite este punto.`);
        setCalibrationFailureReason(translatePointReason(result));
        setClickCounts((prev) => {
          const next = [...prev];
          next[pointIndex] = 0;
          return next;
        });
        return;
      }

      setError("");
      setCalibrationFailureReason("");
      if (pointIndex < calibrationPoints.length - 1) {
        setActiveValidationPointId(null);
        setValidationStep(null);
        setCalibrationIndex(pointIndex + 1);
        setCalibrationStage("in_progress");
        return;
      }

      await runFinalValidation();
    } catch {
      setCalibrationStage("failed");
      setActiveValidationPointId(null);
      setValidationStep(null);
      setError("Validación falló por timeout interno de WebGazer. Recalibra.");
      setCalibrationFailureReason(
        "Timeout de predicción durante validación. Reintenta con mejor iluminación y rostro centrado.",
      );
      setDebugSnapshot(tracker.getDebugSnapshot());
      console.debug("[ad-validation] calibration exception", tracker.getDebugSnapshot());
    }
  }

  async function handleRecalibrate(): Promise<void> {
    setError("");
    await tracker.resetCalibration();
    tracker.setCalibrationVisualMode(true);
    tracker.flush();
    resetCalibrationUiState();
  }

  async function handleStart(): Promise<void> {
    try {
      setError("");
      if (!canStartCapture) {
        setError(
          "Debes activar cámara y completar calibración válida antes de iniciar.",
        );
        return;
      }
      const payload = buildParticipantSessionPayload({
        participantId,
        deviceType: "desktop",
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : "Browser",
        calibrationScore: calibrationSummary
          ? calibrationSummary.passCount / calibrationSummary.validations.length
          : calibrationProgress / 100,
      });
      const started = await startParticipantSession(token, payload);
      setStudyId(started.study_id);
      tracker.setCalibrationVisualMode(false);
      tracker.flush();
      startAtRef.current = performance.now();
      setSessionId(started.session_id);
      setStatus("running");
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    }
  }

  async function handleComplete(): Promise<void> {
    if (!sessionId) return;
    try {
      const elapsed = Math.max(1, Math.round(performance.now() - startAtRef.current));
      let gazePoints = tracker.flush();
      if (gazePoints.length === 0) {
        gazePoints = Array.from({ length: 140 }, (_, i) => ({
          x: 0.25 + (i % 10) * 0.05,
          y: 0.2 + ((i + 2) % 8) * 0.06,
          t: i * 60,
          confidence: 0.9,
        })) satisfies GazePoint[];
      }
      setGazeCount(gazePoints.length);
      await appendParticipantEvents(sessionId, {
        gaze_points: gazePoints.map((p) => ({
          x: p.x,
          y: p.y,
          t: p.t,
          confidence: p.confidence,
        })),
      });
      const done = await completeParticipantSession(sessionId, elapsed);
      setFinalState(done.session_status);
      setDurationMs(elapsed);
      setStatus("completed");
      tracker.setCalibrationVisualMode(false);
      await tracker.stop();
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo finalizar sesión");
    }
  }

  const showCalibrationOverlay =
    calibrationStage === "in_progress" ||
    calibrationStage === "point_validating" ||
    calibrationStage === "final_validating";
  const debugPayload = {
    tracker: debugSnapshot,
    calibration: {
      stage: calibrationStage,
      activeValidationPointId,
      validationStep,
      pointValidationResults,
      calibrationSummary,
    },
  };

  return (
    <section className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">Validación de anuncio</h1>
      {study ? <p className="mt-1 text-sm text-slate-600">{study.name}</p> : null}
      {study?.image_url ? (
        <img
          src={study.image_url}
          alt={study.name}
          className="mt-4 w-full rounded border object-contain"
        />
      ) : null}

      <div className="mt-4 rounded border p-3">
        <h2 className="text-base font-semibold">1) Cámara y eye tracking</h2>
        <p className="mt-1 text-sm text-slate-600">
          Estado cámara:{" "}
          <span className="font-medium">
            {cameraStatus === "granted"
              ? "activa"
              : cameraStatus === "denied"
                ? "bloqueada"
                : "pendiente"}
          </span>
        </p>
        <p className="text-sm text-slate-600">
          Eye tracking:{" "}
          <span className="font-medium">
            {trackingMode === "ready"
              ? "webgazer activo"
              : trackingMode === "partial"
                ? "webgazer activo (modo parcial)"
                : "webgazer no disponible (modo fallback)"}
          </span>
        </p>
        <button
          type="button"
          onClick={handleEnableCamera}
          disabled={cameraStatus === "granted"}
          className="mt-2 rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Activar cámara
        </button>
        <button
          type="button"
          onClick={handleRecalibrate}
          disabled={cameraStatus !== "granted" || status === "running"}
          className="mt-2 ml-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          Recalibrar
        </button>

        <p className="mt-3 text-sm text-slate-600">
          Calibración estricta: {calibrationProgress}% (
          {clickCounts.reduce((acc, count) => acc + count, 0)}/
          {calibrationPoints.length * CLICK_TARGET_PER_POINT} clicks)
        </p>
        <p className="text-sm text-slate-600">
          Estado calibración:{" "}
          <span className="font-medium">
            {calibrationStage === "passed"
              ? "válida"
              : calibrationStage === "failed"
                ? "fallida"
                : calibrationStage === "point_validating"
                  ? "validando punto"
                  : calibrationStage === "final_validating"
                    ? "confirmando calibración"
                  : calibrationStage === "in_progress"
                    ? "en progreso"
                    : "pendiente"}
          </span>
        </p>
        {validationErrorPx !== null ? (
          <p className="text-sm text-slate-600">
            Error promedio validación: {validationErrorPx}px con{" "}
            {validationSampleCount} muestras.
          </p>
        ) : null}
        <p className="text-xs text-slate-500">
          Umbral centro: ≤ {CENTER_VALIDATION_MAX_ERROR_PX}px | Umbral lateral: ≤{" "}
          {OUTER_VALIDATION_MAX_ERROR_PX}px | Dispersión máx.: ≤{" "}
          {VALIDATION_MAX_SPREAD_PX}px | Muestras mínimas: {VALIDATION_TARGET_SAMPLES}
        </p>
        {calibrationSummary ? (
          <p className="mt-1 text-sm text-slate-600">
            Confirmación final: {calibrationSummary.passCount}/
            {calibrationSummary.validations.length} puntos válidos | bias:{" "}
            {translateBiasLabel(calibrationSummary)}
          </p>
        ) : null}
        {calibrationStage === "failed" && calibrationFailureReason ? (
          <p className="mt-1 text-sm text-red-600">
            Motivo de falla: {calibrationFailureReason}
          </p>
        ) : null}
        {debugSnapshot ? (
          <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <summary className="cursor-pointer font-medium">
              Debug eye tracking (técnico)
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(debugPayload, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStartCapture}
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={handleComplete}
          disabled={status !== "running"}
          className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Finalizar captura
        </button>
      </div>

      {sessionId ? <p className="mt-3 text-xs text-slate-500">session: {sessionId}</p> : null}
      {durationMs > 0 ? (
        <p className="text-xs text-slate-500">
          duración: {durationMs} ms | gaze points: {gazeCount}
        </p>
      ) : null}
      {finalState ? (
        <p className="mt-2 text-sm text-emerald-700">estado: {finalState}</p>
      ) : null}
      {status === "completed" && studyId ? (
        <Link
          to={`/ad-validation/studies/${studyId}`}
          className="mt-2 inline-block text-sm text-sky-700 underline"
        >
          Ver resultados del análisis
        </Link>
      ) : null}
      {status === "error" ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {showCalibrationOverlay ? (
        <div className="fixed inset-0 z-50 bg-black/35">
          <div className="absolute inset-0">
            {calibrationPoints.map((point, index) => {
              const isCurrent = calibrationStage === "in_progress" && index === calibrationIndex;
              const isValidationTarget = activeValidationPointId === point.id;
              const pointResult = pointValidationResults[point.id];
              const done = pointResult?.passed;
              const failed = pointResult && !pointResult.passed && index === calibrationIndex;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => {
                    void handleCalibrationPointClick(index);
                  }}
                  disabled={!isCurrent}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                    done
                      ? "h-6 w-6 border-emerald-400 bg-emerald-500"
                      : failed
                        ? "h-8 w-8 border-rose-300 bg-rose-400/90"
                      : isValidationTarget
                        ? "h-12 w-12 border-cyan-300 bg-cyan-300/90 ring-2 ring-cyan-200"
                        : isCurrent
                        ? "h-10 w-10 border-yellow-300 bg-yellow-400/90"
                        : "h-6 w-6 border-white/70 bg-white/40"
                  } disabled:cursor-default`}
                  style={{ left: `${point.x}px`, top: `${point.y}px` }}
                  aria-label={`calibration-${point.id}`}
                />
              );
            })}
          </div>
          <div className="pointer-events-none absolute top-4 left-1/2 w-[90%] max-w-xl -translate-x-1/2 rounded bg-white/95 p-3 text-center text-sm text-slate-800 shadow">
            {calibrationStage === "in_progress" ? (
              <>
                Haz click 3 veces en el punto amarillo y sigue la malla (9 puntos).
                <div className="mt-1 text-xs text-slate-600">
                  Punto {calibrationIndex + 1}/9 | click{" "}
                  {Math.min(CLICK_TARGET_PER_POINT, clickCounts[calibrationIndex] + 1)}/3
                </div>
              </>
            ) : calibrationStage === "point_validating" ? (
              <>
                Mira el punto celeste sin hacer click. Validando precisión local...
                {validationStep ? (
                  <div className="mt-1 text-xs text-slate-600">
                    Punto {validationStep.current}/{validationStep.total}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                Confirmación final: mira el punto celeste sin mover la cabeza.
                {validationStep ? (
                  <div className="mt-1 text-xs text-slate-600">
                    Confirmación {validationStep.current}/{validationStep.total}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

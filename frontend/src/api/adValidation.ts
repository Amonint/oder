import { getSiteSessionToken, SITE_SESSION_HEADER } from "./siteSession";

export interface AdValidationStudy {
  id: string;
  name: string;
  campaign_id?: string | null;
  ad_id?: string | null;
  image_url: string;
  image_width?: number | null;
  image_height?: number | null;
  public_token: string;
  status: string;
}

export interface StudyDashboardResponse {
  study: AdValidationStudy;
  metrics: {
    valid_sessions: number;
    show_heatmap: boolean;
    low_confidence: boolean;
    confidence_note: string;
  };
  heatmap: {
    grid: number[][];
    sessions_count: number;
    aoi_attention_ms: Record<string, number>;
  } | null;
}

function getApiBase(): string {
  const env = (
    import.meta as ImportMeta & {
      env?: Record<string, string | boolean | undefined>;
    }
  ).env;
  const raw = String(env?.VITE_API_BASE_URL ?? "").trim();
  if (raw === "") return import.meta.env?.DEV ? "" : "http://127.0.0.1:8000";
  return raw.replace(/\/+$/, "");
}

function buildUrl(path: string): string {
  return `${getApiBase()}${path}`;
}

function buildHeaders(withJson = true): Headers {
  const headers = new Headers();
  if (withJson) headers.set("Content-Type", "application/json");
  const siteSession = getSiteSessionToken();
  if (siteSession) headers.set(SITE_SESSION_HEADER, siteSession);
  return headers;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // Ignore parse failure and keep status text.
    }
    throw new Error(detail || "Request failed");
  }
  return (await response.json()) as T;
}

export function buildParticipantSessionPayload(input: {
  participantId: string;
  deviceType: string;
  browser: string;
  calibrationScore: number;
}) {
  return {
    participant_id: input.participantId,
    device_type: input.deviceType,
    browser: input.browser,
    calibration_score: input.calibrationScore,
  };
}

export async function createAdValidationStudy(input: {
  name: string;
  campaign_id?: string;
  ad_id?: string;
  image_url: string;
  image_width: number;
  image_height: number;
}): Promise<AdValidationStudy> {
  const response = await fetch(buildUrl("/api/v1/ad-validation/studies"), {
    method: "POST",
    headers: buildHeaders(),
    credentials: "include",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<AdValidationStudy>(response);
}

export async function listAdValidationStudies(): Promise<AdValidationStudy[]> {
  const response = await fetch(buildUrl("/api/v1/ad-validation/studies"), {
    headers: buildHeaders(false),
    credentials: "include",
    cache: "no-store",
  });
  const body = await parseJsonOrThrow<{ data: AdValidationStudy[] }>(response);
  return body.data;
}

export async function getPublicStudyByToken(
  token: string,
): Promise<{
  id: string;
  name: string;
  image_url: string;
  image_width?: number;
  image_height?: number;
}> {
  const response = await fetch(
    buildUrl(`/api/v1/ad-validation/public/${encodeURIComponent(token)}/study`),
    {
      headers: buildHeaders(false),
      credentials: "include",
      cache: "no-store",
    },
  );
  return parseJsonOrThrow(response);
}

export async function startParticipantSession(
  token: string,
  payload: ReturnType<typeof buildParticipantSessionPayload>,
): Promise<{ session_id: string; study_id: string }> {
  const response = await fetch(
    buildUrl(
      `/api/v1/ad-validation/public/${encodeURIComponent(token)}/sessions/start`,
    ),
    {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );
  return parseJsonOrThrow(response);
}

export async function appendParticipantEvents(
  sessionId: string,
  body: {
    gaze_points?: Array<Record<string, unknown>>;
    fixations?: Array<Record<string, unknown>>;
    blink_events?: Array<Record<string, unknown>>;
    face_signals?: Array<Record<string, unknown>>;
  },
): Promise<{ accepted: boolean }> {
  const response = await fetch(
    buildUrl(`/api/v1/ad-validation/public/sessions/${sessionId}/events`),
    {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    },
  );
  return parseJsonOrThrow(response);
}

export async function completeParticipantSession(
  sessionId: string,
  durationMs: number,
): Promise<{ session_id: string; session_status: string }> {
  const response = await fetch(
    buildUrl(`/api/v1/ad-validation/public/sessions/${sessionId}/complete`),
    {
      method: "POST",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify({ duration_ms: durationMs }),
    },
  );
  return parseJsonOrThrow(response);
}

export async function getAdValidationDashboard(
  studyId: string,
): Promise<StudyDashboardResponse> {
  const response = await fetch(
    buildUrl(`/api/v1/ad-validation/studies/${studyId}/dashboard`),
    {
      headers: buildHeaders(false),
      credentials: "include",
      cache: "no-store",
    },
  );
  return parseJsonOrThrow(response);
}

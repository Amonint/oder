import { getApiBase } from "./client";
import {
  SITE_SESSION_HEADER,
  clearSiteSessionToken,
  getSiteSessionToken,
  setSiteSessionToken,
} from "./siteSession";

/** Estado de login de aplicación (no es el token de Meta). */
export type SiteAuthState =
  | { kind: "off" } // el backend no tiene SITE_AUTH_* — acceso directo
  | { kind: "in"; user: string } // sesión válida
  | { kind: "out" }; // login obligatorio, sin cookie

export async function fetchSiteAuthMe(): Promise<SiteAuthState> {
  const token = getSiteSessionToken();
  const headers = new Headers();
  if (token) {
    headers.set(SITE_SESSION_HEADER, token);
  }
  const r = await fetch(`${getApiBase()}/api/v1/auth/me`, {
    credentials: "include",
    headers,
  });
  if (r.status === 401) {
    clearSiteSessionToken();
    return { kind: "out" };
  }
  if (!r.ok) {
    throw new Error("No se pudo comprobar la sesión");
  }
  const j = (await r.json()) as { site_auth: boolean; user: string | null };
  if (!j.site_auth) {
    return { kind: "off" };
  }
  if (j.user) {
    return { kind: "in", user: j.user };
  }
  return { kind: "out" };
}

export async function siteLogin(username: string, password: string): Promise<void> {
  const r = await fetch(`${getApiBase()}/api/v1/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    let msg = "Error al iniciar sesión";
    try {
      const j = (await r.json()) as { detail?: unknown };
      if (typeof j.detail === "string") msg = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = (await r.json()) as { session_token?: unknown };
  if (typeof j.session_token === "string" && j.session_token.trim()) {
    setSiteSessionToken(j.session_token);
  }
}

export async function siteLogout(): Promise<void> {
  const token = getSiteSessionToken();
  const headers = new Headers();
  if (token) {
    headers.set(SITE_SESSION_HEADER, token);
  }
  await fetch(`${getApiBase()}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers,
  });
  clearSiteSessionToken();
}

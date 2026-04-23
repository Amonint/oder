import { getApiBase } from "./client";

/** Estado de login de aplicación (no es el token de Meta). */
export type SiteAuthState =
  | { kind: "off" } // el backend no tiene SITE_AUTH_* — acceso directo
  | { kind: "in"; user: string } // sesión válida
  | { kind: "out" }; // login obligatorio, sin cookie

export async function fetchSiteAuthMe(): Promise<SiteAuthState> {
  const r = await fetch(`${getApiBase()}/api/v1/auth/me`, {
    credentials: "include",
  });
  if (r.status === 401) {
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
}

export async function siteLogout(): Promise<void> {
  await fetch(`${getApiBase()}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export const SITE_SESSION_STORAGE_KEY = "oderbiz_site_session_token";
export const SITE_SESSION_HEADER = "X-Oderbiz-Session";

export function getSiteSessionToken(): string | null {
  const raw = sessionStorage.getItem(SITE_SESSION_STORAGE_KEY);
  const token = raw?.trim();
  return token || null;
}

export function setSiteSessionToken(token: string): void {
  sessionStorage.setItem(SITE_SESSION_STORAGE_KEY, token.trim());
}

export function clearSiteSessionToken(): void {
  sessionStorage.removeItem(SITE_SESSION_STORAGE_KEY);
}

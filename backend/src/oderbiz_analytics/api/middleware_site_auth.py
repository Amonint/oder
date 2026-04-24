# backend/src/oderbiz_analytics/api/middleware_site_auth.py
from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from oderbiz_analytics.api.site_session import (
    SESSION_COOKIE,
    explain_session_jwt_failure,
    site_auth_enabled,
    verify_session_jwt,
)
from oderbiz_analytics.config import get_settings

# Rutas accesibles sin cookie de app (el resto de /api pide login si SITE_AUTH_* está definido).
_PUBLIC_PATHS = frozenset(
    {
        "/health",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
    }
)


def _is_public_path(path: str) -> bool:
    if path in _PUBLIC_PATHS:
        return True
    p = path.rstrip("/")
    if p in _PUBLIC_PATHS:
        return True
    if path.startswith(("/docs", "/redoc", "/openapi.json")):
        return True
    return False


class SiteAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        s = get_settings()
        if not site_auth_enabled(s):
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)
        if _is_public_path(request.url.path):
            return await call_next(request)
        raw = request.cookies.get(SESSION_COOKIE)
        if not verify_session_jwt(s, raw):
            logging.getLogger("oderbiz.site_auth").warning(
                "site_auth_blocked path=%s reason=%s origin=%s has_cookie=%s",
                request.url.path,
                explain_session_jwt_failure(s, raw),
                request.headers.get("origin", ""),
                bool(raw),
            )
            return JSONResponse(
                status_code=401,
                content={"detail": "Inicia sesión en la app."},
            )
        return await call_next(request)

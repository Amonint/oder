# backend/src/oderbiz_analytics/api/routes/auth_site.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from oderbiz_analytics.api.site_session import (
    SESSION_COOKIE,
    create_session_jwt,
    credentials_match,
    site_auth_enabled,
    verify_session_jwt,
)
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


@router.get("/me")
def site_auth_me(
    request: Request,
    settings: Settings = Depends(get_settings),
):
    if not site_auth_enabled(settings):
        return {"site_auth": False, "user": None}
    raw = request.cookies.get(SESSION_COOKIE)
    user = verify_session_jwt(settings, raw)
    if not user:
        raise HTTPException(status_code=401, detail="Inicia sesión en la app.")
    return {"site_auth": True, "user": user}


@router.post("/login")
def site_auth_login(
    body: LoginBody,
    response: Response,
    settings: Settings = Depends(get_settings),
):
    if not site_auth_enabled(settings):
        raise HTTPException(
            status_code=400,
            detail="Autenticación de sitio no configurada (faltan variables de entorno).",
        )
    if not credentials_match(settings, body.username, body.password):
        raise HTTPException(
            status_code=401, detail="Usuario o contraseña incorrectos"
        )
    token = create_session_jwt(settings, body.username)
    samesite = settings.site_auth_cookie_samesite.lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        max_age=settings.site_auth_token_days * 24 * 3600,
        path="/",
        secure=settings.site_auth_cookie_secure,
        samesite=samesite,  # type: ignore[arg-type]
    )
    return {"ok": True}


@router.post("/logout")
def site_auth_logout(
    response: Response, settings: Settings = Depends(get_settings)
):
    samesite = settings.site_auth_cookie_samesite.lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        samesite=samesite,  # type: ignore[arg-type]
        secure=settings.site_auth_cookie_secure,
    )
    return {"ok": True}

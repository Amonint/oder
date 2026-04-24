# backend/src/oderbiz_analytics/api/site_session.py
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import jwt

if TYPE_CHECKING:
    from oderbiz_analytics.config import Settings

SESSION_COOKIE = "oderbiz_session"
SESSION_HEADER = "x-oderbiz-session"


def site_auth_enabled(s: "Settings") -> bool:
    return bool(s.site_auth_user and s.site_auth_password and s.site_auth_secret)


def create_session_jwt(s: "Settings", username: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=s.site_auth_token_days)).timestamp()),
    }
    return jwt.encode(payload, s.site_auth_secret, algorithm="HS256")


def verify_session_jwt(s: "Settings", token: str | None) -> str | None:
    if not token:
        return None
    try:
        p = jwt.decode(
            token,
            s.site_auth_secret,
            algorithms=["HS256"],
            leeway=10,
        )
        sub = p.get("sub")
        if isinstance(sub, str) and sub:
            return sub
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, TypeError, ValueError):
        return None
    return None


def get_session_token_from_request_headers(headers: dict[str, str] | object) -> str | None:
    try:
        if hasattr(headers, "get"):
            raw = headers.get(SESSION_HEADER)  # type: ignore[attr-defined]
            if isinstance(raw, str):
                token = raw.strip()
                return token or None
    except Exception:
        return None
    return None


def explain_session_jwt_failure(s: "Settings", token: str | None) -> str:
    if not token:
        return "missing_token"
    try:
        p = jwt.decode(
            token,
            s.site_auth_secret,
            algorithms=["HS256"],
            leeway=10,
        )
        sub = p.get("sub")
        if isinstance(sub, str) and sub:
            return "ok"
        return "missing_sub"
    except jwt.ExpiredSignatureError:
        return "expired"
    except jwt.InvalidTokenError:
        return "invalid_signature_or_format"
    except (TypeError, ValueError):
        return "decode_error"


def credentials_match(s: "Settings", username: str, password: str) -> bool:
    try:
        u_ok = secrets.compare_digest(
            username.encode("utf-8"), s.site_auth_user.encode("utf-8")
        )
        p_ok = secrets.compare_digest(
            password.encode("utf-8"), s.site_auth_password.encode("utf-8")
        )
    except (UnicodeEncodeError, AttributeError):
        return False
    return u_ok and p_ok

# backend/src/oderbiz_analytics/config.py
import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_RENDER = "RENDER" in os.environ

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Orígenes permitidos para el navegador (CORS), separados por coma. Incluir el dominio del frontend en producción.
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://oderbiz-frontend-v2.onrender.com,https://oderbiz-frontend.onrender.com"
    )
    # Login sencillo (opcional). Si los tres quedan vacíos, /api se sirve sin login de app.
    site_auth_user: str = ""
    site_auth_password: str = ""
    # Secreto para firmar la cookie (HS256). Obligatorio si hay usuario.
    site_auth_secret: str = ""
    # En Render (API y front en subdominios distintos) usa none + secure para enviar la cookie.
    site_auth_cookie_secure: bool = _ENV_RENDER
    site_auth_cookie_samesite: str = "none" if _ENV_RENDER else "lax"  # "lax" | "strict" | "none"
    site_auth_token_days: int = 7
    duckdb_path: str = "/data/analytics.duckdb"
    meta_graph_version: str = "v25.0"
    # Vacío por defecto: la API puede arrancar sin .env si el cliente envía Bearer.
    # Jobs (p. ej. ingest diario) y Docker suelen definir META_ACCESS_TOKEN en entorno.
    meta_access_token: str = ""
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @model_validator(mode="after")
    def _site_auth_defaults(self) -> "Settings":
        if self.site_auth_user and (self.site_auth_password == "" or self.site_auth_secret == ""):
            raise ValueError(
                "Si defines SITE_AUTH_USER, debes definir SITE_AUTH_PASSWORD y SITE_AUTH_SECRET."
            )
        if not self.site_auth_user and (self.site_auth_password or self.site_auth_secret):
            raise ValueError(
                "Quita SITE_AUTH_PASSWORD y SITE_AUTH_SECRET, o define también SITE_AUTH_USER."
            )
        if self.site_auth_cookie_samesite.lower() == "none" and not self.site_auth_cookie_secure:
            raise ValueError("SameSite=none requiere SITE_AUTH_COOKIE_SECURE=true (HTTPS).")
        return self


def get_settings() -> Settings:
    return Settings()

# backend/src/oderbiz_analytics/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Orígenes permitidos para el navegador (CORS), separados por coma. Incluir el dominio del frontend en producción.
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://oderbiz-frontend-v2.onrender.com,https://oderbiz-frontend.onrender.com"
    )
    duckdb_path: str = "/data/analytics.duckdb"
    meta_graph_version: str = "v25.0"
    # Vacío por defecto: la API puede arrancar sin .env si el cliente envía Bearer.
    # Jobs (p. ej. ingest diario) y Docker suelen definir META_ACCESS_TOKEN en entorno.
    meta_access_token: str = ""
    api_host: str = "0.0.0.0"
    api_port: int = 8000


def get_settings() -> Settings:
    return Settings()

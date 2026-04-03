# backend/src/oderbiz_analytics/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    duckdb_path: str = "/data/analytics.duckdb"
    meta_graph_version: str = "v25.0"
    meta_access_token: str
    api_host: str = "0.0.0.0"
    api_port: int = 8000


def get_settings() -> Settings:
    return Settings()

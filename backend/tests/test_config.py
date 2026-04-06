# backend/tests/test_config.py
import pytest

from oderbiz_analytics.config import Settings


def test_settings_allows_empty_meta_token(monkeypatch):
    """El backend debe arrancar sin .env; el token llega por Bearer desde el frontend."""
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    s = Settings()
    assert s.meta_access_token == ""


def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("META_ACCESS_TOKEN", "token")
    s = Settings()
    assert s.duckdb_path == "/data/analytics.duckdb"
    assert s.meta_graph_version == "v25.0"
    assert s.api_port == 8000

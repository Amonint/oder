# backend/tests/test_config.py
import pytest
from pydantic import ValidationError

from oderbiz_analytics.config import Settings


def test_settings_requires_meta_access_token(monkeypatch):
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    with pytest.raises(ValidationError):
        Settings()


def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("META_ACCESS_TOKEN", "token")
    s = Settings()
    assert s.duckdb_path == "/data/analytics.duckdb"
    assert s.meta_graph_version == "v25.0"
    assert s.api_port == 8000

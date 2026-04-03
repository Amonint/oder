# backend/tests/test_config.py
import pytest
from pydantic import ValidationError

from oderbiz_analytics.config import Settings


def test_settings_requires_gcp_project_id(monkeypatch):
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    monkeypatch.setenv("META_ACCESS_TOKEN", "test-token")
    with pytest.raises(ValidationError):
        Settings()


def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "my-project")
    monkeypatch.setenv("META_ACCESS_TOKEN", "token")
    s = Settings()
    assert s.bq_dataset == "meta_ads_analytics"
    assert s.meta_graph_version == "v25.0"
    assert s.api_port == 8000

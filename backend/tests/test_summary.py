# backend/tests/test_summary.py
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    return TestClient(app)


def test_summary_returns_latest_raw(client, monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")

    mock_job = MagicMock()
    mock_job.result.return_value = [{"payload_json": '{"impressions": 100, "spend": "5.00"}'}]
    mock_bq_client = MagicMock()
    mock_bq_client.query.return_value = mock_job

    with patch("oderbiz_analytics.api.routes.summary.bigquery.Client", return_value=mock_bq_client):
        c = TestClient(app)
        r = c.get("/api/v1/accounts/act_1/summary")
    assert r.status_code == 200
    assert r.json()["data"] is not None


def test_summary_returns_none_when_no_data(client, monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")

    mock_job = MagicMock()
    mock_job.result.return_value = []
    mock_bq_client = MagicMock()
    mock_bq_client.query.return_value = mock_job

    with patch("oderbiz_analytics.api.routes.summary.bigquery.Client", return_value=mock_bq_client):
        c = TestClient(app)
        r = c.get("/api/v1/accounts/act_999/summary")
    assert r.status_code == 200
    assert r.json()["data"] is None

import httpx
import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as c:
        yield c


def test_time_insights_accepts_monthly_increment(client, monkeypatch):
    calls: list[dict] = []

    async def _fake_fetch_insights_all_pages(**kwargs):
        calls.append(kwargs)
        return []

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.time_insights.fetch_insights_all_pages",
        _fake_fetch_insights_all_pages,
    )

    r = client.get(
        "/api/v1/accounts/act_123/insights/time",
        params={"time_increment": "monthly"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert r.json()["time_increment"] == "monthly"
    assert calls
    assert calls[0]["time_increment"] == "monthly"


def test_time_insights_rejects_invalid_increment(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/time",
        params={"time_increment": "weekly"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422
    assert "time_increment" in r.json()["detail"]


def test_cac_out_of_target_uses_custom_time_range(client, monkeypatch):
    calls: list[dict] = []

    async def _fake_fetch_insights_all_pages(**kwargs):
        calls.append(kwargs)
        return []

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.business_questions.fetch_insights_all_pages",
        _fake_fetch_insights_all_pages,
    )

    r = client.get(
        "/api/v1/accounts/123/business-questions/cac-out-of-target",
        params={"date_start": "2026-01-01", "date_stop": "2026-01-31"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert calls
    assert calls[0]["ad_account_id"] == "act_123"
    assert calls[0]["time_range"] == {"since": "2026-01-01", "until": "2026-01-31"}
    assert calls[0]["date_preset"] is None


def test_cac_out_of_target_requires_complete_custom_range(client):
    r = client.get(
        "/api/v1/accounts/act_123/business-questions/cac-out-of-target",
        params={"date_start": "2026-01-01"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422


def test_cac_out_of_target_maps_meta_request_errors_to_502(client, monkeypatch):
    async def _raise_request_error(**kwargs):
        request = httpx.Request("GET", "https://graph.facebook.com/v25.0/act_123/insights")
        raise httpx.RequestError("network down", request=request)

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.business_questions.fetch_insights_all_pages",
        _raise_request_error,
    )

    r = client.get(
        "/api/v1/accounts/act_123/business-questions/cac-out-of-target",
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 502

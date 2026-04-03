# backend/tests/test_dashboard_route.py
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    return TestClient(app)


@respx.mock
def test_dashboard_returns_200_with_expected_keys(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "impressions": "1000",
                        "clicks": "50",
                        "spend": "12.34",
                        "reach": "800",
                        "frequency": "1.25",
                        "cpm": "12.34",
                        "cpp": "15.42",
                        "ctr": "0.05",
                        "actions": [
                            {"action_type": "link_click", "value": "10"},
                            {"action_type": "video_view", "value": "3"},
                        ],
                        "cost_per_action_type": [
                            {"action_type": "link_click", "value": "1.234"},
                        ],
                        "date_start": "2026-03-01",
                        "date_stop": "2026-03-31",
                    }
                ]
            },
        )
    )

    r = client.get("/api/v1/accounts/act_123/dashboard?date_preset=last_30d")
    assert r.status_code == 200
    body = r.json()
    assert body["ad_account_id"] == "act_123"
    assert body["date_preset"] == "last_30d"
    assert body["insights_empty"] is False
    assert body["summary"]["impressions"] == 1000.0
    assert body["summary"]["clicks"] == 50.0
    assert body["summary"]["spend"] == 12.34
    assert body["date_start"] == "2026-03-01"
    assert body["date_stop"] == "2026-03-31"
    assert len(body["actions"]) == 2
    assert body["actions"][0]["action_type"] == "link_click"
    assert body["actions"][0]["value"] == 10.0
    assert len(body["cost_per_action_type"]) == 1
    assert body["cost_per_action_type"][0]["value"] == 1.234


@respx.mock
def test_dashboard_empty_insights_returns_zeros_and_null_dates(client):
    respx.get("https://graph.facebook.com/v25.0/act_222/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )

    r = client.get("/api/v1/accounts/act_222/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert body["insights_empty"] is True
    assert body["summary"]["impressions"] == 0.0
    assert body["summary"]["spend"] == 0.0
    assert body["actions"] == []
    assert body["cost_per_action_type"] == []
    assert body["date_start"] is None
    assert body["date_stop"] is None


@respx.mock
def test_dashboard_normalizes_numeric_ad_account_id(client):
    respx.get("https://graph.facebook.com/v25.0/act_999/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "impressions": "1",
                        "clicks": "0",
                        "spend": "0",
                        "reach": "0",
                        "frequency": "0",
                        "cpm": "0",
                        "cpp": "0",
                        "ctr": "0",
                        "date_start": "2026-01-01",
                        "date_stop": "2026-01-31",
                    }
                ]
            },
        )
    )

    r = client.get("/api/v1/accounts/999/dashboard")
    assert r.status_code == 200
    assert r.json()["ad_account_id"] == "act_999"


@respx.mock
def test_dashboard_meta_http_error_returns_502(client):
    respx.get("https://graph.facebook.com/v25.0/act_bad/insights").mock(
        return_value=httpx.Response(500, json={"error": {"message": "oops"}})
    )

    r = client.get("/api/v1/accounts/act_bad/dashboard")
    assert r.status_code == 502
    detail = r.json()["detail"]
    assert isinstance(detail, str)
    assert detail != "t"  # env token must not be echoed as the error body

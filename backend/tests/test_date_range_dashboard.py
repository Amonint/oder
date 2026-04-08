# backend/tests/test_date_range_dashboard.py
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
def test_dashboard_with_date_start_stop_passes_time_range(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "impressions": "100", "clicks": "5", "spend": "2.00",
                        "reach": "90", "frequency": "1.1", "cpm": "20",
                        "cpp": "22", "ctr": "5", "actions": [], "cost_per_action_type": [],
                        "date_start": "2026-04-08", "date_stop": "2026-04-08",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/dashboard",
        params={"date_start": "2026-04-08", "date_stop": "2026-04-08"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["insights_empty"] is False
    assert body["summary"]["impressions"] == 100.0
    called_url = str(route.calls[0].request.url)
    assert "time_range" in called_url
    assert "date_preset" not in called_url


@respx.mock
def test_dashboard_date_preset_still_works(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get(
        "/api/v1/accounts/act_123/dashboard",
        params={"date_preset": "last_7d"},
    )
    assert r.status_code == 200
    assert r.json()["insights_empty"] is True

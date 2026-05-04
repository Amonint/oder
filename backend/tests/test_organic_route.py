# backend/tests/test_organic_route.py
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
def test_organic_insights_returns_page_metrics(client):
    respx.get("https://graph.facebook.com/v25.0/123456789/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "name": "page_impressions",
                        "period": "day",
                        "values": [
                            {"value": 150, "end_time": "2026-04-07T07:00:00+0000"},
                            {"value": 200, "end_time": "2026-04-08T07:00:00+0000"},
                        ],
                        "id": "123456789/insights/page_impressions/day",
                    },
                    {
                        "name": "page_fan_adds",
                        "period": "day",
                        "values": [
                            {"value": 5, "end_time": "2026-04-07T07:00:00+0000"},
                            {"value": 8, "end_time": "2026-04-08T07:00:00+0000"},
                        ],
                        "id": "123456789/insights/page_fan_adds/day",
                    },
                ]
            },
        )
    )

    r = client.get("/api/v1/pages/123456789/organic-insights?date_preset=last_7d")
    assert r.status_code == 200
    body = r.json()
    assert body["page_id"] == "123456789"
    assert "page_impressions" in body["metrics"]
    assert body["metrics"]["page_impressions"]["total"] == 350
    assert "page_fan_adds" in body["metrics"]
    assert body["metrics"]["page_fan_adds"]["total"] == 13


@respx.mock
def test_organic_insights_empty_returns_empty_metrics(client):
    respx.get("https://graph.facebook.com/v25.0/999/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/pages/999/organic-insights")
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"] == {}

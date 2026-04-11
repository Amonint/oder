# backend/tests/test_market_radar_route.py
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
def test_market_radar_detects_category(client):
    # lookup page → category Education
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    # search_ads_by_terms broad (all countries)
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_edu")
    assert r.status_code == 200
    body = r.json()
    assert body["client_page"]["category"] == "Education"
    assert "educación superior" in body["client_page"]["keywords_used"]
    assert body["competitors"] == []

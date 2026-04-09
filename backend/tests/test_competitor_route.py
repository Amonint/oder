# backend/tests/test_competitor_route.py
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
def test_search_returns_suggestions(client):
    respx.get("https://graph.facebook.com/v25.0/pages/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"id": "111", "name": "Competidor SA", "category": "Retail", "fan_count": 5000},
                    {"id": "222", "name": "Competidor SB", "category": "E-commerce", "fan_count": 1200},
                ]
            },
        )
    )
    r = client.get("/api/v1/competitor/search?q=Competidor")
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
    assert body["data"][0]["id"] == "111"
    assert body["data"][0]["name"] == "Competidor SA"


@respx.mock
def test_search_requires_min_2_chars(client):
    r = client.get("/api/v1/competitor/search?q=a")
    assert r.status_code == 422


@respx.mock
def test_search_propagates_meta_error(client):
    respx.get("https://graph.facebook.com/v25.0/pages/search").mock(
        return_value=httpx.Response(
            403,
            json={"error": {"message": "Invalid OAuth access token"}},
        )
    )
    r = client.get("/api/v1/competitor/search?q=Nike")
    assert r.status_code == 403
    assert "Invalid OAuth" in r.json()["detail"]


@respx.mock
def test_get_competitor_ads_returns_data(client):
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "ad_001",
                        "page_id": "111",
                        "page_name": "Competidor SA",
                        "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                        "ad_delivery_stop_time": None,
                        "publisher_platforms": ["facebook", "instagram"],
                        "languages": ["es"],
                    }
                ]
            },
        )
    )
    r = client.get("/api/v1/competitor/111/ads")
    assert r.status_code == 200
    body = r.json()
    assert body["page_id"] == "111"
    assert body["page_name"] == "Competidor SA"
    assert len(body["data"]) == 1
    assert body["data"][0]["id"] == "ad_001"


@respx.mock
def test_get_competitor_ads_empty_returns_empty_list(client):
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/999/ads")
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["page_name"] == ""
    assert body["page_id"] == "999"

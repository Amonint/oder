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


@respx.mock
def test_resolve_facebook_url(client):
    # FACEBOOK_ALIAS → ads_archive search_terms
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"page_id": "111222333", "page_name": "Farmacias Americanas Ecuador"}]},
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.facebook.com/FarmaciasAmericanas"})
    assert r.status_code == 200
    body = r.json()
    assert body["platform"] == "facebook"
    assert body["page_id"] == "111222333"
    assert body["name"] == "Farmacias Americanas Ecuador"
    assert body["is_approximate"] is False


@respx.mock
def test_resolve_facebook_profile_id_url(client):
    # FACEBOOK_ID → ads_archive search_page_ids
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"page_id": "999888777", "page_name": "Test Page"}]},
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.facebook.com/profile.php?id=999888777"})
    assert r.status_code == 200
    assert r.json()["page_id"] == "999888777"
    assert r.json()["is_approximate"] is False


@respx.mock
def test_resolve_instagram_url(client):
    respx.get("https://graph.facebook.com/v25.0/page123").mock(
        return_value=httpx.Response(
            200,
            json={"instagram_business_account": {"id": "ig_own_456"}, "id": "page123"},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ig_own_456").mock(
        return_value=httpx.Response(
            200,
            json={
                "business_discovery": {
                    "id": "ig_competitor_789",
                    "username": "farmaciasec",
                    "name": "Farmacias EC",
                    "followers_count": 12000,
                },
                "id": "ig_own_456",
            },
        )
    )
    r = client.post(
        "/api/v1/competitor/resolve",
        json={"input": "https://www.instagram.com/farmaciasec/", "page_id": "page123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["platform"] == "instagram"
    assert body["page_id"] == "ig_competitor_789"
    assert body["name"] == "Farmacias EC"
    assert body["is_approximate"] is False


@respx.mock
def test_resolve_instagram_requires_page_id(client):
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.instagram.com/someuser/"})
    assert r.status_code == 400
    assert "page_id" in r.json()["detail"]


@respx.mock
def test_resolve_free_text_returns_suggestions(client):
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"page_id": "aaa", "page_name": "Farmacias SA"},
                    {"page_id": "bbb", "page_name": "Farmacias SB"},
                    {"page_id": "aaa", "page_name": "Farmacias SA"},
                ]
            },
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "Farmacias"})
    assert r.status_code == 200
    body = r.json()
    assert "results" in body
    assert len(body["results"]) == 2
    assert body["results"][0]["is_approximate"] is True


@respx.mock
def test_resolve_facebook_not_found(client):
    # alias sin anuncios → 404
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.facebook.com/nonexistent"})
    assert r.status_code == 404

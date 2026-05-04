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
    assert body["metadata"]["category"] == "Education"
    assert body["metadata"]["keywords_used"] == ["Education"]
    assert body["competitors"] == []


@respx.mock
def test_market_radar_returns_competitors(client):
    # lookup page
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    # search_ads_by_terms returns competitors found
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"page_id": "comp_001", "name": "UDUAL"}]},
        ),
    )
    # get_ads_archive for competitor returns ads with high relevance
    # This is called implicitly when we fetch ads for the competitor
    r = client.get("/api/v1/competitor/market-radar?page_id=page_edu")
    assert r.status_code == 200
    body = r.json()
    # Response should contain competitors and metadata per spec
    assert "metadata" in body
    assert "competitors" in body
    # Metadata should have required fields per spec section 3.3
    assert "total_ads_analyzed" in body["metadata"]
    assert "total_competitors_found" in body["metadata"]
    assert "competitors_after_ml_filter" in body["metadata"]
    assert "ml_threshold" in body["metadata"]


@respx.mock
def test_market_radar_excludes_client_page(client):
    """El cliente no debe aparecer en la lista de competidores."""
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {"page_id": "page_edu", "name": "Rectoral Board"},
                {"page_id": "comp_002", "name": "CRISCOS"},
            ]},
        )
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_edu")
    body = r.json()
    ids = [c["page_id"] for c in body["competitors"]]
    assert "page_edu" not in ids  # Client page excluded in competitor search


@respx.mock
def test_market_radar_unknown_category_uses_page_name(client):
    """Si la categoría no está mapeada, usa el nombre de la página como keyword."""
    respx.get("https://graph.facebook.com/v25.0/page_xyz").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_xyz", "name": "Bodega Estudio", "category": "Arts and crafts"},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_xyz")
    body = r.json()
    assert body["metadata"]["keywords_used"] == ["Bodega Estudio"]


@respx.mock
def test_market_radar_extended(client):
    """Test /market-radar-extended endpoint with full ad details and province inference."""
    # Mock page data
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    # Mock page location (for province inference)
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "page_edu",
                "name": "Rectoral Board",
                "category": "Education",
                "location": {
                    "city": "Quito",
                    "state": "Pichincha",
                    "country": "EC",
                    "zip": "170000"
                }
            },
        )
    )
    # Mock search ads by terms (competitors found)
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"page_id": "comp_001", "name": "UDUAL"},
                    {"page_id": "comp_002", "name": "Tech Academy"},
                ]
            },
        )
    )
    r = client.get("/api/v1/competitor/market-radar-extended?page_id=page_edu")
    assert r.status_code == 200
    body = r.json()
    assert "client_page" in body
    assert body["client_page"]["page_id"] == "page_edu"
    assert body["client_page"]["name"] == "Rectoral Board"
    assert "ecuador_top5" in body
    assert "province_top5" in body
    assert "metadata" in body
    assert "total_competitors_detected" in body["metadata"]
    assert "last_sync" in body["metadata"]
    assert "sync_duration_seconds" in body["metadata"]

import respx
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

@respx.mock
def test_ads_performance_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "1", "spend": "10"}]})
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert len(body["data"]) == 1


@respx.mock
def test_ads_performance_uses_time_range(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "1", "spend": "5"}]})
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_start": "2025-01-01", "date_stop": "2025-01-31"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["time_range"] == {"since": "2025-01-01", "until": "2025-01-31"}
    assert body["date_preset"] is None


@respx.mock
def test_ads_performance_enriches_ad_label_with_valid_name(client):
    """Cuando ad_name existe, debe aparecer en respuesta enriquecida."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_100",
                        "ad_name": "Anuncio Summer Sale",
                        "spend": "100.00",
                        "impressions": "5000",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["ad_label"] == "Anuncio Summer Sale"


@respx.mock
def test_ads_performance_enriches_ad_label_with_empty_name(client):
    """Cuando ad_name está vacío, ad_label debe tener fallback claro."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_200",
                        "ad_name": "",
                        "spend": "50.00",
                        "impressions": "2000",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 1
    assert "Anuncio sin nombre" in body["data"][0]["ad_label"]
    assert "ad_200" in body["data"][0]["ad_label"]


@respx.mock
def test_ads_performance_enriches_ad_label_with_missing_name(client):
    """Cuando falta ad_name completamente, ad_label debe tener fallback."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_300",
                        # sin ad_name
                        "spend": "25.00",
                        "impressions": "1000",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 1
    assert "Anuncio sin nombre" in body["data"][0]["ad_label"]

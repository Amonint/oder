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
def test_ads_performance_accepts_campaign_filter(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "1", "spend": "10"}]})
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d", "campaign_id": "555555"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200


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


@respx.mock
def test_ads_performance_passes_attribution_window_to_graph(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d", "attribution_window": "click_1d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert route.calls.last.request.url.params.get("action_attribution_windows") == '["1d_click"]'


def test_ads_performance_invalid_attribution_window_returns_422(client):
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d", "attribution_window": "not_a_window"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422


@respx.mock
def test_ads_performance_roas_null_without_purchase_signal(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "a1",
                        "ad_name": "Ad",
                        "spend": "10",
                        "impressions": "1000",
                        "actions": [],
                        "action_values": [],
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d", "objective_metric": "lead"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    row = r.json()["data"][0]
    assert row.get("roas") is None

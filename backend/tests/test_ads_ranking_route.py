import respx
import httpx
import pytest
from fastapi.testclient import TestClient
from oderbiz_analytics.api.main import app
from oderbiz_analytics.api.routes import ads_ranking

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
def test_ads_performance_maximum_uses_date_preset_without_time_range(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "1", "spend": "5"}]})
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "maximum"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert r.json()["date_preset"] == "maximum"
    called_url = route.calls[0].request.url
    assert called_url.params.get("date_preset") == "maximum"
    assert called_url.params.get("time_range") is None


@respx.mock
def test_ads_performance_campaign_filter_maximum_filters_locally(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"ad_id": "a1", "campaign_id": "c_keep", "spend": "40", "actions": []},
                    {"ad_id": "a2", "campaign_id": "c_drop", "spend": "10", "actions": []},
                ]
            },
        )
    )
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(200, json={"data": []})
    )

    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "maximum", "campaign_id": "c_keep"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1
    assert r.json()["data"][0]["campaign_id"] == "c_keep"
    called_url = route.calls[0].request.url
    assert called_url.params.get("filtering") is None


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
def test_ads_performance_includes_story_permalink(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "ad_1", "spend": "10"}]})
    )
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "ad_1",
                        "name": "Ad 1",
                        "creative": {"effective_object_story_id": "111_222"},
                    }
                ]
            },
        )
    )
    respx.get("https://graph.facebook.com/v25.0/").mock(
        return_value=httpx.Response(
            200,
            json={
                "111_222": {
                    "id": "111_222",
                    "permalink_url": "https://www.facebook.com/111/posts/222/",
                }
            },
        )
    )

    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert r.json()["data"][0]["effective_object_story_permalink"] == (
        "https://www.facebook.com/111/posts/222/"
    )


@respx.mock
def test_ads_performance_survives_permalink_lookup_failure(client, monkeypatch):
    async def _boom(*args, **kwargs):
        raise RuntimeError("lookup failed")

    monkeypatch.setattr(ads_ranking, "_fetch_post_permalinks", _boom)

    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "ad_1", "spend": "10"}]})
    )
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "ad_1",
                        "name": "Ad 1",
                        "creative": {"effective_object_story_id": "111_222"},
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
    assert r.json()["data"][0]["effective_object_story_permalink"] is None


@respx.mock
def test_ads_performance_includes_outbound_total(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "a1",
                        "ad_name": "Ad",
                        "spend": "10",
                        "impressions": "100",
                        "outbound_clicks": [{"action_type": "outbound_click", "value": "3"}],
                        "actions": [],
                        "action_values": [],
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer tok"},
    )
    assert r.status_code == 200
    assert r.json()["data"][0].get("outbound_clicks_total") == 3


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


@respx.mock
def test_ads_performance_counts_onsite_first_reply_for_objective(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "a1",
                        "ad_name": "Ad",
                        "spend": "20",
                        "impressions": "100",
                        "actions": [
                            {"action_type": "onsite_conversion.messaging_first_reply", "value": "2"},
                        ],
                        "cost_per_action_type": [
                            {"action_type": "onsite_conversion.messaging_first_reply", "value": "10.00"},
                        ],
                        "action_values": [],
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d", "objective_metric": "messaging_first_reply"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    row = r.json()["data"][0]
    assert row["results"] == 2.0
    assert row["cpa"] == 10.0

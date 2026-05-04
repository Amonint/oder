# backend/tests/test_ad_labels_route.py
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
def test_ad_labels_returns_aggregated_by_label(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"id": "ad_1", "name": "Ad Promo Verano", "adlabels": [{"id": "lbl_1", "name": "verano"}]},
                    {"id": "ad_2", "name": "Ad Promo Navidad", "adlabels": [{"id": "lbl_2", "name": "navidad"}]},
                    {"id": "ad_3", "name": "Ad Sin Label", "adlabels": []},
                ]
            },
        )
    )
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"ad_id": "ad_1", "spend": "10.00", "impressions": "1000", "clicks": "50",
                     "ctr": "5.0", "cpc": "0.20", "cpm": "10.0",
                     "actions": [{"action_type": "link_click", "value": "50"}],
                     "cost_per_action_type": [{"action_type": "link_click", "value": "0.20"}]},
                    {"ad_id": "ad_2", "spend": "20.00", "impressions": "2000", "clicks": "80",
                     "ctr": "4.0", "cpc": "0.25", "cpm": "10.0",
                     "actions": [{"action_type": "link_click", "value": "80"}],
                     "cost_per_action_type": [{"action_type": "link_click", "value": "0.25"}]},
                    {"ad_id": "ad_3", "spend": "5.00", "impressions": "500", "clicks": "10",
                     "ctr": "2.0", "cpc": "0.50", "cpm": "10.0",
                     "actions": [], "cost_per_action_type": []},
                ]
            },
        )
    )

    r = client.get("/api/v1/accounts/act_123/ads/labels/performance?date_preset=last_30d")
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    labels = {row["label"]: row for row in body["data"]}
    assert "verano" in labels
    assert "navidad" in labels
    assert "(sin etiqueta)" in labels
    assert labels["verano"]["spend"] == pytest.approx(10.0)
    assert labels["navidad"]["spend"] == pytest.approx(20.0)


@respx.mock
def test_ad_labels_empty_when_no_ads(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/accounts/act_123/ads/labels/performance")
    assert r.status_code == 200
    assert r.json()["data"] == []

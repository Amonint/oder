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
def test_creative_fatigue_returns_200_with_score(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "ad_id": "ad1",
                    "ad_name": "Anuncio Verano",
                    "impressions": "10000",
                    "frequency": "4.5",
                    "spend": "100.00",
                    "ctr": "0.8",
                    "actions": [{"action_type": "link_click", "value": "80"}],
                    "cost_per_action_type": [{"action_type": "link_click", "value": "1.25"}],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/creative-fatigue",
        params={"date_preset": "last_30d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert "alerts" in body
    assert len(body["data"]) == 1
    row = body["data"][0]
    assert "fatigue_score" in row
    assert "fatigue_status" in row
    assert row["fatigue_status"] in ("healthy", "watch", "fatigued")
    assert 0 <= row["fatigue_score"] <= 100


@respx.mock
def test_creative_fatigue_high_frequency_low_ctr_is_fatigued(client):
    """Frecuencia alta + CTR bajo = fatigado."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "ad_id": "ad2",
                    "ad_name": "Anuncio Quemado",
                    "impressions": "50000",
                    "frequency": "8.0",
                    "spend": "500.00",
                    "ctr": "0.1",
                    "actions": [],
                    "cost_per_action_type": [],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/creative-fatigue",
        params={"date_preset": "last_30d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    row = body["data"][0]
    assert row["fatigue_status"] == "fatigued"

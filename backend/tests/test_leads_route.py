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
def test_leads_insights_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "campaign_id": "c1",
                    "campaign_name": "Campaña Leads",
                    "spend": "50.00",
                    "actions": [{"action_type": "lead", "value": "10"}],
                    "cost_per_action_type": [{"action_type": "lead", "value": "5.00"}],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/leads",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert "summary" in body
    assert body["summary"]["total_leads_insights"] >= 0


@respx.mock
def test_leads_by_campaign_returns_two_rows(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {"campaign_id": "c1", "campaign_name": "Camp A", "spend": "30.00",
                 "actions": [{"action_type": "lead", "value": "5"}],
                 "cost_per_action_type": [{"action_type": "lead", "value": "6.00"}]},
                {"campaign_id": "c2", "campaign_name": "Camp B", "spend": "20.00",
                 "actions": [{"action_type": "lead", "value": "3"}],
                 "cost_per_action_type": [{"action_type": "lead", "value": "6.67"}]},
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/leads",
        params={"level": "campaign", "date_preset": "last_30d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
    assert body["summary"]["total_leads_insights"] == 8

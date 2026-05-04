import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as c:
        yield c


@respx.mock
def test_entity_summary_campaign(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "campaign_id": "c1",
                        "campaign_name": "Camp A",
                        "spend": "40",
                        "impressions": "1000",
                        "clicks": "10",
                        "actions": [
                            {
                                "action_type": "onsite_conversion.messaging_conversation_started_7d",
                                "value": "4",
                            }
                        ],
                        "action_values": [],
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/entity-summary",
        params={"level": "campaign", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "campaign"
    assert len(body["data"]) == 1
    row = body["data"][0]
    assert row["entity_id"] == "c1"
    assert row["results"] == 4.0
    assert row["cpa"] is not None


@respx.mock
def test_entity_summary_maximum_uses_date_preset_without_time_range(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "campaign_id": "c1",
                        "campaign_name": "Camp A",
                        "spend": "40",
                        "impressions": "1000",
                        "clicks": "10",
                        "actions": [],
                        "action_values": [],
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/entity-summary",
        params={"level": "campaign", "date_preset": "maximum"},
        headers={"Authorization": "Bearer tok"},
    )
    assert r.status_code == 200
    assert r.json()["date_preset"] == "maximum"
    called_url = route.calls[0].request.url
    assert called_url.params.get("date_preset") == "maximum"
    assert called_url.params.get("time_range") is None


@respx.mock
def test_entity_summary_campaign_filter_maximum_filters_locally(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "campaign_id": "c_keep",
                        "campaign_name": "Keep",
                        "spend": "40",
                        "impressions": "1000",
                        "clicks": "10",
                        "actions": [],
                        "action_values": [],
                    },
                    {
                        "campaign_id": "c_drop",
                        "campaign_name": "Drop",
                        "spend": "10",
                        "impressions": "100",
                        "clicks": "1",
                        "actions": [],
                        "action_values": [],
                    },
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/entity-summary",
        params={"level": "campaign", "date_preset": "maximum", "campaign_id": "c_keep"},
        headers={"Authorization": "Bearer tok"},
    )
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1
    assert r.json()["data"][0]["campaign_id"] == "c_keep"
    called_url = route.calls[0].request.url
    assert called_url.params.get("filtering") is None


@respx.mock
def test_entity_summary_counts_onsite_first_reply_for_objective(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "campaign_id": "c1",
                        "campaign_name": "Camp A",
                        "spend": "20",
                        "impressions": "100",
                        "clicks": "4",
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
        "/api/v1/accounts/act_123/insights/entity-summary",
        params={"level": "campaign", "date_preset": "last_7d", "objective_metric": "messaging_first_reply"},
        headers={"Authorization": "Bearer tok"},
    )
    assert r.status_code == 200
    row = r.json()["data"][0]
    assert row["results"] == 2.0
    assert row["cpa"] == 10.0

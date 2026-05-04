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


def test_audience_insights_aggregates_and_splits_values(client, monkeypatch):
    async def _fake_fetch_insights_all_pages(**kwargs):
        return [
            {
                "ad_id": "ad_1",
                "adset_id": "adset_1",
                "campaign_name": "Campana A",
                "impressions": "1000",
                "clicks": "50",
                "spend": "100",
                "actions": [{"action_type": "lead", "value": "10"}],
            }
        ]

    async def _fake_fetch_graph_edge_all_pages(**kwargs):
        return [
            {
                "id": "adset_1",
                "targeting": {
                    "flexible_spec": [
                        {
                            "interests": [
                                {"id": "i1", "name": "Interes 1"},
                                {"id": "i2", "name": "Interes 2"},
                            ]
                        }
                    ]
                },
            }
        ]

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.audience_insights.fetch_insights_all_pages",
        _fake_fetch_insights_all_pages,
    )
    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.audience_insights.fetch_graph_edge_all_pages",
        _fake_fetch_graph_edge_all_pages,
    )

    r = client.get(
        "/api/v1/accounts/act_123/insights/audiences",
        params={"category": "interests"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
    first = body["data"][0]
    assert first["category"] == "interests"
    assert first["spend"] == 50.0
    assert first["results"] == 5.0
    assert first["ctr"] == 5.0
    assert body["summary"]["rows_considered"] == 1
    assert body["summary"]["rows_with_targeting"] == 1
    assert body["summary"]["distinct_audiences"] == 2


def test_audience_insights_sends_normalized_account_and_custom_range(client, monkeypatch):
    calls: list[dict] = []
    edge_calls: list[dict] = []

    async def _fake_fetch_insights_all_pages(**kwargs):
        calls.append(kwargs)
        return []

    async def _fake_fetch_graph_edge_all_pages(**kwargs):
        edge_calls.append(kwargs)
        return []

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.audience_insights.fetch_insights_all_pages",
        _fake_fetch_insights_all_pages,
    )
    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.audience_insights.fetch_graph_edge_all_pages",
        _fake_fetch_graph_edge_all_pages,
    )

    r = client.get(
        "/api/v1/accounts/123/insights/audiences",
        params={"date_start": "2026-01-01", "date_stop": "2026-01-31"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert calls
    assert edge_calls
    assert calls[0]["ad_account_id"] == "act_123"
    assert calls[0]["time_range"] == {"since": "2026-01-01", "until": "2026-01-31"}
    assert calls[0]["date_preset"] is None
    assert edge_calls[0]["path"] == "act_123/adsets"


def test_audience_insights_requires_complete_custom_range(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/audiences",
        params={"date_start": "2026-01-01"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422


def test_audience_insights_rejects_invalid_category(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/audiences",
        params={"category": "invalid_category"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422
    assert "category debe ser uno de" in r.json()["detail"]


def test_audience_insights_maps_meta_errors_to_502(client, monkeypatch):
    async def _raise_request_error(**kwargs):
        request = httpx.Request("GET", "https://graph.facebook.com/v25.0/act_123/insights")
        raise httpx.RequestError("network down", request=request)

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.audience_insights.fetch_insights_all_pages",
        _raise_request_error,
    )

    r = client.get(
        "/api/v1/accounts/act_123/insights/audiences",
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 502

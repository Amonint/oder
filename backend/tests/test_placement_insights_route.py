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
def test_placement_insights_aligns_cpa_to_objective_metric(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "publisher_platform": "facebook",
                        "platform_position": "feed",
                        "spend": "20.00",
                        "actions": [
                            {"action_type": "link_click", "value": "99"},
                            {"action_type": "onsite_conversion.messaging_first_reply", "value": "2"},
                        ],
                        "cost_per_action_type": [
                            {"action_type": "link_click", "value": "1.00"},
                            {"action_type": "onsite_conversion.messaging_first_reply", "value": "10.00"},
                        ],
                    }
                ]
            },
        )
    )

    r = client.get(
        "/api/v1/accounts/act_123/insights/placements",
        params={
            "date_preset": "last_7d",
            "objective_metric": "messaging_first_reply",
        },
        headers={"Authorization": "Bearer test_tok"},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["objective_metric"] == "messaging_first_reply"
    assert body["data"][0]["cpa_derived"] == 10.0
    assert body["data"][0]["results"] == 2.0

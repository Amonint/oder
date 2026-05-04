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
def test_learning_summary_merges_batch(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "adset_id": "as1",
                        "adset_name": "Set 1",
                        "campaign_id": "c1",
                        "campaign_name": "C1",
                        "spend": "50",
                    }
                ]
            },
        )
    )
    respx.post("https://graph.facebook.com/v25.0/").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "code": 200,
                    "body": '{"id":"as1","learning_stage_info":{"status":"LEARNING"}}',
                }
            ],
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/adsets/learning-summary",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer tok"},
    )
    assert r.status_code == 200
    body = r.json()
    stages = {s["stage"] for s in body["by_stage"]}
    assert "LEARNING" in stages
    assert body["adsets"][0]["learning_stage"] == "LEARNING"

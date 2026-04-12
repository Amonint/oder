import pytest
from fastapi.testclient import TestClient
from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as c:
        yield c


def test_save_and_get_manual_data(client):
    payload = {
        "account_id": "act_123",
        "campaign_id": "c1",
        "ad_id": None,
        "useful_messages": 10,
        "accepted_leads": 5,
        "quotes_sent": 4,
        "sales_closed": 2,
        "avg_ticket": 150.0,
        "estimated_revenue": 300.0,
        "notes": "Semana buena",
    }
    r = client.post(
        "/api/v1/accounts/act_123/manual-data",
        json=payload,
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["accepted_leads"] == 5
    assert "id" in body

    r2 = client.get(
        "/api/v1/accounts/act_123/manual-data",
        headers={"Authorization": "Bearer t"},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["data"]) >= 1
    assert data["data"][0]["accepted_leads"] == 5


def test_get_manual_data_empty(client):
    r = client.get(
        "/api/v1/accounts/act_999/manual-data",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 200
    assert r.json()["data"] == []

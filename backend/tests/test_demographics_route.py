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
def test_demographics_age_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"age": "25-34", "impressions": "1000", "spend": "5.00", "clicks": "50", "ctr": "5.00", "cpm": "5.00", "cpc": "0.10"}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/demographics",
        params={"breakdown": "age", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert body["breakdown"] == "age"
    assert len(body["data"]) == 1
    assert body["data"][0]["age"] == "25-34"


@respx.mock
def test_demographics_gender_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"gender": "female", "impressions": "800", "spend": "4.00", "clicks": "40", "ctr": "5.00", "cpm": "5.00", "cpc": "0.10"}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/demographics",
        params={"breakdown": "gender", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["breakdown"] == "gender"
    assert body["data"][0]["gender"] == "female"


def test_demographics_invalid_breakdown_returns_422(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/demographics",
        params={"breakdown": "country"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422

import json
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
def test_geo_insights_account_scope_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"region": "California", "impressions": "1000"}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/geo",
        params={"scope": "account", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert len(body["data"]) == 1


@respx.mock
def test_geo_insights_ad_scope_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/23456/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"region": "Texas", "impressions": "500"}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/geo",
        params={"scope": "ad", "ad_id": "23456", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert len(body["data"]) == 1

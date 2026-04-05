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
def test_targeting_returns_200(client):
    # Primer call: obtener adset_id del ad
    respx.get("https://graph.facebook.com/v25.0/ad_999").mock(
        return_value=httpx.Response(200, json={"id": "ad_999", "adset_id": "adset_111"})
    )
    # Segundo call: obtener targeting del adset
    respx.get("https://graph.facebook.com/v25.0/adset_111").mock(
        return_value=httpx.Response(
            200,
            json={"id": "adset_111", "targeting": {"age_min": 18, "age_max": 65}},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/ad_999/targeting",
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "targeting" in body
    assert body["targeting"]["age_min"] == 18


@respx.mock
def test_targeting_returns_404_when_no_adset(client):
    respx.get("https://graph.facebook.com/v25.0/ad_999").mock(
        return_value=httpx.Response(200, json={"id": "ad_999"})  # sin adset_id
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/ad_999/targeting",
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 404

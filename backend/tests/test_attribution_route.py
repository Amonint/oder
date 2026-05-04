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
def test_attribution_click_7d_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"spend": "10.00", "actions": [{"action_type": "link_click", "value": "5"}], "cost_per_action_type": [{"action_type": "link_click", "value": "2.00"}]}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/attribution",
        params={"window": "click_7d", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert body["window"] == "click_7d"
    assert "window_label" in body
    assert "available_windows" in body


def test_attribution_invalid_window_returns_422(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/attribution",
        params={"window": "invalid"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422

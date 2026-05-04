import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "t.duckdb"))
    return TestClient(app)


@respx.mock
def test_graph_me_returns_id_and_name(client):
    respx.get("https://graph.facebook.com/v25.0/me").mock(
        return_value=httpx.Response(
            200,
            json={"id": "123", "name": "Test User"},
        )
    )
    r = client.get("/api/v1/me", headers={"Authorization": "Bearer tok"})
    assert r.status_code == 200
    assert r.json() == {"id": "123", "name": "Test User"}

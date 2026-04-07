"""Tests para rutas de páginas por cuenta."""
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


class TestGetPagesList:
    """Tests para GET /api/v1/accounts/{id}/pages."""

    @respx.mock
    def test_pages_list_returns_200(self, client):
        """Devuelve 200 con lista de páginas."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "adset_1", "promoted_object": {"page_id": "page_456"}}
                    ]
                },
            )
        )
        respx.get("https://graph.facebook.com/v25.0/page_456").mock(
            return_value=httpx.Response(
                200,
                json={"id": "page_456", "name": "Test Page", "category": "Marketing"},
            )
        )
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(
                200,
                json={"data": [{"spend": "100.00", "impressions": "5000"}]},
            )
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert len(body["data"]) == 1
        assert body["data"][0]["page_id"] == "page_456"
        assert body["data"][0]["name"] == "Test Page"
        assert body["data"][0]["spend"] == 100.0
        assert body["data"][0]["impressions"] == 5000

    @respx.mock
    def test_pages_list_empty_when_no_adsets(self, client):
        """Devuelve lista vacía cuando no hay adsets."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages",
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        assert r.json()["data"] == []

    @respx.mock
    def test_pages_list_deduplicates_page_ids(self, client):
        """Dos adsets con la misma página → una sola entrada."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "adset_1", "promoted_object": {"page_id": "page_456"}},
                        {"id": "adset_2", "promoted_object": {"page_id": "page_456"}},
                    ]
                },
            )
        )
        respx.get("https://graph.facebook.com/v25.0/page_456").mock(
            return_value=httpx.Response(200, json={"id": "page_456", "name": "Page A"})
        )
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [{"spend": "50.00", "impressions": "1000"}]})
        )
        r = client.get("/api/v1/accounts/act_123/pages", headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1

    @respx.mock
    def test_pages_list_uses_cache_on_second_call(self, client):
        """Segunda llamada idéntica no llama a Meta (caché DuckDB)."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        r1 = client.get(
            "/api/v1/accounts/act_123/pages",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        r2 = client.get(
            "/api/v1/accounts/act_123/pages",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json() == r2.json()
        assert respx.calls.call_count == 1  # Meta solo llamado una vez

    @respx.mock
    def test_pages_list_skips_adsets_without_page_id(self, client):
        """Ignora adsets sin promoted_object o sin page_id."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "adset_1"},
                        {"id": "adset_2", "promoted_object": {}},
                        {"id": "adset_3", "promoted_object": {"page_id": "page_789"}},
                    ]
                },
            )
        )
        respx.get("https://graph.facebook.com/v25.0/page_789").mock(
            return_value=httpx.Response(200, json={"id": "page_789", "name": "Real Page"})
        )
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        r = client.get("/api/v1/accounts/act_123/pages", headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1
        assert r.json()["data"][0]["page_id"] == "page_789"

    @respx.mock
    def test_pages_list_handles_meta_error(self, client):
        """Retorna 502 cuando Meta falla al obtener adsets."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(400, json={"error": {"message": "Invalid token"}})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages",
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 502

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


class TestGetPageInsights:
    @respx.mock
    def test_page_insights_returns_200(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [
                {"spend": "150.00", "impressions": "12000", "reach": "8000",
                 "frequency": "1.5", "cpm": "12.50", "ctr": "2.30"}
            ]})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/insights",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        row = r.json()["data"][0]
        for field in ("spend", "impressions", "reach", "frequency", "cpm", "ctr"):
            assert field in row

    @respx.mock
    def test_page_insights_uses_cache(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [{"spend": "50.00", "impressions": "1000",
                "reach": "800", "frequency": "1.25", "cpm": "50.00", "ctr": "1.50"}]})
        )
        client.get("/api/v1/accounts/act_123/pages/page_456/insights",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        client.get("/api/v1/accounts/act_123/pages/page_456/insights",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert respx.calls.call_count == 1

    @respx.mock
    def test_page_insights_handles_meta_error(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(400, json={"error": {"message": "Invalid token"}})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/insights",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 502


class TestGetPagePlacements:
    @respx.mock
    def test_page_placements_returns_200(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [
                {"spend": "80.00", "impressions": "4000", "reach": "3000",
                 "publisher_platform": "facebook", "platform_position": "feed"},
                {"spend": "20.00", "impressions": "1000", "reach": "900",
                 "publisher_platform": "instagram", "platform_position": "feed"},
            ]})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/placements",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["data"]) == 2
        assert body["data"][0]["publisher_platform"] == "facebook"
        assert "breakdowns" in body
        assert "publisher_platform" in body["breakdowns"]

    @respx.mock
    def test_page_placements_uses_cache(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get("/api/v1/accounts/act_123/pages/page_456/placements",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        client.get("/api/v1/accounts/act_123/pages/page_456/placements",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert respx.calls.call_count == 1

    @respx.mock
    def test_page_placements_handles_meta_error(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(400, json={"error": {"message": "Error"}})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/placements",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 502


class TestGetPageGeo:
    @respx.mock
    def test_page_geo_returns_regions(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [
                {"spend": "60.00", "impressions": "3000", "reach": "2500", "region": "Pichincha"},
                {"spend": "40.00", "impressions": "2000", "reach": "1800", "region": "Guayas"},
            ]})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/geo",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["data"]) == 2
        assert body["data"][0]["region"] == "Pichincha"
        assert "region" in body["breakdowns"]

    @respx.mock
    def test_page_geo_uses_cache(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get("/api/v1/accounts/act_123/pages/page_456/geo",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        client.get("/api/v1/accounts/act_123/pages/page_456/geo",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert respx.calls.call_count == 1

    @respx.mock
    def test_page_geo_handles_meta_error(self, client):
        """Retorna 502 cuando Meta falla."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(400, json={"error": {"message": "Error"}})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/geo",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 502


class TestGetPageActions:
    @respx.mock
    def test_page_actions_groups_into_5_categories(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [{"spend": "100.00", "actions": [
                {"action_type": "post_engagement", "value": "450"},
                {"action_type": "link_click", "value": "89"},
                {"action_type": "video_view", "value": "230"},
                {"action_type": "messaging_conversation_started_7d", "value": "120"},
                {"action_type": "onsite_conversion.post_save", "value": "15"},
            ]}]})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/actions",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        body = r.json()
        categories = {item["category"]: item["value"] for item in body["data"]}
        assert set(categories.keys()) == {"mensajeria", "engagement", "trafico", "video", "guardados"}
        assert categories["engagement"] == 450.0
        assert categories["trafico"] == 89.0
        assert categories["video"] == 230.0
        assert categories["mensajeria"] == 120.0
        assert categories["guardados"] == 15.0

    @respx.mock
    def test_page_actions_always_returns_5_categories(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [{"spend": "10.00", "actions": []}]})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/actions",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        assert len(r.json()["data"]) == 5

    @respx.mock
    def test_page_actions_uses_cache(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get("/api/v1/accounts/act_123/pages/page_456/actions",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        client.get("/api/v1/accounts/act_123/pages/page_456/actions",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert respx.calls.call_count == 1


class TestGetPageTimeseries:
    @respx.mock
    def test_page_timeseries_returns_daily_rows(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [
                {"spend": "10.00", "impressions": "500", "reach": "400",
                 "date_start": "2025-01-01", "date_stop": "2025-01-01"},
                {"spend": "12.00", "impressions": "600", "reach": "500",
                 "date_start": "2025-01-02", "date_stop": "2025-01-02"},
            ]})
        )
        r = client.get("/api/v1/accounts/act_123/pages/page_456/timeseries",
                       params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["data"]) == 2
        assert "date_start" in body["data"][0]
        assert body["time_increment"] == 1

    @respx.mock
    def test_page_timeseries_uses_cache(self, client):
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get("/api/v1/accounts/act_123/pages/page_456/timeseries",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        client.get("/api/v1/accounts/act_123/pages/page_456/timeseries",
                   params={"date_preset": "last_30d"}, headers={"Authorization": "Bearer test_tok"})
        assert respx.calls.call_count == 1

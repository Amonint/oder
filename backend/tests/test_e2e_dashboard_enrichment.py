"""
Suite de tests de integración (end-to-end) para enriquecimiento de datos.
Valida que ranking, geo y targeting cumplen requisitos R-2, R-3, R-4.
"""
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
def test_e2e_ranking_geo_targeting_enrichment(client):
    """
    Flujo completo: ranking enriquecido → geo con metadata → targeting formateado.
    Cumple R-2, R-3, R-4.
    """
    # Mock ranking
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_100",
                        "ad_name": "Black Friday 2026",
                        "campaign_name": "Campaign 1",
                        "impressions": "5000",
                        "clicks": "150",
                        "spend": "100.00",
                        "reach": "4800",
                        "frequency": "1.04",
                        "cpm": "20.00",
                        "cpp": "0.67",
                        "ctr": "3.00",
                    }
                ]
            },
        )
    )

    r_ranking = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r_ranking.status_code == 200
    ranking_body = r_ranking.json()
    assert ranking_body["data"][0]["ad_label"] == "Black Friday 2026"  # R-2.1

    # Mock geo
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"region": "ES-CA", "impressions": "2000", "clicks": "60", "spend": "50.00", "reach": "1950"},
                    {"region": "ES-MD", "impressions": "3000", "clicks": "90", "spend": "50.00", "reach": "2850"},
                ]
            },
        )
    )

    r_geo = client.get(
        "/api/v1/accounts/act_123/insights/geo",
        params={"scope": "account", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r_geo.status_code == 200
    geo_body = r_geo.json()
    assert geo_body["data"][0]["region_name"] == "Cataluña"  # R-3.1
    assert geo_body["metadata"]["complete_coverage"] is True  # R-3.2
    assert geo_body["metadata"]["scope"] == "account"  # R-3.4

    # Mock targeting
    respx.get("https://graph.facebook.com/v25.0/ad_100").mock(
        return_value=httpx.Response(200, json={"id": "ad_100", "adset_id": "adset_555"})
    )
    respx.get("https://graph.facebook.com/v25.0/adset_555").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "adset_555",
                "targeting": {
                    "age_min": 25,
                    "age_max": 55,
                    "genders": [1, 2],
                    "geo_locations": {"countries": ["ES"], "regions": [{"key": "ES-CA"}]},
                    "flexible_spec": [
                        {"interests": [{"id": "6003107", "name": "Technology"}]}
                    ],
                },
            },
        )
    )

    r_targeting = client.get(
        "/api/v1/accounts/act_123/ads/ad_100/targeting",
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r_targeting.status_code == 200
    targeting_body = r_targeting.json()
    assert "age_range" in targeting_body["targeting"]  # R-4.1
    assert "25-55 años" in targeting_body["targeting"]["age_range"]
    assert "Masculino" in targeting_body["targeting"]["genders"]  # R-4.1
    assert "Cataluña" in str(targeting_body["targeting"]["locations"])  # R-4.2
    assert "Technology" in str(targeting_body["targeting"]["audiences"])  # R-4.3
    assert "raw_json" in targeting_body["targeting"]  # R-4.4

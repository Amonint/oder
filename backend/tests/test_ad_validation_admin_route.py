import sys
import types

from fastapi.testclient import TestClient

if "jwt" not in sys.modules:
    jwt_stub = types.ModuleType("jwt")

    class _InvalidTokenError(Exception):
        pass

    class _ExpiredSignatureError(_InvalidTokenError):
        pass

    def _encode(*args, **kwargs):
        return "stub.jwt.token"

    def _decode(*args, **kwargs):
        return {"sub": "stub"}

    jwt_stub.InvalidTokenError = _InvalidTokenError
    jwt_stub.ExpiredSignatureError = _ExpiredSignatureError
    jwt_stub.encode = _encode
    jwt_stub.decode = _decode
    sys.modules["jwt"] = jwt_stub

from oderbiz_analytics.api.main import app


def test_admin_creates_study_reads_dashboard_and_exports_csv(monkeypatch, tmp_path):
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/ad-validation/studies",
            json={
                "name": "Banner v1",
                "campaign_id": "cmp_1",
                "ad_id": "ad_1",
                "image_url": "https://cdn.example/banner.png",
                "image_width": 1200,
                "image_height": 628,
            },
        )
        assert created.status_code == 201
        study_id = created.json()["id"]

        dashboard = client.get(f"/api/v1/ad-validation/studies/{study_id}/dashboard")
        assert dashboard.status_code == 200
        assert dashboard.json()["study"]["id"] == study_id

        exported = client.get(f"/api/v1/ad-validation/studies/{study_id}/export.csv")
        assert exported.status_code == 200
        assert exported.headers["content-type"].startswith("text/csv")


def test_dashboard_hides_heatmap_without_valid_sessions(monkeypatch, tmp_path):
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/ad-validation/studies",
            json={
                "name": "No data",
                "image_url": "https://cdn.example/no-data.png",
                "image_width": 1080,
                "image_height": 1080,
            },
        )
        study_id = created.json()["id"]
        dashboard = client.get(f"/api/v1/ad-validation/studies/{study_id}/dashboard")
        body = dashboard.json()
        assert body["metrics"]["valid_sessions"] == 0
        assert body["heatmap"] is None
        assert body["metrics"]["confidence_note"] == "Sin sesiones válidas"

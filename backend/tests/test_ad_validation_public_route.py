import sys
import types

from fastapi.testclient import TestClient

from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    create_study,
    init_ad_validation_tables,
)

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


def test_public_flow_start_append_complete(monkeypatch, tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DUCKDB_PATH", db_path)
    init_ad_validation_tables(db_path)
    study = create_study(
        db_path,
        {
            "name": "Ad test",
            "image_url": "https://cdn.example/ad.png",
            "image_width": 1080,
            "image_height": 1080,
        },
    )
    with TestClient(app) as client:
        token = study["public_token"]

        s = client.post(
            f"/api/v1/ad-validation/public/{token}/sessions/start",
            json={"participant_id": "anon-x", "calibration_score": 0.9},
        )
        assert s.status_code == 201
        session_id = s.json()["session_id"]

        e = client.post(
            f"/api/v1/ad-validation/public/sessions/{session_id}/events",
            json={"gaze_points": [{"x": 0.4, "y": 0.4, "t": 20}] * 140},
        )
        assert e.status_code == 202

        done = client.post(
            f"/api/v1/ad-validation/public/sessions/{session_id}/complete",
            json={"duration_ms": 8200},
        )
        assert done.status_code == 200
        assert done.json()["session_status"] in {"completed", "low_confidence"}

# backend/tests/test_summary.py
import json

import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.adapters.duckdb.client import init_db, insert_raw_insights_row


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.duckdb")
    init_db(path)
    return path


@pytest.fixture
def client(monkeypatch, db_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", db_path)
    from oderbiz_analytics.api.main import app

    return TestClient(app)


def test_summary_returns_latest_raw(client, db_path, monkeypatch):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", db_path)
    insert_raw_insights_row(
        db_path=db_path,
        ad_account_id="act_1",
        object_id="act_1",
        level="account",
        date_preset="last_30d",
        fields="spend",
        payload={"data": [{"spend": "5.00"}]},
    )
    r = client.get("/api/v1/accounts/act_1/summary")
    assert r.status_code == 200
    result = r.json()
    assert result["data"] is not None
    payload = json.loads(result["data"])
    assert payload["data"][0]["spend"] == "5.00"


def test_summary_returns_none_when_no_data(client):
    r = client.get("/api/v1/accounts/act_999/summary")
    assert r.status_code == 200
    assert r.json()["data"] is None

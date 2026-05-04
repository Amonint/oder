# backend/tests/test_duckdb_client.py
import json

import pytest

from oderbiz_analytics.adapters.duckdb.client import (
    init_db,
    insert_raw_insights_row,
    query_latest_raw,
)


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test.duckdb")
    init_db(path)
    return path


def test_init_db_creates_tables(db_path):
    import duckdb

    con = duckdb.connect(db_path)
    tables = {r[0] for r in con.execute("SHOW TABLES").fetchall()}
    con.close()
    assert "raw_meta_insights" in tables


def test_insert_and_query_latest_raw(db_path):
    insert_raw_insights_row(
        db_path=db_path,
        ad_account_id="act_1",
        object_id="act_1",
        level="account",
        date_preset="last_30d",
        fields="spend",
        payload={"data": [{"spend": "5.00"}]},
    )
    result = query_latest_raw(db_path, "act_1")
    assert result is not None
    data = json.loads(result)
    assert data["data"][0]["spend"] == "5.00"


def test_query_latest_raw_returns_none_when_empty(db_path):
    result = query_latest_raw(db_path, "act_999")
    assert result is None


def test_insert_multiple_returns_latest(db_path):
    insert_raw_insights_row(
        db_path=db_path,
        ad_account_id="act_1",
        object_id="act_1",
        level="account",
        date_preset="last_30d",
        fields="spend",
        payload={"data": [{"spend": "1.00"}]},
    )
    insert_raw_insights_row(
        db_path=db_path,
        ad_account_id="act_1",
        object_id="act_1",
        level="account",
        date_preset="last_30d",
        fields="spend",
        payload={"data": [{"spend": "99.00"}]},
    )
    result = query_latest_raw(db_path, "act_1")
    data = json.loads(result)
    assert data["data"][0]["spend"] == "99.00"

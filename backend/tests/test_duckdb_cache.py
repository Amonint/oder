"""Tests para helpers de caché en DuckDB."""
from oderbiz_analytics.adapters.duckdb.client import get_cache, init_db, set_cache


def test_cache_miss_returns_none(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    result = get_cache(db, "nonexistent_key")
    assert result is None


def test_cache_set_and_get_roundtrip(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    payload = {"data": [{"region": "Pichincha", "spend": "10.00"}], "total": 1}
    set_cache(db, "key_abc", payload)
    result = get_cache(db, "key_abc")
    assert result == payload


def test_cache_overwrite_on_duplicate_key(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    set_cache(db, "key_abc", {"v": 1})
    set_cache(db, "key_abc", {"v": 2})
    result = get_cache(db, "key_abc")
    assert result == {"v": 2}


def test_cache_different_keys_are_independent(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    set_cache(db, "key_a", {"x": 1})
    set_cache(db, "key_b", {"x": 2})
    assert get_cache(db, "key_a") == {"x": 1}
    assert get_cache(db, "key_b") == {"x": 2}

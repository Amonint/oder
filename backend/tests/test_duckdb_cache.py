"""Tests para helpers de caché en DuckDB."""
import duckdb
from datetime import UTC, datetime, timedelta

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


def test_cache_hit_within_ttl(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    set_cache(db, "key_ttl", {"v": 1})
    result = get_cache(db, "key_ttl", max_age_hours=24)
    assert result == {"v": 1}


def test_cache_miss_when_expired(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    set_cache(db, "key_old", {"v": 99})
    con = duckdb.connect(db)
    old_ts = datetime.now(UTC) - timedelta(hours=25)
    con.execute("UPDATE api_cache SET cached_at = ? WHERE cache_key = ?", [old_ts, "key_old"])
    con.close()
    result = get_cache(db, "key_old", max_age_hours=24)
    assert result is None


def test_cache_no_ttl_returns_old_entry(tmp_path):
    """max_age_hours=None desactiva el TTL — comportamiento legacy."""
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    set_cache(db, "key_perm", {"v": 7})
    con = duckdb.connect(db)
    old_ts = datetime.now(UTC) - timedelta(days=365)
    con.execute("UPDATE api_cache SET cached_at = ? WHERE cache_key = ?", [old_ts, "key_perm"])
    con.close()
    result = get_cache(db, "key_perm", max_age_hours=None)
    assert result == {"v": 7}


def test_purge_old_cache_entries_removes_expired(tmp_path):
    db = str(tmp_path / "test.duckdb")
    init_db(db)
    from oderbiz_analytics.adapters.duckdb.client import purge_old_cache_entries
    set_cache(db, "recent", {"v": 1})
    set_cache(db, "old", {"v": 2})
    con = duckdb.connect(db)
    old_ts = datetime.now(UTC) - timedelta(hours=25)
    con.execute("UPDATE api_cache SET cached_at = ? WHERE cache_key = ?", [old_ts, "old"])
    con.close()
    deleted = purge_old_cache_entries(db, max_age_hours=24)
    assert deleted == 1
    assert get_cache(db, "recent") is not None
    assert get_cache(db, "old") is None

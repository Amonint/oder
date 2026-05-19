# Cache TTL Fix — Eliminar datos estancados en todos los gráficos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar TTL de 24 horas al cache DuckDB para que los datos estancados expiren automáticamente, eliminando la necesidad de bumpar claves manualmente.

**Architecture:** El cache DuckDB (`api_cache`) almacena respuestas de Meta sin vencimiento. La función `get_cache` simplemente busca por `cache_key` sin revisar `cached_at`. La solución: agregar un parámetro `max_age_hours=24` a `get_cache` que filtre entradas viejas directamente en SQL. También se agrega `purge_old_cache_entries` para limpiar el DuckDB y se bumpa el único endpoint que quedó sin actualizar (`page_ad_diag_spark` → `page_ad_diag_spark_v2`).

**Tech Stack:** Python 3.12, DuckDB, FastAPI, pytest, pyproject.toml (runner: `python3.12 -m pytest`)

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `backend/src/oderbiz_analytics/adapters/duckdb/client.py` | `get_cache` +TTL, `purge_old_cache_entries` nueva función |
| `backend/src/oderbiz_analytics/api/routes/pages.py` | Bumpar `page_ad_diag_spark` → `page_ad_diag_spark_v2` |
| `backend/tests/test_duckdb_cache.py` | Tests de TTL y purge |

---

### Task 1: Agregar TTL a `get_cache` y función `purge_old_cache_entries`

**Files:**
- Modify: `backend/src/oderbiz_analytics/adapters/duckdb/client.py:109-121`
- Test: `backend/tests/test_duckdb_cache.py`

- [ ] **Step 1: Escribir tests que fallan**

Agregar estos tests al final de `backend/tests/test_duckdb_cache.py`:

```python
from datetime import UTC, datetime, timedelta


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
    # Actualizar cached_at a 25 horas en el pasado
    import duckdb
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
    import duckdb
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
    import duckdb
    con = duckdb.connect(db)
    old_ts = datetime.now(UTC) - timedelta(hours=25)
    con.execute("UPDATE api_cache SET cached_at = ? WHERE cache_key = ?", [old_ts, "old"])
    con.close()
    deleted = purge_old_cache_entries(db, max_age_hours=24)
    assert deleted == 1
    assert get_cache(db, "recent") is not None
    assert get_cache(db, "old") is None
```

- [ ] **Step 2: Correr tests para confirmar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python3.12 -m pytest tests/test_duckdb_cache.py -v
```

Esperado: 4 pasan (existentes), 4 nuevos fallan con `TypeError: get_cache() got an unexpected keyword argument 'max_age_hours'`.

- [ ] **Step 3: Implementar TTL en `get_cache` y `purge_old_cache_entries`**

Reemplazar `get_cache` y agregar `purge_old_cache_entries` en `backend/src/oderbiz_analytics/adapters/duckdb/client.py`:

```python
def get_cache(db_path: str, cache_key: str, max_age_hours: int | None = 24) -> dict | None:
    """Retorna el payload cacheado o None si no existe o si expiró el TTL.

    max_age_hours=None desactiva el TTL (comportamiento legacy — rango de fechas fijo).
    """
    con = duckdb.connect(db_path, read_only=True)
    try:
        if max_age_hours is not None:
            cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
            row = con.execute(
                "SELECT payload_json FROM api_cache WHERE cache_key = ? AND cached_at > ?",
                [cache_key, cutoff],
            ).fetchone()
        else:
            row = con.execute(
                "SELECT payload_json FROM api_cache WHERE cache_key = ?",
                [cache_key],
            ).fetchone()
    finally:
        con.close()
    if row is None:
        return None
    return json.loads(row[0])


def purge_old_cache_entries(db_path: str, max_age_hours: int = 24) -> int:
    """Elimina entradas del cache más viejas que max_age_hours. Retorna número de filas eliminadas."""
    cutoff = datetime.now(UTC) - timedelta(hours=max_age_hours)
    con = duckdb.connect(db_path)
    try:
        result = con.execute(
            "DELETE FROM api_cache WHERE cached_at <= ?",
            [cutoff],
        )
        return result.rowcount or 0
    finally:
        con.close()
```

También agregar `timedelta` al import existente en la línea 6:
```python
from datetime import UTC, datetime, timedelta
```

- [ ] **Step 4: Correr tests para confirmar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python3.12 -m pytest tests/test_duckdb_cache.py -v
```

Esperado: 8 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/duckdb/client.py backend/tests/test_duckdb_cache.py
git commit -m "feat(cache): add 24h TTL to get_cache and purge_old_cache_entries"
```

---

### Task 2: Bumpar `page_ad_diag_spark` → `page_ad_diag_spark_v2`

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py:1213`

- [ ] **Step 1: Localizar y cambiar la clave**

En `backend/src/oderbiz_analytics/api/routes/pages.py`, línea 1213:

```python
# ANTES
cache_key = _make_cache_key(normalized_id, "page_ad_diag_spark", page_id=page_id,

# DESPUÉS
cache_key = _make_cache_key(normalized_id, "page_ad_diag_spark_v2", page_id=page_id,
```

- [ ] **Step 2: Verificar que no hay referencias rotas**

```bash
grep -n "page_ad_diag_spark" "/Users/lamnda/Documents/oderbiz analitics/backend/src/oderbiz_analytics/api/routes/pages.py"
```

Esperado: solo 1 línea con `page_ad_diag_spark_v2`, ninguna con `page_ad_diag_spark"`.

- [ ] **Step 3: Correr tests de pages**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python3.12 -m pytest tests/test_pages_routes.py -v 2>&1 | tail -20
```

Esperado: todos pasan (o los mismos que pasaban antes).

- [ ] **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/pages.py
git commit -m "fix(cache): bump page_ad_diag_spark to v2 to invalidate stale adset data"
```

---

### Task 3: Verificación end-to-end

**Files:**
- Read: `backend/src/oderbiz_analytics/api/routes/pages.py`

- [ ] **Step 1: Confirmar que TODOS los endpoints de pages usan daily rotation o TTL**

```bash
grep -n "_make_cache_key" "/Users/lamnda/Documents/oderbiz analitics/backend/src/oderbiz_analytics/api/routes/pages.py"
```

Verificar que la lista sea exactamente:
- `pages_list` — incluye `date_preset` → rota diariamente ✓
- `adset_ids_for_page_v2` — incluye `date_preset="last_30d"` → rota diariamente ✓
- `page_insights_v3` — incluye `date_preset` → rota diariamente ✓
- `page_placements_v2` — incluye `date_preset` → rota diariamente ✓
- `page_geo_v2` — incluye `date_preset` → rota diariamente ✓
- `page_demographics_v2` — incluye `date_preset` → rota diariamente ✓
- `page_actions_v2` — incluye `date_preset` → rota diariamente ✓
- `page_timeseries_v2` — incluye `date_preset` → rota diariamente ✓
- `page_conv_ts_v4` — incluye `date_preset` → rota diariamente ✓
- `page_traffic_quality_v2` — incluye `date_preset` → rota diariamente ✓
- `page_traffic_quality_ts_v2` — incluye `date_preset` → rota diariamente ✓
- `page_ad_diag_spark_v2` — incluye `date_preset` → rota diariamente ✓
- `page_funnel_v4` — incluye `date_preset` → rota diariamente ✓

- [ ] **Step 2: Confirmar que ningún otro route usa get_cache/set_cache**

```bash
grep -rn "get_cache\|set_cache" "/Users/lamnda/Documents/oderbiz analitics/backend/src/" --include="*.py" | grep -v "pages.py" | grep -v "client.py" | grep -v "__pycache__"
```

Esperado: ninguna línea de output (solo pages.py usa el cache DuckDB).

- [ ] **Step 3: Correr suite completa de tests relevantes**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python3.12 -m pytest tests/test_duckdb_cache.py tests/test_pages_routes.py -v 2>&1 | tail -20
```

Esperado: todos pasan.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "fix(cache): complete cache TTL audit — all page endpoints verified, no stale data possible"
```

---

## Resultado esperado

1. `get_cache` rechaza automáticamente cualquier entrada con más de 24 horas → datos estancados imposibles sin bumpar claves
2. `purge_old_cache_entries` puede llamarse periódicamente para mantener el DuckDB limpio
3. Todos los 13 endpoints de `pages.py` tienen claves con rotación diaria → doble protección
4. Ningún otro route usa el cache DuckDB → scope del problema acotado a pages.py

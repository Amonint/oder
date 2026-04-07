# Dashboard "Página Primero" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el flujo Token → Cuenta → Páginas → Dashboard completo con caché DuckDB permanente y filtros unificados por página.

**Architecture:** 6 endpoints FastAPI nuevos bajo `/accounts/{account_id}/pages`, caché SHA256 en DuckDB sin TTL (permanente), frontend React con `FilterContext` compartido y 5 bloques de visualización independientes que re-fetchen automáticamente al cambiar cualquier filtro.

**Tech Stack:** FastAPI + DuckDB + httpx + asyncio (backend); React 18 + React Query + Recharts + Shadcn UI + React Router (frontend).

---

## Mapa de archivos

### Backend — Crear
- `backend/src/oderbiz_analytics/api/routes/pages.py` — 6 endpoints de páginas
- `backend/tests/test_pages_routes.py` — tests para los 6 endpoints
- `backend/tests/test_duckdb_cache.py` — tests para helpers de caché

### Backend — Modificar
- `backend/src/oderbiz_analytics/adapters/duckdb/client.py` — agregar tabla `api_cache` + `get_cache()` / `set_cache()`
- `backend/src/oderbiz_analytics/api/main.py` — registrar `pages_router`

### Frontend — Crear
- `frontend/src/context/FilterContext.tsx` — estado de filtros compartido
- `frontend/src/routes/PagesPage.tsx` — lista de páginas por cuenta
- `frontend/src/components/PageCard.tsx` — fila/card de una página
- `frontend/src/components/KpiGrid.tsx` — 6 cards de KPI
- `frontend/src/components/PlacementChart.tsx` — barras por plataforma/posición
- `frontend/src/components/ActionsChart.tsx` — barras por categoría de acción
- `frontend/src/components/TimeseriesChart.tsx` — línea diaria gasto + impresiones

### Frontend — Modificar
- `frontend/src/api/client.ts` — agregar 7 funciones API y sus tipos
- `frontend/src/routes/DashboardPage.tsx` — refactorizar para usar `pageId` y `FilterContext`
- `frontend/src/routes/AccountsPage.tsx` — cambiar navegación a `/pages`
- `frontend/src/main.tsx` — agregar rutas `PagesPage` y `DashboardPage` nueva

---

## Task 1: Caché DuckDB — tabla `api_cache` y helpers

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/adapters/duckdb/client.py`
- Crear: `backend/tests/test_duckdb_cache.py`

- [ ] **Paso 1: Escribir tests que fallan**

Crear `backend/tests/test_duckdb_cache.py`:

```python
"""Tests para helpers de caché en DuckDB."""
import pytest
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
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_duckdb_cache.py -v
```

Esperado: `ImportError` o `AttributeError` (funciones no existen aún).

- [ ] **Paso 3: Agregar tabla y helpers en `client.py`**

En `backend/src/oderbiz_analytics/adapters/duckdb/client.py`, agregar `api_cache` al esquema y las dos funciones. El archivo final debe quedar así (solo mostrar los cambios — no borrar código existente):

**Agregar al bloque `_SCHEMA`** (al final, antes del cierre de comillas triples):

```python
# Agregar al final de _SCHEMA, antes del cierre """
CREATE TABLE IF NOT EXISTS api_cache (
    cache_key    VARCHAR PRIMARY KEY,
    payload_json VARCHAR NOT NULL,
    cached_at    TIMESTAMPTZ NOT NULL
);
```

**Agregar al final del archivo** (después de `query_latest_raw`):

```python
def get_cache(db_path: str, cache_key: str) -> dict | None:
    """Retorna el payload cacheado o None si no existe la clave."""
    con = duckdb.connect(db_path)
    try:
        row = con.execute(
            "SELECT payload_json FROM api_cache WHERE cache_key = ?",
            [cache_key],
        ).fetchone()
    finally:
        con.close()
    if row is None:
        return None
    return json.loads(row[0])


def set_cache(db_path: str, cache_key: str, payload: dict) -> None:
    """Guarda (o sobreescribe) un payload en caché. Sin TTL — permanente."""
    con = duckdb.connect(db_path)
    try:
        con.execute("DELETE FROM api_cache WHERE cache_key = ?", [cache_key])
        con.execute(
            "INSERT INTO api_cache (cache_key, payload_json, cached_at) VALUES (?, ?, ?)",
            [cache_key, json.dumps(payload), datetime.now(UTC)],
        )
    finally:
        con.close()
```

- [ ] **Paso 4: Ejecutar tests — verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_duckdb_cache.py -v
```

Esperado: 4 PASSED.

- [ ] **Paso 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/adapters/duckdb/client.py backend/tests/test_duckdb_cache.py
git commit -m "feat(duckdb): add api_cache table with get_cache/set_cache helpers"
```

---

## Task 2: Backend — Ruta `/accounts/{id}/pages` (lista de páginas)

**Archivos:**
- Crear: `backend/src/oderbiz_analytics/api/routes/pages.py`
- Crear: `backend/tests/test_pages_routes.py` (primera clase)

La lógica de esta ruta:
1. Escanea adsets de la cuenta buscando `promoted_object.page_id`
2. Para cada `page_id` único, obtiene nombre/categoría desde `/{page_id}?fields=name,category`
3. Para cada `page_id`, obtiene `spend` e `impressions` con filtering por página
4. Devuelve lista ordenada por spend DESC

- [ ] **Paso 1: Escribir tests que fallan**

Crear `backend/tests/test_pages_routes.py`:

```python
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
        """Devuelve lista vacía cuando no hay adsets con promoted_object."""
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
        """Deduplication: dos adsets con la misma página → una sola entrada."""
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
        r = client.get(
            "/api/v1/accounts/act_123/pages",
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1

    @respx.mock
    def test_pages_list_uses_cache_on_second_call(self, client):
        """Segunda llamada idéntica no llama a Meta."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        # Primera llamada
        r1 = client.get(
            "/api/v1/accounts/act_123/pages",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r1.status_code == 200
        # Segunda llamada — respx contaría una sola llamada si el caché funciona
        r2 = client.get(
            "/api/v1/accounts/act_123/pages",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r2.status_code == 200
        assert r1.json() == r2.json()
        # Solo 1 llamada a adsets (la primera)
        assert respx.calls.call_count == 1

    @respx.mock
    def test_pages_list_skips_adsets_without_page_id(self, client):
        """Ignora adsets sin promoted_object o sin page_id."""
        respx.get("https://graph.facebook.com/v25.0/act_123/adsets").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "adset_1"},  # sin promoted_object
                        {"id": "adset_2", "promoted_object": {}},  # promoted_object vacío
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
        r = client.get(
            "/api/v1/accounts/act_123/pages",
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1
        assert r.json()["data"][0]["page_id"] == "page_789"
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPagesList -v
```

Esperado: ERROR con `ImportError` o 404 (ruta no existe).

- [ ] **Paso 3: Crear `pages.py` con la ruta de lista de páginas**

Crear `backend/src/oderbiz_analytics/api/routes/pages.py`:

```python
"""Rutas de páginas por cuenta: lista y endpoints de métricas por página."""
from __future__ import annotations

import asyncio
import hashlib
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.duckdb.client import get_cache, set_cache
from oderbiz_analytics.adapters.meta.graph_edges import fetch_graph_edge_all_pages
from oderbiz_analytics.adapters.meta.insights import fetch_insights, fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["pages"])

# ─────────────────────────────────────────────
# Helpers compartidos
# ─────────────────────────────────────────────

ACTION_GROUPS: dict[str, set[str]] = {
    "mensajeria": {
        "onsite_conversion.total_messaging_connection",
        "messaging_conversation_started_7d",
        "messaging_first_reply",
        "messaging_user_depth_2_message_send",
        "messaging_user_depth_3_message_send",
    },
    "engagement": {
        "post_engagement",
        "page_engagement",
        "post_reaction",
        "like",
        "post_interaction_net",
        "post_interaction_gross",
    },
    "trafico": {"link_click"},
    "video": {"video_view"},
    "guardados": {
        "onsite_conversion.post_save",
        "onsite_conversion.post_net_save",
    },
}


def _make_cache_key(
    account_id: str,
    endpoint: str,
    page_id: str = "",
    date_preset: str = "",
    campaign_id: str = "",
    adset_id: str = "",
    ad_id: str = "",
) -> str:
    raw = f"{account_id}|{page_id}|{endpoint}|{date_preset}|{campaign_id}|{adset_id}|{ad_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _page_filtering(
    page_id: str,
    campaign_id: str = "",
    adset_id: str = "",
    ad_id: str = "",
) -> list[dict]:
    """Construye lista de filtros para Meta: siempre filtra por page_id + filtro en cascada opcional."""
    filters: list[dict] = [
        {"field": "adset.promoted_object_page_id", "operator": "EQUAL", "value": page_id}
    ]
    aid = ad_id.strip()
    sid = adset_id.strip()
    cid = campaign_id.strip()
    if aid:
        filters.append({"field": "ad.id", "operator": "IN", "value": [aid]})
    elif sid:
        filters.append({"field": "adset.id", "operator": "IN", "value": [sid]})
    elif cid:
        filters.append({"field": "campaign.id", "operator": "IN", "value": [cid]})
    return filters


def _group_actions(rows: list[dict]) -> list[dict]:
    """Agrupa action_types en 5 categorías de negocio y suma sus valores."""
    totals: dict[str, float] = {cat: 0.0 for cat in ACTION_GROUPS}
    for row in rows:
        for action in row.get("actions") or []:
            atype = action.get("action_type", "")
            value = float(action.get("value", 0) or 0)
            for cat, types in ACTION_GROUPS.items():
                if atype in types:
                    totals[cat] += value
    return [{"category": cat, "value": totals[cat]} for cat in ACTION_GROUPS]


# ─────────────────────────────────────────────
# Endpoint 1: Lista de páginas por cuenta
# ─────────────────────────────────────────────

@router.get("/{ad_account_id}/pages")
async def get_pages_list(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Lista páginas con campañas activas/inactivas en la cuenta.
    Extrae page_id de adset.promoted_object y enriquece con métricas del periodo.
    Respeta caché DuckDB permanente.
    """
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    cache_key = _make_cache_key(normalized_id, "pages_list", date_preset=effective_preset)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    try:
        adsets = await fetch_graph_edge_all_pages(
            base_url=base,
            access_token=access_token,
            path=f"{normalized_id}/adsets",
            fields="promoted_object",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener adsets de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    page_ids: set[str] = set()
    for adset in adsets:
        po = adset.get("promoted_object") or {}
        pid = po.get("page_id")
        if pid:
            page_ids.add(str(pid))

    if not page_ids:
        result: dict = {"data": [], "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    async def _fetch_page_data(page_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Info de la página (nombre, categoría)
            try:
                info_r = await client.get(
                    f"{base}/{page_id}",
                    params={"fields": "name,category", "access_token": access_token},
                )
                page_info = info_r.json() if info_r.is_success else {}
            except httpx.RequestError:
                page_info = {}

            # Insights filtrados por esta página
            try:
                rows = await fetch_insights(
                    base_url=base,
                    access_token=access_token,
                    ad_account_id=normalized_id,
                    fields="spend,impressions",
                    date_preset=effective_preset,
                    level="account",
                    filtering=[
                        {"field": "adset.promoted_object_page_id", "operator": "EQUAL", "value": page_id}
                    ],
                    client=client,
                )
                row = rows[0] if rows else {}
            except (httpx.HTTPStatusError, httpx.RequestError):
                row = {}

        return {
            "page_id": page_id,
            "name": page_info.get("name", page_id),
            "category": page_info.get("category", ""),
            "spend": float(row.get("spend", 0) or 0),
            "impressions": int(row.get("impressions", 0) or 0),
            "date_preset": effective_preset,
        }

    pages = list(await asyncio.gather(*[_fetch_page_data(pid) for pid in page_ids]))
    pages_sorted = sorted(pages, key=lambda x: x["spend"], reverse=True)

    result = {"data": pages_sorted, "date_preset": effective_preset}
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Paso 4: Registrar el router en `main.py` (temporal, para que los tests pasen)**

En `backend/src/oderbiz_analytics/api/main.py`, agregar al bloque de imports y al `include_router`:

```python
# Agregar import:
from oderbiz_analytics.api.routes.pages import router as pages_router

# Agregar en la lista de include_router:
app.include_router(pages_router, prefix="/api/v1")
```

- [ ] **Paso 5: Ejecutar tests — verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPagesList -v
```

Esperado: 5 PASSED.

- [ ] **Paso 6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_pages_routes.py
git commit -m "feat(backend): add GET /accounts/{id}/pages with DuckDB cache"
```

---

## Task 3: Backend — KPIs de página (`/pages/{page_id}/insights`)

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/pages.py`
- Modificar: `backend/tests/test_pages_routes.py` (agregar `TestGetPageInsights`)

- [ ] **Paso 1: Agregar tests para KPIs**

En `backend/tests/test_pages_routes.py`, agregar al final:

```python
class TestGetPageInsights:
    """Tests para GET /api/v1/accounts/{id}/pages/{page_id}/insights."""

    @respx.mock
    def test_page_insights_returns_200(self, client):
        """Devuelve 200 con los 6 KPIs del periodo."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "spend": "150.00",
                            "impressions": "12000",
                            "reach": "8000",
                            "frequency": "1.5",
                            "cpm": "12.50",
                            "ctr": "2.30",
                        }
                    ]
                },
            )
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/insights",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        row = body["data"][0]
        assert "spend" in row
        assert "impressions" in row
        assert "reach" in row
        assert "frequency" in row
        assert "cpm" in row
        assert "ctr" in row

    @respx.mock
    def test_page_insights_uses_cache(self, client):
        """Segunda llamada idéntica sirve desde caché."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [{"spend": "50.00", "impressions": "1000", "reach": "800", "frequency": "1.25", "cpm": "50.00", "ctr": "1.50"}]})
        )
        r1 = client.get(
            "/api/v1/accounts/act_123/pages/page_456/insights",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        r2 = client.get(
            "/api/v1/accounts/act_123/pages/page_456/insights",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert respx.calls.call_count == 1  # Meta solo se llamó una vez

    @respx.mock
    def test_page_insights_applies_cascade_campaign_filter(self, client):
        """Filtra por campaign_id cuando se proporciona."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/insights",
            params={"date_preset": "last_30d", "campaign_id": "camp_100"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200

    @respx.mock
    def test_page_insights_handles_meta_error(self, client):
        """Retorna 502 cuando Meta falla."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(400, json={"error": {"message": "Invalid token"}})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/insights",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 502
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageInsights -v
```

Esperado: 404 (ruta no existe aún).

- [ ] **Paso 3: Agregar endpoint a `pages.py`**

En `backend/src/oderbiz_analytics/api/routes/pages.py`, agregar después del endpoint de lista:

```python
# ─────────────────────────────────────────────
# Endpoint 2: KPIs de página (insights agregados)
# ─────────────────────────────────────────────

@router.get("/{ad_account_id}/pages/{page_id}/insights")
async def get_page_insights(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """KPIs de pauta para una página: spend, impressions, reach, frequency, cpm, ctr."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    aid = (ad_id or "").strip()

    cache_key = _make_cache_key(
        normalized_id, "page_insights", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid,
    )
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields="spend,impressions,reach,frequency,cpm,ctr",
            date_preset=effective_preset,
            level="account",
            filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener KPIs de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {
        "data": rows,
        "page_id": page_id,
        "date_preset": effective_preset,
        "campaign_id": cid or None,
        "adset_id": sid or None,
        "ad_id": aid or None,
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Paso 4: Ejecutar tests — verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageInsights -v
```

Esperado: 4 PASSED.

- [ ] **Paso 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py backend/tests/test_pages_routes.py
git commit -m "feat(backend): add GET /accounts/{id}/pages/{page_id}/insights (KPIs)"
```

---

## Task 4: Backend — Placements de página (`/pages/{page_id}/placements`)

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/pages.py`
- Modificar: `backend/tests/test_pages_routes.py`

- [ ] **Paso 1: Agregar tests**

En `backend/tests/test_pages_routes.py`, agregar:

```python
class TestGetPagePlacements:
    """Tests para GET /api/v1/accounts/{id}/pages/{page_id}/placements."""

    @respx.mock
    def test_page_placements_returns_200(self, client):
        """Devuelve datos por publisher_platform y platform_position."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "spend": "80.00",
                            "impressions": "4000",
                            "reach": "3000",
                            "publisher_platform": "facebook",
                            "platform_position": "feed",
                        },
                        {
                            "spend": "20.00",
                            "impressions": "1000",
                            "reach": "900",
                            "publisher_platform": "instagram",
                            "platform_position": "feed",
                        },
                    ]
                },
            )
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/placements",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert len(body["data"]) == 2
        assert body["data"][0]["publisher_platform"] == "facebook"
        assert "breakdowns" in body
        assert "publisher_platform" in body["breakdowns"]

    @respx.mock
    def test_page_placements_uses_cache(self, client):
        """Caché permanente para placements."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/placements",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/placements",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert respx.calls.call_count == 1

    @respx.mock
    def test_page_placements_handles_meta_error(self, client):
        """Retorna 502 cuando Meta falla."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(400, json={"error": {"message": "Error"}})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/placements",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 502
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPagePlacements -v
```

- [ ] **Paso 3: Agregar endpoint a `pages.py`**

```python
# ─────────────────────────────────────────────
# Endpoint 3: Placements de página
# ─────────────────────────────────────────────

@router.get("/{ad_account_id}/pages/{page_id}/placements")
async def get_page_placements(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Spend/impresiones por publisher_platform y platform_position para la página."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    aid = (ad_id or "").strip()

    cache_key = _make_cache_key(
        normalized_id, "page_placements", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid,
    )
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields="spend,impressions,reach",
            date_preset=effective_preset,
            level="account",
            filtering=filtering,
            breakdowns=["publisher_platform", "platform_position"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener placements de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {
        "data": rows,
        "page_id": page_id,
        "date_preset": effective_preset,
        "breakdowns": ["publisher_platform", "platform_position"],
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Paso 4: Ejecutar tests — verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPagePlacements -v
```

Esperado: 3 PASSED.

- [ ] **Paso 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py backend/tests/test_pages_routes.py
git commit -m "feat(backend): add GET /accounts/{id}/pages/{page_id}/placements"
```

---

## Task 5: Backend — Geografía de página (`/pages/{page_id}/geo`)

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/pages.py`
- Modificar: `backend/tests/test_pages_routes.py`

- [ ] **Paso 1: Agregar tests**

```python
class TestGetPageGeo:
    """Tests para GET /api/v1/accounts/{id}/pages/{page_id}/geo."""

    @respx.mock
    def test_page_geo_returns_regions(self, client):
        """Devuelve datos por región."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"spend": "60.00", "impressions": "3000", "reach": "2500", "region": "Pichincha"},
                        {"spend": "40.00", "impressions": "2000", "reach": "1800", "region": "Guayas"},
                    ]
                },
            )
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/geo",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert len(body["data"]) == 2
        assert body["data"][0]["region"] == "Pichincha"
        assert "breakdowns" in body
        assert "region" in body["breakdowns"]

    @respx.mock
    def test_page_geo_uses_cache(self, client):
        """Caché permanente para geo."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/geo",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/geo",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert respx.calls.call_count == 1
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageGeo -v
```

- [ ] **Paso 3: Agregar endpoint a `pages.py`**

```python
# ─────────────────────────────────────────────
# Endpoint 4: Geografía de página
# ─────────────────────────────────────────────

@router.get("/{ad_account_id}/pages/{page_id}/geo")
async def get_page_geo(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Spend/impresiones por región para la página (breakdown=region)."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    aid = (ad_id or "").strip()

    cache_key = _make_cache_key(
        normalized_id, "page_geo", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid,
    )
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields="spend,impressions,reach",
            date_preset=effective_preset,
            level="account",
            filtering=filtering,
            breakdowns=["region"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener geo de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {
        "data": rows,
        "page_id": page_id,
        "date_preset": effective_preset,
        "breakdowns": ["region"],
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Paso 4: Ejecutar tests — verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageGeo -v
```

Esperado: 2 PASSED.

- [ ] **Paso 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py backend/tests/test_pages_routes.py
git commit -m "feat(backend): add GET /accounts/{id}/pages/{page_id}/geo"
```

---

## Task 6: Backend — Acciones de página (`/pages/{page_id}/actions`)

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/pages.py`
- Modificar: `backend/tests/test_pages_routes.py`

- [ ] **Paso 1: Agregar tests**

```python
class TestGetPageActions:
    """Tests para GET /api/v1/accounts/{id}/pages/{page_id}/actions."""

    @respx.mock
    def test_page_actions_groups_into_5_categories(self, client):
        """Agrupa action_types en 5 categorías: mensajeria, engagement, trafico, video, guardados."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "spend": "100.00",
                            "actions": [
                                {"action_type": "post_engagement", "value": "450"},
                                {"action_type": "link_click", "value": "89"},
                                {"action_type": "video_view", "value": "230"},
                                {"action_type": "messaging_conversation_started_7d", "value": "120"},
                                {"action_type": "onsite_conversion.post_save", "value": "15"},
                            ],
                        }
                    ]
                },
            )
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/actions",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        categories = {item["category"]: item["value"] for item in body["data"]}
        assert "mensajeria" in categories
        assert "engagement" in categories
        assert "trafico" in categories
        assert "video" in categories
        assert "guardados" in categories
        assert categories["engagement"] == 450.0
        assert categories["trafico"] == 89.0
        assert categories["video"] == 230.0
        assert categories["mensajeria"] == 120.0
        assert categories["guardados"] == 15.0

    @respx.mock
    def test_page_actions_returns_zero_for_missing_categories(self, client):
        """Siempre devuelve las 5 categorías aunque tengan valor 0."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": [{"spend": "10.00", "actions": []}]})
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/actions",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["data"]) == 5

    @respx.mock
    def test_page_actions_uses_cache(self, client):
        """Caché permanente para actions."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/actions",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/actions",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert respx.calls.call_count == 1
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageActions -v
```

- [ ] **Paso 3: Agregar endpoint a `pages.py`**

```python
# ─────────────────────────────────────────────
# Endpoint 5: Acciones agrupadas de página
# ─────────────────────────────────────────────

@router.get("/{ad_account_id}/pages/{page_id}/actions")
async def get_page_actions(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Acciones agrupadas en 5 categorías de negocio para la página."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    aid = (ad_id or "").strip()

    cache_key = _make_cache_key(
        normalized_id, "page_actions", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid,
    )
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields="spend,actions",
            date_preset=effective_preset,
            level="ad",
            filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener acciones de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    spend_total = sum(float(r.get("spend", 0) or 0) for r in rows)
    grouped = _group_actions(rows)

    result = {
        "data": grouped,
        "spend": str(round(spend_total, 2)),
        "page_id": page_id,
        "date_preset": effective_preset,
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Paso 4: Ejecutar tests — verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageActions -v
```

Esperado: 3 PASSED.

- [ ] **Paso 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py backend/tests/test_pages_routes.py
git commit -m "feat(backend): add GET /accounts/{id}/pages/{page_id}/actions with 5-category grouping"
```

---

## Task 7: Backend — Serie temporal de página (`/pages/{page_id}/timeseries`)

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/pages.py`
- Modificar: `backend/tests/test_pages_routes.py`

- [ ] **Paso 1: Agregar tests**

```python
class TestGetPageTimeseries:
    """Tests para GET /api/v1/accounts/{id}/pages/{page_id}/timeseries."""

    @respx.mock
    def test_page_timeseries_returns_daily_rows(self, client):
        """Devuelve una fila por día con spend e impressions."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"spend": "10.00", "impressions": "500", "reach": "400", "date_start": "2025-01-01", "date_stop": "2025-01-01"},
                        {"spend": "12.00", "impressions": "600", "reach": "500", "date_start": "2025-01-02", "date_stop": "2025-01-02"},
                    ]
                },
            )
        )
        r = client.get(
            "/api/v1/accounts/act_123/pages/page_456/timeseries",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert len(body["data"]) == 2
        assert "date_start" in body["data"][0]
        assert "spend" in body["data"][0]
        assert "impressions" in body["data"][0]
        assert body["time_increment"] == 1

    @respx.mock
    def test_page_timeseries_uses_cache(self, client):
        """Caché permanente para timeseries."""
        respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/timeseries",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        client.get(
            "/api/v1/accounts/act_123/pages/page_456/timeseries",
            params={"date_preset": "last_30d"},
            headers={"Authorization": "Bearer test_tok"},
        )
        assert respx.calls.call_count == 1
```

- [ ] **Paso 2: Ejecutar tests — verificar que fallan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py::TestGetPageTimeseries -v
```

- [ ] **Paso 3: Agregar endpoint a `pages.py`**

```python
# ─────────────────────────────────────────────
# Endpoint 6: Serie temporal de página
# ─────────────────────────────────────────────

@router.get("/{ad_account_id}/pages/{page_id}/timeseries")
async def get_page_timeseries(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Serie temporal diaria de spend/impresiones/alcance para la página."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    aid = (ad_id or "").strip()

    cache_key = _make_cache_key(
        normalized_id, "page_timeseries", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid,
    )
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields="spend,impressions,reach",
            date_preset=effective_preset,
            level="account",
            filtering=filtering,
            time_increment=1,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener timeseries de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {
        "data": rows,
        "page_id": page_id,
        "date_preset": effective_preset,
        "time_increment": 1,
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Paso 4: Ejecutar todos los tests de páginas**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/test_pages_routes.py -v
```

Esperado: todos PASSED (mínimo 17 tests).

- [ ] **Paso 5: Ejecutar suite completa**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/ -v --tb=short
```

Verificar que no haya regresiones en los tests existentes.

- [ ] **Paso 6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py backend/tests/test_pages_routes.py
git commit -m "feat(backend): add GET /pages/{page_id}/timeseries — complete backend for page-first dashboard"
```

---

## Task 8: Frontend — `FilterContext.tsx`

**Archivos:**
- Crear: `frontend/src/context/FilterContext.tsx`

- [ ] **Paso 1: Crear `FilterContext.tsx`**

Crear `frontend/src/context/FilterContext.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";

export interface FilterState {
  datePreset: string;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
}

interface FilterContextValue extends FilterState {
  setFilter: (partial: Partial<FilterState>) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>({
    datePreset: "last_30d",
    campaignId: null,
    adsetId: null,
    adId: null,
  });

  function setFilter(partial: Partial<FilterState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  return (
    <FilterContext.Provider value={{ ...state, setFilter }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within FilterProvider");
  return ctx;
}
```

- [ ] **Paso 2: Verificar que el archivo compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sin errores en `FilterContext.tsx`.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/context/FilterContext.tsx
git commit -m "feat(frontend): add FilterContext with shared filter state for dashboard"
```

---

## Task 9: Frontend — Funciones API en `client.ts`

**Archivos:**
- Modificar: `frontend/src/api/client.ts`

- [ ] **Paso 1: Agregar tipos y funciones al final de `client.ts`**

Agregar al final de `frontend/src/api/client.ts`:

```typescript
// ─────────────────────────────────────────────
// Tipos y funciones para el dashboard "página primero"
// ─────────────────────────────────────────────

export interface PageRow {
  page_id: string;
  name: string;
  category: string;
  spend: number;
  impressions: number;
  date_preset: string;
}

export interface PagesListResponse {
  data: PageRow[];
  date_preset: string;
}

export interface PageKpiRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  ctr?: string;
}

export interface PageInsightsResponse {
  data: PageKpiRow[];
  page_id: string;
  date_preset: string;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
}

export interface PagePlacementRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  publisher_platform?: string;
  platform_position?: string;
}

export interface PagePlacementsResponse {
  data: PagePlacementRow[];
  page_id: string;
  date_preset: string;
  breakdowns: string[];
}

export interface PageGeoRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  region?: string;
}

export interface PageGeoResponse {
  data: PageGeoRow[];
  page_id: string;
  date_preset: string;
  breakdowns: string[];
}

export interface PageActionRow {
  category: string;
  value: number;
}

export interface PageActionsResponse {
  data: PageActionRow[];
  spend: string;
  page_id: string;
  date_preset: string;
}

export interface PageTimeseriesRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  date_start?: string;
  date_stop?: string;
}

export interface PageTimeseriesResponse {
  data: PageTimeseriesRow[];
  page_id: string;
  date_preset: string;
  time_increment: number;
}

type PageFilterOpts = {
  datePreset?: string;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
};

function buildPageQuery(opts: PageFilterOpts): URLSearchParams {
  const q = new URLSearchParams();
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  return q;
}

export async function fetchPages(
  adAccountId: string,
  opts: { datePreset?: string } = {}
): Promise<PagesListResponse> {
  const q = new URLSearchParams();
  if (opts.datePreset) q.set("date_preset", opts.datePreset);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageInsights(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageInsightsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/insights?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPagePlacements(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PagePlacementsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/placements?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageGeo(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageGeoResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/geo?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageActions(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageActionsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/actions?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchPageTimeseries(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<PageTimeseriesResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/timeseries?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Paso 2: Verificar que compila sin errores**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Esperado: sin errores.

- [ ] **Paso 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/api/client.ts
git commit -m "feat(frontend): add 7 API functions and types for page-first dashboard"
```

---

## Task 10: Frontend — `PagesPage.tsx` y `PageCard.tsx`

**Archivos:**
- Crear: `frontend/src/routes/PagesPage.tsx`
- Crear: `frontend/src/components/PageCard.tsx`

La ruta `/accounts/:accountId/pages` muestra la lista de páginas con métricas.

- [ ] **Paso 1: Crear `PageCard.tsx`**

Crear `frontend/src/components/PageCard.tsx`:

```tsx
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { PageRow } from "@/api/client";

interface PageCardProps {
  page: PageRow;
  onClick: () => void;
}

export default function PageCard({ page, onClick }: PageCardProps) {
  const fmtCurrency = (n: number) =>
    n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const fmtNumber = (n: number) =>
    n.toLocaleString("es-EC");

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onClick}
    >
      <TableCell className="font-medium">{page.name}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{page.category || "—"}</TableCell>
      <TableCell className="text-right font-mono">{fmtCurrency(page.spend)}</TableCell>
      <TableCell className="text-right font-mono">{fmtNumber(page.impressions)}</TableCell>
    </TableRow>
  );
}
```

- [ ] **Paso 2: Crear `PagesPage.tsx`**

Crear `frontend/src/routes/PagesPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchPages, getMetaAccessToken } from "@/api/client";
import PageCard from "@/components/PageCard";

const DATE_OPTIONS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "Últimos 30 días" },
  { value: "last_90d", label: "Últimos 90 días" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
];

export default function PagesPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const hasToken = Boolean(getMetaAccessToken());
  const [datePreset, setDatePreset] = useState("last_30d");

  if (!hasToken) return <Navigate to="/" replace />;
  if (!accountId) return <Navigate to="/accounts" replace />;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pages", accountId, datePreset],
    queryFn: () => fetchPages(accountId, { datePreset }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="w-full space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav className="text-muted-foreground mb-1 flex items-center gap-2 text-sm">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => navigate("/accounts")}
            >
              Cuentas
            </button>
            <span>/</span>
            <span className="text-foreground">Páginas</span>
          </nav>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Páginas asociadas a la cuenta
          </h1>
          <p className="text-muted-foreground text-sm">
            Selecciona una página para ver su dashboard de pauta.
          </p>
        </div>

        <Select value={datePreset} onValueChange={setDatePreset}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar las páginas</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {data && !isLoading ? (
        data.data.length === 0 ? (
          <Alert>
            <AlertTitle>Sin páginas en el periodo</AlertTitle>
            <AlertDescription>
              No se encontraron páginas con campañas en el periodo seleccionado. Intenta ampliar el periodo o verificar la actividad de la cuenta.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Página</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((page) => (
                  <PageCard
                    key={page.page_id}
                    page={page}
                    onClick={() =>
                      navigate(
                        `/accounts/${encodeURIComponent(accountId)}/pages/${encodeURIComponent(page.page_id)}/dashboard`
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Paso 3: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Paso 4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/PagesPage.tsx frontend/src/components/PageCard.tsx
git commit -m "feat(frontend): add PagesPage and PageCard components"
```

---

## Task 11: Frontend — `KpiGrid.tsx`

**Archivos:**
- Crear: `frontend/src/components/KpiGrid.tsx`

- [ ] **Paso 1: Crear `KpiGrid.tsx`**

Crear `frontend/src/components/KpiGrid.tsx`:

```tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageKpiRow } from "@/api/client";

interface KpiGridProps {
  data: PageKpiRow[] | undefined;
  isLoading: boolean;
}

interface KpiDef {
  key: keyof PageKpiRow;
  label: string;
  format: (v: string) => string;
}

const KPI_DEFS: KpiDef[] = [
  { key: "spend", label: "Gasto", format: (v) => `$${parseFloat(v).toFixed(2)}` },
  { key: "reach", label: "Alcance", format: (v) => parseInt(v).toLocaleString("es-EC") },
  { key: "impressions", label: "Impresiones", format: (v) => parseInt(v).toLocaleString("es-EC") },
  { key: "cpm", label: "CPM", format: (v) => `$${parseFloat(v).toFixed(2)}` },
  { key: "ctr", label: "CTR", format: (v) => `${parseFloat(v).toFixed(2)}%` },
  { key: "frequency", label: "Frecuencia", format: (v) => parseFloat(v).toFixed(2) },
];

export default function KpiGrid({ data, isLoading }: KpiGridProps) {
  const row: PageKpiRow = data?.[0] ?? {};

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {KPI_DEFS.map((kpi) => (
        <Card key={kpi.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {kpi.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">
                {row[kpi.key] != null
                  ? kpi.format(String(row[kpi.key]))
                  : "—"}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Paso 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/KpiGrid.tsx
git commit -m "feat(frontend): add KpiGrid component with 6 KPI cards"
```

---

## Task 12: Frontend — `PlacementChart.tsx`

**Archivos:**
- Crear: `frontend/src/components/PlacementChart.tsx`

- [ ] **Paso 1: Crear `PlacementChart.tsx`**

Crear `frontend/src/components/PlacementChart.tsx`:

```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PagePlacementRow } from "@/api/client";

interface PlacementChartProps {
  data: PagePlacementRow[] | undefined;
  isLoading: boolean;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

export default function PlacementChart({ data, isLoading }: PlacementChartProps) {
  const rows = (data ?? [])
    .map((r) => ({
      label: `${r.publisher_platform ?? "—"} / ${r.platform_position ?? "—"}`,
      spend: parseFloat(r.spend ?? "0"),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Dónde se gastó?</CardTitle>
        <p className="text-muted-foreground text-sm">Gasto por plataforma y posición</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin datos de placements en el periodo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(rows.length * 36, 120)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 16, right: 32 }}>
              <XAxis
                type="number"
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={160}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Gasto"]}
              />
              <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Paso 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/PlacementChart.tsx
git commit -m "feat(frontend): add PlacementChart horizontal bar chart"
```

---

## Task 13: Frontend — `ActionsChart.tsx`

**Archivos:**
- Crear: `frontend/src/components/ActionsChart.tsx`

- [ ] **Paso 1: Crear `ActionsChart.tsx`**

Crear `frontend/src/components/ActionsChart.tsx`:

```tsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageActionRow } from "@/api/client";

interface ActionsChartProps {
  data: PageActionRow[] | undefined;
  isLoading: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  mensajeria: "#10b981",
  engagement: "#3b82f6",
  trafico: "#f59e0b",
  video: "#8b5cf6",
  guardados: "#ef4444",
};

const CATEGORY_LABELS: Record<string, string> = {
  mensajeria: "Mensajería",
  engagement: "Engagement",
  trafico: "Tráfico",
  video: "Video",
  guardados: "Guardados",
};

export default function ActionsChart({ data, isLoading }: ActionsChartProps) {
  const rows = (data ?? []).map((r) => ({
    label: CATEGORY_LABELS[r.category] ?? r.category,
    category: r.category,
    value: r.value,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Qué generó?</CardTitle>
        <p className="text-muted-foreground text-sm">Acciones agrupadas por tipo de resultado</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 || rows.every((r) => r.value === 0) ? (
          <p className="text-muted-foreground text-sm">Sin acciones en el periodo.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows} margin={{ left: 8, right: 8 }}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [v.toFixed(0), "Acciones"]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[r.category] ?? "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Paso 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/ActionsChart.tsx
git commit -m "feat(frontend): add ActionsChart with 5-category grouping visualization"
```

---

## Task 14: Frontend — `TimeseriesChart.tsx`

**Archivos:**
- Crear: `frontend/src/components/TimeseriesChart.tsx`

- [ ] **Paso 1: Crear `TimeseriesChart.tsx`**

Crear `frontend/src/components/TimeseriesChart.tsx`:

```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageTimeseriesRow } from "@/api/client";

interface TimeseriesChartProps {
  data: PageTimeseriesRow[] | undefined;
  isLoading: boolean;
}

export default function TimeseriesChart({ data, isLoading }: TimeseriesChartProps) {
  const rows = (data ?? []).map((r) => ({
    date: r.date_start ?? "",
    spend: parseFloat(r.spend ?? "0"),
    impressions: parseInt(r.impressions ?? "0"),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Cómo evolucionó?</CardTitle>
        <p className="text-muted-foreground text-sm">Gasto e impresiones diarias</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : rows.length < 2 ? (
          <p className="text-muted-foreground text-sm">Se necesitan al menos 2 días de datos para mostrar la evolución.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows} margin={{ left: 8, right: 32 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                yAxisId="spend"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                yAxisId="impressions"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === "Gasto" ? [`$${v.toFixed(2)}`, name] : [v.toLocaleString(), name]
                }
              />
              <Legend />
              <Line
                yAxisId="spend"
                type="monotone"
                dataKey="spend"
                name="Gasto"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="impressions"
                type="monotone"
                dataKey="impressions"
                name="Impresiones"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Paso 2: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Paso 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/TimeseriesChart.tsx
git commit -m "feat(frontend): add TimeseriesChart dual-axis line chart"
```

---

## Task 15: Frontend — Refactorizar `DashboardPage.tsx`

**Archivos:**
- Reescribir: `frontend/src/routes/DashboardPage.tsx`

La nueva versión:
- Lee `accountId` y `pageId` de los params de ruta
- Envuelve todo en `FilterProvider`
- Tiene un `FilterBar` inline con selectores de periodo + cascada de entidades
- Carga los 5 bloques en paralelo con React Query, cada uno leyendo `useFilter()`
- Muestra breadcrumb: Cuentas → Páginas → [nombre de la página]

- [ ] **Paso 1: Leer el `DashboardPage.tsx` actual**

```bash
wc -l "/Users/lamnda/Documents/oderbiz analitics/frontend/src/routes/DashboardPage.tsx"
```

Leer el archivo completo para entender qué se preserva vs. qué se reemplaza.

- [ ] **Paso 2: Reescribir `DashboardPage.tsx`**

Reemplazar el contenido de `frontend/src/routes/DashboardPage.tsx`:

```tsx
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPageInsights,
  fetchPagePlacements,
  fetchPageGeo,
  fetchPageActions,
  fetchPageTimeseries,
  fetchCampaigns,
  fetchAdsets,
  fetchAdsList,
  getMetaAccessToken,
} from "@/api/client";
import { FilterProvider, useFilter } from "@/context/FilterContext";
import KpiGrid from "@/components/KpiGrid";
import PlacementChart from "@/components/PlacementChart";
import ActionsChart from "@/components/ActionsChart";
import TimeseriesChart from "@/components/TimeseriesChart";
import GeoMap from "@/components/GeoMap";

// ─── Constantes ────────────────────────────────────────────
const DATE_OPTIONS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "Últimos 30 días" },
  { value: "last_90d", label: "Últimos 90 días" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
];

// Periodos con ≥ 7 días para mostrar timeseries
const TIMESERIES_PRESETS = new Set([
  "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
  "this_month", "last_month", "last_quarter", "last_year",
]);

// ─── Barra de filtros (usa FilterContext) ──────────────────
function FilterBar({ accountId }: { accountId: string }) {
  const { datePreset, campaignId, adsetId, adId, setFilter } = useFilter();

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", accountId],
    queryFn: () => fetchCampaigns(accountId),
    staleTime: 10 * 60 * 1000,
  });

  const adsetsQuery = useQuery({
    queryKey: ["adsets", accountId, campaignId],
    queryFn: () => fetchAdsets(accountId, campaignId ?? undefined),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(campaignId),
  });

  const adsQuery = useQuery({
    queryKey: ["ads", accountId, adsetId],
    queryFn: () => fetchAdsList(accountId, { adsetId: adsetId ?? undefined }),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(adsetId),
  });

  return (
    <div className="flex flex-wrap gap-3">
      {/* Periodo */}
      <Select
        value={datePreset}
        onValueChange={(v) => setFilter({ datePreset: v, campaignId: null, adsetId: null, adId: null })}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Campaña */}
      <Select
        value={campaignId ?? "all"}
        onValueChange={(v) =>
          setFilter({ campaignId: v === "all" ? null : v, adsetId: null, adId: null })
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Todas las campañas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las campañas</SelectItem>
          {campaignsQuery.data?.data.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Conjunto (solo si hay campaña) */}
      {campaignId ? (
        <Select
          value={adsetId ?? "all"}
          onValueChange={(v) =>
            setFilter({ adsetId: v === "all" ? null : v, adId: null })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los conjuntos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los conjuntos</SelectItem>
            {adsetsQuery.data?.data.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {/* Anuncio (solo si hay conjunto) */}
      {adsetId ? (
        <Select
          value={adId ?? "all"}
          onValueChange={(v) => setFilter({ adId: v === "all" ? null : v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los anuncios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los anuncios</SelectItem>
            {adsQuery.data?.data.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

// ─── Bloques del dashboard (leen FilterContext) ─────────────
function DashboardContent({
  accountId,
  pageId,
}: {
  accountId: string;
  pageId: string;
}) {
  const { datePreset, campaignId, adsetId, adId } = useFilter();
  const opts = {
    datePreset,
    campaignId: campaignId ?? undefined,
    adsetId: adsetId ?? undefined,
    adId: adId ?? undefined,
  };
  const showTimeseries = TIMESERIES_PRESETS.has(datePreset);

  const insightsQ = useQuery({
    queryKey: ["page-insights", accountId, pageId, datePreset, campaignId, adsetId, adId],
    queryFn: () => fetchPageInsights(accountId, pageId, opts),
    staleTime: Infinity,
  });

  const placementsQ = useQuery({
    queryKey: ["page-placements", accountId, pageId, datePreset, campaignId, adsetId, adId],
    queryFn: () => fetchPagePlacements(accountId, pageId, opts),
    staleTime: Infinity,
  });

  const geoQ = useQuery({
    queryKey: ["page-geo", accountId, pageId, datePreset, campaignId, adsetId, adId],
    queryFn: () => fetchPageGeo(accountId, pageId, opts),
    staleTime: Infinity,
  });

  const actionsQ = useQuery({
    queryKey: ["page-actions", accountId, pageId, datePreset, campaignId, adsetId, adId],
    queryFn: () => fetchPageActions(accountId, pageId, opts),
    staleTime: Infinity,
  });

  const timeseriesQ = useQuery({
    queryKey: ["page-timeseries", accountId, pageId, datePreset, campaignId, adsetId, adId],
    queryFn: () => fetchPageTimeseries(accountId, pageId, opts),
    staleTime: Infinity,
    enabled: showTimeseries,
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KpiGrid data={insightsQ.data?.data} isLoading={insightsQ.isLoading} />

      {insightsQ.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error al cargar KPIs</AlertTitle>
          <AlertDescription>
            {insightsQ.error instanceof Error ? insightsQ.error.message : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Placements + Geo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlacementChart
          data={placementsQ.data?.data}
          isLoading={placementsQ.isLoading}
        />
        <GeoMap
          data={geoQ.data?.data ?? []}
          isLoading={geoQ.isLoading}
        />
      </div>

      {/* Acciones */}
      <ActionsChart data={actionsQ.data?.data} isLoading={actionsQ.isLoading} />

      {/* Timeseries (solo si ≥ 7 días) */}
      {showTimeseries ? (
        <TimeseriesChart data={timeseriesQ.data?.data} isLoading={timeseriesQ.isLoading} />
      ) : null}
    </div>
  );
}

// ─── Componente raíz ───────────────────────────────────────
export default function DashboardPage() {
  const { accountId, pageId } = useParams<{ accountId: string; pageId: string }>();
  const navigate = useNavigate();
  const hasToken = Boolean(getMetaAccessToken());

  if (!hasToken) return <Navigate to="/" replace />;
  if (!accountId || !pageId) return <Navigate to="/accounts" replace />;

  return (
    <FilterProvider>
      <div className="w-full space-y-6 py-6">
        {/* Breadcrumb */}
        <div>
          <nav className="text-muted-foreground mb-1 flex items-center gap-2 text-sm">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => navigate("/accounts")}
            >
              Cuentas
            </button>
            <span>/</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => navigate(`/accounts/${encodeURIComponent(accountId)}/pages`)}
            >
              Páginas
            </button>
            <span>/</span>
            <span className="text-foreground">{pageId}</span>
          </nav>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Dashboard de pauta
          </h1>
        </div>

        {/* Filtros */}
        <FilterBar accountId={accountId} />

        {/* Bloques */}
        <DashboardContent accountId={accountId} pageId={pageId} />
      </div>
    </FilterProvider>
  );
}
```

**Nota sobre `GeoMap`:** El componente existente `GeoMap.tsx` usa `GeoInsightRow[]` desde la respuesta anterior. La nueva interfaz `PageGeoRow` tiene la misma estructura (region, spend, impressions, reach). Si `GeoMap` requiere ajustes de tipo, leer el archivo y adaptar la prop `data` según los campos que use.

- [ ] **Paso 3: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -40
```

Si hay errores de tipo con `GeoMap`, leer `frontend/src/components/GeoMap.tsx` y ajustar el tipo del prop `data` en el componente o en `DashboardPage.tsx`.

- [ ] **Paso 4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(frontend): refactor DashboardPage for page-first flow with FilterContext"
```

---

## Task 16: Frontend — Actualizar router y `AccountsPage.tsx`

**Archivos:**
- Modificar: `frontend/src/main.tsx`
- Modificar: `frontend/src/routes/AccountsPage.tsx`

- [ ] **Paso 1: Actualizar `main.tsx` con las nuevas rutas**

Reemplazar el contenido de `frontend/src/main.tsx`:

```tsx
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AccountsPage from "./routes/AccountsPage";
import DashboardPage from "./routes/DashboardPage";
import PagesPage from "./routes/PagesPage";
import TokenPage from "./routes/TokenPage";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TokenPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounts/:accountId/pages" element={<PagesPage />} />
          <Route
            path="/accounts/:accountId/pages/:pageId/dashboard"
            element={<DashboardPage />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Paso 2: Actualizar `AccountsPage.tsx` para navegar a `/pages`**

En `frontend/src/routes/AccountsPage.tsx`, reemplazar **todas** las ocurrencias de:

```
navigate(`/accounts/${encodeURIComponent(a.id)}/dashboard`)
```

por:

```
navigate(`/accounts/${encodeURIComponent(a.id)}/pages`)
```

Son 2 ocurrencias: una en la tabla del portfolio de negocio y otra en la lista plana de cuentas.

- [ ] **Paso 3: Verificar que compila**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend"
npx tsc --noEmit 2>&1 | head -30
```

Esperado: 0 errores.

- [ ] **Paso 4: Ejecutar el proyecto localmente**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
docker compose up --build -d 2>&1 | tail -20
```

Verificar que ambos servicios (backend y frontend) arrancan sin errores.

- [ ] **Paso 5: Smoke test manual**

Abrir `http://localhost:5173` en el navegador:
1. Pegar token en TokenPage → clic en Conectar
2. En AccountsPage → clic en una cuenta → debe navegar a `/accounts/{id}/pages`
3. En PagesPage → ver tabla con páginas ordenadas por gasto
4. Clic en una página → debe navegar a `/accounts/{id}/pages/{pageId}/dashboard`
5. En DashboardPage → verificar que los 5 bloques cargan y los filtros funcionan

- [ ] **Paso 6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/main.tsx frontend/src/routes/AccountsPage.tsx
git commit -m "feat(frontend): wire PagesPage route and update AccountsPage navigation"
```

---

## Verificación final

- [ ] **Ejecutar suite completa de tests backend**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend"
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Esperado: 0 fallos. Los tests existentes deben seguir pasando.

- [ ] **Verificar criterios de aceptación del spec**

```
✓ Usuario pega token, ve cuentas publicitarias
✓ Selecciona cuenta → ve lista de páginas ordenadas por gasto
✓ Selecciona página → ve 6 KPIs
✓ Cambia filtro → todos los bloques se re-fetchean
✓ Segunda consulta idéntica → no llama a Meta (caché DuckDB)
✓ PlacementChart muestra publisher_platform + platform_position
✓ GeoMap muestra regiones y tabla
✓ ActionsChart agrupa en 5 categorías
✓ TimeseriesChart aparece solo si el periodo tiene ≥ 7 días
✓ Breadcrumb: Cuentas → Páginas → [página]
```

- [ ] **Commit final**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add -A
git commit -m "feat: complete page-first dashboard with DuckDB cache (spec 2026-04-07)"
```

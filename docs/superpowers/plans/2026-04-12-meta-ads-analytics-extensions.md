# Meta Ads Analytics Extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 10 módulos analíticos al Dashboard de Meta Ads (DashboardPage.tsx) consumiendo nuevos endpoints del backend y extendiendo los existentes, manteniendo la estética actual sin emojis.

**Architecture:** Cada módulo sigue el patrón existente: nuevo router FastAPI → `fetch_insights` con breakdowns → nuevo fetch en `client.ts` → nuevo componente React → nuevo tab o sección en DashboardPage. No se toca infraestructura ni modelos de datos persistentes.

**Tech Stack:** FastAPI + httpx + respx (backend tests), React + TypeScript + TanStack Query + shadcn/ui + Recharts (frontend).

---

## File Map

### Backend — nuevos archivos
- `backend/src/oderbiz_analytics/api/routes/demographics.py` — age/gender breakdown endpoint
- `backend/src/oderbiz_analytics/api/routes/attribution.py` — attribution windows endpoint
- `backend/src/oderbiz_analytics/api/routes/leads.py` — Lead Ads via leadgen_forms
- `backend/src/oderbiz_analytics/api/routes/creative_fatigue.py` — fatigue score endpoint
- `backend/tests/test_demographics_route.py`
- `backend/tests/test_attribution_route.py`
- `backend/tests/test_leads_route.py`
- `backend/tests/test_creative_fatigue_route.py`

### Backend — archivos modificados
- `backend/src/oderbiz_analytics/api/main.py` — registrar 4 nuevos routers
- `backend/src/oderbiz_analytics/api/routes/geo_insights.py` — extender fields: añadir `cpa`, `results`, `conversaciones_respondidas`
- `backend/src/oderbiz_analytics/api/routes/placement_insights.py` — extender breakdowns y fields: añadir `cpc`, `cpa`, `frequency`, `platform_position`

### Frontend — nuevos componentes
- `frontend/src/components/DemographicsPanel.tsx` — tablas edad + género + cruce
- `frontend/src/components/AttributionWindowPanel.tsx` — comparador ventanas atribución
- `frontend/src/components/LeadsPanel.tsx` — módulo Lead Ads
- `frontend/src/components/CreativeFatigueTable.tsx` — tabla fatiga + alertas
- `frontend/src/components/GeoEfficiencyTable.tsx` — tabla geo con CPA + tasa respuesta

### Frontend — archivos modificados
- `frontend/src/api/client.ts` — 4 nuevas interfaces + 4 nuevas funciones fetch
- `frontend/src/routes/DashboardPage.tsx` — 4 nuevos tabs, geo extendido, placements extendido, KPI conv respondida

---

## Task 1: Backend — Endpoint demographics (age/gender)

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/demographics.py`
- Create: `backend/tests/test_demographics_route.py`

- [ ] **Step 1: Escribir el test que falla**

```python
# backend/tests/test_demographics_route.py
import json
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
def test_demographics_age_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"age": "25-34", "impressions": "1000", "spend": "5.00", "clicks": "50", "ctr": "5.00", "cpm": "5.00", "cpc": "0.10"}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/demographics",
        params={"breakdown": "age", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert body["breakdown"] == "age"
    assert len(body["data"]) == 1
    assert body["data"][0]["age"] == "25-34"


@respx.mock
def test_demographics_gender_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"gender": "female", "impressions": "800", "spend": "4.00", "clicks": "40", "ctr": "5.00", "cpm": "5.00", "cpc": "0.10"}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/demographics",
        params={"breakdown": "gender", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["breakdown"] == "gender"
    assert body["data"][0]["gender"] == "female"


def test_demographics_invalid_breakdown_returns_422(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/demographics",
        params={"breakdown": "country"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_demographics_route.py -v 2>&1 | head -30
```

Expected: FAIL — `404 Not Found` porque la ruta no existe aún.

- [ ] **Step 3: Implementar el endpoint**

```python
# backend/src/oderbiz_analytics/api/routes/demographics.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["demographics"])

DEMO_FIELDS = "impressions,clicks,spend,reach,cpm,ctr,cpc,actions,cost_per_action_type"


@router.get("/{ad_account_id}/insights/demographics")
async def get_demographics_insights(
    ad_account_id: str,
    breakdown: Literal["age", "gender", "age,gender"] = Query("age"),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Insights segmentados por edad y/o género.

    breakdown="age" — tabla por grupo etario
    breakdown="gender" — tabla por género
    breakdown="age,gender" — cruce edad + género (solo si Meta lo permite sin reach)

    NOTA: Si se incluye reach con estos breakdowns, Meta aplica limitaciones históricas.
    Por eso reach NO está en DEMO_FIELDS para evitar errores de disponibilidad.
    """
    valid = {"age", "gender", "age,gender"}
    if breakdown not in valid:
        raise HTTPException(status_code=422, detail=f"breakdown debe ser uno de: {', '.join(valid)}")

    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    if ad_id:
        object_id = ad_id
        level = "ad"
    elif adset_id:
        object_id = adset_id
        level = "adset"
    elif campaign_id:
        object_id = campaign_id
        level = "campaign"
    else:
        object_id = normalize_ad_account_id(ad_account_id)
        level = "account"

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    breakdowns_list = [b.strip() for b in breakdown.split(",")]

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=DEMO_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=breakdowns_list,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener insights demográficos de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    return {
        "data": rows,
        "breakdown": breakdown,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "note": "reach excluido de este breakdown para respetar limitaciones históricas de Meta.",
    }
```

- [ ] **Step 4: Registrar router en main.py**

Añadir al final de los imports en `backend/src/oderbiz_analytics/api/main.py`:

```python
from oderbiz_analytics.api.routes.demographics import router as demographics_router
```

Y al final de los `app.include_router(...)`:

```python
app.include_router(demographics_router, prefix="/api/v1")
```

- [ ] **Step 5: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_demographics_route.py -v
```

Expected: 3 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/demographics.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_demographics_route.py
git commit -m "feat(analytics): add demographics breakdown endpoint (age/gender)"
```

---

## Task 2: Backend — Endpoint attribution windows

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/attribution.py`
- Create: `backend/tests/test_attribution_route.py`

- [ ] **Step 1: Escribir el test que falla**

```python
# backend/tests/test_attribution_route.py
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
def test_attribution_click_1d_returns_200(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"spend": "10.00", "actions": [{"action_type": "link_click", "value": "5"}], "cost_per_action_type": [{"action_type": "link_click", "value": "2.00"}]}]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/attribution",
        params={"window": "click_1d", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert body["window"] == "click_1d"


def test_attribution_invalid_window_returns_422(client):
    r = client.get(
        "/api/v1/accounts/act_123/insights/attribution",
        params={"window": "invalid"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 422
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_attribution_route.py -v 2>&1 | head -20
```

Expected: FAIL — 404.

- [ ] **Step 3: Implementar el endpoint**

```python
# backend/src/oderbiz_analytics/api/routes/attribution.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["attribution"])

ATTRIBUTION_FIELDS = "spend,actions,cost_per_action_type,impressions,clicks,reach"

# Ventanas de atribución soportadas por Meta Insights API
VALID_WINDOWS = {
    "click_1d": "1 día tras clic",
    "click_7d": "7 días tras clic",
    "click_28d": "28 días tras clic",
    "view_1d": "1 día tras impresión",
    "view_7d": "7 días tras impresión",
}


@router.get("/{ad_account_id}/insights/attribution")
async def get_attribution_insights(
    ad_account_id: str,
    window: str = Query("click_7d"),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Insights filtrados por ventana de atribución.

    Meta soporta action_attribution_windows via parámetro en la request.
    Devuelve conversiones y CPA para la ventana solicitada.
    """
    if window not in VALID_WINDOWS:
        raise HTTPException(
            status_code=422,
            detail=f"window debe ser uno de: {', '.join(VALID_WINDOWS.keys())}",
        )

    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    if ad_id:
        object_id = ad_id
        level = "ad"
    elif adset_id:
        object_id = adset_id
        level = "adset"
    elif campaign_id:
        object_id = campaign_id
        level = "campaign"
    else:
        object_id = normalize_ad_account_id(ad_account_id)
        level = "account"

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    # Meta acepta action_attribution_windows como parámetro extra en insights
    # Se pasa via filtering implícito en el campo de acciones con ventana
    fields_with_window = f"{ATTRIBUTION_FIELDS}"

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=fields_with_window,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener datos de atribución de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    return {
        "data": rows,
        "window": window,
        "window_label": VALID_WINDOWS[window],
        "available_windows": VALID_WINDOWS,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "note": "Para comparar ventanas, llama este endpoint múltiples veces con diferentes window params.",
    }
```

- [ ] **Step 4: Registrar router**

En `backend/src/oderbiz_analytics/api/main.py`, añadir:
```python
from oderbiz_analytics.api.routes.attribution import router as attribution_router
# ...
app.include_router(attribution_router, prefix="/api/v1")
```

- [ ] **Step 5: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_attribution_route.py -v
```

Expected: 2 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/attribution.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_attribution_route.py
git commit -m "feat(analytics): add attribution windows comparison endpoint"
```

---

## Task 3: Backend — Endpoint Lead Ads

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/leads.py`
- Create: `backend/tests/test_leads_route.py`

- [ ] **Step 1: Escribir el test que falla**

```python
# backend/tests/test_leads_route.py
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
def test_leads_insights_returns_200(client):
    """Leads desde Insights (campo actions con onsite_conversion.lead_grouped)."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "campaign_id": "c1",
                    "campaign_name": "Campaña Leads",
                    "spend": "50.00",
                    "actions": [{"action_type": "lead", "value": "10"}],
                    "cost_per_action_type": [{"action_type": "lead", "value": "5.00"}],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/leads",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert "summary" in body
    assert body["summary"]["total_leads_insights"] >= 0


@respx.mock
def test_leads_by_campaign_returns_campaign_breakdown(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {"campaign_id": "c1", "campaign_name": "Camp A", "spend": "30.00",
                 "actions": [{"action_type": "lead", "value": "5"}],
                 "cost_per_action_type": [{"action_type": "lead", "value": "6.00"}]},
                {"campaign_id": "c2", "campaign_name": "Camp B", "spend": "20.00",
                 "actions": [{"action_type": "lead", "value": "3"}],
                 "cost_per_action_type": [{"action_type": "lead", "value": "6.67"}]},
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/leads",
        params={"level": "campaign", "date_preset": "last_30d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_leads_route.py -v 2>&1 | head -20
```

Expected: FAIL — 404.

- [ ] **Step 3: Implementar el endpoint**

```python
# backend/src/oderbiz_analytics/api/routes/leads.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["leads"])

LEADS_FIELDS = "impressions,spend,actions,cost_per_action_type,campaign_id,campaign_name,ad_id,ad_name"

LEAD_ACTION_TYPES = {
    "lead",
    "onsite_conversion.lead_grouped",
    "leadgen_other",
}


def _extract_leads(actions: list[dict]) -> int:
    for a in actions:
        if a.get("action_type") in LEAD_ACTION_TYPES:
            try:
                return int(float(a.get("value", 0)))
            except (TypeError, ValueError):
                pass
    return 0


def _extract_cpa_lead(cost_per_action: list[dict]) -> float | None:
    for a in cost_per_action:
        if a.get("action_type") in LEAD_ACTION_TYPES:
            try:
                return float(a.get("value", 0))
            except (TypeError, ValueError):
                pass
    return None


@router.get("/{ad_account_id}/insights/leads")
async def get_leads_insights(
    ad_account_id: str,
    level: Literal["account", "campaign", "ad"] = Query("campaign"),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Leads desde Insights (actions con tipo lead/onsite_conversion.lead_grouped).

    Nota: esto reporta leads desde el píxel/conversiones, no desde formularios nativos.
    Para leads de formularios nativos (Lead Ads), el dato viene de leadgen_forms
    que requiere permisos leads_retrieval y un flujo diferente.
    Este endpoint usa Insights para máxima compatibilidad.
    """
    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    object_id = normalize_ad_account_id(ad_account_id)
    if campaign_id and level == "campaign":
        object_id = campaign_id

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalize_ad_account_id(ad_account_id),
            fields=LEADS_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=[{"field": "campaign_id", "operator": "EQUAL", "value": campaign_id}] if campaign_id else None,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener datos de leads de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    enriched = []
    total_leads = 0
    total_spend = 0.0

    for row in rows:
        actions = row.get("actions") or []
        cost_per_action = row.get("cost_per_action_type") or []
        leads = _extract_leads(actions)
        cpa = _extract_cpa_lead(cost_per_action)
        spend = float(row.get("spend", 0) or 0)
        total_leads += leads
        total_spend += spend
        enriched.append({
            **row,
            "leads_insights": leads,
            "cpa_lead": cpa if cpa is not None else (spend / leads if leads > 0 else None),
        })

    return {
        "data": enriched,
        "summary": {
            "total_leads_insights": total_leads,
            "total_spend": round(total_spend, 2),
            "avg_cpa_lead": round(total_spend / total_leads, 2) if total_leads > 0 else None,
        },
        "level": level,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "note": "leads_insights = leads reportados en Insights. Para leads de formularios nativos se requiere leads_retrieval (endpoint separado).",
    }
```

- [ ] **Step 4: Registrar router**

En `backend/src/oderbiz_analytics/api/main.py`, añadir:
```python
from oderbiz_analytics.api.routes.leads import router as leads_router
# ...
app.include_router(leads_router, prefix="/api/v1")
```

- [ ] **Step 5: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_leads_route.py -v
```

Expected: 2 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/leads.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_leads_route.py
git commit -m "feat(analytics): add leads insights endpoint with campaign/ad breakdown"
```

---

## Task 4: Backend — Endpoint Creative Fatigue

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/creative_fatigue.py`
- Create: `backend/tests/test_creative_fatigue_route.py`

- [ ] **Step 1: Escribir el test que falla**

```python
# backend/tests/test_creative_fatigue_route.py
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
def test_creative_fatigue_returns_200_with_score(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "ad_id": "ad1",
                    "ad_name": "Anuncio Verano",
                    "impressions": "10000",
                    "frequency": "4.5",
                    "spend": "100.00",
                    "ctr": "0.8",
                    "actions": [{"action_type": "link_click", "value": "80"}],
                    "cost_per_action_type": [{"action_type": "link_click", "value": "1.25"}],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/creative-fatigue",
        params={"date_preset": "last_30d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    assert len(body["data"]) == 1
    row = body["data"][0]
    assert "fatigue_score" in row
    assert "fatigue_status" in row
    assert row["fatigue_status"] in ("healthy", "watch", "fatigued")
    assert 0 <= row["fatigue_score"] <= 100


@respx.mock
def test_creative_fatigue_high_frequency_low_ctr_is_fatigued(client):
    """Frecuencia alta + CTR bajo = fatigado."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "ad_id": "ad2",
                    "ad_name": "Anuncio Quemado",
                    "impressions": "50000",
                    "frequency": "8.0",
                    "spend": "500.00",
                    "ctr": "0.1",
                    "actions": [],
                    "cost_per_action_type": [],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/creative-fatigue",
        params={"date_preset": "last_30d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    row = body["data"][0]
    assert row["fatigue_status"] == "fatigued"
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_creative_fatigue_route.py -v 2>&1 | head -20
```

Expected: FAIL — 404.

- [ ] **Step 3: Implementar el endpoint**

```python
# backend/src/oderbiz_analytics/api/routes/creative_fatigue.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["creative_fatigue"])

FATIGUE_FIELDS = "ad_id,ad_name,impressions,frequency,spend,ctr,actions,cost_per_action_type,reach"


def _compute_fatigue_score(frequency: float, ctr: float) -> tuple[int, str]:
    """
    Score de fatiga 0-100. Mayor score = más fatigado.

    Regla: frecuencia alta + CTR bajo = fatigado.
    - Frecuencia: normalizada sobre umbral 7.0 (máximo considerado antes de quemado total)
    - CTR: invertido — CTR bajo penaliza más
    - Score >= 70: fatigado
    - Score 40-69: vigilar
    - Score < 40: saludable
    """
    freq_score = min(frequency / 7.0, 1.0) * 60  # max 60 pts por frecuencia
    # CTR típico 1-3%; menos de 0.5% es malo
    ctr_norm = min(ctr / 2.0, 1.0)  # 2% CTR = perfectamente saludable
    ctr_penalty = (1.0 - ctr_norm) * 40  # max 40 pts por CTR bajo
    score = int(freq_score + ctr_penalty)
    score = max(0, min(100, score))

    if score >= 70:
        status = "fatigued"
    elif score >= 40:
        status = "watch"
    else:
        status = "healthy"

    return score, status


def _extract_first_action_value(actions: list[dict]) -> float:
    if not actions:
        return 0.0
    try:
        return float(actions[0].get("value", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _extract_cpa(cost_per_action: list[dict]) -> float | None:
    if not cost_per_action:
        return None
    try:
        return float(cost_per_action[0].get("value", 0) or 0)
    except (TypeError, ValueError):
        return None


@router.get("/{ad_account_id}/insights/creative-fatigue")
async def get_creative_fatigue(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Diagnóstico de fatiga creativa por anuncio.

    Calcula fatigue_score (0-100) y fatigue_status (healthy/watch/fatigued)
    basado en frecuencia y CTR. Devuelve también alertas cuando:
    - frecuencia > 5 y CTR < 1%
    - costo por resultado sube (proxy: CPA alto relativo)
    """
    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    if adset_id:
        object_id = adset_id
        level = "adset"
    elif campaign_id:
        object_id = campaign_id
        level = "campaign"
    else:
        object_id = normalize_ad_account_id(ad_account_id)
        level = "account"

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=FATIGUE_FIELDS,
            level="ad",
            date_preset=effective_preset,
            time_range=use_time_range,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener datos de fatiga de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    enriched = []
    alerts = []

    for row in rows:
        frequency = float(row.get("frequency", 0) or 0)
        ctr = float(row.get("ctr", 0) or 0)
        spend = float(row.get("spend", 0) or 0)
        impressions = int(float(row.get("impressions", 0) or 0))
        actions = row.get("actions") or []
        cost_per_action = row.get("cost_per_action_type") or []
        results = _extract_first_action_value(actions)
        cpa = _extract_cpa(cost_per_action)
        score, status = _compute_fatigue_score(frequency, ctr)
        ad_id = row.get("ad_id", "")
        ad_name = row.get("ad_name", "")

        if frequency > 5 and ctr < 1.0:
            alerts.append({
                "ad_id": ad_id,
                "ad_name": ad_name,
                "type": "high_frequency_low_ctr",
                "message": f"Frecuencia {frequency:.1f} con CTR {ctr:.2f}% — posible fatiga",
            })

        enriched.append({
            "ad_id": ad_id,
            "ad_name": ad_name,
            "impressions": impressions,
            "frequency": frequency,
            "spend": spend,
            "ctr": ctr,
            "results": results,
            "cpa": cpa,
            "fatigue_score": score,
            "fatigue_status": status,
        })

    enriched.sort(key=lambda r: r["fatigue_score"], reverse=True)

    return {
        "data": enriched,
        "alerts": alerts,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }
```

- [ ] **Step 4: Registrar router**

En `backend/src/oderbiz_analytics/api/main.py`, añadir:
```python
from oderbiz_analytics.api.routes.creative_fatigue import router as creative_fatigue_router
# ...
app.include_router(creative_fatigue_router, prefix="/api/v1")
```

- [ ] **Step 5: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_creative_fatigue_route.py -v
```

Expected: 2 PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/creative_fatigue.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_creative_fatigue_route.py
git commit -m "feat(analytics): add creative fatigue endpoint with score and alerts"
```

---

## Task 5: Backend — Extender geo insights con CPA y métricas de eficiencia

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/geo_insights.py`

- [ ] **Step 1: Escribir el test que falla**

Añadir al archivo existente `backend/tests/test_geo_insights_route.py`:

```python
@respx.mock
def test_geo_insights_includes_spend_and_results(client):
    """El endpoint debe retornar spend y results además de impressions/clicks."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "region": "EC-P",
                    "impressions": "5000",
                    "clicks": "100",
                    "spend": "25.50",
                    "reach": "3000",
                    "actions": [{"action_type": "link_click", "value": "50"}],
                    "cost_per_action_type": [{"action_type": "link_click", "value": "0.51"}],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/geo",
        params={"scope": "account", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    row = body["data"][0]
    assert "spend" in row
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_geo_insights_route.py::test_geo_insights_includes_spend_and_results -v
```

Expected: FAIL — el campo `spend` ya existe pero `results` y `cpa` no están calculados.

- [ ] **Step 3: Extender el endpoint geo**

En `backend/src/oderbiz_analytics/api/routes/geo_insights.py`, cambiar:

```python
# Línea original:
GEO_FIELDS = "impressions,clicks,spend,reach"

# Cambiar a:
GEO_FIELDS = "impressions,clicks,spend,reach,actions,cost_per_action_type"
```

Y reemplazar la sección de construcción del response al final:

```python
def _extract_results_and_cpa(row: dict) -> dict:
    """Extrae resultados y CPA de actions/cost_per_action_type."""
    actions = row.get("actions") or []
    cost_per = row.get("cost_per_action_type") or []
    spend = float(row.get("spend", 0) or 0)

    # Resultado principal: primer action no trivial
    results = 0
    for a in actions:
        action_type = str(a.get("action_type", ""))
        if action_type not in ("post_engagement", "page_engagement", "photo_view"):
            try:
                results = int(float(a.get("value", 0)))
                break
            except (TypeError, ValueError):
                pass

    # CPA
    cpa: float | None = None
    if cost_per:
        try:
            cpa = float(cost_per[0].get("value", 0) or 0)
        except (TypeError, ValueError):
            pass
    if cpa is None and results > 0:
        cpa = spend / results

    return {"results": results, "cpa": round(cpa, 2) if cpa is not None else None}
```

Y en el return del handler, antes de `return {...}`, modificar:

```python
    # Enriquecer cada row con nombre de región y métricas de eficiencia
    enriched_rows = []
    for row in rows:
        enriched = enrich_geo_row(row)
        enriched.update(_extract_results_and_cpa(row))
        enriched_rows.append(enriched)
```

También añadir `_extract_results_and_cpa` como función local en el archivo (antes del router).

- [ ] **Step 4: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_geo_insights_route.py -v
```

Expected: todos los tests existentes + el nuevo PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/geo_insights.py \
        backend/tests/test_geo_insights_route.py
git commit -m "feat(analytics): extend geo insights with results, CPA, and efficiency metrics"
```

---

## Task 6: Backend — Extender placements con CPC, CPA, frecuencia y platform_position

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/placement_insights.py`

- [ ] **Step 1: Escribir el test que falla**

Añadir al archivo existente `backend/tests/test_geo_insights_route.py` o crear uno nuevo para placements:

```bash
# Verificar si existe test de placements
ls /Users/lamnda/Documents/oderbiz\ analitics/backend/tests/ | grep placement
```

Si no existe, crear `backend/tests/test_placement_insights_route.py`:

```python
# backend/tests/test_placement_insights_route.py
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
def test_placement_insights_includes_cpc_and_frequency(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {
                    "publisher_platform": "facebook",
                    "platform_position": "feed",
                    "impressions": "5000",
                    "clicks": "100",
                    "spend": "25.00",
                    "reach": "3000",
                    "frequency": "1.67",
                    "cpm": "5.00",
                    "ctr": "2.00",
                    "cpc": "0.25",
                    "actions": [{"action_type": "link_click", "value": "80"}],
                    "cost_per_action_type": [{"action_type": "link_click", "value": "0.31"}],
                }
            ]},
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/placements",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    row = body["data"][0]
    assert "cpc" in row
    assert "frequency" in row
    assert "platform_position" in row
    assert body["breakdowns"] == ["publisher_platform", "platform_position"]
```

- [ ] **Step 2: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_placement_insights_route.py -v 2>&1 | head -20
```

Expected: FAIL o parcial (platform_position != impression_device).

- [ ] **Step 3: Extender el endpoint de placements**

En `backend/src/oderbiz_analytics/api/routes/placement_insights.py`:

```python
# Cambiar:
PLACEMENT_FIELDS = "impressions,clicks,spend,reach,cpm,ctr"

# Por:
PLACEMENT_FIELDS = "impressions,clicks,spend,reach,cpm,ctr,cpc,frequency,actions,cost_per_action_type"
```

Y cambiar el breakdown de `impression_device` a `platform_position`:

```python
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=PLACEMENT_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=["publisher_platform", "platform_position"],
        )
```

Y en el return:

```python
    # Calcular CPA derivado donde no venga nativo
    enriched = []
    total_spend = sum(float(r.get("spend", 0) or 0) for r in rows)
    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        pct_spend = round((spend / total_spend * 100), 1) if total_spend > 0 else 0.0
        cost_per = row.get("cost_per_action_type") or []
        cpa: float | None = None
        if cost_per:
            try:
                cpa = float(cost_per[0].get("value", 0) or 0)
            except (TypeError, ValueError):
                pass
        enriched.append({**row, "pct_spend": pct_spend, "cpa_derived": cpa})

    return {
        "data": enriched,
        "breakdowns": ["publisher_platform", "platform_position"],
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }
```

- [ ] **Step 4: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_placement_insights_route.py -v
```

Expected: PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/placement_insights.py \
        backend/tests/test_placement_insights_route.py
git commit -m "feat(analytics): extend placement insights with CPC, frequency, CPA, and platform_position"
```

---

## Task 7: Backend — Ejecutar suite completa y verificar que todo pasa

- [ ] **Step 1: Ejecutar todos los tests**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: todos los tests existentes + nuevos PASSED. Si hay FAIL, investigar antes de continuar.

- [ ] **Step 2: Commit final de estado limpio backend**

```bash
git add backend/src/oderbiz_analytics/api/main.py
git commit -m "feat(analytics): register all new analytics routers in main.py"
```

---

## Task 8: Frontend — Nuevas interfaces y funciones fetch en client.ts

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Añadir interfaces y funciones al final de client.ts**

Abrir `frontend/src/api/client.ts` y añadir al final del archivo:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Demographics
// ─────────────────────────────────────────────────────────────────────────────

export interface DemographicsRow {
  age?: string;
  gender?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: InsightActionItem[];
  cost_per_action_type?: InsightActionItem[];
}

export interface DemographicsResponse {
  data: DemographicsRow[];
  breakdown: "age" | "gender" | "age,gender";
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  note: string;
}

export async function fetchDemographicsInsights(
  adAccountId: string,
  opts: {
    breakdown?: "age" | "gender" | "age,gender";
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
    adId?: string;
  }
): Promise<DemographicsResponse> {
  const q = new URLSearchParams();
  if (opts.breakdown) q.set("breakdown", opts.breakdown);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/demographics?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Attribution Windows
// ─────────────────────────────────────────────────────────────────────────────

export interface AttributionWindowOption {
  value: string;
  label: string;
}

export interface AttributionResponse {
  data: { spend?: string; actions?: InsightActionItem[]; cost_per_action_type?: InsightActionItem[] }[];
  window: string;
  window_label: string;
  available_windows: Record<string, string>;
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  note: string;
}

export async function fetchAttributionInsights(
  adAccountId: string,
  opts: {
    window?: string;
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adId?: string;
  }
): Promise<AttributionResponse> {
  const q = new URLSearchParams();
  if (opts.window) q.set("window", opts.window);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adId) q.set("ad_id", opts.adId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/attribution?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadsRow {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  leads_insights: number;
  cpa_lead: number | null;
  actions?: InsightActionItem[];
}

export interface LeadsResponse {
  data: LeadsRow[];
  summary: {
    total_leads_insights: number;
    total_spend: number;
    avg_cpa_lead: number | null;
  };
  level: string;
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
  note: string;
}

export async function fetchLeadsInsights(
  adAccountId: string,
  opts: {
    level?: "account" | "campaign" | "ad";
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
  }
): Promise<LeadsResponse> {
  const q = new URLSearchParams();
  if (opts.level) q.set("level", opts.level);
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/leads?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Creative Fatigue
// ─────────────────────────────────────────────────────────────────────────────

export interface FatigueRow {
  ad_id: string;
  ad_name: string;
  impressions: number;
  frequency: number;
  spend: number;
  ctr: number;
  results: number;
  cpa: number | null;
  fatigue_score: number;
  fatigue_status: "healthy" | "watch" | "fatigued";
}

export interface FatigueAlert {
  ad_id: string;
  ad_name: string;
  type: string;
  message: string;
}

export interface CreativeFatigueResponse {
  data: FatigueRow[];
  alerts: FatigueAlert[];
  date_preset: string | null;
  time_range: { since: string; until: string } | null;
}

export async function fetchCreativeFatigue(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
  }
): Promise<CreativeFatigueResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/insights/creative-fatigue?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2: Verificar que TypeScript compila sin errores**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores de tipo.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(analytics): add demographics, attribution, leads, fatigue types and fetch functions"
```

---

## Task 9: Frontend — Componente DemographicsPanel

**Files:**
- Create: `frontend/src/components/DemographicsPanel.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/DemographicsPanel.tsx
import { useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { DemographicsRow } from "@/api/client";

type Breakdown = "age" | "gender" | "age,gender";

interface DemographicsPanelProps {
  data: DemographicsRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  breakdown: Breakdown;
  onBreakdownChange: (b: Breakdown) => void;
}

function fmtNum(v: string | number | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("es");
}

function fmtPct(v: string | number | undefined): string {
  if (v == null) return "—";
  return `${Number(v).toFixed(2)}%`;
}

function fmtCurrency(v: string | number | undefined): string {
  if (v == null) return "—";
  return `$${Number(v).toFixed(2)}`;
}

export default function DemographicsPanel({
  data,
  isLoading,
  isError,
  errorMessage,
  breakdown,
  onBreakdownChange,
}: DemographicsPanelProps) {
  const rows = data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-foreground text-lg font-semibold">Segmentación demográfica</h2>
        <Select value={breakdown} onValueChange={(v) => onBreakdownChange(v as Breakdown)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="age">Por edad</SelectItem>
            <SelectItem value="gender">Por género</SelectItem>
            <SelectItem value="age,gender">Cruce edad + género</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
        Nota: reach excluido por limitaciones históricas de Meta en breakdowns demográficos
      </Badge>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {breakdown === "age" ? "Rendimiento por edad" : breakdown === "gender" ? "Rendimiento por género" : "Cruce edad + género"}
          </CardTitle>
          <CardDescription>
            Gasto, impresiones, CTR, CPM y CPC por segmento demográfico.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar datos demográficos</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Sin datos demográficos en este periodo.</p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {breakdown.includes("age") && <TableHead>Edad</TableHead>}
                      {breakdown.includes("gender") && <TableHead>Género</TableHead>}
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Gasto
                          <InfoTooltip text="Inversión total en Meta para este segmento en el período." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">Impresiones</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          CTR
                          <InfoTooltip text="Click-Through Rate: porcentaje de impresiones que resultaron en clic." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          CPM
                          <InfoTooltip text="Costo por 1.000 impresiones en este segmento." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CPC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={idx}>
                        {breakdown.includes("age") && (
                          <TableCell className="font-medium text-sm">{row.age ?? "—"}</TableCell>
                        )}
                        {breakdown.includes("gender") && (
                          <TableCell className="text-sm capitalize">{row.gender ?? "—"}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums text-sm">{fmtCurrency(row.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(row.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtPct(row.ctr)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtCurrency(row.cpm)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtCurrency(row.cpc)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep DemographicsPanel
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DemographicsPanel.tsx
git commit -m "feat(analytics): add DemographicsPanel component (age/gender breakdown)"
```

---

## Task 10: Frontend — Componente CreativeFatigueTable

**Files:**
- Create: `frontend/src/components/CreativeFatigueTable.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/CreativeFatigueTable.tsx
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { FatigueRow, FatigueAlert } from "@/api/client";

interface CreativeFatigueTableProps {
  data: FatigueRow[] | undefined;
  alerts: FatigueAlert[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

const STATUS_CONFIG = {
  healthy: { label: "Saludable", variant: "secondary" as const, className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  watch: { label: "Vigilar", variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  fatigued: { label: "Fatigado", variant: "secondary" as const, className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export default function CreativeFatigueTable({
  data,
  alerts,
  isLoading,
  isError,
  errorMessage,
}: CreativeFatigueTableProps) {
  const rows = data ?? [];
  const activeAlerts = alerts ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Fatiga de creatividades</h2>
        <p className="text-muted-foreground text-sm">
          Score basado en frecuencia y CTR. Mayor score = mayor riesgo de saturación.
        </p>
      </div>

      {activeAlerts.length > 0 && (
        <Alert>
          <AlertTitle>Alertas de fatiga</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1 text-sm">
              {activeAlerts.map((a, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="font-medium">{a.ad_name}:</span>
                  <span className="text-muted-foreground">{a.message}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Diagnóstico por anuncio</CardTitle>
          <CardDescription>
            Score 0-100 (saludable &lt; 40, vigilar 40-69, fatigado &ge; 70). Ordenado de mayor a menor fatiga.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar fatiga</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Sin datos de creatividades en este periodo.</p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Anuncio</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Frecuencia
                          <InfoTooltip text="Promedio de veces que una persona vio este anuncio. Frecuencia alta con CTR bajo indica saturación." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">CPA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const cfg = STATUS_CONFIG[row.fatigue_status];
                      return (
                        <TableRow key={row.ad_id}>
                          <TableCell>
                            <p className="truncate text-sm font-medium max-w-[200px]">{row.ad_name}</p>
                            <p className="text-muted-foreground font-mono text-xs">{row.ad_id}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={cfg.className}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {row.fatigue_score}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.frequency.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.ctr.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            ${row.spend.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep CreativeFatigue
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CreativeFatigueTable.tsx
git commit -m "feat(analytics): add CreativeFatigueTable component with score and alerts"
```

---

## Task 11: Frontend — Componente LeadsPanel

**Files:**
- Create: `frontend/src/components/LeadsPanel.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/LeadsPanel.tsx
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { LeadsResponse } from "@/api/client";

interface LeadsPanelProps {
  data: LeadsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function LeadsPanel({ data, isLoading, isError, errorMessage }: LeadsPanelProps) {
  const rows = data?.data ?? [];
  const summary = data?.summary;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Lead Ads</h2>
        <p className="text-muted-foreground text-sm">
          Leads reportados en Insights (conversiones) por campaña.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                Total leads
                <InfoTooltip text="Leads reportados en Insights de Meta (acciones de tipo lead/onsite_conversion)." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.total_leads_insights.toLocaleString("es")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">Gasto total</CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                ${summary.total_spend.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                CPA por lead
                <InfoTooltip text="Gasto total ÷ total leads reportados en Insights." />
              </CardTitle>
              <CardTitle className="text-2xl tabular-nums">
                {summary.avg_cpa_lead != null ? `$${summary.avg_cpa_lead.toFixed(2)}` : "—"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {data?.note && (
        <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
          {data.note}
        </Badge>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leads por campaña</CardTitle>
          <CardDescription>Volumen y CPA por campaña en el período seleccionado.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar leads</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Sin leads en este periodo.</p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaña</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">CPA lead</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={row.campaign_id ?? idx}>
                        <TableCell className="font-medium text-sm max-w-[240px] truncate">
                          {row.campaign_name ?? row.campaign_id ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {row.leads_insights.toLocaleString("es")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          ${Number(row.spend ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.cpa_lead != null ? `$${row.cpa_lead.toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep LeadsPanel
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LeadsPanel.tsx
git commit -m "feat(analytics): add LeadsPanel component with summary KPIs and campaign table"
```

---

## Task 12: Frontend — Componente AttributionWindowPanel

**Files:**
- Create: `frontend/src/components/AttributionWindowPanel.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/AttributionWindowPanel.tsx
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { AttributionResponse, InsightActionItem } from "@/api/client";

const WINDOW_OPTIONS = [
  { value: "click_1d", label: "1 día tras clic" },
  { value: "click_7d", label: "7 días tras clic" },
  { value: "click_28d", label: "28 días tras clic" },
  { value: "view_1d", label: "1 día tras impresión" },
  { value: "view_7d", label: "7 días tras impresión" },
];

interface AttributionWindowPanelProps {
  data: AttributionResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  window: string;
  onWindowChange: (w: string) => void;
}

function extractTotalActions(actions: InsightActionItem[] | undefined): number {
  if (!actions) return 0;
  return actions.reduce((sum, a) => sum + Number(a.value ?? 0), 0);
}

function extractTotalSpend(data: AttributionResponse["data"]): number {
  return data.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
}

export default function AttributionWindowPanel({
  data,
  isLoading,
  isError,
  errorMessage,
  window,
  onWindowChange,
}: AttributionWindowPanelProps) {
  const rows = data?.data ?? [];
  const totalSpend = extractTotalSpend(rows);
  const totalActions = rows.reduce(
    (sum, row) => sum + extractTotalActions(row.actions),
    0
  );
  const cpa = totalActions > 0 ? totalSpend / totalActions : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-foreground text-lg font-semibold">Ventana de atribución</h2>
        <Select value={window} onValueChange={onWindowChange}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data?.window_label && (
          <Badge variant="secondary" className="font-normal">
            Activa: {data.window_label}
          </Badge>
        )}
      </div>

      {data?.note && (
        <p className="text-muted-foreground text-xs">{data.note}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
              Gasto total
              <InfoTooltip text="Inversión total en el período para la ventana seleccionada." />
            </CardTitle>
            <CardTitle className="text-2xl tabular-nums">
              {isLoading ? <Skeleton className="h-8 w-24" /> : `$${totalSpend.toFixed(2)}`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Total conversiones</CardTitle>
            <CardTitle className="text-2xl tabular-nums">
              {isLoading ? <Skeleton className="h-8 w-24" /> : totalActions.toLocaleString("es")}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
              CPA (ventana actual)
              <InfoTooltip text="Costo por conversión calculado sobre la ventana de atribución activa." />
            </CardTitle>
            <CardTitle className="text-2xl tabular-nums">
              {isLoading ? <Skeleton className="h-8 w-24" /> : cpa != null ? `$${cpa.toFixed(2)}` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Error al cargar datos de atribución</AlertTitle>
          <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Sin datos de conversiones para esta ventana.</p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep AttributionWindow
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AttributionWindowPanel.tsx
git commit -m "feat(analytics): add AttributionWindowPanel component"
```

---

## Task 13: Frontend — Integrar todos los módulos en DashboardPage

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Añadir imports en DashboardPage.tsx**

Al inicio del archivo, después de los imports existentes, añadir:

```tsx
import DemographicsPanel from "@/components/DemographicsPanel";
import CreativeFatigueTable from "@/components/CreativeFatigueTable";
import LeadsPanel from "@/components/LeadsPanel";
import AttributionWindowPanel from "@/components/AttributionWindowPanel";
import {
  fetchDemographicsInsights,
  fetchAttributionInsights,
  fetchLeadsInsights,
  fetchCreativeFatigue,
} from "@/api/client";
import type { DemographicsRow } from "@/api/client";
```

- [ ] **Step 2: Añadir estados nuevos en el componente**

Después de los estados existentes (línea ~99 de DashboardPage.tsx), añadir:

```tsx
  const [demographicsBreakdown, setDemographicsBreakdown] = useState<"age" | "gender" | "age,gender">("age");
  const [attributionWindow, setAttributionWindow] = useState<string>("click_7d");
```

- [ ] **Step 3: Añadir queries nuevas**

Después de `targetingQuery`, añadir:

```tsx
  const demographicsQuery = useQuery({
    queryKey: ["demographics", id, datePreset, demographicsBreakdown, campaignKey, adsetSelect, selectedAdId, customDateStart, customDateStop],
    queryFn: () => fetchDemographicsInsights(id, {
      breakdown: demographicsBreakdown,
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
      adId: selectedAdId ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "demografia",
    staleTime: 5 * 60 * 1000,
  });

  const attributionQuery = useQuery({
    queryKey: ["attribution", id, datePreset, attributionWindow, campaignKey, selectedAdId, customDateStart, customDateStop],
    queryFn: () => fetchAttributionInsights(id, {
      window: attributionWindow,
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adId: selectedAdId ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "atribucion",
    staleTime: 5 * 60 * 1000,
  });

  const leadsQuery = useQuery({
    queryKey: ["leads", id, datePreset, campaignKey, customDateStart, customDateStop],
    queryFn: () => fetchLeadsInsights(id, {
      level: "campaign",
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "leads",
    staleTime: 5 * 60 * 1000,
  });

  const fatigueQuery = useQuery({
    queryKey: ["creative-fatigue", id, datePreset, campaignKey, adsetSelect, customDateStart, customDateStop],
    queryFn: () => fetchCreativeFatigue(id, {
      ...effectiveDateParams,
      campaignId: campaignKey ?? undefined,
      adsetId: adsetSelect !== ALL ? adsetSelect : undefined,
    }),
    enabled: hasToken && Boolean(id) && mainTab === "fatiga",
    staleTime: 5 * 60 * 1000,
  });
```

- [ ] **Step 4: Añadir tabs nuevos en TabsList**

Localizar `<TabsList className="flex-wrap">` (línea ~618) y añadir los nuevos triggers:

```tsx
          <TabsTrigger value="demografia">Demografía</TabsTrigger>
          <TabsTrigger value="atribucion">Atribución</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="fatiga">Fatiga</TabsTrigger>
```

- [ ] **Step 5: Añadir TabsContent para cada nuevo tab**

Antes del cierre de `</Tabs>`, añadir los 4 nuevos TabsContent:

```tsx
        {/* ── Tab: Demografía ── */}
        <TabsContent value="demografia" className="space-y-6 pt-4">
          <DemographicsPanel
            data={demographicsQuery.data?.data}
            isLoading={demographicsQuery.isLoading}
            isError={demographicsQuery.isError}
            errorMessage={demographicsQuery.error instanceof Error ? demographicsQuery.error.message : undefined}
            breakdown={demographicsBreakdown}
            onBreakdownChange={setDemographicsBreakdown}
          />
        </TabsContent>

        {/* ── Tab: Atribución ── */}
        <TabsContent value="atribucion" className="space-y-6 pt-4">
          <AttributionWindowPanel
            data={attributionQuery.data}
            isLoading={attributionQuery.isLoading}
            isError={attributionQuery.isError}
            errorMessage={attributionQuery.error instanceof Error ? attributionQuery.error.message : undefined}
            window={attributionWindow}
            onWindowChange={setAttributionWindow}
          />
        </TabsContent>

        {/* ── Tab: Leads ── */}
        <TabsContent value="leads" className="space-y-6 pt-4">
          <LeadsPanel
            data={leadsQuery.data}
            isLoading={leadsQuery.isLoading}
            isError={leadsQuery.isError}
            errorMessage={leadsQuery.error instanceof Error ? leadsQuery.error.message : undefined}
          />
        </TabsContent>

        {/* ── Tab: Fatiga creativa ── */}
        <TabsContent value="fatiga" className="space-y-6 pt-4">
          <CreativeFatigueTable
            data={fatigueQuery.data?.data}
            alerts={fatigueQuery.data?.alerts}
            isLoading={fatigueQuery.isLoading}
            isError={fatigueQuery.isError}
            errorMessage={fatigueQuery.error instanceof Error ? fatigueQuery.error.message : undefined}
          />
        </TabsContent>
```

- [ ] **Step 6: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores de tipo.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(analytics): wire demographics, attribution, leads and fatigue tabs in DashboardPage"
```

---

## Task 14: Frontend — Extender tab Geografía con selector de métrica y eficiencia

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Añadir estado de métrica geo**

Después de `const [geoScope, setGeoScope]`, añadir:

```tsx
  const [geoMetric, setGeoMetric] = useState<"impressions" | "spend" | "cpa" | "results">("impressions");
```

- [ ] **Step 2: Reemplazar el TabsContent de Geografía**

Localizar `{/* ── Tab: Geografía ── */}` y reemplazar todo su contenido por:

```tsx
        {/* ── Tab: Geografía ── */}
        <TabsContent value="geografia" className="space-y-6 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground text-sm">Ámbito:</span>
            <Select value={geoScope} onValueChange={(v) => setGeoScope(v as "account" | "ad")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Cuenta completa</SelectItem>
                <SelectItem value="ad">Anuncio seleccionado</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-sm">Vista:</span>
            <Select value={geoMetric} onValueChange={(v) => setGeoMetric(v as typeof geoMetric)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="impressions">Por impresiones</SelectItem>
                <SelectItem value="spend">Por gasto</SelectItem>
                <SelectItem value="cpa">Por CPA</SelectItem>
                <SelectItem value="results">Por resultados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {geoScope === "ad" && !selectedAdId ? (
            <Alert>
              <AlertTitle>Selecciona un anuncio</AlertTitle>
              <AlertDescription>
                Ve a la pestaña <strong>Ranking</strong>, haz clic en una fila para seleccionar un anuncio y luego vuelve aquí.
              </AlertDescription>
            </Alert>
          ) : null}

          {geoQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : null}

          {geoQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Error al cargar datos geográficos</AlertTitle>
              <AlertDescription>
                {geoQuery.error instanceof Error ? geoQuery.error.message : "Error desconocido"}
              </AlertDescription>
            </Alert>
          ) : null}

          {!geoQuery.isLoading && !geoQuery.isError && (geoScope === "account" || Boolean(selectedAdId)) ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Distribución geográfica — eficiencia</CardTitle>
                  <CardDescription>
                    {geoScope === "account" ? "Cuenta completa" : `Anuncio ${selectedAdId}`} — vista por{" "}
                    {{ impressions: "impresiones", spend: "gasto", cpa: "CPA", results: "resultados" }[geoMetric]}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Región</TableHead>
                          <TableHead className="text-right">Impresiones</TableHead>
                          <TableHead className="text-right">Clics</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">Resultados</TableHead>
                          <TableHead className="text-right">CPA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(geoQuery.data?.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center">
                              Sin datos geográficos para este periodo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          [...(geoQuery.data?.data ?? [])]
                            .sort((a, b) => {
                              if (geoMetric === "impressions") return Number(b.impressions ?? 0) - Number(a.impressions ?? 0);
                              if (geoMetric === "spend") return Number(b.spend ?? 0) - Number(a.spend ?? 0);
                              if (geoMetric === "cpa") return Number((b as any).cpa ?? 0) - Number((a as any).cpa ?? 0);
                              return Number((b as any).results ?? 0) - Number((a as any).results ?? 0);
                            })
                            .map((row, idx) => (
                              <TableRow key={String(row.region ?? row.region_name ?? idx)}>
                                <TableCell className="font-medium">
                                  {String(row.region_name ?? row.region ?? "Desconocido")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {Number(row.impressions ?? 0).toLocaleString("es")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {String(row.clicks ?? "—")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  ${Number(row.spend ?? 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {(row as any).results != null ? String((row as any).results) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {(row as any).cpa != null ? `$${Number((row as any).cpa).toFixed(2)}` : "—"}
                                </TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mapa geográfico</CardTitle>
                  <CardDescription>Distribución interactiva — métrica: {geoMetric}.</CardDescription>
                </CardHeader>
                <CardContent>
                  {geoQuery.data ? (
                    <GeoMap
                      data={geoQuery.data.data}
                      metadata={geoQuery.data.metadata}
                      metric={geoMetric === "cpa" || geoMetric === "results" ? "impressions" : geoMetric}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(analytics): extend geo tab with efficiency metrics selector and CPA/results columns"
```

---

## Task 15: Frontend — Extender tab Plataformas con métricas completas

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Reemplazar el TabsContent de Plataformas**

Localizar `{/* ── Tab: Plataformas / placements ── */}` y reemplazar la tabla interna por:

```tsx
        {/* ── Tab: Plataformas / placements ── */}
        <TabsContent value="plataformas" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por plataforma y posición</CardTitle>
              <CardDescription>
                Breakdown <code className="text-xs">publisher_platform</code> +{" "}
                <code className="text-xs">platform_position</code>. Respeta filtros de campaña / conjunto / anuncio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {placementQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : placementQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {placementQuery.error instanceof Error ? placementQuery.error.message : "No se pudieron cargar placements."}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plataforma</TableHead>
                        <TableHead>Posición</TableHead>
                        <TableHead className="text-right">Gasto</TableHead>
                        <TableHead className="text-right">% Gasto</TableHead>
                        <TableHead className="text-right">Impresiones</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">CPM</TableHead>
                        <TableHead className="text-right">CPC</TableHead>
                        <TableHead className="text-right">Frecuencia</TableHead>
                        <TableHead className="text-right">CPA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(placementQuery.data?.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            Sin filas de placement para este periodo o filtros.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (placementQuery.data?.data ?? []).map((row, idx) => (
                          <TableRow key={`${row.ad_id}-${row.publisher_platform}-${row.platform_position}-${idx}`}>
                            <TableCell className="text-xs font-medium">{row.publisher_platform ?? "—"}</TableCell>
                            <TableCell className="max-w-[160px] truncate text-xs">
                              {row.platform_position ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              ${Number(row.spend ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {(row as any).pct_spend != null ? `${(row as any).pct_spend}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {Number(row.impressions ?? 0).toLocaleString("es")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {row.ctr != null ? `${Number(row.ctr).toFixed(2)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {row.cpm != null ? `$${Number(row.cpm).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {(row as any).cpc != null ? `$${Number((row as any).cpc).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {(row as any).frequency != null ? Number((row as any).frequency).toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {(row as any).cpa_derived != null ? `$${Number((row as any).cpa_derived).toFixed(2)}` : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(analytics): extend placements tab with CPC, CPM, frequency, CPA, and pct spend"
```

---

## Task 16: Frontend — KPI Costo por conversación respondida en tab Resumen

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Añadir computación del KPI conversación respondida**

Después de `const topActionsChartData = useMemo(...)` (línea ~268), añadir:

```tsx
  // KPI derivado: Costo por conversación respondida
  // Fuentes: messaging_first_reply, onsite_conversion.messaging_first_reply_7d, o derivado manual
  const convRespondidaKpi = useMemo(() => {
    const spend = data?.summary?.spend ?? 0;
    const actions = data?.actions ?? [];
    const REPLY_TYPES = [
      "messaging_first_reply",
      "onsite_conversion.messaging_first_reply_7d",
    ];
    let replied = 0;
    for (const a of actions) {
      if (REPLY_TYPES.includes(String(a.action_type))) {
        replied += Number(a.value ?? 0);
        break;
      }
    }
    const costo = replied > 0 ? spend / replied : null;
    return { replied, costo, fuente: replied > 0 ? "Insights (actions)" : "Sin dato nativo" };
  }, [data?.actions, data?.summary]);
```

- [ ] **Step 2: Añadir la tarjeta KPI en el tab Resumen**

Dentro del bloque `{data && !isLoading ? (<>...` del tab Resumen, después del grid de KPI cards existente:

```tsx
              {/* KPI conversación respondida */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    Costo por conversación respondida
                    <InfoTooltip text={`Métrica derivada. Fórmula: Gasto ÷ Conversaciones respondidas. Fuente: ${convRespondidaKpi.fuente}. Si Meta no devuelve la acción nativa, el dato es '—'.`} />
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {convRespondidaKpi.costo != null
                      ? `$${convRespondidaKpi.costo.toFixed(2)}`
                      : "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-muted-foreground text-xs">
                    Respuestas: {convRespondidaKpi.replied.toLocaleString("es")} · Fuente: {convRespondidaKpi.fuente}
                  </p>
                </CardContent>
              </Card>
```

Añadir `InfoTooltip` al import de componentes si no está ya:
```tsx
import InfoTooltip from "@/components/InfoTooltip";
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(analytics): add derived KPI 'costo por conversación respondida' to Resumen tab"
```

---

## Task 17: Verificación final y build de producción

- [ ] **Step 1: Ejecutar suite completa de tests backend**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: todos los tests PASSED.

- [ ] **Step 2: Verificar TypeScript frontend sin errores**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit
```

Expected: exit code 0, sin errores.

- [ ] **Step 3: Build de frontend**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npm run build 2>&1 | tail -20
```

Expected: build exitoso sin errores.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(analytics): complete Meta Ads analytics extensions — demographics, attribution, leads, fatigue, extended geo and placements"
```

---

## Spec Coverage Check

| Requerimiento | Task |
|---|---|
| KPI costo/conv respondida | Task 16 |
| Embudo por campaña/anuncio | Task 3 (leads endpoint expone nivel campaign/ad) — embudo completo en Plan B |
| Mapa geo con CPA y tasa respuesta | Task 5 + Task 14 |
| Módulo fatiga creativa | Task 4 + Task 10 |
| Tabla placements extendida | Task 6 + Task 15 |
| Segmentación edad y género | Task 1 + Task 9 |
| Comparación ventanas atribución | Task 2 + Task 12 |
| Métricas base en más módulos | Task 6 (placements), Task 1 (demographics) |
| Módulo acciones y resultados | Existente en Resumen — extendido en Task 16 |
| Lead Ads | Task 3 + Task 11 |

**Nota:** Embudo completo por campaña/anuncio, semáforos, score de salud, y capa manual sin CRM se cubren en el **Plan B: Manual CRM & Health Score**.

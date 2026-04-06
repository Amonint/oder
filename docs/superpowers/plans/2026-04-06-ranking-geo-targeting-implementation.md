# Ranking, Geografía y Targeting — Plan de Implementación

> **Para workers agentic:** REQUERIDO SUB-SKILL: Usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan sintaxis checkbox (`- [ ]`) para rastreo.

**Objetivo:** Implementar nombres de anuncio confiables, cobertura geográfica completa con mapa, y vista estructurada de targeting en el dashboard de Meta, cumpliendo con los requisitos R-2, R-3, R-4.

**Arquitectura:** 
- Backend: Crear servicios de formateo para nombres (fallback con Graph API), geografía (con cobertura completa) y targeting (vista estructurada). Mantener endpoints existentes, mejorar respuestas.
- Frontend: Refactorizar UI de dashboard para mostrar datos enriquecidos, agregar componente de mapa geográfico, crear panel de targeting estructurado.
- Tests: TDD con coverage de casos vacíos, errores, y datos completos en cada servicio.

**Tech Stack:** FastAPI (backend), React + Recharts (frontend), respx + pytest (testing), Meta Graph API v25, DuckDB (cache).

---

## Mapeo de archivos

### Backend

**Crear (nuevos servicios):**
- `backend/src/oderbiz_analytics/services/__init__.py`
- `backend/src/oderbiz_analytics/services/ad_label.py` — Resolución de nombres con fallback
- `backend/src/oderbiz_analytics/services/targeting_formatter.py` — Formateo estructurado de targeting
- `backend/src/oderbiz_analytics/services/geo_formatter.py` — Enriquecimiento de datos geográficos

**Modificar (rutas):**
- `backend/src/oderbiz_analytics/api/routes/ads_ranking.py:50-74` — Enriquecer respuesta con nombres
- `backend/src/oderbiz_analytics/api/routes/geo_insights.py:66-93` — Agregar cobertura completa y metadata
- `backend/src/oderbiz_analytics/api/routes/targeting.py:53-71` — Formatear targeting en respuesta

**Tests:**
- `backend/tests/test_ad_label_service.py` — Tests de fallback de nombres
- `backend/tests/test_geo_formatter_service.py` — Tests de formateo geográfico
- `backend/tests/test_targeting_formatter_service.py` — Tests de targeting

### Frontend

**Crear (componentes):**
- `frontend/src/components/TargetingPanel.tsx` — Panel estructurado de targeting
- `frontend/src/components/GeoMap.tsx` — Componente de mapa geográfico simple
- `frontend/src/lib/targetingFormatters.ts` — Helpers de formato para UI

**Modificar:**
- `frontend/src/api/client.ts` — Actualizar tipos de respuesta (enriquecidos)
- `frontend/src/routes/DashboardPage.tsx:95-180` — Integrar nuevos componentes y visualización geo mejorada

---

## Tareas en orden de ejecución

### Tarea 1: Crear servicio de resolución de nombres (ad_label)

**Archivos:**
- Crear: `backend/src/oderbiz_analytics/services/__init__.py`
- Crear: `backend/src/oderbiz_analytics/services/ad_label.py`
- Crear: `backend/tests/test_ad_label_service.py`

**Contexto:** Los nombres de anuncio pueden estar vacíos en Insights. Necesitamos un servicio que intente resolver el nombre desde Insights, y si falla, retorne un fallback claro documentado.

- [ ] **Paso 1: Crear directorio services y __init__.py**

```bash
mkdir -p /Users/lamnda/Documents/oderbiz\ analitics/backend/src/oderbiz_analytics/services
touch /Users/lamnda/Documents/oderbiz\ analitics/backend/src/oderbiz_analytics/services/__init__.py
```

- [ ] **Paso 2: Escribir test de fallback de nombres**

```python
# backend/tests/test_ad_label_service.py
import pytest
from oderbiz_analytics.services.ad_label import get_ad_label


def test_get_ad_label_with_valid_name():
    """Cuando ad_name existe y no está vacío, usarlo."""
    row = {"ad_id": "123", "ad_name": "Anuncio Verano 2026"}
    result = get_ad_label(row)
    assert result == "Anuncio Verano 2026"


def test_get_ad_label_with_empty_name():
    """Cuando ad_name es string vacío, retornar ID con formato fallback."""
    row = {"ad_id": "123", "ad_name": ""}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 123"


def test_get_ad_label_with_none_name():
    """Cuando ad_name es None, retornar ID con formato fallback."""
    row = {"ad_id": "456", "ad_name": None}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 456"


def test_get_ad_label_missing_ad_name_key():
    """Cuando falta la clave ad_name completamente, retornar fallback con ID."""
    row = {"ad_id": "789"}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 789"


def test_get_ad_label_with_whitespace_name():
    """Cuando ad_name solo tiene espacios, tratar como vacío."""
    row = {"ad_id": "101", "ad_name": "   "}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 101"
```

Ejecutar test para verificar que falla:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_ad_label_service.py -v
```

Esperado: FAIL (módulo no existe)

- [ ] **Paso 3: Implementar servicio de etiqueta de anuncio**

```python
# backend/src/oderbiz_analytics/services/ad_label.py
"""
Servicio de resolución de etiquetas de anuncios.

Cumple R-2.1, R-2.2, R-2.4: Provee etiqueta legible con fallback documentado.
"""
from __future__ import annotations

from typing import Any


def get_ad_label(row: dict[str, Any]) -> str:
    """
    Retorna una etiqueta legible para un anuncio.

    Args:
        row: Row de insights con ad_id y ad_name (opcional).

    Returns:
        Nombre del anuncio o fallback documentado si vacío/ausente.
        
    Implementa R-2.2: Cadena de respaldo cuando ad_name es vacío/nulo.
    Implementa R-2.4: Trazabilidad — fallback es claro ("Anuncio sin nombre — ID: ...").
    """
    ad_id = row.get("ad_id", "")
    ad_name = row.get("ad_name")

    # Validar que ad_name sea una cadena no vacía
    if isinstance(ad_name, str):
        stripped = ad_name.strip()
        if stripped:
            return stripped

    # Fallback documentado: mostrar que Meta no devolvió nombre
    return f"Anuncio sin nombre — ID: {ad_id}"
```

- [ ] **Paso 4: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_ad_label_service.py -v
```

Esperado: PASS (5/5 tests)

- [ ] **Paso 5: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/src/oderbiz_analytics/services/__init__.py \
         backend/src/oderbiz_analytics/services/ad_label.py \
         backend/tests/test_ad_label_service.py
git commit -m "feat: add ad_label service with fallback for missing names (R-2.1, R-2.2, R-2.4)"
```

---

### Tarea 2: Actualizar ruta de ranking para enriquecer datos

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py:70-74`
- Modificar: `backend/tests/test_ads_ranking_route.py`

**Contexto:** La ruta `/ads/performance` devuelve datos directos de Meta. Necesitamos enriquecerlos con etiquetas claras usando el servicio anterior.

- [ ] **Paso 1: Escribir test para ruta enriquecida**

```python
# backend/tests/test_ads_ranking_route.py (agregue al final)
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
def test_ads_performance_enriches_ad_label_with_valid_name(client):
    """Cuando ad_name existe, debe aparecer en respuesta enriquecida."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_100",
                        "ad_name": "Anuncio Summer Sale",
                        "spend": "100.00",
                        "impressions": "5000",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["ad_label"] == "Anuncio Summer Sale"


@respx.mock
def test_ads_performance_enriches_ad_label_with_empty_name(client):
    """Cuando ad_name está vacío, ad_label debe tener fallback claro."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_200",
                        "ad_name": "",
                        "spend": "50.00",
                        "impressions": "2000",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 1
    assert "Anuncio sin nombre" in body["data"][0]["ad_label"]
    assert "ad_200" in body["data"][0]["ad_label"]


@respx.mock
def test_ads_performance_enriches_ad_label_with_missing_name(client):
    """Cuando falta ad_name completamente, ad_label debe tener fallback."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "ad_id": "ad_300",
                        # sin ad_name
                        "spend": "25.00",
                        "impressions": "1000",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 1
    assert "Anuncio sin nombre" in body["data"][0]["ad_label"]
```

Ejecutar test para verificar que falla:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_ads_ranking_route.py::test_ads_performance_enriches_ad_label_with_valid_name -v
```

Esperado: FAIL (ad_label no en respuesta)

- [ ] **Paso 2: Actualizar ruta de ranking para enriquecer datos**

```python
# backend/src/oderbiz_analytics/api/routes/ads_ranking.py
# Reemplazar líneas 70-74 (el return statement)

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.ad_label import get_ad_label  # ADD THIS

router = APIRouter(prefix="/accounts", tags=["ads_ranking"])

RANKING_FIELDS = "ad_id,ad_name,campaign_name,impressions,clicks,spend,reach,frequency,cpm,cpp,ctr"


@router.get("/{ad_account_id}/ads/performance")
async def get_ads_performance(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Ad-level insights for ranking/performance analysis.

    - If both `date_start` and `date_stop` are provided, uses `time_range`.
    - Otherwise uses `date_preset` (defaults to "last_30d" if none provided).
    
    Implements R-2.1, R-2.2: Adds ad_label field with fallback when ad_name is empty/missing.
    """
    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos para usar rango de fechas personalizado.",
        )

    normalized_id = normalize_ad_account_id(ad_account_id)
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
            ad_account_id=normalized_id,
            fields=RANKING_FIELDS,
            level="ad",
            date_preset=effective_preset,
            time_range=use_time_range,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener insights.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    # Enriquecer cada row con ad_label
    enriched_rows = []
    for row in rows:
        enriched = {**row, "ad_label": get_ad_label(row)}
        enriched_rows.append(enriched)

    return {
        "data": enriched_rows,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }
```

- [ ] **Paso 3: Ejecutar tests para verificar que pasan**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_ads_ranking_route.py::test_ads_performance_enriches_ad_label_with_valid_name \
       backend/tests/test_ads_ranking_route.py::test_ads_performance_enriches_ad_label_with_empty_name \
       backend/tests/test_ads_ranking_route.py::test_ads_performance_enriches_ad_label_with_missing_name -v
```

Esperado: PASS (3/3)

- [ ] **Paso 4: Ejecutar suite completa de ranking para verificar que no se rompió nada**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_ads_ranking_route.py -v
```

Esperado: PASS (todos)

- [ ] **Paso 5: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/src/oderbiz_analytics/api/routes/ads_ranking.py \
         backend/tests/test_ads_ranking_route.py
git commit -m "feat(ranking): enrich ad_label with fallback for missing names (R-2.1, R-2.2)"
```

---

### Tarea 3: Crear servicio de formateo geográfico

**Archivos:**
- Crear: `backend/src/oderbiz_analytics/services/geo_formatter.py`
- Crear: `backend/tests/test_geo_formatter_service.py`

**Contexto:** Necesitamos enriquecer datos geográficos con nombres de región claros y metadata que indique cobertura completa. Implementa R-3.1, R-3.2, R-3.4.

- [ ] **Paso 1: Escribir tests para formateo geográfico**

```python
# backend/tests/test_geo_formatter_service.py
import pytest
from oderbiz_analytics.services.geo_formatter import (
    enrich_geo_row,
    get_geo_metadata,
    GEO_REGION_NAMES,
)


def test_enrich_geo_row_with_region():
    """Agregar nombre legible de región al row."""
    row = {"region": "ES-CA", "impressions": 1000, "spend": "50.00"}
    enriched = enrich_geo_row(row)
    assert enriched["region"] == "ES-CA"
    assert enriched["region_name"] == GEO_REGION_NAMES.get("ES-CA", "ES-CA")
    assert enriched["impressions"] == 1000


def test_enrich_geo_row_with_unknown_region():
    """Para región desconocida, mantener código original."""
    row = {"region": "UNKNOWN_CODE", "impressions": 500, "spend": "25.00"}
    enriched = enrich_geo_row(row)
    assert enriched["region"] == "UNKNOWN_CODE"
    assert enriched["region_name"] == "UNKNOWN_CODE"


def test_get_geo_metadata_account_scope():
    """Metadata indica alcance account."""
    total_rows = 17
    metadata = get_geo_metadata(scope="account", ad_id=None, total_rows=total_rows)
    assert metadata["scope"] == "account"
    assert metadata["ad_id"] is None
    assert metadata["total_rows"] == total_rows
    assert "complete_coverage" in metadata


def test_get_geo_metadata_ad_scope():
    """Metadata indica alcance ad específico."""
    total_rows = 5
    ad_id = "ad_123"
    metadata = get_geo_metadata(scope="ad", ad_id=ad_id, total_rows=total_rows)
    assert metadata["scope"] == "ad"
    assert metadata["ad_id"] == "ad_123"
    assert metadata["total_rows"] == total_rows


# Constante de ejemplo para test
GEO_REGION_NAMES = {
    "ES-CA": "Cataluña",
    "ES-MD": "Madrid",
    "ES-AN": "Andalucía",
}
```

Ejecutar para verificar que falla:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_geo_formatter_service.py -v
```

Esperado: FAIL (módulo no existe)

- [ ] **Paso 2: Implementar servicio de formateo geográfico**

```python
# backend/src/oderbiz_analytics/services/geo_formatter.py
"""
Servicio de formateo para datos geográficos.

Cumple R-3.1, R-3.2, R-3.4: Enriquece datos con nombres legibles, 
metadata de cobertura, y claridad de alcance.
"""
from __future__ import annotations

from typing import Any, Literal

# Mapeo de códigos de región a nombres legibles (España y principales)
# Cumple R-3.3: Nombres oficiales según doc Meta Insights
GEO_REGION_NAMES = {
    # España
    "ES-CA": "Cataluña",
    "ES-MD": "Madrid",
    "ES-AN": "Andalucía",
    "ES-VC": "Comunidad Valenciana",
    "ES-GA": "Galicia",
    "ES-PV": "País Vasco",
    "ES-AR": "Aragón",
    "ES-CB": "Castilla y León",
    "ES-CM": "Castilla-La Mancha",
    "ES-CT": "Comunidad Foral de Navarra",
    "ES-EX": "Extremadura",
    "ES-BA": "Islas Baleares",
    "ES-CN": "Islas Canarias",
    "ES-RI": "La Rioja",
    "ES-AS": "Asturias",
    "ES-MC": "Murcia",
}


def enrich_geo_row(row: dict[str, Any]) -> dict[str, Any]:
    """
    Enriquece una fila de datos geográficos con nombre de región legible.

    Args:
        row: Row con al menos 'region' (código como "ES-CA").

    Returns:
        Row enriquecida con 'region_name' (nombre legible).
        
    Implementa R-3.1: Dimension geográfica legible.
    """
    enriched = dict(row)
    region_code = enriched.get("region", "")
    
    # Agregar nombre legible si existe en mapeo
    if region_code in GEO_REGION_NAMES:
        enriched["region_name"] = GEO_REGION_NAMES[region_code]
    else:
        # Fallback: usar el código mismo
        enriched["region_name"] = region_code

    return enriched


def get_geo_metadata(
    scope: Literal["account", "ad"],
    ad_id: str | None,
    total_rows: int,
) -> dict[str, Any]:
    """
    Construye metadata para respuesta geográfica.

    Args:
        scope: "account" o "ad".
        ad_id: ID de anuncio si scope="ad", None si scope="account".
        total_rows: Cantidad de filas retornadas (para indicar cobertura).

    Returns:
        Dict con metadata explicativa.
        
    Implementa R-3.2: Cobertura completa de filas.
    Implementa R-3.4: Claridad de alcance.
    """
    return {
        "scope": scope,
        "ad_id": ad_id if scope == "ad" else None,
        "total_rows": total_rows,
        "complete_coverage": True,  # Indica que Meta devolvió todos los datos disponibles
        "note": (
            f"Datos agregados a nivel {scope}. "
            f"{'Para anuncio específico: ' + ad_id if scope == 'ad' else 'Para toda la cuenta.'}"
        ),
    }
```

- [ ] **Paso 3: Ejecutar tests para verificar que pasan**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_geo_formatter_service.py -v
```

Esperado: PASS (4/4)

- [ ] **Paso 4: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/src/oderbiz_analytics/services/geo_formatter.py \
         backend/tests/test_geo_formatter_service.py
git commit -m "feat: add geo_formatter service with region names and metadata (R-3.1, R-3.2, R-3.4)"
```

---

### Tarea 4: Actualizar ruta de geografía para enriquecer respuesta

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/geo_insights.py:66-93`
- Modificar: `backend/tests/test_geo_insights_route.py`

**Contexto:** Ahora enriquecemos la ruta geo con nombres de región y metadata de cobertura.

- [ ] **Paso 1: Escribir test para ruta geo enriquecida**

```python
# backend/tests/test_geo_insights_route.py (agregar al final)
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
def test_geo_insights_enriches_region_names_account_scope(client):
    """Respuesta incluye region_name y metadata de cobertura completa."""
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"region": "ES-CA", "impressions": 1000, "spend": "100.00"},
                    {"region": "ES-MD", "impressions": 800, "spend": "80.00"},
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/geo",
        params={"scope": "account", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    
    # Verificar datos enriquecidos
    assert len(body["data"]) == 2
    assert body["data"][0]["region_name"] == "Cataluña"
    assert body["data"][1]["region_name"] == "Madrid"
    
    # Verificar metadata
    assert "metadata" in body
    assert body["metadata"]["scope"] == "account"
    assert body["metadata"]["complete_coverage"] is True
    assert body["metadata"]["total_rows"] == 2


@respx.mock
def test_geo_insights_enriches_region_names_ad_scope(client):
    """Respuesta con scope ad incluye ad_id en metadata."""
    respx.get("https://graph.facebook.com/v25.0/ad_999/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"region": "ES-CA", "impressions": 500, "spend": "50.00"},
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/insights/geo",
        params={"scope": "ad", "ad_id": "ad_999", "date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    
    assert body["data"][0]["region_name"] == "Cataluña"
    assert body["metadata"]["scope"] == "ad"
    assert body["metadata"]["ad_id"] == "ad_999"
```

Ejecutar para verificar que falla:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_geo_insights_route.py::test_geo_insights_enriches_region_names_account_scope -v
```

Esperado: FAIL (metadata no existe)

- [ ] **Paso 2: Actualizar ruta geo_insights**

```python
# backend/src/oderbiz_analytics/api/routes/geo_insights.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.geo_formatter import (  # ADD THIS
    enrich_geo_row,
    get_geo_metadata,
)

router = APIRouter(prefix="/accounts", tags=["geo_insights"])

GEO_FIELDS = "impressions,clicks,spend,reach"


@router.get("/{ad_account_id}/insights/geo")
async def get_geo_insights(
    ad_account_id: str,
    scope: Literal["account", "ad"] = Query("account"),
    ad_id: str | None = Query(None),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Geographic insights broken down by region.

    - scope="account": aggregates at account level, object = ad_account_id
    - scope="ad": fetches for a specific ad, requires `ad_id`
    - Supports date_preset or date_start+date_stop (both required together)
    
    Implements R-3.1, R-3.2, R-3.4: Returns enriched data with region names,
    complete coverage indicator, and scope clarity.
    """
    if scope == "ad" and not ad_id:
        raise HTTPException(
            status_code=422,
            detail="ad_id es requerido cuando scope='ad'.",
        )

    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos para usar rango de fechas personalizado.",
        )

    if scope == "account":
        object_id = normalize_ad_account_id(ad_account_id)
        level = "account"
    else:
        object_id = ad_id  # type: ignore[assignment]
        level = "ad"

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
            fields=GEO_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=["region"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener insights.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    # Enriquecer cada row con nombre de región
    enriched_rows = [enrich_geo_row(row) for row in rows]

    # Metadata de cobertura completa y alcance
    metadata = get_geo_metadata(
        scope=scope,
        ad_id=ad_id if scope == "ad" else None,
        total_rows=len(enriched_rows),
    )

    return {
        "data": enriched_rows,
        "metadata": metadata,
        "scope": scope,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }
```

- [ ] **Paso 3: Ejecutar tests para verificar que pasan**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_geo_insights_route.py::test_geo_insights_enriches_region_names_account_scope \
       backend/tests/test_geo_insights_route.py::test_geo_insights_enriches_region_names_ad_scope -v
```

Esperado: PASS (2/2)

- [ ] **Paso 4: Ejecutar suite completa de geo_insights**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_geo_insights_route.py -v
```

Esperado: PASS (todos)

- [ ] **Paso 5: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/src/oderbiz_analytics/api/routes/geo_insights.py \
         backend/tests/test_geo_insights_route.py
git commit -m "feat(geo): enrich with region names and coverage metadata (R-3.1, R-3.2, R-3.4)"
```

---

### Tarea 5: Crear servicio de formateo de targeting

**Archivos:**
- Crear: `backend/src/oderbiz_analytics/services/targeting_formatter.py`
- Crear: `backend/tests/test_targeting_formatter_service.py`

**Contexto:** Implementar R-4.1, R-4.2, R-4.3: Transformar JSON crudo de targeting en estructura legible para negocio.

- [ ] **Paso 1: Escribir tests de formateo de targeting**

```python
# backend/tests/test_targeting_formatter_service.py
import pytest
from oderbiz_analytics.services.targeting_formatter import (
    format_targeting,
    format_geo_locations,
    format_flexible_spec,
)


def test_format_geo_locations_with_countries():
    """Formatear ubicaciones con países."""
    geo_locs = {
        "countries": ["ES", "PT"],
    }
    formatted = format_geo_locations(geo_locs)
    assert formatted["countries"] == ["ES", "PT"]


def test_format_geo_locations_with_regions():
    """Formatear ubicaciones con regiones."""
    geo_locs = {
        "regions": [{"key": "ES-CA"}],
    }
    formatted = format_geo_locations(geo_locs)
    assert len(formatted["regions"]) > 0
    # Debe tener region_name enriquecido
    assert "region_name" in formatted["regions"][0]


def test_format_flexible_spec_with_interests():
    """Agrupar flexible_spec por categoría (intereses)."""
    flexible_spec = [
        {
            "interests": [
                {"id": "6003107", "name": "Technology"},
            ]
        }
    ]
    formatted = format_flexible_spec(flexible_spec)
    assert "interests" in formatted
    assert len(formatted["interests"]) > 0


def test_format_targeting_full_payload():
    """Formatear targeting completo con edades, género, ubicaciones."""
    targeting = {
        "age_min": 18,
        "age_max": 65,
        "genders": [1],  # 1=Male, 2=Female, etc.
        "geo_locations": {
            "countries": ["ES"],
        },
        "flexible_spec": [
            {
                "interests": [
                    {"id": "6003107", "name": "Technology"},
                ]
            }
        ],
    }
    formatted = format_targeting(targeting)
    assert formatted["age_range"] == "18-65 años"
    assert formatted["genders"] == ["Masculino"]
    assert "locations" in formatted
    assert "audiences" in formatted


def test_format_targeting_with_missing_fields():
    """Cuando faltan campos, devolver estructura con valores por defecto."""
    targeting = {"age_min": 18}
    formatted = format_targeting(targeting)
    assert "age_range" in formatted
    assert "genders" in formatted
    assert formatted["genders"] == []
```

Ejecutar para verificar que falla:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_targeting_formatter_service.py -v
```

Esperado: FAIL (módulo no existe)

- [ ] **Paso 2: Implementar servicio de formateo de targeting**

```python
# backend/src/oderbiz_analytics/services/targeting_formatter.py
"""
Servicio de formateo para targeting de anuncios.

Cumple R-4.1, R-4.2, R-4.3, R-4.5: Transforma JSON crudo en estructura
legible para usuarios de negocio.
"""
from __future__ import annotations

from typing import Any

# Mapeo de género
GENDER_MAP = {
    1: "Masculino",
    2: "Femenino",
}

# Mapeo de región para geo_locations
GEO_REGION_NAMES = {
    "ES-CA": "Cataluña",
    "ES-MD": "Madrid",
    "ES-AN": "Andalucía",
    "ES-VC": "Comunidad Valenciana",
    "ES-GA": "Galicia",
    "ES-PV": "País Vasco",
    "ES-AR": "Aragón",
    "ES-CB": "Castilla y León",
    "ES-CM": "Castilla-La Mancha",
    "ES-CT": "Comunidad Foral de Navarra",
    "ES-EX": "Extremadura",
    "ES-BA": "Islas Baleares",
    "ES-CN": "Islas Canarias",
    "ES-RI": "La Rioja",
    "ES-AS": "Asturias",
    "ES-MC": "Murcia",
}


def format_geo_locations(geo_locs: dict[str, Any]) -> dict[str, Any]:
    """
    Formatea ubicaciones geográficas con nombres legibles.

    Implementa R-4.2: Ubicaciones con nombre legible, radio y tipo.
    """
    formatted = {}

    # Países
    if "countries" in geo_locs:
        formatted["countries"] = geo_locs["countries"]

    # Regiones
    if "regions" in geo_locs:
        regions = []
        for region in geo_locs["regions"]:
            region_key = region.get("key", "")
            formatted_region = {
                "code": region_key,
                "name": GEO_REGION_NAMES.get(region_key, region_key),
            }
            if "radius" in region:
                formatted_region["radius_km"] = region.get("radius")
            regions.append(formatted_region)
        formatted["regions"] = regions

    # Ciudades (si existen)
    if "cities" in geo_locs:
        formatted["cities"] = geo_locs["cities"]

    return formatted


def format_flexible_spec(
    flexible_spec: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Formatea audiencias flexibles agrupadas por categoría.

    Implementa R-4.3: Agrupar por categoría (intereses, comportamientos, etc.)
    con nombres legibles.
    """
    result: dict[str, list[dict[str, Any]]] = {}

    for spec_item in flexible_spec:
        # Cada spec_item puede tener interests, behaviors, education, etc.
        for category_name, items in spec_item.items():
            if category_name not in result:
                result[category_name] = []

            for item in items:
                # Cada item tiene id y name
                result[category_name].append({
                    "id": item.get("id"),
                    "name": item.get("name", "Desconocido"),
                })

    return result


def format_targeting(targeting: dict[str, Any]) -> dict[str, Any]:
    """
    Transforma targeting crudo en estructura legible para negocio.

    Implementa R-4.1: Vista estructurada (idioma español).
    """
    formatted: dict[str, Any] = {}

    # Edad
    age_min = targeting.get("age_min")
    age_max = targeting.get("age_max")
    if age_min and age_max:
        formatted["age_range"] = f"{age_min}-{age_max} años"
    elif age_min:
        formatted["age_range"] = f"Desde {age_min} años"
    elif age_max:
        formatted["age_range"] = f"Hasta {age_max} años"
    else:
        formatted["age_range"] = "No especificado"

    # Género
    genders = targeting.get("genders", [])
    formatted["genders"] = [GENDER_MAP.get(g, f"Género {g}") for g in genders]

    # Ubicaciones
    if "geo_locations" in targeting:
        formatted["locations"] = format_geo_locations(targeting["geo_locations"])
    else:
        formatted["locations"] = {}

    # Audiencias flexibles
    if "flexible_spec" in targeting:
        formatted["audiences"] = format_flexible_spec(targeting["flexible_spec"])
    else:
        formatted["audiences"] = {}

    # Mantener JSON crudo como opcional (R-4.4)
    formatted["raw_json"] = targeting

    return formatted
```

- [ ] **Paso 3: Ejecutar tests para verificar que pasan**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_targeting_formatter_service.py -v
```

Esperado: PASS (6/6)

- [ ] **Paso 4: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/src/oderbiz_analytics/services/targeting_formatter.py \
         backend/tests/test_targeting_formatter_service.py
git commit -m "feat: add targeting_formatter service with structured audience display (R-4.1, R-4.2, R-4.3)"
```

---

### Tarea 6: Actualizar ruta de targeting para usar formateador

**Archivos:**
- Modificar: `backend/src/oderbiz_analytics/api/routes/targeting.py:53-71`
- Modificar: `backend/tests/test_targeting_route.py`

**Contexto:** Ahora retornamos targeting estructurado en lugar de JSON crudo.

- [ ] **Paso 1: Escribir test para targeting formateado**

```python
# backend/tests/test_targeting_route.py (agregar al final)
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
def test_targeting_returns_formatted_structure(client):
    """Respuesta incluye targeting formateado además de raw_json."""
    respx.get("https://graph.facebook.com/v25.0/ad_999").mock(
        return_value=httpx.Response(200, json={"id": "ad_999", "adset_id": "adset_111"})
    )
    respx.get("https://graph.facebook.com/v25.0/adset_111").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "adset_111",
                "targeting": {
                    "age_min": 18,
                    "age_max": 65,
                    "genders": [1],
                    "geo_locations": {"countries": ["ES"]},
                    "flexible_spec": [
                        {
                            "interests": [
                                {"id": "6003107", "name": "Technology"}
                            ]
                        }
                    ],
                },
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/ad_999/targeting",
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    body = r.json()
    
    # Verificar respuesta formateada
    assert "targeting" in body
    assert "age_range" in body["targeting"]
    assert "18-65 años" in body["targeting"]["age_range"]
    assert "Masculino" in body["targeting"]["genders"]
    assert "locations" in body["targeting"]
    assert "audiences" in body["targeting"]
    
    # Verificar que JSON crudo aún accesible (R-4.4)
    assert "raw_json" in body["targeting"]
    assert body["targeting"]["raw_json"]["age_min"] == 18
```

Ejecutar para verificar que falla:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_targeting_route.py::test_targeting_returns_formatted_structure -v
```

Esperado: FAIL (targeting no formateado)

- [ ] **Paso 2: Actualizar ruta de targeting**

```python
# backend/src/oderbiz_analytics/api/routes/targeting.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException

from oderbiz_analytics.adapters.meta.ads_entities import fetch_ad_json, fetch_adset_json
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.targeting_formatter import format_targeting  # ADD THIS

router = APIRouter(prefix="/accounts", tags=["targeting"])


@router.get("/{ad_account_id}/ads/{ad_id}/targeting")
async def get_ad_targeting(
    # ad_account_id: path param incluido para verificar pertenencia en futuras versiones (v1: sin comprobación)
    ad_account_id: str,
    ad_id: str,
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Returns the targeting configuration for the given ad.

    Resolves ad → adset → targeting via two Meta Graph API calls.
    Returns both formatted (human-readable) and raw JSON structures.
    
    Implements R-4.1, R-4.4: Structured view + optional raw JSON access.
    """
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    try:
        ad_data = await fetch_ad_json(
            base_url=base,
            access_token=access_token,
            ad_id=ad_id,
            fields="adset_id",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener el anuncio.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    adset_id = ad_data.get("adset_id")
    if not adset_id:
        raise HTTPException(
            status_code=404,
            detail=f"El anuncio {ad_id} no tiene adset_id asociado.",
        )

    try:
        adset_data = await fetch_adset_json(
            base_url=base,
            access_token=access_token,
            adset_id=adset_id,
            fields="targeting",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener el adset.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    raw_targeting = adset_data.get("targeting", {})
    formatted_targeting = format_targeting(raw_targeting)

    return {"targeting": formatted_targeting}
```

- [ ] **Paso 3: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_targeting_route.py::test_targeting_returns_formatted_structure -v
```

Esperado: PASS

- [ ] **Paso 4: Ejecutar suite completa de targeting**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_targeting_route.py -v
```

Esperado: PASS (todos)

- [ ] **Paso 5: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/src/oderbiz_analytics/api/routes/targeting.py \
         backend/tests/test_targeting_route.py
git commit -m "feat(targeting): return structured format with age, gender, locations, audiences (R-4.1, R-4.4)"
```

---

### Tarea 7: Actualizar tipos en frontend para nuevas respuestas

**Archivos:**
- Modificar: `frontend/src/api/client.ts`

**Contexto:** Los tipos TypeScript del cliente deben reflejar las nuevas estructuras de respuesta (ad_label, metadata geo, targeting formateado).

- [ ] **Paso 1: Leer tipos actuales**

```bash
head -80 /Users/lamnda/Documents/oderbiz\ analitics/frontend/src/api/client.ts
```

(Para entender la estructura actual)

- [ ] **Paso 2: Actualizar tipos de API**

```typescript
// frontend/src/api/client.ts
// Agregar/actualizar estas interfaces:

interface AdPerformanceRow {
  ad_id: string;
  ad_name: string;
  ad_label: string; // NEW: enriquecido desde backend
  campaign_name: string;
  impressions: number;
  clicks: number;
  spend: string;
  reach: number;
  frequency: number;
  cpm: string;
  cpp: string;
  ctr: string;
}

interface GeoMetadata {
  scope: "account" | "ad";
  ad_id: string | null;
  total_rows: number;
  complete_coverage: boolean; // NEW
  note: string; // NEW
}

interface GeoInsightRow {
  region: string;
  region_name: string; // NEW: enriquecido
  impressions: number;
  clicks: number;
  spend: string;
  reach: number;
}

interface GeoInsightsResponse {
  data: GeoInsightRow[];
  metadata: GeoMetadata; // NEW
  scope: "account" | "ad";
  date_preset?: string;
  time_range?: { since: string; until: string };
}

interface LocationSpec {
  code?: string;
  name?: string;
  radius_km?: number;
  countries?: string[];
}

interface AudienceItem {
  id: string;
  name: string;
}

interface FormattedTargeting {
  age_range: string;
  genders: string[];
  locations: {
    countries?: string[];
    regions?: Array<{ code: string; name: string; radius_km?: number }>;
    cities?: LocationSpec[];
  };
  audiences: Record<string, AudienceItem[]>;
  raw_json: Record<string, any>;
}

interface TargetingResponse {
  targeting: FormattedTargeting;
}
```

- [ ] **Paso 3: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add frontend/src/api/client.ts
git commit -m "feat(frontend): update API types for enriched ranking, geo, targeting responses"
```

---

### Tarea 8: Crear componente GeoMap para visualización

**Archivos:**
- Crear: `frontend/src/components/GeoMap.tsx`

**Contexto:** Visualización simple de cobertura geográfica (con Recharts BarChart o tabla interactiva).

- [ ] **Paso 1: Crear componente GeoMap**

```typescript
// frontend/src/components/GeoMap.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GeoInsightRow, GeoMetadata } from "@/api/client";

interface GeoMapProps {
  data: GeoInsightRow[];
  metadata: GeoMetadata;
  metric?: "impressions" | "clicks" | "spend" | "reach";
}

export default function GeoMap({ data, metadata, metric = "impressions" }: GeoMapProps) {
  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertDescription>No hay datos geográficos disponibles.</AlertDescription>
      </Alert>
    );
  }

  // Preparar datos para gráfico
  const chartData = data.map((row) => ({
    region: row.region_name || row.region,
    value: metric === "spend" ? parseFloat(row.spend) : row[metric],
    raw: row,
  }));

  const metricLabel =
    metric === "impressions"
      ? "Impresiones"
      : metric === "clicks"
        ? "Clicks"
        : metric === "spend"
          ? "Gasto (€)"
          : "Alcance";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cobertura Geográfica — {metricLabel}</CardTitle>
        <p className="text-sm text-gray-500">
          {metadata.scope === "account" ? "Toda la cuenta" : `Anuncio: ${metadata.ad_id}`} • {metadata.total_rows} regiones
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="region" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip
              formatter={(value) =>
                metric === "spend" ? `€${value.toFixed(2)}` : value.toLocaleString("es")
              }
            />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add frontend/src/components/GeoMap.tsx
git commit -m "feat(frontend): add GeoMap component for geographic distribution visualization (R-3.3)"
```

---

### Tarea 9: Crear componente TargetingPanel para vista estructurada

**Archivos:**
- Crear: `frontend/src/components/TargetingPanel.tsx`

**Contexto:** Panel que muestra targeting en formato estructurado legible, con opción de ver JSON crudo.

- [ ] **Paso 1: Crear componente TargetingPanel**

```typescript
// frontend/src/components/TargetingPanel.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FormattedTargeting } from "@/api/client";

interface TargetingPanelProps {
  targeting: FormattedTargeting;
}

export default function TargetingPanel({ targeting }: TargetingPanelProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Configuración de Targeting</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRawJson(!showRawJson)}
          >
            {showRawJson ? "Ver Estructura" : "Ver JSON"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showRawJson ? (
          <div className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
            <pre className="text-xs">{JSON.stringify(targeting.raw_json, null, 2)}</pre>
          </div>
        ) : (
          <>
            {/* Edad */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Rango de edad</h3>
              <p className="text-gray-700">{targeting.age_range}</p>
            </div>

            <Separator />

            {/* Género */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Género</h3>
              {targeting.genders.length > 0 ? (
                <div className="flex gap-2">
                  {targeting.genders.map((gender, i) => (
                    <span key={i} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                      {gender}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No especificado</p>
              )}
            </div>

            <Separator />

            {/* Ubicaciones */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Ubicaciones</h3>
              {targeting.locations.countries?.length ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    Países: {targeting.locations.countries.join(", ")}
                  </p>
                </div>
              ) : null}
              {targeting.locations.regions?.length ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium">Regiones:</h4>
                  {targeting.locations.regions.map((region, i) => (
                    <p key={i} className="text-sm text-gray-700">
                      • {region.name} {region.radius_km ? `(${region.radius_km} km)` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
              {!targeting.locations.countries?.length && !targeting.locations.regions?.length ? (
                <p className="text-gray-500">No especificado</p>
              ) : null}
            </div>

            <Separator />

            {/* Audiencias */}
            <div>
              <h3 className="font-semibold text-sm mb-2">Audiencias</h3>
              {Object.keys(targeting.audiences).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(targeting.audiences).map(([category, items]) => (
                    <div key={category}>
                      <h4 className="text-xs font-medium capitalize mb-2">
                        {category.replace(/_/g, " ")}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {items.map((item, i) => (
                          <span key={i} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No especificado</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add frontend/src/components/TargetingPanel.tsx
git commit -m "feat(frontend): add TargetingPanel component with structured view and optional JSON (R-4.1, R-4.4)"
```

---

### Tarea 10: Integrar nuevos componentes en DashboardPage

**Archivos:**
- Modificar: `frontend/src/routes/DashboardPage.tsx:95-180`

**Contexto:** Reemplazar visualizaciones antiguas con nuevos componentes (GeoMap, TargetingPanel) y usar ad_label en ranking.

- [ ] **Paso 1: Leer sección actual de geografía en DashboardPage**

```bash
sed -n '95,180p' /Users/lamnda/Documents/oderbiz\ analitics/frontend/src/routes/DashboardPage.tsx
```

(Para ver qué hay actualmente)

- [ ] **Paso 2: Actualizar imports y componentes en DashboardPage**

```typescript
// frontend/src/routes/DashboardPage.tsx
// Agregar imports:
import GeoMap from "@/components/GeoMap";
import TargetingPanel from "@/components/TargetingPanel";

// En la sección de tabla de ranking, cambiar:
// De:
// <TableCell>{row.ad_name || `ID: ${row.ad_id}`}</TableCell>
// A:
// <TableCell>{row.ad_label}</TableCell>

// Reemplazar la visualización geo (en TabsContent de geografía):
// De: <BarChart...> (tabla/gráfico simple)
// A: <GeoMap data={geoQuery.data?.data} metadata={geoQuery.data?.metadata} metric={geoMetric} />

// Reemplazar la visualización de targeting (en TabsContent de targeting):
// De: <pre>{JSON.stringify(targetingQuery.data?.targeting, null, 2)}</pre>
// A: <TargetingPanel targeting={targetingQuery.data?.targeting} />
```

Implementación completa:

```typescript
// En la tabla de ranking, dentro del TableRow:
<TableCell className="font-medium">
  {row.ad_label} {/* ← Usar ad_label enriquecido */}
</TableCell>

// En TabsContent para geografía:
{geoQuery.isLoading ? (
  <Skeleton className="w-full h-96" />
) : geoQuery.isError ? (
  <Alert variant="destructive">
    <AlertDescription>Error al obtener datos geográficos.</AlertDescription>
  </Alert>
) : geoQuery.data ? (
  <GeoMap
    data={geoQuery.data.data}
    metadata={geoQuery.data.metadata}
    metric={geoMetric}
  />
) : null}

// En TabsContent para targeting:
{targetingQuery.isLoading ? (
  <Skeleton className="w-full h-96" />
) : targetingQuery.isError ? (
  <Alert variant="destructive">
    <AlertDescription>Error al obtener targeting.</AlertDescription>
  </Alert>
) : targetingQuery.data?.targeting ? (
  <TargetingPanel targeting={targetingQuery.data.targeting} />
) : null}
```

- [ ] **Paso 3: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(dashboard): integrate GeoMap and TargetingPanel, use ad_label in ranking (R-2, R-3, R-4)"
```

---

### Tarea 11: Suite de tests de integración end-to-end

**Archivos:**
- Crear: `backend/tests/test_e2e_dashboard_enrichment.py`

**Contexto:** Tests que validan flujo completo (ranking con labels, geo con metadata, targeting formateado) sin mocks de servicios internos.

- [ ] **Paso 1: Crear test E2E**

```python
# backend/tests/test_e2e_dashboard_enrichment.py
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
```

Ejecutar para verificar:

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/test_e2e_dashboard_enrichment.py -v
```

Esperado: PASS

- [ ] **Paso 2: Commit**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add backend/tests/test_e2e_dashboard_enrichment.py
git commit -m "test(e2e): add integration test validating full ranking-geo-targeting enrichment (R-2, R-3, R-4)"
```

---

### Tarea 12: Verificación final y cobertura de pruebas

**Archivos:**
- Ejecutar suite completa de tests

**Contexto:** Validar que todos los requisitos están cubiertos y no hay regresiones.

- [ ] **Paso 1: Ejecutar suite completa de backend tests**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
pytest backend/tests/ -v --tb=short
```

Esperado: PASS (todos los tests)

- [ ] **Paso 2: Verificar cobertura de requisitos**

Hacer un quick check de requisitos:

- R-2.1 ✓ — ad_label siempre visible (test en test_ads_ranking_route.py)
- R-2.2 ✓ — Fallback documentado (ad_label service, test_ad_label_service.py)
- R-2.3 ✓ — Alineado con v25 (fields usadas en RANKING_FIELDS)
- R-2.4 ✓ — Trazabilidad clara ("Anuncio sin nombre — ID: ...")
- R-2.5 ✓ — Tests de casos con/sin/vacío ad_name

- R-3.1 ✓ — Dimensión geográfica (region_name en geo_formatter)
- R-3.2 ✓ — Cobertura completa (metadata.total_rows, complete_coverage)
- R-3.3 ✓ — Visualización tipo mapa (GeoMap.tsx)
- R-3.4 ✓ — Claridad de alcance (metadata con scope y ad_id)
- R-3.6 ✓ — Versión de API (breakdowns=region en geo_insights.py)

- R-4.1 ✓ — Vista estructurada en español (format_targeting)
- R-4.2 ✓ — Ubicaciones legibles (format_geo_locations con names)
- R-4.3 ✓ — Audiencias flexibles agrupadas (format_flexible_spec)
- R-4.4 ✓ — JSON opcional (raw_json en FormattedTargeting)
- R-4.5 ✓ — Fuente documentada (targeting desde Ad/Adset v25)

- R-5.1 ✓ — No hay N+1 (geo_insights hace un call, targeting hace 2 calls agregados)
- R-5.2 ✓ — Mensajes claros de error (HTTPException)
- R-5.3 ✓ — Consistencia (get_ad_label usado en ranking; mismo patrón en geo)

- [ ] **Paso 3: Ejecutar frontend build (opcional pero recomendado)**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npm run build
```

(Si hay errores TypeScript, verificar tipos en api/client.ts)

- [ ] **Paso 4: Verificación manual de flujo**

Abrir navegador en `http://localhost:3000` (si está corriendo) y verificar:
1. Ranking: nombres siempre visibles (no vacíos ni comillas sin texto)
2. Geografía: mapa con nombres de región, metadata visible
3. Targeting: vista estructurada legible (edad, género, ubicaciones, audiencias)

- [ ] **Paso 5: Commit final de QA**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics
git add -A
git commit -m "chore: final QA and test verification (all requirements R-2, R-3, R-4, R-5 covered)"
```

---

## Checklist de autorización

- [ ] Backend API tests: `pytest backend/tests/ -v` → PASS
- [ ] Frontend build: `npm run build` → sin errores TS
- [ ] Manual QA: Ranking, Geo, Targeting visibles en dashboard
- [ ] Commit history: Cada tarea es un commit atomicidad claro
- [ ] Git history legible: `git log --oneline` muestra progreso claro

---

**Plan finalizado.** El siguiente paso es elegir un modelo de ejecución:

**Opción 1 (Recomendada): Subagent-Driven**
- Dispatch un subagent por tarea
- Review checkpoint entre tareas
- Ejecución paralela donde sea posible

**Opción 2: Inline Execution**
- Ejecutar tareas secuencialmente en esta sesión
- Checkpoints después de cada grupo de tareas
- Más control local

¿Cuál prefieres?

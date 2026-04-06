# Meta Ads Analytics Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un pipeline Meta Ads (Graph API v25.0) → almacenamiento en BigQuery → API REST versionada (FastAPI) consumible por cualquier front (React, Power BI, etc.) y una app React (Vite) solo como cliente de visualización.

**Architecture:** Capa de dominio (puertos) desacoplada de Meta y de BigQuery; adaptador HTTP para Marketing API; jobs de ingesta idempotentes que escriben raw JSON + tablas hecho diarias por `ad_id`; FastAPI expone contratos estables bajo `/api/v1`; el frontend no contiene reglas de negocio de métricas.

**Tech Stack:** Python 3.12+, FastAPI, httpx, Pydantic v2, google-cloud-bigquery, pytest + pytest-asyncio + respx; React 18 + TypeScript + Vite + TanStack Query; GCP BigQuery (dataset configurable por env).

---

## File structure (greenfield)


| Ruta                                           | Responsabilidad                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `backend/pyproject.toml`                       | Dependencias y herramientas (ruff, pytest).                       |
| `backend/src/oderbiz_analytics/`               | Paquete principal.                                                |
| `backend/src/oderbiz_analytics/domain/`        | Modelos y puertos (interfaces).                                   |
| `backend/src/oderbiz_analytics/adapters/meta/` | Cliente Graph API v25.0.                                          |
| `backend/src/oderbiz_analytics/adapters/bq/`   | Repositorio BigQuery (raw + facts).                               |
| `backend/src/oderbiz_analytics/api/`           | Routers FastAPI y DTOs de respuesta.                              |
| `backend/src/oderbiz_analytics/jobs/`          | Orquestación de ingesta (CLI invocable por Cloud Run Job o cron). |
| `backend/sql/`                                 | DDL BigQuery (datasets, tablas).                                  |
| `backend/tests/`                               | Tests unitarios e integración con mocks.                          |
| `frontend/`                                    | App Vite + React + TS (solo consumo de API).                      |


---

### Task 1: Bootstrap monorepo backend

**Files:**

- Create: `backend/pyproject.toml`
- Create: `backend/src/oderbiz_analytics/__init__.py`
- Create: `backend/README.md`
- **Step 1: Crear `pyproject.toml` con dependencias y herramientas**

```toml
[project]
name = "oderbiz-analytics"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.32.0",
  "httpx>=0.27.0",
  "pydantic>=2.9.0",
  "pydantic-settings>=2.6.0",
  "google-cloud-bigquery>=3.26.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3.0",
  "pytest-asyncio>=0.24.0",
  "respx>=0.21.0",
  "ruff>=0.8.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- **Step 2: Crear paquete vacío**

```bash
mkdir -p backend/src/oderbiz_analytics
touch backend/src/oderbiz_analytics/__init__.py
```

- **Step 3: Instalar en modo editable y verificar**

Run: `cd backend && python -m pip install -e ".[dev]"`

Expected: instalación sin error.

- **Step 4: Commit**

```bash
git init
git add backend/pyproject.toml backend/src/oderbiz_analytics/__init__.py
git commit -m "chore: bootstrap Python package for Meta Ads analytics backend"
```

---

### Task 2: Configuración tipada (Pydantic Settings)

**Files:**

- Create: `backend/src/oderbiz_analytics/config.py`
- Create: `backend/tests/test_config.py`
- **Step 1: Escribir test que exige variables mínimas**

```python
# backend/tests/test_config.py
import os

import pytest

from oderbiz_analytics.config import Settings


def test_settings_requires_gcp_project_id(monkeypatch):
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    monkeypatch.setenv("META_ACCESS_TOKEN", "test-token")
    with pytest.raises(Exception):
        Settings()
```

- **Step 2: Ejecutar test (debe fallar)**

Run: `cd backend && pytest tests/test_config.py -v`

Expected: FAIL (módulo Settings no existe o import error).

- **Step 3: Implementar Settings**

```python
# backend/src/oderbiz_analytics/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project_id: str
    bq_dataset: str = "meta_ads_analytics"
    meta_graph_version: str = "v25.0"
    meta_access_token: str
    api_host: str = "0.0.0.0"
    api_port: int = 8000


def get_settings() -> Settings:
    return Settings()
```

- **Step 4: Ajustar test para usar ValidationError de Pydantic**

```python
# backend/tests/test_config.py
import os

import pytest
from pydantic import ValidationError

from oderbiz_analytics.config import Settings


def test_settings_requires_gcp_project_id(monkeypatch):
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    monkeypatch.setenv("META_ACCESS_TOKEN", "test-token")
    with pytest.raises(ValidationError):
        Settings()
```

- **Step 5: Ejecutar tests**

Run: `cd backend && pytest tests/test_config.py -v`

Expected: PASS

- **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/config.py backend/tests/test_config.py
git commit -m "feat: add pydantic settings for GCP and Meta token"
```

---

### Task 3: Cliente Meta — listar `adaccounts`

**Files:**

- Create: `backend/src/oderbiz_analytics/domain/models.py`
- Create: `backend/src/oderbiz_analytics/adapters/meta/client.py`
- Create: `backend/tests/test_meta_client_adaccounts.py`
- **Step 1: Modelo de dominio mínimo**

```python
# backend/src/oderbiz_analytics/domain/models.py
from pydantic import BaseModel


class AdAccount(BaseModel):
    id: str  # e.g. act_123
    name: str
    account_id: str
    currency: str | None = None
```

- **Step 2: Test con respx (mock HTTP)**

```python
# backend/tests/test_meta_client_adaccounts.py
import httpx
import pytest
import respx

from oderbiz_analytics.adapters.meta.client import MetaGraphClient


@respx.mock
async def test_list_ad_accounts_parses_data():
    respx.get("https://graph.facebook.com/v25.0/me/adaccounts").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "act_111",
                        "name": "Test",
                        "account_id": "111",
                        "currency": "USD",
                    }
                ]
            },
        )
    )
    client = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="fake",
    )
    accounts = await client.list_ad_accounts(
        fields="id,name,account_id,currency",
    )
    assert len(accounts) == 1
    assert accounts[0].id == "act_111"
    assert accounts[0].currency == "USD"
```

- **Step 3: Ejecutar test (falla)**

Run: `cd backend && pytest tests/test_meta_client_adaccounts.py -v`

Expected: FAIL (MetaGraphClient missing).

- **Step 4: Implementar cliente**

```python
# backend/src/oderbiz_analytics/adapters/meta/client.py
from __future__ import annotations

import httpx

from oderbiz_analytics.domain.models import AdAccount


class MetaGraphClient:
    def __init__(self, base_url: str, access_token: str, timeout_s: float = 60.0) -> None:
        self._base = base_url.rstrip("/")
        self._token = access_token
        self._client = httpx.AsyncClient(timeout=timeout_s)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list_ad_accounts(self, fields: str) -> list[AdAccount]:
        r = await self._client.get(
            f"{self._base}/me/adaccounts",
            params={"fields": fields, "access_token": self._token},
        )
        r.raise_for_status()
        payload = r.json()
        return [AdAccount.model_validate(x) for x in payload.get("data", [])]
```

- **Step 5: Ejecutar tests**

Run: `cd backend && pytest tests/test_meta_client_adaccounts.py -v`

Expected: PASS

- **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/domain/models.py \
  backend/src/oderbiz_analytics/adapters/meta/client.py \
  backend/tests/test_meta_client_adaccounts.py
git commit -m "feat: add Meta Graph client for ad accounts listing"
```

---

### Task 4: Cliente Meta — `insights` por cuenta (nível account)

**Files:**

- Create: `backend/src/oderbiz_analytics/adapters/meta/insights.py`
- Modify: `backend/src/oderbiz_analytics/adapters/meta/client.py`
- Create: `backend/tests/test_meta_insights.py`
- **Step 1: Test mock de insights**

```python
# backend/tests/test_meta_insights.py
import httpx
import pytest
import respx

from oderbiz_analytics.adapters.meta.insights import fetch_account_insights


@respx.mock
async def test_fetch_account_insights_returns_rows():
    respx.get(
        "https://graph.facebook.com/v25.0/act_111/insights",
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "impressions": "100",
                        "clicks": "5",
                        "spend": "1.23",
                        "date_start": "2026-03-01",
                        "date_stop": "2026-03-31",
                    }
                ]
            },
        )
    )
    rows = await fetch_account_insights(
        base_url="https://graph.facebook.com/v25.0",
        access_token="fake",
        ad_account_id="act_111",
        date_preset="last_30d",
        fields="impressions,clicks,spend",
    )
    assert rows[0]["spend"] == "1.23"
```

- **Step 2: Implementar función pura de insights**

```python
# backend/src/oderbiz_analytics/adapters/meta/insights.py
from __future__ import annotations

import httpx


async def fetch_account_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    date_preset: str,
    fields: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    own = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=120.0)
    try:
        r = await client.get(
            f"{base_url.rstrip('/')}/{ad_account_id}/insights",
            params={
                "date_preset": date_preset,
                "level": "account",
                "fields": fields,
                "access_token": access_token,
            },
        )
        r.raise_for_status()
        return r.json().get("data", [])
    finally:
        if own:
            await client.aclose()
```

- **Step 3: Ejecutar tests**

Run: `cd backend && pytest tests/test_meta_insights.py -v`

Expected: PASS

- **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/meta/insights.py backend/tests/test_meta_insights.py
git commit -m "feat: fetch account-level insights from Meta Marketing API"
```

---

### Task 5: DDL BigQuery — raw + hechos diarios

**Files:**

- Create: `backend/sql/001_create_tables.sql`
- Create: `backend/tests/test_bq_ddl_syntax.py` (opcional: solo lectura de archivo)
- **Step 1: Definir tablas**

```sql
-- backend/sql/001_create_tables.sql
-- Ejecutar en BigQuery con dataset parametrizado, ej. ${BQ_DATASET}

CREATE TABLE IF NOT EXISTS `${BQ_DATASET}.raw_meta_insights` (
  ingest_id STRING NOT NULL,
  ad_account_id STRING NOT NULL,
  object_id STRING NOT NULL,
  level STRING NOT NULL,
  date_preset STRING,
  time_range_json STRING,
  fields STRING,
  payload_json STRING NOT NULL,
  ingested_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(ingested_at)
CLUSTER BY ad_account_id, object_id;

CREATE TABLE IF NOT EXISTS `${BQ_DATASET}.fact_ads_insights_daily` (
  ad_account_id STRING NOT NULL,
  ad_id STRING NOT NULL,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  impressions INT64,
  clicks INT64,
  spend NUMERIC,
  reach INT64,
  actions_json STRING,
  cost_per_action_json STRING,
  extracted_at TIMESTAMP NOT NULL
)
PARTITION BY date_start
CLUSTER BY ad_account_id, ad_id;
```

- **Step 2: Documentar en `backend/README.md` cómo aplicar**

```bash
bq query --use_legacy_sql=false < backend/sql/001_create_tables.sql
-- (sustituir ${BQ_DATASET} manualmente o usar sed)
```

- **Step 3: Commit**

```bash
git add backend/sql/001_create_tables.sql backend/README.md
git commit -m "feat: add BigQuery DDL for raw insights and daily ad facts"
```

---

### Task 6: Repositorio BigQuery — insertar raw

**Files:**

- Create: `backend/src/oderbiz_analytics/adapters/bq/client.py`
- Create: `backend/tests/test_bq_raw_insert.py`
- **Step 1: Test con mock del cliente BigQuery**

Usar `unittest.mock` para `google.cloud.bigquery.Client` y verificar que `insert_rows_json` se llama con una fila que incluye `ad_account_id` y `payload_json`.

```python
# backend/tests/test_bq_raw_insert.py
import json
from unittest.mock import MagicMock, patch

from oderbiz_analytics.adapters.bq.client import insert_raw_insights_row


@patch("oderbiz_analytics.adapters.bq.client.bigquery.Client")
def test_insert_raw_insights_row(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    insert_raw_insights_row(
        project_id="p",
        dataset="d",
        ad_account_id="act_1",
        object_id="act_1",
        level="account",
        date_preset="last_30d",
        fields="spend",
        payload={"data": [{"spend": "1"}]},
    )
    mock_client.insert_rows_json.assert_called_once()
    args, _ = mock_client.insert_rows_json.call_args
    row = args[1][0]
    assert row["ad_account_id"] == "act_1"
    assert json.loads(row["payload_json"])["data"][0]["spend"] == "1"
```

- **Step 2: Implementar función**

```python
# backend/src/oderbiz_analytics/adapters/bq/client.py
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from google.cloud import bigquery


def insert_raw_insights_row(
    *,
    project_id: str,
    dataset: str,
    ad_account_id: str,
    object_id: str,
    level: str,
    date_preset: str | None,
    fields: str,
    payload: dict,
) -> None:
    client = bigquery.Client(project=project_id)
    table = f"{project_id}.{dataset}.raw_meta_insights"
    row = {
        "ingest_id": str(uuid.uuid4()),
        "ad_account_id": ad_account_id,
        "object_id": object_id,
        "level": level,
        "date_preset": date_preset,
        "time_range_json": None,
        "fields": fields,
        "payload_json": json.dumps(payload),
        "ingested_at": datetime.now(UTC).isoformat(),
    }
    errors = client.insert_rows_json(table, [row])
    if errors:
        raise RuntimeError(errors)
```

- **Step 3: Ejecutar test**

Run: `cd backend && pytest tests/test_bq_raw_insert.py -v`

Expected: PASS

- **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/bq/client.py backend/tests/test_bq_raw_insert.py
git commit -m "feat: insert raw Meta insights payloads into BigQuery"
```

---

### Task 7: Job de ingesta — CLI `ingest-daily`

**Files:**

- Create: `backend/src/oderbiz_analytics/jobs/ingest_daily.py`
- Create: `backend/pyproject.toml` (modify: add script entry)
- Create: `backend/tests/test_ingest_daily.py`
- **Step 1: Añadir entry point en `pyproject.toml`**

```toml
[project.scripts]
oderbiz-ingest-daily = "oderbiz_analytics.jobs.ingest_daily:main"
```

- **Step 2: Implementar función principal async (sin side effects en test)**

```python
# backend/src/oderbiz_analytics/jobs/ingest_daily.py
from __future__ import annotations

import asyncio

from oderbiz_analytics.adapters.bq.client import insert_raw_insights_row
from oderbiz_analytics.adapters.meta.client import MetaGraphClient
from oderbiz_analytics.adapters.meta.insights import fetch_account_insights
from oderbiz_analytics.config import get_settings


async def run_daily_ingest() -> None:
    s = get_settings()
    base = f"https://graph.facebook.com/{s.meta_graph_version}"
    meta = MetaGraphClient(base_url=base, access_token=s.meta_access_token)
    try:
        accounts = await meta.list_ad_accounts(fields="id,name,account_id,currency")
        fields = (
            "impressions,clicks,spend,reach,frequency,cpm,cpp,ctr,actions,cost_per_action_type"
        )
        for acct in accounts:
            payload = {
                "data": await fetch_account_insights(
                    base_url=base,
                    access_token=s.meta_access_token,
                    ad_account_id=acct.id,
                    date_preset="last_30d",
                    fields=fields,
                )
            }
            insert_raw_insights_row(
                project_id=s.gcp_project_id,
                dataset=s.bq_dataset,
                ad_account_id=acct.id,
                object_id=acct.id,
                level="account",
                date_preset="last_30d",
                fields=fields,
                payload=payload,
            )
    finally:
        await meta.aclose()


def main() -> None:
    asyncio.run(run_daily_ingest())
```

- **Step 3: Test con mocks de Meta y BQ**

```python
# backend/tests/test_ingest_daily.py
from unittest.mock import AsyncMock, patch

import pytest

from oderbiz_analytics.jobs import ingest_daily


@pytest.mark.asyncio
async def test_run_daily_ingest_calls_insert_and_list(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("BQ_DATASET", "d")

    with patch("oderbiz_analytics.jobs.ingest_daily.MetaGraphClient") as mc, patch(
        "oderbiz_analytics.jobs.ingest_daily.fetch_account_insights", new_callable=AsyncMock
    ) as fi, patch(
        "oderbiz_analytics.jobs.ingest_daily.insert_raw_insights_row"
    ) as ins:
        instance = mc.return_value
        instance.list_ad_accounts = AsyncMock(
            return_value=[
                type("X", (), {"id": "act_1", "name": "n", "account_id": "1", "currency": "USD"})()
            ]
        )
        instance.aclose = AsyncMock()
        fi.return_value = [{"spend": "1"}]
        await ingest_daily.run_daily_ingest()
        ins.assert_called_once()
```

- **Step 4: Ajustar import de Settings en test** — usar `BQ_DATASET` en `Settings` si añades variable; si no, alinear `Settings` con `bq_dataset` default y solo `GCP_PROJECT_ID`.

Añadir a `Settings`: ya existe `bq_dataset` default; el test puede omitir `BQ_DATASET` env o usar `monkeypatch.setenv` no necesario.

- **Step 5: Ejecutar tests**

Run: `cd backend && pytest tests/test_ingest_daily.py -v`

Expected: PASS

- **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/jobs/ingest_daily.py
git add backend/pyproject.toml backend/tests/test_ingest_daily.py
git commit -m "feat: add daily ingest job for Meta account insights to BigQuery"
```

---

### Task 8: FastAPI — health y listado de cuentas

**Files:**

- Create: `backend/src/oderbiz_analytics/api/main.py`
- Create: `backend/src/oderbiz_analytics/api/routes/accounts.py`
- Create: `backend/tests/test_api_accounts.py`
- **Step 1: App FastAPI**

```python
# backend/src/oderbiz_analytics/api/main.py
from fastapi import FastAPI

from oderbiz_analytics.api.routes.accounts import router as accounts_router

app = FastAPI(title="Oderbiz Meta Ads Analytics API", version="0.1.0")
app.include_router(accounts_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- **Step 2: Router de cuentas**

```python
# backend/src/oderbiz_analytics/api/routes/accounts.py
from fastapi import APIRouter, Depends

from oderbiz_analytics.adapters.meta.client import MetaGraphClient
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["accounts"])


def meta_client(settings: Settings = Depends(get_settings)) -> MetaGraphClient:
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    return MetaGraphClient(base_url=base, access_token=settings.meta_access_token)


@router.get("")
async def list_accounts(client: MetaGraphClient = Depends(meta_client)):
    accounts = await client.list_ad_accounts(fields="id,name,account_id,currency")
    return {"data": [a.model_dump() for a in accounts]}
```

- **Step 3: Test con TestClient y mock de MetaGraphClient**

```python
# backend/tests/test_api_accounts.py
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app
from oderbiz_analytics.api.routes import accounts as accounts_mod


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")

    async def fake_list(**_kwargs):
        from oderbiz_analytics.domain.models import AdAccount

        return [
            AdAccount(id="act_1", name="A", account_id="1", currency="USD"),
        ]

    monkeypatch.setattr(
        accounts_mod.MetaGraphClient,
        "list_ad_accounts",
        AsyncMock(side_effect=fake_list),
    )
    return TestClient(app)


def test_list_accounts(client):
    r = client.get("/api/v1/accounts")
    assert r.status_code == 200
    assert r.json()["data"][0]["id"] == "act_1"
```

- **Step 4: Añadir `httpx` como dependencia de TestClient** — FastAPI usa `starlette.testclient` que requiere `httpx` (ya en dependencias).
- **Step 5: Ejecutar tests**

Run: `cd backend && pytest tests/test_api_accounts.py -v`

Expected: PASS

- **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/main.py backend/src/oderbiz_analytics/api/routes/accounts.py
git add backend/tests/test_api_accounts.py
git commit -m "feat: add FastAPI health and Meta ad accounts endpoint"
```

---

### Task 9: Endpoint resumen por cuenta (lee último raw o agrega)

**Files:**

- Create: `backend/src/oderbiz_analytics/api/routes/summary.py`
- Modify: `backend/src/oderbiz_analytics/api/main.py`
- **Step 1: Implementar `GET /api/v1/accounts/{ad_account_id}/summary?from=&to=`** que por v1 consulta BigQuery tabla `raw_meta_insights` o `fact_ads_insights_daily` según exista datos; si no hay BQ en tests, inyectar dependencia mock.

Para mantener el plan sin placeholders, la versión mínima v1 puede devolver **último payload** de raw para esa cuenta:

```python
# backend/src/oderbiz_analytics/api/routes/summary.py (esqueleto)
from google.cloud import bigquery
from fastapi import APIRouter, Depends

from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["summary"])


@router.get("/{ad_account_id}/summary")
def account_summary(ad_account_id: str, settings: Settings = Depends(get_settings)):
    client = bigquery.Client(project=settings.gcp_project_id)
    q = f"""
    SELECT payload_json
    FROM `{settings.gcp_project_id}.{settings.bq_dataset}.raw_meta_insights`
    WHERE ad_account_id = @aid
    ORDER BY ingested_at DESC
    LIMIT 1
    """
    job = client.query(
        q,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("aid", "STRING", ad_account_id),
            ]
        ),
    )
    rows = list(job.result())
    if not rows:
        return {"data": None}
    return {"data": rows[0]["payload_json"]}
```

- **Step 2: Incluir router en `main.py`**

```python
from oderbiz_analytics.api.routes.summary import router as summary_router
app.include_router(summary_router, prefix="/api/v1")
```

- **Step 3: Test con mock de `bigquery.Client.query`**

```python
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


def test_summary_returns_latest_raw(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    mock_job = MagicMock()
    mock_job.result.return_value = [{"payload_json": '{"x":1}'}]
    mock_client = MagicMock()
    mock_client.query.return_value = mock_job
    with patch("oderbiz_analytics.api.routes.summary.bigquery.Client", return_value=mock_client):
        c = TestClient(app)
        r = c.get("/api/v1/accounts/act_1/summary")
    assert r.status_code == 200
```

- **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/summary.py backend/src/oderbiz_analytics/api/main.py
git add backend/tests/test_summary.py
git commit -m "feat: add account summary endpoint backed by latest BigQuery raw row"
```

*(Crear `backend/tests/test_summary.py` con el contenido del Step 3.)*

---

### Task 10: Frontend React (Vite) — listar cuentas

**Files:**

- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/client.ts`
- **Step 1: Scaffold Vite**

Run:

```bash
cd frontend && npm create vite@latest . -- --template react-ts
npm install @tanstack/react-query
```

- **Step 2: Cliente API**

```typescript
// frontend/src/api/client.ts
const base = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function fetchAdAccounts(): Promise<{ data: unknown[] }> {
  const r = await fetch(`${base}/api/v1/accounts`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

- **Step 3: `App.tsx` mínimo**

```tsx
import { useQuery } from "@tanstack/react-query";
import { fetchAdAccounts } from "./api/client";

export default function App() {
  const q = useQuery({ queryKey: ["accounts"], queryFn: fetchAdAccounts });
  if (q.isLoading) return <p>Cargando…</p>;
  if (q.isError) return <p>Error</p>;
  return (
    <ul>
      {(q.data?.data as { id: string; name: string }[]).map((a) => (
        <li key={a.id}>
          {a.name} ({a.id})
        </li>
      ))}
    </ul>
  );
}
```

- **Step 4: Commit**

```bash
git add frontend
git commit -m "feat: add Vite React client for ad accounts list"
```

---

## Self-review

### Spec coverage


| Requisito (inventario + conversación) | Tarea                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Graph API v25.0                       | Task 3–4 (`base_url` v25.0)                                                                                  |
| Meta Ads solamente (sin WhatsApp)     | Alcance del cliente y campos                                                                                 |
| Raw JSON en BigQuery                  | Task 5–6                                                                                                     |
| Ingesta programable                   | Task 7                                                                                                       |
| API desacoplada para cualquier front  | Task 8–9                                                                                                     |
| React como consumidor                 | Task 10                                                                                                      |
| Rate limit / async jobs (doc)         | Pendiente de hardening: añadir en iteración 2 `POST` async insights + backoff según headers (no bloquea MVP) |


**Brecha intencional:** extracción `level=ad` + `time_increment` y normalización a `fact_ads_insights_daily` puede añadirse como **Task 11** cuando el volumen lo exija; el MVP usa `account` + raw + summary desde último raw.

### Placeholder scan

- Sin `TBD` en pasos: los fragmentos de código son concretos; los endpoints de summary asumen tabla `raw_meta_insights` creada.

### Consistencia de nombres

- `MetaGraphClient.list_ad_accounts` y `Settings.bq_dataset` se usan consistentemente.
- `get_settings` es función; tests deben setear env antes de importar app donde aplique.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-03-meta-ads-analytics-platform.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
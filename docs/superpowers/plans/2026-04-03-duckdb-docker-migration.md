# DuckDB + Docker Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar BigQuery/GCP por DuckDB (archivo local) y levantar todo el stack con Docker, manteniendo la arquitectura de puertos desacoplada para un futuro swap sencillo.

**Architecture:** El adaptador `adapters/duckdb/client.py` expone exactamente las mismas operaciones que el antiguo `adapters/bq/client.py` (`insert_raw_insights_row`, `query_latest_raw`). DuckDB persiste en un archivo en `/data/analytics.duckdb` que se monta como volumen Docker compartido entre el servicio `api` y el job `ingest`. Las tablas se auto-crean al inicio via `init_db()` — sin DDL externo. `config.py` elimina toda referencia a GCP y expone `duckdb_path`.

**Tech Stack:** Python 3.12, DuckDB ≥1.1.0, FastAPI, Docker 24+, docker compose v2. Tests con `pytest` + `tmp_path` (DuckDB en memoria o archivo temporal, sin mocks de terceros).

---

## File structure (cambios respecto al estado actual)


| Ruta                                                        | Acción    | Responsabilidad                                               |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `backend/src/oderbiz_analytics/config.py`                   | Modificar | Quitar `gcp_project_id` / `bq_dataset`; agregar `duckdb_path` |
| `backend/src/oderbiz_analytics/adapters/duckdb/__init__.py` | Crear     | Paquete                                                       |
| `backend/src/oderbiz_analytics/adapters/duckdb/client.py`   | Crear     | `init_db`, `insert_raw_insights_row`, `query_latest_raw`      |
| `backend/src/oderbiz_analytics/adapters/bq/client.py`       | Eliminar  | Reemplazado por duckdb                                        |
| `backend/src/oderbiz_analytics/adapters/bq/__init__.py`     | Eliminar  | Ya no necesario                                               |
| `backend/src/oderbiz_analytics/jobs/ingest_daily.py`        | Modificar | Importar desde `adapters.duckdb`; ajustar parámetros          |
| `backend/src/oderbiz_analytics/api/routes/summary.py`       | Modificar | Usar `query_latest_raw` del adaptador DuckDB                  |
| `backend/src/oderbiz_analytics/api/main.py`                 | Modificar | Agregar lifespan que llama `init_db` al arrancar              |
| `backend/pyproject.toml`                                    | Modificar | Quitar `google-cloud-bigquery`; agregar `duckdb>=1.1.0`       |
| `backend/tests/test_bq_raw_insert.py`                       | Eliminar  | Reemplazado                                                   |
| `backend/tests/test_duckdb_client.py`                       | Crear     | Tests reales con DuckDB en archivo temporal                   |
| `backend/tests/test_summary.py`                             | Modificar | Usar DuckDB real en lugar de mock BigQuery                    |
| `backend/tests/test_ingest_daily.py`                        | Modificar | Ajustar mock del adaptador a la nueva ruta                    |
| `backend/Dockerfile`                                        | Crear     | Imagen Python 3.12 slim para api e ingest                     |
| `backend/.dockerignore`                                     | Crear     | Excluir .venv, **pycache**, tests, .env                       |
| `docker-compose.yml`                                        | Crear     | Servicios `api` e `ingest`, volumen `analytics_data`          |


---

### Task 1: Actualizar `config.py` — quitar GCP, agregar `duckdb_path`

**Files:**

- Modify: `backend/src/oderbiz_analytics/config.py`
- Modify: `backend/tests/test_config.py`
- **Step 1: Actualizar test de config para reflejar los nuevos campos**

```python
# backend/tests/test_config.py
import pytest
from pydantic import ValidationError

from oderbiz_analytics.config import Settings


def test_settings_requires_meta_access_token(monkeypatch):
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    with pytest.raises(ValidationError):
        Settings()


def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("META_ACCESS_TOKEN", "token")
    s = Settings()
    assert s.duckdb_path == "/data/analytics.duckdb"
    assert s.meta_graph_version == "v25.0"
    assert s.api_port == 8000
```

- **Step 2: Ejecutar test (debe FALLAR — `duckdb_path` no existe aún)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_config.py -v
```

Expected: FAIL (`AttributeError` o `ValidationError`).

- **Step 3: Reemplazar contenido de `config.py`**

```python
# backend/src/oderbiz_analytics/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    duckdb_path: str = "/data/analytics.duckdb"
    meta_graph_version: str = "v25.0"
    meta_access_token: str
    api_host: str = "0.0.0.0"
    api_port: int = 8000


def get_settings() -> Settings:
    return Settings()
```

- **Step 4: Ejecutar tests de config (debe PASAR)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_config.py -v
```

Expected: 2 tests PASS.

- **Step 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add backend/src/oderbiz_analytics/config.py backend/tests/test_config.py && git commit -m "feat: replace GCP config with duckdb_path setting"
```

---

### Task 2: Crear adaptador DuckDB

**Files:**

- Create: `backend/src/oderbiz_analytics/adapters/duckdb/__init__.py`
- Create: `backend/src/oderbiz_analytics/adapters/duckdb/client.py`
- Create: `backend/tests/test_duckdb_client.py`
- **Step 1: Crear `backend/tests/test_duckdb_client.py`**

```python
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
```

- **Step 2: Ejecutar tests (deben FALLAR)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_duckdb_client.py -v
```

Expected: FAIL (módulo no existe).

- **Step 3: Crear `backend/src/oderbiz_analytics/adapters/duckdb/__init__.py`**

Archivo vacío.

- **Step 4: Crear `backend/src/oderbiz_analytics/adapters/duckdb/client.py`**

```python
# backend/src/oderbiz_analytics/adapters/duckdb/client.py
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import duckdb

_SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_meta_insights (
    ingest_id    VARCHAR NOT NULL,
    ad_account_id VARCHAR NOT NULL,
    object_id    VARCHAR NOT NULL,
    level        VARCHAR NOT NULL,
    date_preset  VARCHAR,
    time_range_json VARCHAR,
    fields       VARCHAR,
    payload_json VARCHAR NOT NULL,
    ingested_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_ads_insights_daily (
    ad_account_id VARCHAR NOT NULL,
    ad_id         VARCHAR NOT NULL,
    date_start    DATE NOT NULL,
    date_stop     DATE NOT NULL,
    impressions   BIGINT,
    clicks        BIGINT,
    spend         DECIMAL(12, 2),
    reach         BIGINT,
    actions_json  VARCHAR,
    cost_per_action_json VARCHAR,
    extracted_at  TIMESTAMPTZ NOT NULL
);
"""


def init_db(db_path: str) -> None:
    """Crea las tablas si no existen. Llamar al iniciar la app y el job."""
    con = duckdb.connect(db_path)
    try:
        con.execute(_SCHEMA)
    finally:
        con.close()


def insert_raw_insights_row(
    *,
    db_path: str,
    ad_account_id: str,
    object_id: str,
    level: str,
    date_preset: str | None,
    fields: str,
    payload: dict,
) -> None:
    row = (
        str(uuid.uuid4()),
        ad_account_id,
        object_id,
        level,
        date_preset,
        None,  # time_range_json — reservado para backfill futuro
        fields,
        json.dumps(payload),
        datetime.now(UTC),
    )
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO raw_meta_insights
                (ingest_id, ad_account_id, object_id, level, date_preset,
                 time_range_json, fields, payload_json, ingested_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            row,
        )
    finally:
        con.close()


def query_latest_raw(db_path: str, ad_account_id: str) -> str | None:
    """Retorna el payload_json más reciente para la cuenta o None si no hay datos."""
    con = duckdb.connect(db_path, read_only=True)
    try:
        result = con.execute(
            """
            SELECT payload_json
            FROM raw_meta_insights
            WHERE ad_account_id = ?
            ORDER BY ingested_at DESC
            LIMIT 1
            """,
            [ad_account_id],
        ).fetchone()
    finally:
        con.close()
    return result[0] if result else None
```

- **Step 5: Instalar DuckDB y actualizar `pyproject.toml`**

Primero edita `backend/pyproject.toml`. Reemplaza `"google-cloud-bigquery>=3.26.0"` por `"duckdb>=1.1.0"` en la lista de `dependencies`.

El archivo debe quedar:

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
  "duckdb>=1.1.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3.0",
  "pytest-asyncio>=0.24.0",
  "respx>=0.21.0",
  "ruff>=0.8.0",
]

[project.scripts]
oderbiz-ingest-daily = "oderbiz_analytics.jobs.ingest_daily:main"

[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"

[build-system]
requires = ["setuptools>=70", "wheel"]
build-backend = "setuptools.build_meta"
```

Luego reinstala:

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pip install -e ".[dev]" --quiet
```

- **Step 6: Ejecutar tests del adaptador (deben PASAR)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_duckdb_client.py -v
```

Expected: 4 tests PASS.

- **Step 7: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add backend/src/oderbiz_analytics/adapters/duckdb/ backend/tests/test_duckdb_client.py backend/pyproject.toml && git commit -m "feat: add DuckDB adapter replacing BigQuery"
```

---

### Task 3: Actualizar `ingest_daily.py`

**Files:**

- Modify: `backend/src/oderbiz_analytics/jobs/ingest_daily.py`
- Modify: `backend/tests/test_ingest_daily.py`
- **Step 1: Actualizar `backend/tests/test_ingest_daily.py`**

El mock debe apuntar al nuevo adaptador. Reemplaza el contenido completo:

```python
# backend/tests/test_ingest_daily.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from oderbiz_analytics.jobs import ingest_daily


@pytest.mark.asyncio
async def test_run_daily_ingest_calls_insert_and_list(monkeypatch):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")

    mock_account = MagicMock()
    mock_account.id = "act_1"
    mock_account.name = "n"
    mock_account.account_id = "1"
    mock_account.currency = "USD"

    with (
        patch("oderbiz_analytics.jobs.ingest_daily.MetaGraphClient") as mc,
        patch(
            "oderbiz_analytics.jobs.ingest_daily.fetch_account_insights",
            new_callable=AsyncMock,
        ) as fi,
        patch("oderbiz_analytics.jobs.ingest_daily.insert_raw_insights_row") as ins,
        patch("oderbiz_analytics.jobs.ingest_daily.init_db") as idb,
    ):
        instance = mc.return_value
        instance.list_ad_accounts = AsyncMock(return_value=[mock_account])
        instance.aclose = AsyncMock()
        fi.return_value = [{"spend": "1"}]

        await ingest_daily.run_daily_ingest()

        idb.assert_called_once()
        ins.assert_called_once()
        call_kwargs = ins.call_args.kwargs
        assert call_kwargs["ad_account_id"] == "act_1"
        assert call_kwargs["level"] == "account"
        assert call_kwargs["date_preset"] == "last_30d"
        assert "db_path" in call_kwargs
```

- **Step 2: Ejecutar test (debe FALLAR — import de bq aún en el job)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_ingest_daily.py -v
```

Expected: FAIL.

- **Step 3: Reemplazar `backend/src/oderbiz_analytics/jobs/ingest_daily.py`**

```python
# backend/src/oderbiz_analytics/jobs/ingest_daily.py
from __future__ import annotations

import asyncio

from oderbiz_analytics.adapters.duckdb.client import init_db, insert_raw_insights_row
from oderbiz_analytics.adapters.meta.client import MetaGraphClient
from oderbiz_analytics.adapters.meta.insights import fetch_account_insights
from oderbiz_analytics.config import get_settings

FIELDS = (
    "impressions,clicks,spend,reach,frequency,cpm,cpp,ctr,actions,cost_per_action_type"
)
DATE_PRESET = "last_30d"


async def run_daily_ingest() -> None:
    s = get_settings()
    init_db(s.duckdb_path)
    base = f"https://graph.facebook.com/{s.meta_graph_version}"
    meta = MetaGraphClient(base_url=base, access_token=s.meta_access_token)
    try:
        accounts = await meta.list_ad_accounts(fields="id,name,account_id,currency")
        for acct in accounts:
            rows = await fetch_account_insights(
                base_url=base,
                access_token=s.meta_access_token,
                ad_account_id=acct.id,
                date_preset=DATE_PRESET,
                fields=FIELDS,
            )
            insert_raw_insights_row(
                db_path=s.duckdb_path,
                ad_account_id=acct.id,
                object_id=acct.id,
                level="account",
                date_preset=DATE_PRESET,
                fields=FIELDS,
                payload={"data": rows},
            )
    finally:
        await meta.aclose()


def main() -> None:
    asyncio.run(run_daily_ingest())
```

- **Step 4: Ejecutar test (debe PASAR)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_ingest_daily.py -v
```

Expected: PASS.

- **Step 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add backend/src/oderbiz_analytics/jobs/ingest_daily.py backend/tests/test_ingest_daily.py && git commit -m "feat: wire ingest job to DuckDB adapter"
```

---

### Task 4: Actualizar `summary.py` y `main.py`

**Files:**

- Modify: `backend/src/oderbiz_analytics/api/routes/summary.py`
- Modify: `backend/src/oderbiz_analytics/api/main.py`
- Modify: `backend/tests/test_summary.py`
- **Step 1: Reemplazar `backend/tests/test_summary.py`**

Ahora los tests usan DuckDB real con `tmp_path` en lugar de mocks de BigQuery:

```python
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
```

- **Step 2: Ejecutar test (debe FALLAR — summary.py aún usa BigQuery)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_summary.py -v
```

Expected: FAIL.

- **Step 3: Reemplazar `backend/src/oderbiz_analytics/api/routes/summary.py`**

```python
# backend/src/oderbiz_analytics/api/routes/summary.py
from fastapi import APIRouter, Depends

from oderbiz_analytics.adapters.duckdb.client import query_latest_raw
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["summary"])


@router.get("/{ad_account_id}/summary")
def account_summary(ad_account_id: str, settings: Settings = Depends(get_settings)):
    payload_json = query_latest_raw(settings.duckdb_path, ad_account_id)
    return {"data": payload_json}
```

- **Step 4: Actualizar `backend/src/oderbiz_analytics/api/main.py` — agregar lifespan con `init_db`**

Lee el archivo actual y reemplaza su contenido completo:

```python
# backend/src/oderbiz_analytics/api/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI

from oderbiz_analytics.adapters.duckdb.client import init_db
from oderbiz_analytics.api.routes.accounts import router as accounts_router
from oderbiz_analytics.api.routes.summary import router as summary_router
from oderbiz_analytics.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.duckdb_path)
    yield


app = FastAPI(title="Oderbiz Meta Ads Analytics API", version="0.1.0", lifespan=lifespan)
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(summary_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- **Step 5: Ejecutar tests de summary (deben PASAR)**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest tests/test_summary.py -v
```

Expected: 2 tests PASS.

- **Step 6: Suite completa**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest -v
```

Expected: todos PASS. Si `test_api_accounts.py` falla por el lifespan (intenta crear DuckDB en `/data/` que no existe), parchea el `lifespan` en el test sobreescribiendo la env var `DUCKDB_PATH`:

El fixture en `test_api_accounts.py` ya hace `monkeypatch.setenv("META_ACCESS_TOKEN", "t")`. Agrega también `monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))`. Si el test no usa `tmp_path`, ajusta el fixture así:

```python
# Sección a modificar en backend/tests/test_api_accounts.py
@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("GCP_PROJECT_ID", "p")   # se puede mantener; Settings lo ignora con extra="ignore"
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    # ... resto del fixture igual
```

- **Step 7: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add backend/src/oderbiz_analytics/api/routes/summary.py backend/src/oderbiz_analytics/api/main.py backend/tests/test_summary.py backend/tests/test_api_accounts.py && git commit -m "feat: replace BigQuery summary with DuckDB query_latest_raw"
```

---

### Task 5: Eliminar artefactos BigQuery

**Files:**

- Delete: `backend/src/oderbiz_analytics/adapters/bq/client.py`
- Delete: `backend/src/oderbiz_analytics/adapters/bq/__init__.py`
- Delete: `backend/tests/test_bq_raw_insert.py`
- Delete: `backend/sql/001_create_tables.sql` (DDL ya está embebido en el adaptador)
- **Step 1: Borrar archivos obsoletos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && \
  rm backend/src/oderbiz_analytics/adapters/bq/client.py \
     backend/src/oderbiz_analytics/adapters/bq/__init__.py \
     backend/tests/test_bq_raw_insert.py \
     backend/sql/001_create_tables.sql
rmdir backend/src/oderbiz_analytics/adapters/bq
rmdir backend/sql
```

- **Step 2: Verificar que la suite pasa sin los archivos BQ**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python3.12 -m pytest -v
```

Expected: todos PASS (sin errores de import).

- **Step 3: Actualizar `backend/README.md` — sección BigQuery**

Reemplaza la sección `## BigQuery — Aplicar DDL` con:

```markdown
## Base de datos — DuckDB

El backend usa DuckDB como base analítica local. El archivo se crea automáticamente
al iniciar la app o el job de ingesta en la ruta configurada por `DUCKDB_PATH`
(default: `/data/analytics.duckdb`).

No se requiere migración manual. Las tablas se crean con `init_db()` al arrancar.
```

- **Step 4: Actualizar `backend/.env.example`**

Reemplaza el contenido completo:

```
# Requerido
META_ACCESS_TOKEN=your-meta-long-lived-token

# Opcionales (tienen defaults)
DUCKDB_PATH=/data/analytics.duckdb
META_GRAPH_VERSION=v25.0
API_HOST=0.0.0.0
API_PORT=8000
```

- **Step 5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add -A && git commit -m "chore: remove BigQuery adapter and GCP references"
```

---

### Task 6: Dockerfile

**Files:**

- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- **Step 1: Crear `backend/.dockerignore`**

```
__pycache__
*.pyc
*.pyo
.venv
venv
.env
tests/
*.egg-info
dist/
.git
```

- **Step 2: Crear `backend/Dockerfile`**

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Instalar dependencias del sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar solo lo necesario para instalar dependencias primero (capa cacheada)
COPY pyproject.toml .
COPY src/ src/

# Instalar el paquete (sin extras dev)
RUN pip install --no-cache-dir -e .

# Crear directorio de datos (será sobreescrito por el volumen en Docker)
RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "oderbiz_analytics.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- **Step 3: Verificar que la imagen buildea**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && docker build -t oderbiz-analytics:dev .
```

Expected: imagen construida sin errores. Si hay error de `gcc` en tu arquitectura, el `RUN apt-get` se puede omitir (DuckDB tiene wheels precompilados para linux/amd64 y linux/arm64).

- **Step 4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add backend/Dockerfile backend/.dockerignore && git commit -m "feat: add Dockerfile for backend service"
```

---

### Task 7: `docker-compose.yml`

**Files:**

- Create: `docker-compose.yml` (raíz del proyecto)
- **Step 1: Crear `docker-compose.yml`**

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: oderbiz-analytics:dev
    ports:
      - "8000:8000"
    volumes:
      - analytics_data:/data
    environment:
      - META_ACCESS_TOKEN=${META_ACCESS_TOKEN}
      - DUCKDB_PATH=/data/analytics.duckdb
      - META_GRAPH_VERSION=${META_GRAPH_VERSION:-v25.0}
      - API_HOST=0.0.0.0
      - API_PORT=8000
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  ingest:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: oderbiz-analytics:dev
    volumes:
      - analytics_data:/data
    environment:
      - META_ACCESS_TOKEN=${META_ACCESS_TOKEN}
      - DUCKDB_PATH=/data/analytics.duckdb
      - META_GRAPH_VERSION=${META_GRAPH_VERSION:-v25.0}
    command: oderbiz-ingest-daily
    profiles:
      - ingest
    depends_on:
      - api

volumes:
  analytics_data:
    driver: local
```

- **Step 2: Crear `.env` en la raíz para docker compose**

Crea `/Users/lamnda/Documents/oderbiz analitics/.env` con:

```
META_ACCESS_TOKEN=your-real-token-here
```

Agrega `/Users/lamnda/Documents/oderbiz analitics/.env` al `.gitignore` de la raíz (o verifica que ya está):

```bash
echo ".env" >> "/Users/lamnda/Documents/oderbiz analitics/.gitignore" 2>/dev/null || echo ".env" > "/Users/lamnda/Documents/oderbiz analitics/.gitignore"
```

- **Step 3: Verificar que `docker compose up` arranca la API**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && docker compose up api --build -d
```

Espera ~10 segundos y verifica:

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

- **Step 4: Verificar que el health check del container pasa**

```bash
docker compose ps
```

Expected: `api` con status `healthy` o `running`.

- **Step 5: Verificar cómo ejecutar el job de ingesta**

```bash
# Correr ingesta una vez (one-shot, se destruye al terminar)
docker compose --profile ingest run --rm ingest
```

Expected: el job corre y termina (puede fallar si el token es inválido, pero no debe crashear con errores de import).

- **Step 6: Bajar servicios**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && docker compose down
```

- **Step 7: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && git add docker-compose.yml .gitignore && git commit -m "feat: add docker-compose with api and ingest services sharing DuckDB volume"
```

---

## Self-review

### Spec coverage


| Requisito                                             | Tarea                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Quitar GCP/BigQuery                                   | Tasks 1, 2, 5                                                                            |
| DuckDB como storage persistente                       | Task 2                                                                                   |
| Auto-creación de tablas (sin DDL manual)              | Task 2 (`init_db`)                                                                       |
| `insert_raw_insights_row` con nueva firma (`db_path`) | Tasks 2, 3                                                                               |
| `query_latest_raw` para endpoint summary              | Tasks 2, 4                                                                               |
| `summary.py` sin referencias a BigQuery               | Task 4                                                                                   |
| `ingest_daily.py` sin referencias a BigQuery          | Task 3                                                                                   |
| `lifespan` en FastAPI que llama `init_db`             | Task 4                                                                                   |
| Dockerfile Python 3.12 slim                           | Task 6                                                                                   |
| `docker-compose.yml` con volumen compartido           | Task 7                                                                                   |
| Job `ingest` con profile (one-shot)                   | Task 7                                                                                   |
| Tests sin mocks de BigQuery                           | Tasks 2, 4                                                                               |
| Desacoplar fácil en el futuro                         | Adaptador con interfaz limpia (`init_db`, `insert_raw_insights_row`, `query_latest_raw`) |


### Placeholder scan

Sin `TBD`, `TODO` ni pasos sin código. Todos los comandos tienen output esperado.

### Consistencia de nombres

- `init_db(db_path)` — usada en `main.py` lifespan, `ingest_daily.py` y tests.
- `insert_raw_insights_row(*, db_path, ...)` — usada en `ingest_daily.py` y tests.
- `query_latest_raw(db_path, ad_account_id)` — usada en `summary.py` y tests.
- `settings.duckdb_path` — usado en `ingest_daily.py`, `main.py` lifespan y `summary.py`.

---

## Execution handoff

**Plan completo guardado en `docs/superpowers/plans/2026-04-03-duckdb-docker-migration.md`. Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — Despacho un subagente fresco por tarea, revisión entre tareas, iteración rápida.

**2. Inline Execution** — Ejecutar tareas en esta sesión con executing-plans, con checkpoints de revisión.

**¿Cuál enfoque?**
# Oderbiz Analytics

Plataforma de analitica para Meta Ads (Facebook/Instagram) con:

- **Backend** en FastAPI (integracion con Graph/Marketing API + persistencia local en DuckDB).
- **Frontend** en React + Vite para exploracion de cuentas, dashboards y modulos de diagnostico.

El flujo principal funciona con token Bearer de Meta desde la UI, sin OAuth embebido en esta version.

---

## Que resuelve

- Centraliza metricas de rendimiento publicitario por cuenta de anuncios.
- Expone dashboards por cuenta y por pagina para analizar embudo, creatividades, audiencias y tiempos.
- Permite enriquecer analisis con datos manuales (CRM/operacion) para responder preguntas de negocio.
- Incluye modulos de inteligencia competitiva (radar de mercado y ads de competidores).

---

## Stack tecnico

### Backend (`backend/`)

- Python 3.12+
- FastAPI + Uvicorn
- httpx
- Pydantic / pydantic-settings
- DuckDB
- Pytest + Respx + Ruff (dev)

### Frontend (`frontend/`)

- React 19 + TypeScript
- Vite
- React Router
- TanStack Query
- Tailwind + componentes estilo shadcn
- Recharts / MapLibre

---

## Estructura del repositorio

```text
backend/                  API FastAPI, servicios de dominio, adapters Meta/DuckDB, tests
frontend/                 SPA React (token, cuentas, dashboard cuenta y dashboard pagina)
docs/                     especificaciones funcionales, contratos y runbooks
scripts/                  utilidades locales y scripts Docker
docker-compose.yml        entorno con web + api + job opcional de ingesta
```

---

## Arquitectura funcional

1. El usuario pega un token de Meta en la pantalla inicial.
2. El frontend guarda el token en `sessionStorage` (`meta_access_token`).
3. Cada request al backend incluye `Authorization: Bearer <token>`.
4. El backend consulta Meta API, normaliza datos y retorna payloads para visualizacion.
5. Para ciertos modulos, se complementa con datos en DuckDB (cache/insumos manuales/competidores).

---

## Endpoints principales (API `/api/v1`)

### Base y cuenta

- `GET /accounts`
- `GET /accounts/{ad_account_id}/dashboard`
- `GET /accounts/{ad_account_id}/summary`
- `GET /businesses/portfolio`
- `GET /me`

### Entidades publicitarias

- `GET /accounts/{account_id}/campaigns`
- `GET /accounts/{account_id}/adsets`
- `GET /accounts/{account_id}/ads`
- `GET /accounts/{ad_account_id}/ads/performance`
- `GET /accounts/{ad_account_id}/ads/labels/performance`
- `GET /accounts/{ad_account_id}/ads/{ad_id}/targeting`

### Insights avanzados de cuenta

- `GET /accounts/{ad_account_id}/insights/placements`
- `GET /accounts/{ad_account_id}/insights/geo`
- `GET /accounts/{ad_account_id}/insights/demographics`
- `GET /accounts/{ad_account_id}/insights/attribution`
- `GET /accounts/{ad_account_id}/insights/leads`
- `GET /accounts/{ad_account_id}/insights/creative-fatigue`
- `GET /accounts/{ad_account_id}/insights/time`
- `GET /accounts/{ad_account_id}/insights/audiences`

### Vista "Pagina primero"

- `GET /accounts/{account_id}/pages`
- `GET /accounts/{ad_account_id}/pages/{page_id}/insights`
- `GET /accounts/{ad_account_id}/pages/{page_id}/placements`
- `GET /accounts/{ad_account_id}/pages/{page_id}/geo`
- `GET /accounts/{ad_account_id}/pages/{page_id}/demographics`
- `GET /accounts/{ad_account_id}/pages/{page_id}/actions`
- `GET /accounts/{ad_account_id}/pages/{page_id}/timeseries`
- `GET /accounts/{ad_account_id}/pages/{page_id}/conversion-timeseries`
- `GET /accounts/{ad_account_id}/pages/{page_id}/traffic-quality`
- `GET /accounts/{ad_account_id}/pages/{page_id}/ad-diagnostics`
- `GET /accounts/{ad_account_id}/pages/{page_id}/funnel`
- `GET /pages/{page_id}/organic-insights`

### Datos manuales y preguntas de negocio

- `POST /accounts/{ad_account_id}/manual-data`
- `GET /accounts/{ad_account_id}/manual-data`
- `GET /accounts/{ad_account_id}/business-questions/close-speed`
- `GET /accounts/{ad_account_id}/business-questions/bottleneck`
- `GET /accounts/{ad_account_id}/business-questions/segment-no-quote`
- `GET /accounts/{ad_account_id}/business-questions/cac-out-of-target`
- `GET /accounts/{ad_account_id}/business-questions/sla-lost-revenue`
- `GET /accounts/{ad_account_id}/business-questions/stability`
- `GET /accounts/{ad_account_id}/pages/{page_id}/business-questions/stability`

### Competencia

- `POST /competitor/resolve`
- `GET /competitor/{page_id}/ads`
- `GET /competitor/market-radar`
- `GET /competitor/market-radar-extended`
- `GET /competitor/market-radar-temporal`

### Salud

- `GET /health`

---

## Frontend: rutas principales

- `/` ingreso de token
- `/accounts` listado de cuentas
- `/accounts/:accountId/dashboard` dashboard de cuenta
- `/accounts/:accountId/pages` listado de paginas asociadas
- `/accounts/:accountId/pages/:pageId/dashboard` dashboard de pagina

---

## Referencias de anuncios (UI)

- En vistas de **Cuenta** y **Pagina**, las tablas/listados por anuncio muestran un enlace `Ver referencia` encima del nombre.
- Prioridad de resolucion del enlace:
  1. `effective_object_story_permalink` (permalink oficial de Meta si existe),
  2. link de destino en `creative.object_story_spec` (CTA/link_data/template/photo),
  3. fallback por `effective_object_story_id`,
  4. fallback a Ads Manager del anuncio.
- Endpoints que entregan permalink oficial:
  - `GET /accounts/{account_id}/ads`
  - `GET /accounts/{ad_account_id}/ads/performance`

---

## Requisitos

- Python `3.12`
- Node.js `>=20` recomendado
- npm
- Docker + Docker Compose (opcional, pero recomendado para entorno reproducible)

---

## Configuracion de entorno

### Backend (`backend/.env`)

Variables base (ver `backend/.env.example`):

```env
META_ACCESS_TOKEN=
DUCKDB_PATH=/data/analytics.duckdb
META_GRAPH_VERSION=v25.0
API_HOST=0.0.0.0
API_PORT=8000
```

> `META_ACCESS_TOKEN` es opcional para la API HTTP si el frontend envia Bearer por cabecera.
> Para jobs o ejecucion no interactiva, normalmente si conviene definirlo.

### Frontend (`frontend/.env`)

```env
# Opcional. En desarrollo se recomienda dejar vacio para usar proxy de Vite.
# VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## Ejecucion local (sin Docker)

### Opcion rapida (script unico)

Desde la raiz:

```bash
./scripts/dev-local.sh
```

Este script:

- instala backend editable si falta (`pip install -e ".[dev]"`)
- levanta API en `http://127.0.0.1:8000`
- levanta frontend en `http://localhost:5173`

### Opcion manual

Backend:

```bash
cd backend
python3.12 -m pip install -e ".[dev]"
python3.12 -m uvicorn oderbiz_analytics.api.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend (otra terminal):

```bash
cd frontend
npm install
npm run dev
```

---

## Ejecucion con Docker

Desde la raiz:

```bash
docker compose up --build
```

Servicios:

- `web` en `http://localhost:5173`
- `api` en `http://localhost:8000`

Job opcional de ingesta diaria:

```bash
docker compose --profile ingest up ingest
```

---

## Tests

Backend:

```bash
cd backend
python3 -m pytest -q
```

---

## Comandos utiles

- Salud API: `curl -s http://127.0.0.1:8000/health`
- Rebuild API Docker: `docker compose build api && docker compose up -d api`

---

## Troubleshooting rapido

- Si no aparecen cuentas y `/api/v1/accounts` responde `200` con `data: []`, el token no tiene acceso real a cuentas publicitarias.
- Si hay `404` desde frontend, revisar `VITE_API_BASE_URL`: debe ser solo el origen, sin `/api` ni `/api/v1`.
- `localhost` y `127.0.0.1` son origenes distintos para `sessionStorage`; usa siempre uno para evitar "token perdido".
- Mensajes de consola tipo `runtime.lastError` suelen venir de extensiones del navegador, no necesariamente de la app.

---

## Documentacion recomendada del repo

- `frontend/README.md` (detalle de flujo frontend)
- `docs/specs/` (briefs, contrato API, KPIs, QA y runbooks)
- `docs/superpowers/plans/` (planes de implementacion por fecha)

---

## Seguridad

- Nunca commitear tokens, `.env` ni credenciales.
- Rotar cualquier token que se haya expuesto en logs, screenshots o chats.


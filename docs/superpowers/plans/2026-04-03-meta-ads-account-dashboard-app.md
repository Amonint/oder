# Meta Ads — App por token, selector de cuentas y dashboard por cuenta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el proyecto en una **aplicación web** donde el usuario introduce un **token de acceso de Meta (Marketing API)**, ve **todas las cuentas publicitarias** visibles para ese token (`/me/adaccounts`), **elige una cuenta** y accede a un **dashboard analítico** por cuenta, alineado con el inventario real de endpoints y métricas documentados en `docs/meta-ads-api-inventario-prueba.md` (no solo listar dos filas en HTML plano).

**Architecture:** El **frontend** (Vite + React + TypeScript + TanStack Query) es la capa de experiencia: pantalla de token, lista de cuentas con navegación y vista dashboard. La **UI usa shadcn/ui** (registro `@shadcn` vía MCP / CLI) para layout, KPIs, tablas y gráficos. El **backend** (FastAPI + DuckDB) sigue como BFF: valida requests, llama a Graph API con el token que el cliente envía **por petición** (cabecera), persiste/agrega datos donde aplique, y expone contratos JSON estables bajo `/api/v1`. El token **no se escribe en logs** ni se persiste en servidor salvo decisión explícita futura (esta spec asume **token solo en tránsito** + opcionalmente `sessionStorage` en el cliente para no reescribirlo cada vez).

**Tech Stack:** Backend existente (Python 3.12, FastAPI, httpx, DuckDB, Pydantic v2). Frontend: React 19, Vite 8, TanStack Query 5, **shadcn/ui** (Radix + Tailwind), **Recharts** vía bloque `chart` de shadcn. Graph API **v25.0** (configurable por `META_GRAPH_VERSION`).

**Referencia de dominio obligatoria:** `docs/meta-ads-api-inventario-prueba.md` (endpoints, campos de insights, `action_type`, límites de agregación, presets de fecha válidos).

---

## 1. Especificación de producto (requisitos detallados)

### 1.1 Flujo principal (usuario)

1. **Entrada de token**
  - El usuario pega un **long-lived user access token** (o el token que la app use) en un campo controlado.  
  - Debe existir acción **“Conectar” / “Cargar cuentas”** que dispare la lista de cuentas.  
  - Mensajes claros si el token es inválido o la API devuelve error (sin mostrar el token completo en pantallas de error).
2. **Lista de cuentas publicitarias**
  - Debe mostrar **todas** las cuentas devueltas por Graph `GET /v{version}/me/adaccounts` para ese token (no hardcodear dos cuentas).  
  - Columnas mínimas: **nombre**, **id** (`act_…`), **moneda**, (opcional) **estado** si el campo viene en la respuesta ampliada.  
  - Cada fila o tarjeta debe ser **clicable** y llevar a la ruta del dashboard de esa cuenta, p. ej. `/accounts/act_XXX/dashboard`.
3. **Un token → muchas cuentas**
  - Queda explícito: **una identidad de Facebook/Meta** puede tener **varias cuentas de anuncios**; el listado debe reflejarlas todas según permisos del token (`ads_read`, `ads_management`, etc.).
4. **Dashboard por cuenta**
  Vista única por `ad_account_id` que incluya al menos:

  | Bloque                        | Contenido (según inventario)                                                                                                                                                                     |
  | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | **Cabecera**                  | Nombre de cuenta, id, moneda, selector de **rango de fechas** (`date_preset` válido: p. ej. `last_7d`, `last_30d`, `last_90d`; evitar presets no soportados como `last_365d` si la API rechaza). |
  | **KPIs (tarjetas)**           | Agregados nivel **cuenta** para el preset elegido: `impressions`, `clicks`, `spend`, `reach`, `frequency`, `cpm`, `cpp`, `ctr` (según disponibilidad en respuesta Meta).                         |
  | **Acciones**                  | Tabla o desglose de `actions`: pares `action_type` → `value` (JSON flexible; priorizar tipos relevantes del doc: mensajería, `link_click`, `video_view`, engagement).                            |
  | **Costo por tipo de acción**  | Desde `cost_per_action_type` cuando exista.                                                                                                                                                      |
  | **Gráfico(s)**                | Al menos **una serie temporal o comparativa** (p. ej. barras por tipo de acción o línea de spend si hay datos diarios — ver nota 1.3).                                                           |
  | **Profundidad opcional v1.1** | Enlaces o pestañas a listados **campañas** y **anuncios** (endpoints ya inventariados) si el tiempo lo permite; si no, dejar hooks en la API.                                                    |

5. **Privacidad y seguridad**
  - No mostrar tokens en URL.  
  - Preferir **Authorization: Bearer **** hacia el backend o header dedicado; el backend nunca loguea el valor.  **
  - Recordatorio en UI: revocar tokens expuestos (texto corto, sin almacenar en DB).

### 1.2 Requisitos de backend (contratos nuevos o ampliados)

- **Token por request:** Los endpoints que llamen a Meta deben aceptar el token del cliente (p. ej. cabecera `Authorization: Bearer …`) y usarlo en `MetaGraphClient` / insights en lugar de solo `Settings.meta_access_token` (el env puede quedar como fallback solo para jobs server-side o desarrollo).
- **Listado de cuentas:** `GET /api/v1/accounts` ya existe; debe funcionar con el token del header cuando esté presente.
- **Dashboard data:** Nuevo agregado recomendado (un solo endpoint para el front en v1):
  - `GET /api/v1/accounts/{ad_account_id}/dashboard?date_preset=last_30d`  
  - Respuesta incluye: métricas agregadas cuenta, `actions` parseadas, `cost_per_action_type`, `date_start`/`date_stop`, y metadata mínima.  
  - Implementación: llamada a `fetch_account_insights` (o equivalente) con `level=account` y los mismos `fields` que el job de ingesta; opcionalmente lectura de DuckDB para “último snapshot” si se define caché.
- **CORS:** Orígenes de Vite ya permitidos; mantener al añadir nuevas rutas.
- **Errores Graph:** Mapear códigos comunes a mensajes HTTP 4xx/502 legibles para el front.

### 1.3 Notas de datos (del inventario)

- Insights es **agregado**, no por persona.  
- `actions` y `cost_per_action_type` son heterogéneos: el modelo de UI debe soportar filas dinámicas.  
- Para **series temporales** estrictas hace falta `time_increment` o desglose diario en la API; si v1 solo tiene un fila por preset, el gráfico puede ser **por `action_type`** (barras) en lugar de serie diaria — documentar en UI (“periodo agregado”).

### 1.4 UI — shadcn/ui (MCP `@shadcn`)

Implementación obligatoria vía CLI del proyecto, consultando el MCP **shadcn** para nombres exactos:

- **Base:** `button`, `card`, `input`, `label`, `skeleton`, `alert`, `badge`, `separator`, `breadcrumb` (o `navigation-menu` según navegación).  
- **Datos:** `table`, `tabs` (si se separan Resumen / Campañas / Anuncios).  
- **Gráficos:** paquete `chart` de shadcn (Recharts) — p. ej. bloques tipo `chart-bar-`* o `chart-area-*` adaptados a datos de acciones o métricas.  
- **Formulario token:** `input` + `button`; estado loading con `skeleton`.

Comandos típicos (ajustar tras `npx shadcn@latest init` en `frontend/`):

```bash
cd frontend && npx shadcn@latest add card button input label table tabs skeleton alert badge separator chart
```

---

## 2. Mapa de archivos (alto nivel)


| Ruta                                                            | Responsabilidad                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `backend/src/oderbiz_analytics/api/deps.py` (nuevo o ampliar)   | Resolver `access_token` desde `Authorization` + fallback `Settings`. |
| `backend/src/oderbiz_analytics/api/routes/accounts.py`          | Inyectar token dinámico en `MetaGraphClient`.                        |
| `backend/src/oderbiz_analytics/api/routes/dashboard.py` (nuevo) | Endpoint agregado dashboard por cuenta + preset.                     |
| `backend/src/oderbiz_analytics/adapters/meta/insights.py`       | Reutilizar / ampliar params si hace falta.                           |
| `backend/tests/test_dashboard.py` (nuevo)                       | Tests con mocks/respx.                                               |
| `frontend/src/main.tsx`                                         | Router (React Router), providers.                                    |
| `frontend/src/routes/`                                          | Páginas: `TokenGate`, `AccountList`, `AccountDashboard`.             |
| `frontend/src/components/ui/*`                                  | Componentes shadcn generados.                                        |
| `frontend/src/api/client.ts`                                    | `fetch` con `Authorization: Bearer` desde almacén de sesión.         |


---

## 3. Tareas de implementación

### Task 1: Backend — dependencia de token desde cabecera `Authorization`

**Files:**

- Create: `backend/src/oderbiz_analytics/api/deps.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/accounts.py`
- Modify: `backend/src/oderbiz_analytics/api/main.py` (incluir router nuevo en Task 2 o mismo task)
- Create: `backend/tests/test_auth_token_header.py`
- **Step 1: Test — listado de cuentas usa token del header**

```python
# backend/tests/test_auth_token_header.py
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "env-token")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "t.duckdb"))
    return TestClient(app)


def test_accounts_prefers_bearer_token_over_env(client, monkeypatch):
    async def fake_list(self, **kwargs):
        from oderbiz_analytics.domain.models import AdAccount

        return [AdAccount(id="act_x", name="A", account_id="1", currency="USD")]

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.accounts.MetaGraphClient.list_ad_accounts",
        fake_list,
    )

    r = client.get(
        "/api/v1/accounts",
        headers={"Authorization": "Bearer header-token"},
    )
    assert r.status_code == 200
```

- **Step 2: Ejecutar test — debe fallar** hasta implementar `deps`.

Run: `cd backend && python3.12 -m pytest tests/test_auth_token_header.py -v`  
Expected: FAIL.

- **Step 3: Implementar `get_meta_access_token`** en `deps.py` que lea `Authorization: Bearer <token>` y si no hay, use `get_settings().meta_access_token`.
- **Step 4: Cambiar `accounts.py`** para que `MetaGraphClient` use `access_token=get_meta_access_token(...)` en lugar de solo settings.
- **Step 5: Ejecutar tests** — incluir `test_api_accounts.py` sin romper.

Run: `cd backend && python3.12 -m pytest tests/ -v`  
Expected: todos PASS.

- **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/deps.py backend/src/oderbiz_analytics/api/routes/accounts.py backend/tests/test_auth_token_header.py
git commit -m "feat(api): accept Meta access token via Authorization Bearer"
```

---

### Task 2: Backend — endpoint `GET /api/v1/accounts/{id}/dashboard`

**Files:**

- Create: `backend/src/oderbiz_analytics/api/routes/dashboard.py`
- Modify: `backend/src/oderbiz_analytics/api/main.py`
- Create: `backend/tests/test_dashboard_route.py`
- **Step 1: Test de contrato mínimo** con `respx` mock a Graph `/{ad_account_id}/insights`.
- **Step 2: Implementar handler** que llame a `fetch_account_insights` con `date_preset` query (default `last_30d`), mismos `fields` que ingesta, y devuelva JSON estructurado: `{ "ad_account_id", "date_preset", "summary": { ... }, "actions": [...], "cost_per_action_type": [...], "date_start", "date_stop" }` (ajustar a la forma real de la API Meta).
- **Step 3: pytest** y commit.

---

### Task 3: Frontend — React Router + almacén de token

**Files:**

- Modify: `frontend/package.json` (dependencia `react-router-dom`)
- Modify: `frontend/src/main.tsx`
- Create: `frontend/src/routes/Layout.tsx`, `TokenPage.tsx`, `AccountsPage.tsx`, `DashboardPage.tsx`
- Modify: `frontend/src/api/client.ts`
- **Step 1: Instalar router**

```bash
cd frontend && npm install react-router-dom
```

- **Step 2: `client.ts`** — leer token de `sessionStorage` key `meta_access_token` y enviar `Authorization: Bearer` en cada fetch; si no hay token, no llamar API protegida.
- **Step 3: Rutas** `/`, `/accounts`, `/accounts/:accountId/dashboard`.

---

### Task 4: Frontend — shadcn init y componentes base

**Files:**

- Modify: `frontend/` (tailwind, `components.json`)
- Create: `frontend/src/components/ui/`*
- **Step 1:** `npx shadcn@latest init` en `frontend` (seguir prompts; Tailwind v4 según doc actual).
- **Step 2:** `npx shadcn@latest add` los componentes listados en sección 1.4 (usar MCP `search_items_in_registries` / `get_add_command_for_items` si hace falta el comando exacto).
- **Step 3:** Commit solo de scaffolding UI.

---

### Task 5: UI — pantalla token (shadcn form)

- **Step 1:** Página `/` con `Card` + `Input` + `Button`; al guardar, persistir token en `sessionStorage` y navegar a `/accounts`.
- **Step 2:** Si token falta, redirigir a `/`.

---

### Task 6: UI — lista de cuentas con tabla shadcn

- **Step 1:** `AccountsPage` usa `useQuery` + `Table` con filas clicables (`useNavigate`).
- **Step 2:** Estados loading (`Skeleton`) y error (`Alert`).

---

### Task 7: UI — dashboard cuenta

- **Step 1:** `DashboardPage` lee `accountId` de la ruta, `useQuery` a `/api/v1/accounts/{id}/dashboard?date_preset=...`.
- **Step 2:** `Select` o botones para `date_preset` válidos.
- **Step 3:** Grid de `Card` para KPIs; `Table` para actions; componente `Chart` para barras/líneas según datos disponibles.

---

### Task 8: Pulido y documentación

- **Step 1:** Actualizar `frontend/README.md` con flujo token + rutas.
- **Step 2:** Prueba manual: token → cuentas → dashboard con dos cuentas reales.

---

## 4. Self-review (spec coverage)


| Requisito                                      | Tarea                            |
| ---------------------------------------------- | -------------------------------- |
| Token ingresado por usuario                    | Task 3, 5                        |
| Listar todas las cuentas del token             | Task 1 + 6                       |
| Seleccionar cuenta → dashboard                 | Task 3, 6, 7                     |
| KPIs y acciones según inventario               | Task 2, 7                        |
| Gráfico                                        | Task 4 (chart), 7                |
| shadcn/ui                                      | Task 4, 5, 6, 7                  |
| Sin persistir token en servidor (spec default) | Task 3 (sessionStorage + header) |


## 5. Placeholder scan

Sin `TBD` en pasos críticos: los presets de fecha y campos de insights deben copiarse del inventario al implementar Task 2.

---

## Execution handoff

**Plan completo guardado en `docs/superpowers/plans/2026-04-03-meta-ads-account-dashboard-app.md`. Opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — Un subagente por tarea, revisión entre tareas.

**2. Inline Execution** — Ejecutar en esta sesión con executing-plans y checkpoints.

**¿Cuál enfoque prefieres?**
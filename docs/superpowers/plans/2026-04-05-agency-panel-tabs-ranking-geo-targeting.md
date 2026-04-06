# Plan de implementación — Panel agencia (tabs Ranking / Geografía / Targeting)

> **Para agentes:** conviene ejecutar tarea por tarea (p. ej. subagent-driven-development o plan manual con checkboxes). Cada bloque usa `- [ ]` para marcar avance.

**Objetivo:** Evolucionar el monorepo existente para soportar ranking de anuncios con orden por métrica cruda, vista geográfica agregada (tabla + barras; mapa opcional después) y lectura de `targeting` del ad set del anuncio seleccionado, con llamadas Meta mínimas y sin reescribir el stack.

**Arquitectura:** El frontend sigue llamando solo a la API FastAPI (`vite` proxy). Se generaliza el cliente HTTP de Insights (`insights.py`) para aceptar `level`, `breakdowns` y `time_range` opcional frente a `date_preset`. Se añaden rutas REST bajo `/api/v1/accounts/...` que encapsulan Graph. La UI implementa **vistas de panel completas** (layout, tabs, tablas, estados vacíos/carga) y **todos los gráficos estadísticos** con patrones **shadcn/ui** obtenidos vía **MCP `user-shadcn`** (requisito obligatorio; no improvisar componentes de chart fuera de ese flujo).

**Stack:** Python 3.12, FastAPI, httpx, pytest+respx, React+Vite, TanStack Query, shadcn/ui (`components.json`), Recharts vía `ChartContainer` (shadcn), DuckDB (sin cambios obligatorios en v1 de este plan).

**Especificación de producto:** `docs/superpowers/specs/2026-04-05-agency-insights-panel-design.md`

---

## Requisito obligatorio — UI Design + MCP Shadcn (`user-shadcn`)

**Regla:** Cualquier **gráfico estadístico** (barras, líneas, áreas, radial, comparativas, mini-charts en cards) debe:

1. Basarse en el bloque **Chart** oficial del registro shadcn del proyecto (`frontend/components.json`).
2. **Antes de implementar o modificar** el chart, el agente **debe** usar el servidor MCP `**user-shadcn`** (herramientas indicadas abajo). No cumplir esto es incumplimiento del plan.

**Flujo MCP recomendado (ejecutar en orden, registrar en PR/commit message qué ítems se consultaron):**


| Paso | Herramienta MCP (`user-shadcn`)         | Propósito                                                                                                                         |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `get_project_registries`                | Confirmar registries disponibles en `components.json` (p. ej. `@shadcn`).                                                         |
| 2    | `search_items_in_registries`            | Buscar `chart`, `card`, `tabs`, `table`, `skeleton`, `badge` según haga falta.                                                    |
| 3    | `get_item_examples_from_registries`     | Traer demos (`chart-demo`, `bar-chart`, etc.) y copiar el patrón `ChartContainer` + `ChartConfig` + tooltip.                      |
| 4    | `get_add_command_for_items`             | Si falta un primitivo en `src/components/ui/`, generar el comando `npx shadcn@latest add ...` exacto y ejecutarlo en `frontend/`. |
| 5    | `view_items_in_registries` *(opcional)* | Inspeccionar metadatos del ítem antes de add.                                                                                     |


**Vistas UI que deben cubrirse con diseño coherente (además de datos):**

- **Tab Resumen** (dashboard cuenta existente): mantener/actualizar gráfico de `actions` solo con patrón shadcn chart vía MCP.
- **Tab Ranking:** tabla + **gráfico de barras** (p. ej. top N anuncios por métrica seleccionada) usando Chart + MCP.
- **Tab Geografía:** tabla + **gráfico de barras horizontales** (regiones) usando Chart + MCP.
- **Tab Targeting:** presentación legible del JSON (`Card`, tipografía, `ScrollArea` si se añade vía MCP); sin chart si no aplica.
- **Estados:** `Skeleton` en carga, `Alert` en error (shadcn), fila seleccionada visible (`Table` + estilos).

**Archivos UI típicos (ajustar según MCP):**


| Archivo                                                       | Responsabilidad                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `frontend/src/routes/DashboardPage.tsx`                       | Orquestación tabs, queries, charts estadísticos.                                             |
| `frontend/src/components/ui/chart.tsx`                        | Base Recharts/shadcn; **no editar a mano** sin haber consultado ejemplos MCP en esa tarea.   |
| `frontend/src/components/dashboard/*.tsx` *(opcional, nuevo)* | Extraer secciones por tab si `DashboardPage` crece (RankingTable, GeoChart, TargetingPanel). |


---

## Mapa de archivos (crear / tocar)


| Archivo                                                                 | Responsabilidad                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/oderbiz_analytics/adapters/meta/insights.py`               | Función genérica `fetch_insights` (o ampliar la existente) con `level`, `date_preset` XOR `time_range`, `breakdowns` opcional. |
| `backend/src/oderbiz_analytics/adapters/meta/ads_entities.py` *(nuevo)* | `fetch_ad_fields`, `fetch_adset_fields` vía Graph (pequeño, testeable).                                                        |
| `backend/src/oderbiz_analytics/api/routes/ads_ranking.py` *(nuevo)*     | `GET .../{act}/ads/performance` — lista filas `level=ad` + campos de ranking.                                                  |
| `backend/src/oderbiz_analytics/api/routes/geo_insights.py` *(nuevo)*    | `GET .../{act}/insights/geo` — breakdown `region` (y `country` si se combina según doc Meta).                                  |
| `backend/src/oderbiz_analytics/api/routes/targeting.py` *(nuevo)*       | `GET .../ads/{ad_id}/targeting` — resuelve adset y devuelve JSON `targeting`.                                                  |
| `backend/src/oderbiz_analytics/api/main.py`                             | Registrar los tres routers.                                                                                                    |
| `backend/tests/test_insights_params.py` *(nuevo)*                       | respx: query string correcto para breakdowns y level.                                                                          |
| `backend/tests/test_ads_ranking_route.py` *(nuevo)*                     | Contrato JSON del endpoint de ranking.                                                                                         |
| `frontend/src/api/client.ts`                                            | Funciones `fetchAdsRanking`, `fetchGeoInsights`, `fetchAdTargeting` + tipos.                                                   |
| `frontend/src/routes/DashboardPage.tsx`                                 | Tabs, selectores de tiempo (preset + rango mes), fila seleccionada, sub-vistas, **todos los charts vía shadcn+MCP**.           |
| `frontend/src/components/dashboard/`* *(opcional)*                      | Sub-vistas por tab para mantener legibilidad y reutilizar charts.                                                              |


**Fuera de alcance de este plan (fases posteriores):** caché servidor/TTL en DuckDB, mapa Leaflet/Google, auth multi-cliente agencia, OAuth Meta.

---

### Task 1: Generalizar fetch de Insights en el backend

**Archivos:**

- Modificar: `backend/src/oderbiz_analytics/adapters/meta/insights.py`
- Crear: `backend/tests/test_insights_params.py`
- **Paso 1.1 — Test que falla (respx)**

Añadir test que registre `GET https://graph.facebook.com/v25.0/act_111/insights` y espere query params `level=ad`, `breakdowns=region`, `fields=impressions`, `date_preset=last_7d`.

```python
# backend/tests/test_insights_params.py
import respx
import httpx
import pytest
from oderbiz_analytics.adapters.meta.insights import fetch_insights


@pytest.mark.asyncio
@respx.mock
async def test_fetch_insights_passes_level_and_breakdowns():
    route = respx.get("https://graph.facebook.com/v25.0/act_111/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    await fetch_insights(
        base_url="https://graph.facebook.com/v25.0",
        access_token="tok",
        ad_account_id="act_111",
        fields="impressions",
        date_preset="last_7d",
        level="ad",
        breakdowns=["region"],
    )
    assert route.called
    req = route.calls[0].request
    assert "level=ad" in str(req.url)
    assert "breakdowns" in str(req.url)
```

Ejecutar: `cd backend && python3 -m pytest tests/test_insights_params.py -v`  
**Esperado:** falla (import o función inexistente).

- **Paso 1.2 — Implementar `fetch_insights`**

Reemplazar el cuerpo limitado de `fetch_account_insights` por una función única (o mantener `fetch_account_insights` como wrapper que llama a `fetch_insights` con `level="account"` para no romper tests existentes).

Contrato sugerido:

```python
async def fetch_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    fields: str,
    date_preset: str | None = None,
    time_range: dict[str, str] | None = None,
    level: str = "account",
    breakdowns: list[str] | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
```

Construir `params`: siempre `fields`, `access_token`, `level`. Si `time_range` → enviar `time_range` como JSON stringificado en query (patrón Graph). Si no → `date_preset`. Si `breakdowns` → `breakdowns` como lista serializada según doc Meta (a menudo JSON array en query).

Actualizar `dashboard.py` para usar `fetch_insights(..., level="account", date_preset=...)` en lugar del nombre antiguo si renombrás.

- **Paso 1.3 — Ejecutar suite de tests afectada**

`cd backend && python3 -m pytest tests/test_meta_insights.py tests/test_dashboard_route.py tests/test_insights_params.py -v`  
**Esperado:** todo PASS.

- **Paso 1.4 — Commit**

`git add backend/src/oderbiz_analytics/adapters/meta/insights.py backend/tests/test_insights_params.py backend/src/oderbiz_analytics/api/routes/dashboard.py`  
`git commit -m "refactor(meta): fetch_insights genérico con level y breakdowns"`

---

### Task 2: Endpoint ranking de anuncios (`level=ad`)

**Archivos:**

- Crear: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py`
- Crear: `backend/tests/test_ads_ranking_route.py`
- Modificar: `backend/src/oderbiz_analytics/api/main.py`
- **Paso 2.1 — Constante de campos**

Reutilizar o extraer desde `ingest_daily.FIELDS` una constante `RANKING_FIELDS` que incluya al menos:  
`ad_id,ad_name,campaign_name,impressions,clicks,spend,reach,frequency,cpm,cpp,ctr`  
(más `actions` solo si lo necesitás en tabla v1; YAGNI: empezar sin `actions` en ranking para filas más livianas).

- **Paso 2.2 — Ruta FastAPI**

`GET /api/v1/accounts/{ad_account_id}/ads/performance`

Query params:

- `date_preset: str | None = None`
- `date_start: str | None = None`, `date_stop: str | None = None` (si ambos presentes, usar `time_range` y no enviar `date_preset`)

Llamar `fetch_insights` con `level="ad"`, sin `breakdowns`. Respuesta: `{ "data": [ ...filas crudas de Graph... ], "date_preset": ..., "time_range": ... }`.

Manejar `httpx.HTTPStatusError` como 502 (mismo patrón que `dashboard.py`).

- **Paso 2.3 — Test de ruta con respx**

Mock Graph devolver 1 fila con `ad_id`, `spend`, etc. Assert status 200 y que `data` tiene 1 elemento.

- **Paso 2.4 — Registrar router en `main.py`**

`app.include_router(ads_ranking_router, prefix="/api/v1")` si el router ya trae `prefix="/accounts"` internamente (alinear con `dashboard_router`).

- **Paso 2.5 — Commit**

`git commit -m "feat(api): ranking de anuncios level=ad"`

---

### Task 3: Endpoint insights geográficos

**Archivos:**

- Crear: `backend/src/oderbiz_analytics/api/routes/geo_insights.py`
- Crear: `backend/tests/test_geo_insights_route.py`
- Modificar: `backend/src/oderbiz_analytics/api/main.py`
- **Paso 3.1 — Contrato**

`GET /api/v1/accounts/{ad_account_id}/insights/geo`

Query:

- `scope`: enum `account` | `ad`
- `ad_id`: opcional si scope=ad
- mismos params de tiempo que Task 2

Implementación:

- `scope=account`: `fetch_insights` sobre `act_`* con `breakdowns=["region"]` (validar en cuenta real si hace falta añadir `country`; si Meta rechaza la combinación, documentar en respuesta de error o probar solo `region`).
- `scope=ad`: URL base `/{ad_id}/insights` (nuevo helper o parámetro `object_id` en `fetch_insights` para no forzar prefijo `act_`).
- **Paso 3.2 — Test respx** para ambos scopes (mínimo uno por scope).
- **Paso 3.3 — Commit** `feat(api): insights geográficos por cuenta o anuncio`

---

### Task 4: Endpoint targeting (ad → adset)

**Archivos:**

- Crear: `backend/src/oderbiz_analytics/adapters/meta/ads_entities.py`
- Crear: `backend/src/oderbiz_analytics/api/routes/targeting.py`
- Crear: `backend/tests/test_targeting_route.py`
- Modificar: `backend/src/oderbiz_analytics/api/main.py`
- **Paso 4.1 — Funciones Graph**

```python
async def fetch_ad_json(base_url: str, access_token: str, ad_id: str, fields: str) -> dict:
    # GET {base}/{ad_id}?fields=...&access_token=...
```

```python
async def fetch_adset_json(base_url: str, access_token: str, adset_id: str, fields: str) -> dict:
```

- **Paso 4.2 — Ruta** `GET /api/v1/accounts/{ad_account_id}/ads/{ad_id}/targeting`  
(el `ad_account_id` puede servir para comprobar que el anuncio pertenece a la cuenta si en v1 querés omitir la comprobación e confiar en el token; YAGNI: opcional).

Respuesta: `{ "targeting": { ... } }` o 404 si falta adset.

- **Paso 4.3 — Test respx** cadena ad → adset.
- **Paso 4.4 — Commit** `feat(api): targeting del ad set por ad_id`

---

### Task 5: Cliente frontend y tipos

**Archivos:**

- Modificar: `frontend/src/api/client.ts`
- **Paso 5.1 — Funciones**

```typescript
export async function fetchAdsPerformance(
  adAccountId: string,
  opts: { datePreset?: string; dateStart?: string; dateStop?: string }
): Promise<{ data: Record<string, unknown>[]; ... }>;

export async function fetchGeoInsights(
  adAccountId: string,
  opts: { scope: "account" | "ad"; adId?: string; datePreset?: string; dateStart?: string; dateStop?: string }
): Promise<{ data: Record<string, unknown>[] }>;

export async function fetchAdTargeting(
  adAccountId: string,
  adId: string
): Promise<{ targeting: unknown }>;
```

Usar el mismo patrón `apiFetch` + Bearer que ya existe.

- **Paso 5.2 — Commit** `feat(frontend): client API ranking geo targeting`

---

### Task 6: UI Design — consulta MCP Shadcn y composición de vistas

**Archivos:**

- Modificar / crear según resultado MCP: `frontend/src/components/ui/*`, `frontend/src/routes/DashboardPage.tsx`, opcionalmente `frontend/src/components/dashboard/*.tsx`
- **Paso 6.1 — MCP: inventario de componentes**

Invocar `get_project_registries` y `search_items_in_registries` con `registries: ["@shadcn"]` y queries: `chart`, `card`, `tabs`, `table`, `skeleton`, `alert`, `select`, `scroll-area` (añadir los que falten al proyecto).

- **Paso 6.2 — MCP: ejemplos de charts**

Invocar `get_item_examples_from_registries` con queries alineadas a la doc del registry (p. ej. `chart-demo`, `chart-bar`, `chart-bar-horizontal` o equivalentes que devuelva el MCP). **Guardar** en el plan de rama o comentario en PR qué ejemplo se tomó como referencia para:

- Gráfico de **acciones** (tab Resumen).
- Gráfico **top anuncios** por métrica (tab Ranking).
- Gráfico **geografía** barras horizontales (tab Geografía).
- **Paso 6.3 — MCP: comandos `shadcn add`**

Si falta algún UI primitive, invocar `get_add_command_for_items` y ejecutar el comando en el directorio `frontend/` (p. ej. `npx shadcn@latest add @shadcn/chart`).

- **Paso 6.4 — Wireframe de vistas (código)**

Implementar estructura visual **antes o junto** al wiring de datos:

- Layout con `Tabs` (4 tabs: Resumen, Ranking, Geografía, Targeting).
- `Card` por sección; `Skeleton` mientras `isLoading`.
- Placeholders de `ChartContainer` con datos mock estáticos **solo para validar diseño** (luego Task 7 conecta API).
- **Paso 6.5 — Commit** `feat(ui): vistas panel + charts shadcn (MCP)`

---

### Task 7: Wiring de datos + charts estadísticos en `DashboardPage`

**Archivos:**

- Modificar: `frontend/src/routes/DashboardPage.tsx` (y componentes dashboard si se crearon)

**Precondición:** Task 6 completado; charts deben seguir el mismo patrón MCP (no sustituir por `BarChart` suelto de Recharts sin `ChartContainer`).

- **Paso 7.1 — Estado global de página**
- `timeMode`: `"preset" | "month"`
- `datePreset` (existente)
- `month` (`YYYY-MM` → `date_start` / `date_stop` en cliente)
- `selectedAdId: string | null`
- `sortMetric`: una de las 8 métricas (orden en cliente sobre filas descargadas)
- **Paso 7.2 — Tab Resumen**

Mantener `fetchAccountDashboard`; gráfico de `actions` **solo** con componente shadcn Chart alineado al ejemplo MCP del Paso 6.2.

- **Paso 7.3 — Tab Ranking**

`useQuery` → `fetchAdsPerformance`. Tabla + chart estadístico (barras top N por métrica seleccionada en `Select`) vía shadcn Chart. Clic en fila → `selectedAdId`.

- **Paso 7.4 — Tab Geografía**

`useQuery` (lazy si tab activo) → `fetchGeoInsights`; selector alcance cuenta vs anuncio. Tabla + **bar chart horizontal** (shadcn+MCP) por dimensión geográfica devuelta por Meta.

- **Paso 7.5 — Tab Targeting**

`useQuery` con `selectedAdId` → `fetchAdTargeting`. Presentación en `Card` + JSON legible (sin chart salvo que se decida un chart MCP con sentido).

- **Paso 7.6 — Commit** `feat(frontend): datos reales en tabs ranking geo targeting`

---

### Task 8: Verificación manual y documentación mínima

- **Paso 8.1 — Docker** `docker compose up` API + `npm run dev` en `frontend`, token válido, recorrer **las 4 tabs** y validar charts.
- **Paso 8.2 — Documentar uso MCP** en `frontend/README.md` o en `docs/superpowers/specs/2026-04-05-agency-insights-panel-design.md` (párrafo corto: “gráficos: consultar MCP user-shadcn antes de cambiar `chart.tsx`”).
- **Paso 8.3 — Commit final** `docs: UI charts shadcn MCP` (opcional)

---

## Orden sugerido y riesgos

1. Task 1 → 2 → 3 → 4 (backend completo y testeado).
2. Task 5 (cliente API).
3. Task 6 (**MCP Shadcn + vistas UI**).
4. Task 7 (datos reales en charts y tablas).
5. Task 8.

**Riesgos:** Meta puede rechazar ciertas combinaciones `breakdowns` + `level`; tener listo fallback (solo `region`, o mensaje de error claro en UI). Paginación: si hay muchos anuncios, el ranking puede necesitar `limit` + cursor en iteración posterior.

---

## Después de este plan

- Caché DuckDB / TTL según spec §4.  
- Proveedor de mapa intercambiable si la tabla+barras no alcanza.  
- Cualquier **nuevo** gráfico estadístico en el futuro: repetir flujo **MCP `user-shadcn`** antes de codificar.  
- `writing-plans` sugiere, tras completar, commits pequeños frecuentes ya reflejados en cada task.


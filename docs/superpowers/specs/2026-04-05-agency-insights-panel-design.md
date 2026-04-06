# Especificación — Panel agencia (Meta-only) + estrategia de API y mapa

**Fecha:** 2026-04-05  
**Estado:** borrador acordado con brainstorming (iteraciones posteriores: API rate, caché, mapa simple).

---

## 0. Base existente — evolución incremental (no reescritura)

**Principio:** todo lo descrito en este documento son **extensiones y ajustes** sobre el monorepo actual (`backend/` FastAPI + `frontend/` Vite/React + `docker-compose` + DuckDB). **No** se asume cambiar de framework ni rehacer flujos que ya funcionan.

### 0.1 Inventario de lo que ya hay


| Área                     | Ubicación / comportamiento actual                                                                                          | Rol frente al panel agencia                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API cuentas              | `backend/.../routes/accounts.py` — `GET /api/v1/accounts`                                                                  | Se **mantiene**; opcional: caché TTL en servidor para no repetir `me/adaccounts`.                                                                                    |
| API dashboard            | `backend/.../routes/dashboard.py` — insights **nivel cuenta**, `date_preset`, campos fijos (`FIELDS` en `ingest_daily.py`) | Se **extiende** o se añaden rutas hermanas (p. ej. ranking `level=ad`, `time_range`) sin tirar la ruta actual si aún sirve para KPI global.                          |
| Cliente Meta insights    | `backend/.../adapters/meta/insights.py`                                                                                    | Se **amplía** con parámetros opcionales: `breakdowns`, distintos `level`, `time_range` — misma función o variantes delgadas.                                         |
| Ingesta batch            | `backend/.../jobs/ingest_daily.py` + DuckDB                                                                                | Se **mantiene**; la caché “histórica” del spec puede **reutilizar** el mismo patrón de tablas (`raw_meta_insights`, etc.) con claves ampliadas cuando se implemente. |
| Persistencia             | `backend/.../adapters/duckdb/client.py`                                                                                    | **Ampliar esquema o consultas** solo si hace falta servidor de caché; no sustituir DuckDB por otra cosa en v1.                                                       |
| Frontend token + cuentas | `TokenPage`, `AccountsPage`, `client.ts`                                                                                   | Se **mantienen**; nuevas funciones `fetch`* para endpoints nuevos.                                                                                                   |
| Dashboard UI             | `DashboardPage.tsx` + `@/components/ui/*` (tabs, table, chart ya presentes)                                                | Se **evoluciona** la misma ruta o sub-rutas: pestañas Ranking / Geografía / Targeting encima del flujo actual.                                                       |
| Proxy dev                | `frontend/vite.config.ts` → backend `:8000`                                                                                | **Sin cambio** de idea: el navegador sigue sin llamar a `graph.facebook.com`.                                                                                        |


### 0.2 Qué cuenta como “cambio necesario” vs “nuevo trozo pequeño”

- **Ajuste:** ampliar `fields`, query params (`time_range`, `sort` solo en UI sobre datos ya pedidos), reutilizar `fetch_account_insights` con más argumentos.  
- **Nuevo trozo acotado:** 1–2 endpoints FastAPI adicionales (p. ej. `.../ads/ranking`, `.../insights/geo`) si preferís no inflar una sola ruta.  
- **Evitar:** segundo backend, otro bundler, reemplazar React Query, duplicar lógica de token en otro servicio.

### 0.3 Desalineación menor con el spec (ya resuelta en la práctica)

- El documento habla de “BFF único”: **ya es así** (frontend → `/api` → Python → Meta). Solo hay que **seguir** ese patrón en las nuevas rutas.

---

## 1. Objetivo del producto

Herramienta tipo panel para clientes de una agencia: datos **solo Meta**, sin CRM. Tres vistas (tabs/chips): **Ranking**, **Geografía**, **Targeting**. Sin KPIs derivados en servidor; ordenar y mostrar campos crudos de Insights. El usuario infiere rendimiento.

---

## 2. Decisiones de producto ya fijadas


| Tema             | Decisión                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cuentas          | Desplegable de varias `act_`* accesibles al token.                                                                   |
| Tiempo           | Mes calendario (`time_range`) **o** preset Meta; el usuario elige.                                                   |
| Ranking          | Métricas crudas; orden por desplegable: `spend`, `impressions`, `reach`, `clicks`, `frequency`, `ctr`, `cpm`, `cpp`. |
| Mapa / geografía | Alcance: **toda la cuenta** o **un anuncio** (selector). **v1 Ecuador** en datos (breakdowns que devuelva Meta).     |
| Targeting        | Mismo anuncio seleccionado en Ranking → `ad` → `adset` → `targeting`.                                                |
| Límites Meta     | Sin identidad individual; solo agregados y breakdowns permitidos.                                                    |


---

## 3. Estrategia anti-ráfaga: llamadas mínimas a Meta

### 3.1 Principio

- El **frontend no llama a graph.facebook.com** salvo que en el futuro se decida explícitamente lo contrario. El **backend** (BFF) es el único que habla con Meta; así se centralizan límites, caché y paginación.
- Cada pantalla pide **solo lo necesario para ese momento** (carga perezosa).

### 3.2 Secuencia recomendada (por visita)

1. **Cuentas** — Una llamada corta: `GET /me/adaccounts` (o equivalente ya usado) al elegir contexto de sesión. **Cachear** en almacén local (ver §4) con TTL corto (p. ej. 15–60 min) o invalidar al cambiar token.
2. **Ranking** — Solo al entrar al tab y con cuenta + rango ya elegidos: `insights` con `level=ad` y el conjunto de `fields` necesario para tabla + orden. **No** pedir breakdowns geográficos en la misma llamada si el usuario no abrió Geografía.
3. **Geografía** — Solo al abrir el tab o al cambiar “alcance cuenta | anuncio” o fechas: `insights` con `breakdowns` geográficos (`country`, `region` según disponibilidad). Una petición por combinación (cuenta vs anuncio) en caché.
4. **Targeting** — Solo al abrir el tab con un `ad_id` seleccionado: `GET ad` con `fields=adset_id` (si no está en memoria) + `GET adset` con `fields=targeting` (o campos mínimos). Evitar listar todos los ad sets de la cuenta si no hace falta.

### 3.3 Evitar duplicar trabajo

- **Desduplicar en backend:** clave de caché = `(token_hash o account_id, endpoint, params normalizados)` para no repetir la misma query Graph por dos usuarios de la misma agencia si comparten token (opcional; si cada cliente tiene token propio, la clave incluye hash de token).
- **Paginación:** al listar muchos anuncios, respetar `limit` y cursores; no “traer todo” en una sola respuesta si la cuenta es grande.

### 3.4 Rate limiting (operación)

- Registrar cabeceras de uso (`x-fb-ads-insights-throttle`, `x-ad-account-usage` cuando apliquen).
- Backoff exponencial ante códigos de throttling documentados por Meta.
- Preferir **rangos de fecha razonables** y **menos campos** por request cuando el informe sea pesado.

---

## 4. Persistencia y caché (backend)

### 4.1 Objetivo

Reducir llamadas repetidas a Graph para **la misma cuenta + mismos parámetros + ventana temporal ya cerrada** (p. ej. marzo terminado).

### 4.2 Enfoque sugerido

- **Capa 1 — Memoria / Redis (opcional):** respuestas recientes (minutos) para navegación entre tabs sin re-fetch.
- **Capa 2 — DuckDB (alineado al repo):** tablas tipo “raw” o agregados por `(ad_account_id, ad_id, date_start, date_stop, nivel, preset_o_rango_hash, breakdown_signature)` con JSON o columnas para métricas.  
  - **Ventanas históricas cerradas** (mes calendario pasado) son buen candidato a **servir desde DB** si ya se ingirieron.  
  - **Hoy / últimos 7 días** pueden refrescarse con TTL corto o bypass de caché.
- **Invalidación:** cambio de token, cambio explícito “refrescar” en UI, o expiración TTL.

### 4.3 Qué ya existe en el repo

Hay ingesta diaria y tablas DuckDB para insights en crudo; esta especificación asume **extender o reutilizar** ese patrón para las nuevas consultas por tab, sin duplicar lógica de fetch en el frontend.

---

## 5. Mapa / geografía — versión **simple** y proveedor **intercambiable**

### 5.1 Problema con GeoJSON provincial completo

Polígonos administrativos completos de Ecuador añaden mantenimiento y tamaño. Para v1 se **rechaza** como requisito obligatorio.

### 5.2 v1 recomendada (mínima y clara)

- **Vista principal “Geografía”:** **tabla** ordenable + **gráfico de barras horizontales** por etiqueta de región/país (valores = `impressions`, `spend` o lo que el usuario elija en un segundo desplegable, siguiendo la regla “solo campos Meta”).  
- Esto usa **exactamente** los strings que devuelve Meta; **cero** capa cartográfica obligatoria.

### 5.3 v1 opcional “mapa lite” (sin polígonos)

- **Mapa de puntos:** un **marcador por región** usando **tabla estática pequeña** `region_key_o_nombre → lat, lng` (centroide aproximado), no geometría completa.  
- Tiles: **Leaflet + OpenStreetMap** (sin API key; atribución OSM).  
- Si más adelante usás **Google Maps**, sustituís solo el adaptador de mapa.

### 5.4 Abstracción en frontend (acoplable)

- Contrato interno: `GeographicBreakdownRow { label, metrics }` (independiente del proveedor).  
- `MapViewPort` (interfaz): `render(rows)` — implementaciones: `BarChartOnlyAdapter`, `LeafletMarkersAdapter`, `GoogleMapsAdapter` (futuro).  
- El **origen de datos** es siempre el mismo endpoint backend; solo cambia la visualización.

---

## 6. Seguridad

- Tokens solo en servidor o en flujo ya definido por el producto; no loguear URLs con token.  
- Política de retención en DuckDB acorde a acuerdos con clientes.

---

## 7. Próximos pasos de ingeniería (orden incremental)

1. Gap analysis mínimo: qué tab reusa `dashboard` actual vs qué ruta nueva (sin borrar lo existente).
2. Extender `fetch_account_insights` (o wrapper) con `breakdowns` / `level` / `time_range` según tab.
3. UI: tabs en `DashboardPage` (componente `tabs` ya en el repo) + query keys distintas en React Query para no mezclar caché cliente.
4. Caché servidor: solo si hace falta tras medir llamadas; reutilizar tablas DuckDB existentes antes de crear otra base.
5. Geografía v1: tabla + barras; mapa opcional con adaptador intercambiable.
6. Logs de throttling Meta en endpoints que pegan a Insights.

---

## 8. Referencias Meta (v25.0)

- Insights / breakdowns: documentación oficial Marketing API (Breakdowns, Combining breakdowns).  
- Documentación interna del repo: `docs/meta-permisos-v25-campos-y-breakdowns.md`, `docs/meta-ads-api-inventario-prueba.md`.


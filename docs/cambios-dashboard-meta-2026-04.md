# Resumen de cambios — Dashboard Meta Ads (abril 2026)

Documento de referencia de lo implementado en la sesión de trabajo: exploración por cuenta/campaña/conjunto/anuncio, métricas completas de Insights, placements Facebook/Instagram, mensajería/WhatsApp y catálogo de entidades Graph.

---

## Objetivo

- Permitir **navegar poco a poco** desde la cuenta hasta un anuncio concreto, con **filtros y chips**.
- **Usar** el catálogo de entidades (A), hechos de Insights nivel anuncio (B), desglose por plataforma/posición (C) y señales de mensajería (D).
- Exponer todo en **API** y reflejarlo en el **dashboard** del frontend.

---

## Backend

### Adaptador `insights` (`backend/src/oderbiz_analytics/adapters/meta/insights.py`)

- Parámetro opcional **`time_increment`** (p. ej. `1` para series diarias).
- Nueva función **`fetch_insights_all_pages`**: recorre **`paging.next`** hasta un límite de páginas (evita perder filas en cuentas grandes).

### Agregación y mensajería (`backend/src/oderbiz_analytics/services/insights_aggregate.py`)

- **`aggregate_ad_rows`**: agrupa filas diarias por `ad_id` (suma métricas, fusiona `actions` y `cost_per_action_type`).
- **`summarize_messaging_actions`**: suma valores de `actions` cuyo `action_type` indica mensajería / `total_messaging_connection`.

### Entidades Graph (`backend/src/oderbiz_analytics/api/routes/entities.py`)

- Campos ampliados:
  - **Campañas**: objetivo, estados, presupuestos, fechas (como ya estaba, alineado al catálogo A).
  - **Conjuntos**: `targeting`, `bid_strategy`, `optimization_goal`, `billing_event`, presupuestos, fechas.
  - **Anuncios**: `creative{id,name,title,body,object_story_spec,call_to_action_type}`.

### Rendimiento por anuncio (`backend/src/oderbiz_analytics/api/routes/ads_ranking.py`)

- **`GET /api/v1/accounts/{ad_account_id}/ads/performance`**
  - Campos de Insights: métricas base + **`actions`** + **`cost_per_action_type`** + identificadores de campaña/conjunto/anuncio.
  - Query **`campaign_id`**, **`adset_id`**, **`ad_id`** (prioridad: anuncio > conjunto > campaña).
  - Query opcional **`time_increment`** (`1` = filas diarias; el backend devuelve ranking agregado en `data`).
  - Respuesta:
    - **`data`**: filas listas para ranking (en modo diario, ya agregadas por anuncio con `ad_label`).
    - **`raw_rows`**: solo si `time_increment=1` (detalle diario crudo).
    - **`aggregated_by_ad`**: filas agregadas por anuncio cuando aplica.
    - **`messaging_actions_summary`**: diccionario `action_type → suma`.
    - **`time_increment`**, **`date_preset`**, **`time_range`**.

### Placements (`backend/src/oderbiz_analytics/api/routes/placement_insights.py`)

- **`GET /api/v1/accounts/{ad_account_id}/insights/placements`**
  - Mismos filtros de fecha y `campaign_id` / `adset_id` / `ad_id` que rendimiento.
  - **`breakdowns=publisher_platform,platform_position`** (no incluir esos campos en `fields`; vienen por breakdown).
  - Opcional **`time_increment`**.

### Registro de rutas (`backend/src/oderbiz_analytics/api/main.py`)

- Router de **entidades** y router de **placement insights** montados bajo `/api/v1`.

---

## Frontend

### Cliente API (`frontend/src/api/client.ts`)

- Tipos ampliados: **`AdPerformanceRow`** (acciones, fechas, métricas flexibles string/número), **`AdsPerformanceResponse`** (`raw_rows`, `aggregated_by_ad`, `messaging_actions_summary`, `time_increment`).
- Entidades: **`CampaignRow`**, **`AdsetRow`**, **`AdRow`** con campos alineados al backend.
- **`fetchAdsPerformance`**: soporta **`timeIncrement`**.
- Nuevo **`fetchPlacementInsights`** y tipo **`PlacementInsightsResponse`**.

### Dashboard (`frontend/src/routes/DashboardPage.tsx`)

- **Explorar por estructura**: selects **Campaña → Conjunto → Anuncio** con valores “Todas/Todos”, **chips** con quitar (×) y reset en cascada.
- **Periodo** (preset) + selector **Rendimiento anuncios**: **Periodo agregado** vs **Diario (suma por anuncio)** (mapea a `time_increment=1`).
- **Tarjeta Mensajería / WhatsApp**: muestra **`messaging_actions_summary`** cuando hay datos.
- **Pestaña Catálogo**: tablas/listados de campañas; conjuntos con **JSON de targeting**; anuncios con texto, CTA y **object_story_spec**.
- **Pestaña Plataformas**: tabla por fila de placement + badges de **gasto agregado** por `plataforma · posición`.
- **Ranking**: columna **Conjunto**; gráfico usa **`ad_label`**; queries alineadas a filtros + granularidad.
- **Tabs controlados** (`mainTab`) para cargar placements solo al abrir la pestaña correspondiente.

---

## Flujo de usuario (resumen)

1. **Inicio** → token → **Cuentas** → elegir cuenta (`act_…`).
2. **Dashboard** de esa cuenta: breadcrumb y nombre de cuenta.
3. **Opcional — Explorar**: campaña → conjunto → anuncio; chips reflejan el estado.
4. **Periodo** + **granularidad** de rendimiento (agregado vs diario).
5. **Pestañas**: Resumen (KPI cuenta) | Ranking | Catálogo | Plataformas | Geografía | Targeting (anuncio seleccionado).

---

## Endpoints nuevos o relevantes

| Método | Ruta | Notas |
|--------|------|--------|
| GET | `/api/v1/accounts/{id}/campaigns` | Catálogo campañas |
| GET | `/api/v1/accounts/{id}/adsets?campaign_id=` | Catálogo conjuntos filtrados |
| GET | `/api/v1/accounts/{id}/ads?campaign_id=` o `?adset_id=` | Catálogo anuncios |
| GET | `/api/v1/accounts/{id}/ads/performance` | Métricas + filtros + `time_increment` + mensajería |
| GET | `/api/v1/accounts/{id}/insights/placements` | Facebook / Instagram por posición |

---

## Notas técnicas

- Las URLs de paginación de Meta pueden incluir token; no registrar `paging.next` en logs.
- Si Graph rechaza algún subcampo de `creative`, habría que acortar el `fields` en entidades (no cubierto en este documento).
- Tests del backend pueden requerir `PYTHONPATH=src` y dependencias (p. ej. `duckdb`) según el entorno.

---

*Generado como resumen de la evolución del dashboard y la API Meta en este repositorio.*

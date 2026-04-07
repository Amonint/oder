# Design — Dashboard "Página primero" con caché DuckDB

**Versión:** 1.0  
**Fecha:** 2026-04-07  
**Estado:** Aprobado por usuario  
**Enfoque:** Opción A — Rediseño completo con navegación Token → Cuenta → Página → Dashboard

---

## 1. Visión

Herramienta de analítica de pauta en Meta donde **cualquier usuario** pega su token de acceso y ve sus cuentas publicitarias, las páginas asociadas a cada cuenta, y un tablero completo de métricas de pauta para la página seleccionada.

No hay base de usuarios propia. El token de Meta es la identidad. La herramienta funciona para cualquier agencia o cuenta individual.

---

## 2. Flujo de navegación

```
[TokenPage]         → el usuario pega su Meta Access Token
        ↓
[AccountsPage]      → lista cuentas publicitarias del token (/me/adaccounts)
        ↓ selecciona cuenta
[PagesPage]         → lista páginas con campañas en esa cuenta
                      (resueltas via adset.promoted_object.page_id)
                      columnas: nombre, categoría, gasto, impresiones
                      orden: mayor gasto DESC
        ↓ selecciona página
[DashboardPage]     → tablero completo de esa página
                      filtros globales: periodo · campaña · conjunto · anuncio
                      todos los bloques responden a los mismos filtros
```

**Rutas del frontend:**

| Ruta | Pantalla |
|------|----------|
| `/` | TokenPage (existente) |
| `/accounts` | AccountsPage (existente) |
| `/accounts/:accountId/pages` | PagesPage **(nueva)** |
| `/accounts/:accountId/pages/:pageId/dashboard` | DashboardPage **(refactorizada)** |

---

## 3. Backend — Endpoints

### 3.1 Endpoint nuevo: Lista de páginas por cuenta

```
GET /api/v1/accounts/{account_id}/pages
  ?date_preset=last_30d   (default)
```

**Lógica:**
1. Escanea todos los adsets de la cuenta vía `/{account_id}/adsets?fields=promoted_object`
2. Extrae `page_id` únicos de `promoted_object.page_id`
3. Enriquece con nombre y categoría desde `/me/accounts` del token
4. Para cada página, obtiene `spend` e `impressions` del periodo usando Insights con `filtering=[{field: "adset.promoted_object_page_id", operator: "EQUAL", value: page_id}]`
5. Devuelve lista ordenada por `spend DESC`

**Respuesta:**
```json
{
  "data": [
    {
      "page_id": "1395690107130206",
      "name": "Oderbiz Marketing & Estrategia",
      "category": "Agencia de marketing",
      "spend": 23.53,
      "impressions": 15267,
      "date_preset": "last_30d"
    }
  ]
}
```

### 3.2 Endpoint nuevo: KPIs de página

```
GET /api/v1/accounts/{account_id}/pages/{page_id}/insights
  ?date_preset=last_30d
  &campaign_id=   (opcional)
  &adset_id=      (opcional)
  &ad_id=         (opcional)
```

**Campos Meta:** `spend,impressions,reach,frequency,cpm,ctr`  
**Filtering:** `adset.promoted_object_page_id = page_id` + filtros en cascada opcionales

### 3.3 Endpoint nuevo: Placements

```
GET /api/v1/accounts/{account_id}/pages/{page_id}/placements
  ?date_preset=last_30d  [+ filtros en cascada]
```

**Breakdowns:** `publisher_platform,platform_position`  
**Campos:** `spend,impressions,reach`

### 3.4 Endpoint nuevo: Geografía

```
GET /api/v1/accounts/{account_id}/pages/{page_id}/geo
  ?date_preset=last_30d  [+ filtros en cascada]
```

**Breakdowns:** `region`  
**Campos:** `spend,impressions,reach`

### 3.5 Endpoint nuevo: Acciones agrupadas

```
GET /api/v1/accounts/{account_id}/pages/{page_id}/actions
  ?date_preset=last_30d  [+ filtros en cascada]
```

**Campos:** `spend,actions`  
**El backend agrupa** los `action_type` en 5 categorías antes de devolver:

| Categoría | action_types incluidos |
|-----------|----------------------|
| Mensajería | `onsite_conversion.total_messaging_connection`, `messaging_conversation_started_7d`, `messaging_first_reply`, `messaging_user_depth_2_message_send`, `messaging_user_depth_3_message_send` |
| Engagement | `post_engagement`, `page_engagement`, `post_reaction`, `like`, `post_interaction_net`, `post_interaction_gross` |
| Tráfico | `link_click` |
| Video | `video_view` |
| Guardados | `onsite_conversion.post_save`, `onsite_conversion.post_net_save` |

### 3.6 Endpoint nuevo: Serie temporal

```
GET /api/v1/accounts/{account_id}/pages/{page_id}/timeseries
  ?date_preset=last_30d  [+ filtros en cascada]
```

**Campos:** `spend,impressions,reach`  
**Parámetro Meta:** `time_increment=1` (datos diarios)  
**Solo se llama desde el frontend si el periodo tiene ≥ 7 días**

---

## 4. Backend — Caché en DuckDB

### 4.1 Nueva tabla

```sql
CREATE TABLE IF NOT EXISTS api_cache (
    cache_key    VARCHAR PRIMARY KEY,
    payload_json VARCHAR NOT NULL,
    cached_at    TIMESTAMPTZ NOT NULL
);
```

### 4.2 Clave de caché

```python
cache_key = sha256(
    f"{account_id}|{page_id}|{endpoint}|{date_preset}|{campaign_id}|{adset_id}|{ad_id}"
)
```

### 4.3 Comportamiento

- **Cache hit:** si existe la clave en `api_cache`, devuelve `payload_json` directamente sin llamar a Meta.
- **Cache miss:** llama a Meta, guarda el resultado en `api_cache`, devuelve el resultado.
- **Sin TTL:** el caché es permanente. Si el usuario quiere datos frescos, deberá limpiar el caché manualmente (fuera del alcance de esta versión).
- **Sin invalidación automática:** simplicidad sobre complejidad.

### 4.4 Función helper en `duckdb/client.py`

```python
def get_cache(db_path: str, cache_key: str) -> dict | None: ...
def set_cache(db_path: str, cache_key: str, payload: dict) -> None: ...
```

---

## 5. Frontend — Componentes

### 5.1 Nuevos archivos

| Archivo | Responsabilidad |
|---------|----------------|
| `src/routes/PagesPage.tsx` | Lista de páginas por cuenta, tabla con métricas resumen |
| `src/components/PageCard.tsx` | Tarjeta individual de página (nombre, categoría, gasto, impresiones) |
| `src/components/KpiGrid.tsx` | 6 cards de KPI |
| `src/components/PlacementChart.tsx` | Barras horizontales por plataforma/posición |
| `src/components/ActionsChart.tsx` | Barras por categoría de acción |
| `src/components/TimeseriesChart.tsx` | Línea diaria de gasto + impresiones |
| `src/context/FilterContext.tsx` | Contexto global de filtros compartido por todos los bloques |

### 5.2 Archivos refactorizados

| Archivo | Cambio |
|---------|--------|
| `src/routes/DashboardPage.tsx` | Recibe `pageId` como param; usa `FilterContext`; carga bloques en paralelo |
| `src/components/GeoMap.tsx` | Conectar a nuevo endpoint `/pages/{page_id}/geo` |
| `src/api/client.ts` | Agregar funciones para los 6 endpoints nuevos |

### 5.3 Layout del DashboardPage

```
┌───────────────────────────────────────────────────────────┐
│ Breadcrumb: Cuentas > Páginas > [Nombre de la página]     │
├───────────────────────────────────────────────────────────┤
│ FilterBar: [Periodo ▼] [Campaña ▼] [Conjunto ▼] [Anuncio ▼] │
├──────────┬──────────┬──────────┬──────────┬──────┬────────┤
│  Gasto   │ Alcance  │  Impr.   │   CPM    │ CTR  │ Frec.  │ ← KpiGrid
├──────────────────────┬────────────────────────────────────┤
│ ¿Dónde se gastó?     │ ¿Dónde se vio?                     │
│ PlacementChart       │ GeoSection (mapa + tabla)          │
├──────────────────────┴────────────────────────────────────┤
│ ¿Qué generó? ActionsChart (5 categorías)                  │
├───────────────────────────────────────────────────────────┤
│ ¿Cómo evolucionó? TimeseriesChart (solo si ≥ 7 días)      │
└───────────────────────────────────────────────────────────┘
```

### 5.4 Principio de filtros

`FilterContext` expone: `{ datePreset, campaignId, adsetId, adId, setFilter }`.  
Todos los bloques del dashboard leen de este contexto. Cuando cambia cualquier filtro, **todos los bloques se re-fetchen automáticamente** via React Query con la nueva clave de caché.

---

## 6. Métricas del dashboard

| Métrica | Bloque | Por qué |
|---------|--------|---------|
| Gasto | KPI + Timeseries | Base de inversión |
| Alcance | KPI + Timeseries | Personas únicas |
| Impresiones | KPI + Timeseries | Volumen total de entregas |
| CPM | KPI | Eficiencia de dinero |
| CTR | KPI | Relevancia del creativo |
| Frecuencia | KPI | Alerta de saturación de audiencia |
| Spend por placement | PlacementChart | ¿Dónde se gastó el dinero? |
| Impresiones por región | GeoSection | ¿Dónde se vio? |
| Acciones por categoría | ActionsChart | ¿Qué resultados generó? |
| Gasto/Impresiones diarios | TimeseriesChart | ¿Cómo evolucionó? |

---

## 7. Criterios de aceptación

- [ ] Usuario pega token, ve sus cuentas publicitarias.
- [ ] Selecciona cuenta, ve lista de páginas con métricas ordenadas por gasto.
- [ ] Selecciona página, ve dashboard con los 6 KPIs.
- [ ] Cambia cualquier filtro (periodo, campaña, conjunto, anuncio) y todos los bloques se actualizan.
- [ ] Segunda consulta idéntica no llama a Meta — se sirve desde DuckDB.
- [ ] PlacementChart muestra barras con `publisher_platform` + `platform_position`.
- [ ] GeoSection muestra provincias ecuatorianas en mapa y tabla.
- [ ] ActionsChart agrupa en 5 categorías (Mensajería, Engagement, Tráfico, Video, Guardados).
- [ ] TimeseriesChart solo aparece si el periodo tiene ≥ 7 días.
- [ ] Breadcrumb muestra: Cuentas → Páginas → [Nombre de la página].

---

## 8. Lo que no entra en esta versión

- Autenticación propia de usuarios (el token es la identidad).
- TTL o invalidación automática de caché.
- Comparación de periodos.
- Exportación CSV/PDF.
- Métricas orgánicas (posts sin pauta).
- CPL o tracking de leads personalizado.

---

## 9. Decisiones técnicas tomadas

| Decisión | Razón |
|----------|-------|
| Caché permanente sin TTL | Simplicidad; los datos históricos no cambian |
| SHA256 como clave de caché | Determinista, colisiones prácticamente imposibles |
| Filtro por página via `adset.promoted_object_page_id` | Es el único campo de Meta que vincula campañas a páginas |
| Bloque Timeseries condicional (≥7 días) | Una línea con 1-2 puntos no es útil |
| React Query para fetching paralelo | Cada bloque carga independientemente; fallo en uno no bloquea otros |
| `publisher_platform,platform_position` como breakdowns, no fields | Requisito técnico de la API de Meta — error #100 si se ponen en fields |

---

*Documento generado tras sesión de brainstorming con el usuario. Aprobado sección por sección.*

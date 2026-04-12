# Market Radar Extendido — Spec de Diseño

**Fecha:** 2026-04-12  
**Contexto:** Oderbiz Analytics — Market Radar competidores con ranking por país y provincia  
**Objetivo:** Mostrar Top 5 competidores en Ecuador + Top 5 en provincia del cliente, con análisis de anuncios y mensajería para jefes de agencia.

---

## 1. Problema que resuelve

El Market Radar actual (2026-04-11) muestra competidores genéricos sin diferenciación geográfica. Jefe de agencia necesita:
- **Top 5 Ecuador:** panorama nacional
- **Top 5 Provincia:** competencia local específica
- **Detalles anuncios:** copy, creatividad, timing, plataformas
- **Sin datos económicos:** Meta no expone spend/impressions para ads comerciales

---

## 2. Entrada de usuario

En `PageDashboardPage.tsx`, botón "Radar de Mercado" existente abre `MarketRadarPanel` con dos secciones:

**Sección 1: Detección de Provincia**
```
✓ Provincia: Pichincha (Meta location • 100% confiable)
```

**Sección 2: Top 5 Ecuador**
- Cards con rank por actividad (anuncios activos)
- Cada card: nombre, página, ads activos/total, plataformas, últimos 10 anuncios

**Sección 3: Top 5 Provincia**
- Misma estructura, filtrado por provincia detectada

---

## 3. Flujo de datos

```
1. Usuario abre "Radar de Mercado"
   ↓
2. Frontend llama GET /competitor/market-radar-extended?page_id={pid}
   ↓
3. Backend: GET /{page_id} → categoría + ubicación cliente (provincia)
   ↓
4. Backend: Normaliza ubicación:
   - Si Meta location existe → provincia cliente confirmada (100%)
   - Si no → fallback a inferencia (nombre página, copy)
   ↓
5. Backend: search_ads_by_terms(category) en todos países
   ↓
6. Backend: Para cada página encontrada:
   - Inferir provincia (Meta location → heurística)
   - Obtener últimos 50 ads
   - Guardar en DuckDB tables (competitors, competitor_ads)
   ↓
7. Backend: Rankear por actividad (anuncios activos desc)
   ↓
8. Backend: Retornar Top 5 Ecuador + Top 5 Provincia
   ↓
9. Frontend: Renderizar dos secciones con anuncios expandibles
```

---

## 4. Arquitectura backend

### 4.1 Modelos DuckDB

**Tabla: `competitors`**
```sql
CREATE TABLE competitors (
  page_id STRING PRIMARY KEY,
  name STRING,
  category STRING,
  province_ec STRING,              -- "Loja", "Pichincha", NULL si desconocida
  province_confidence FLOAT,       -- 0.0-1.0 (1.0=Meta, 0.5=inferencia, 0.0=desconocida)
  province_source STRING,          -- "meta_location" | "page_name" | "ad_copy" | "landing_page" | "unknown"
  last_detected DATE,
  active_ads_count INT,            -- ads con delivery_stop_time null o futuro
  total_ads_count INT,
  platforms JSON,                  -- ["facebook", "instagram"]
  languages JSON,                  -- ["es", "en"]
  metadata JSON                    -- {"location_source": "...", "inferred_at": "...", ...}
)
```

**Tabla: `competitor_ads`**
```sql
CREATE TABLE competitor_ads (
  ad_id STRING PRIMARY KEY,
  page_id STRING REFERENCES competitors(page_id),
  ad_creative_bodies TEXT,         -- texto del anuncio
  ad_creative_link_titles TEXT,
  ad_creative_link_descriptions TEXT,
  ad_creative_link_captions TEXT,
  ad_snapshot_url STRING,          -- URL a visual del anuncio
  publisher_platforms JSON,        -- ["facebook", "instagram"]
  languages JSON,                  -- ["es", "en"]
  media_type STRING,               -- "image" | "video" | "carousel" | "none"
  ad_creation_time DATE,
  ad_delivery_start_time DATE,
  ad_delivery_stop_time DATE,
  is_active BOOL,
  detected_at TIMESTAMP DEFAULT NOW()
)
```

### 4.2 Servicio: InferenceService

**Función: `infer_province(page_id, page_name, ads)`**

Retorna: `(province: str|None, confidence: float, source: str)`

**Paso 1: Meta Location (confianza 1.0)**
```python
location = meta_api.get_page_location(page_id)
if location and location.city:
    province = normalize_city_to_province(location.city)
    return province, 1.0, "meta_location"
```

**Paso 2: Nombre Página (confianza 0.7)**
```python
provinces_ec = {
    "loja": "Loja", "pichincha": "Pichincha", "guayas": "Guayas",
    "tungurahua": "Tungurahua", "chimborazo": "Chimborazo", "imbabura": "Imbabura",
    "carchi": "Carchi", "sucumbíos": "Sucumbíos", "orellana": "Orellana",
    "pastaza": "Pastaza", "morona santiago": "Morona Santiago", "zamora": "Zamora Chinchipe",
    "santa elena": "Santa Elena", "santo domingo": "Santo Domingo de los Tsáchilas",
    "cotopaxi": "Cotopaxi", "manabí": "Manabí", "los ríos": "Los Ríos", 
    "el oro": "El Oro", "azuay": "Azuay", "cañar": "Cañar"
}
name_lower = page_name.lower()
for keyword, province in provinces_ec.items():
    if keyword in name_lower:
        return province, 0.7, "page_name"
```

**Paso 3: Copy Anuncio (confianza 0.5)**
```python
for ad in ads[:10]:  # revisar primeros 10
    copy = (ad.ad_creative_bodies + " " + ad.ad_creative_link_descriptions).lower()
    for keyword, province in provinces_ec.items():
        if f"en {keyword}" in copy or f"desde {keyword}" in copy:
            return province, 0.5, "ad_copy"
```

**Paso 4: Landing Page (confianza 0.4)**
```python
# Intentar extraer ciudad de snapshot URL o metadata pública
# Heurística simple: si landing_page contiene "/loja" o similar
for ad in ads[:5]:
    if ad.ad_snapshot_url and extract_city_from_url(ad.ad_snapshot_url):
        city = extract_city_from_url(ad.ad_snapshot_url)
        if city in provinces_ec:
            return provinces_ec[city], 0.4, "landing_page"
```

**Fallback: Desconocida**
```python
return None, 0.0, "unknown"
```

### 4.3 Endpoint: GET `/api/v1/competitor/market-radar-extended`

**Parámetros:**
- `page_id` (str, required): ID página cliente

**Response:**
```json
{
  "client_page": {
    "page_id": "1506380769434870",
    "name": "Centro de Psicología Integral y Terapia - Psicotelcon",
    "category": "Psicólogo",
    "province": "Pichincha",
    "province_confidence": 1.0,
    "province_source": "meta_location"
  },
  "ecuador_top5": [
    {
      "rank": 1,
      "page_id": "123456789",
      "name": "Psico Clinic Ecuador",
      "province": "Pichincha",
      "province_confidence": 1.0,
      "province_source": "meta_location",
      "active_ads": 15,
      "total_ads": 47,
      "last_detected": "2026-04-12",
      "platforms": ["facebook", "instagram"],
      "languages": ["es"],
      "ads": [
        {
          "id": "ad_123_001",
          "ad_creative_bodies": ["Terapia psicológica online para toda la familia..."],
          "ad_creative_link_titles": ["Reserva tu sesión hoy"],
          "ad_creative_link_descriptions": ["Psicólogos certificados. Primera sesión gratis."],
          "ad_creative_link_captions": ["Centro de Psicología"],
          "ad_snapshot_url": "https://www.facebook.com/ads/library/?id=...",
          "publisher_platforms": ["facebook", "instagram"],
          "languages": ["es"],
          "media_type": "image",
          "ad_creation_time": "2026-04-01",
          "ad_delivery_start_time": "2026-04-01",
          "ad_delivery_stop_time": "2026-04-15",
          "is_active": false
        },
        ... (máximo 10 anuncios)
      ]
    },
    ... (máximo 5 competidores)
  ],
  "province_top5": [
    // Mismo estructura, filtrado por client_page.province
    // Solo competidores con province == client_page.province
  ],
  "metadata": {
    "total_competitors_detected": 42,
    "ecuador_competitors": 42,
    "province_competitors": 8,
    "last_sync": "2026-04-12T10:30:00Z",
    "sync_duration_seconds": 12.5
  }
}
```

**Límites:**
- `search_ads_by_terms`: limit=20 páginas
- Ads por página: últimos 50 obtenidos, top 10 en response
- Timeout total: 30s (asyncio.gather)

---

## 5. Arquitectura frontend

### 5.1 Hook: `useMarketRadarExtended`

```ts
function useMarketRadarExtended(pageId: string | null) {
  // Llama fetchMarketRadarExtended solo si pageId
  // Retorna: { data, isLoading, error }
  // React Query: queryKey=["market-radar-extended", pageId], staleTime=10min
}
```

### 5.2 Componente: `MarketRadarPanel` (existente, modificado)

Props: `{ pageId: string; onClose: () => void }`

Estructura:
```
├── Header: "🎯 Radar de Mercado — [categoría]" + ✕
├── Info provincia detectada (Meta location • X% confiable)
├── [useMarketRadarExtended(pageId)]
├── Skeleton loading
├── Si error: Alert destructive
└── Si data:
    ├── TopAdvertisersEcuador
    │   ├── Ranking Top 5
    │   └── Cards con anuncios expandibles
    └── TopAdvertisersProvince
        ├── Ranking Top 5 [provincia]
        └── Cards con anuncios expandibles
```

### 5.3 Componentes nuevos

**`TopAdvertisersSection.tsx`**
Props: `{ competitors, title, onSelectCompetitor }`
- Renderiza table/cards de Top 5
- Cada fila expandible para ver anuncios

**`CompetitorCard.tsx`**
Props: `{ competitor, onSelectCompetitor }`
- Nombre, provincia, ads count
- [▼ Ver últimos 10 anuncios]
- Anuncios en grid o list

**`AdPreview.tsx`**
Props: `{ ad }`
- Thumbnail (ad_snapshot_url)
- Texto truncado
- Click para expandir modal

**`AdModal.tsx`**
Props: `{ ad }`
- Full visual (snapshot)
- Texto + copy completo
- Plataformas, idiomas, fechas
- Rango de pautaje (ad_delivery_start_time → ad_delivery_stop_time)

---

## 6. Cambios en archivos existentes

**`backend/src/oderbiz_analytics/api/routes/competitor.py`**
- ✅ Ya existe `/market-radar` (2026-04-11)
- Agregar: `/market-radar-extended` endpoint
- Agregar: `InferenceService` import

**`backend/src/oderbiz_analytics/adapters/meta/client.py`**
- Agregar método: `get_page_location(page_id)` → retorna `{city, state, country, street, zip}`

**`backend/src/oderbiz_analytics/services/inference_service.py`** (nuevo)
- Clase `ProvinceInferenceService`
- Método: `infer_province(page_id, page_name, ads)`

**`frontend/src/components/MarketRadarPanel.tsx`** (modificar)
- Importar `TopAdvertisersSection`, `CompetitorCard`, `AdPreview`, `AdModal`
- Agregar segundo dataset: `province_top5`
- Renderizar dos secciones lado a lado

**`frontend/src/hooks/useMarketRadarExtended.ts`** (nuevo)
- Query React Query para `market-radar-extended`

---

## 7. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Sin categoría en Meta | Usa nombre página como search_term |
| Sin competidores en Ecuador | "No encontramos competidores en este segmento. Intenta en otro período." |
| Sin competidores en provincia | "No hay competidores detectados en [provincia]. Mostrando Top 5 Ecuador." |
| Meta API error (403) | "Token sin permisos ads_read. Requiere Ad Library API." |
| Inferencia provincia falla en todas heurísticas | Muestra "Ubicación desconocida • Confianza 0%" |
| DuckDB insert falla | Log error, devuelve datos en tiempo real (sin persistencia para ese sync) |
| Timeout > 30s | Retorna resultados parciales con nota "Algunos datos no se cargaron" |

**Frontend:**
- Loading skeletons mientras carga
- Error alerts (destructive variant)
- Toast success: "Datos guardados en base de datos"

---

## 8. Lo que este módulo NO hace

- ❌ Comparativas estadísticas (no hay datos confiables)
- ❌ Benchmarking vs cliente (imposible sin datos económicos)
- ❌ Predicción de ROI o gasto (Meta no expone para ads comerciales)
- ❌ Overrides manuales de Top 5 (feature v2)
- ❌ Google Trends (extensión futura)
- ❌ YouTube stats (extensión futura)
- ❌ delivery_by_region (solo ads políticos)

---

## 9. Criterios de éxito

**Backend:**
- ✅ Endpoint devuelve Top 5 Ecuador + Top 5 Provincia
- ✅ Inferencia provincia funciona (Meta location → fallback)
- ✅ DuckDB persiste competidores detectados
- ✅ Últimos 10 anuncios por competidor incluyen todos los campos
- ✅ Timeout < 30s

**Frontend:**
- ✅ Dos secciones claras (Ecuador + Provincia)
- ✅ Cards expandibles muestran anuncios
- ✅ Visual de ads carga (snapshot_url)
- ✅ Lado a lado con dashboard del cliente (izq/der split)
- ✅ Loading states y error handling

---

## 10. Dependencias

| Librería | Versión | Uso |
|---|---|---|
| DuckDB | (actual) | Persistencia competidores |
| FastAPI | (actual) | Endpoint |
| asyncio | (actual) | Llamadas paralelas Meta API |
| React Query | (actual) | Frontend caching |
| shadcn/ui | (actual) | Components UI |

---

## 11. Timeline estimado

- **Backend:** 2-3 días (modelos + inferencia + endpoint)
- **Frontend:** 2-3 días (componentes + UI)
- **Testing:** 1 día
- **Total:** 1 sprint (5-6 días)

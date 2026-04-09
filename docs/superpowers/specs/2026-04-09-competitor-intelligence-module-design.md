# Módulo de Inteligencia Competitiva Meta — Spec de Diseño

**Fecha:** 2026-04-09  
**Contexto:** Dashboard de página (`PageDashboardPage.tsx`) dentro de Oderbiz Analytics  
**Objetivo:** Permitir comparar la actividad publicitaria propia contra un competidor seleccionado, usando la Meta Ad Library API, sin salir del dashboard.

---

## 1. Resumen funcional

El usuario puede buscar una página de Facebook competidora desde el dashboard de página. Al seleccionarla, la pantalla se divide en dos columnas: el dashboard existente a la izquierda (reducido al 50% del ancho) y un panel de inteligencia competitiva a la derecha. El panel puede cerrarse para volver al layout de ancho completo.

---

## 2. Entry point UI

- Se agrega un botón **"Buscar competidor"** a la derecha del selector "Filtrar por campaña" (línea ~231 de `PageDashboardPage.tsx`).
- Al hacer clic, aparece un `Input` inline con un dropdown de sugerencias.
- Se escribe el nombre del competidor y el dropdown muestra páginas sugeridas (nombre + categoría).
- Al seleccionar una página, el botón se reemplaza por el nombre del competidor + botón **X** para cerrar.
- Cerrar el panel → `selectedCompetitor = null` → layout vuelve a ancho completo.

---

## 3. Split layout

```
Sin competidor seleccionado:
  <div className="w-full space-y-6">   ← comportamiento actual sin cambios

Con competidor seleccionado:
  <div className="flex gap-4 transition-all duration-300">
    <div className="w-1/2 min-w-0">   ← dashboard existente (todos los módulos actuales)
    <div className="w-1/2 min-w-0">   ← CompetitorPanel
```

En viewport < 1024px (`lg`): las dos columnas se apilan verticalmente (competidor debajo del dashboard).

---

## 4. Arquitectura de archivos

### Backend — nuevo router

**`backend/src/oderbiz_analytics/api/routes/competitor.py`**

```
GET /api/v1/competitor/search?q={query}
```
- Proxea `GET /pages/search?q={query}&fields=id,name,category,fan_count` en la Meta Graph API.
- Requiere token en header `Authorization: Bearer {token}` (igual al resto del sistema).
- Devuelve: `{ data: [{ id, name, category, fan_count }] }`
- Mínimo 2 caracteres para disparar la búsqueda.

```
GET /api/v1/competitor/{page_id}/ads
```
- Proxea `GET /ads_archive` con:
  - `search_page_ids={page_id}`
  - `ad_reached_countries=["CO","MX","AR","CL","PE","US","ES"]` (default fijo)
  - `fields=id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,publisher_platforms,languages,page_name,page_id`
  - `ad_active_status=ALL`
  - `limit=50`
- Devuelve: `{ data: [...], page_name: str, page_id: str }`

Registrar en `main.py` bajo prefijo `/api/v1`.

### Frontend — nuevos archivos

```
frontend/src/
  hooks/
    useCompetitorSearch.ts
  components/
    CompetitorPanel.tsx
    competitor/
      RadarTable.tsx
      CreativeLibrary.tsx
      IntensityIndex.tsx
      MarketMap.tsx
```

### Frontend — archivos modificados

```
frontend/src/api/client.ts              ← +2 funciones y sus interfaces
frontend/src/routes/PageDashboardPage.tsx  ← estado + split layout + botón
```

---

## 5. Funciones API cliente

### `searchCompetitorPages(query: string)`
```ts
GET /api/v1/competitor/search?q={query}
→ Promise<{ data: CompetitorPageSuggestion[] }>

interface CompetitorPageSuggestion {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
}
```

### `fetchCompetitorAds(pageId: string)`
```ts
GET /api/v1/competitor/{pageId}/ads
→ Promise<CompetitorAdsResponse>

interface CompetitorAdItem {
  id: string;
  ad_creation_time?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string | null;
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  languages?: string[];
  page_name?: string;
  page_id?: string;
}

interface CompetitorAdsResponse {
  data: CompetitorAdItem[];
  page_name: string;
  page_id: string;
}
```

---

## 6. Hook `useCompetitorSearch`

- Acepta el `query` string como parámetro.
- Debounce de 300ms antes de llamar `searchCompetitorPages`.
- No llama si `query.length < 2`.
- Retorna `{ suggestions, isLoading, error }`.
- Implementado con `useState` + `useEffect` + `AbortController` (sin React Query — es búsqueda efímera).

---

## 7. Componente `CompetitorPanel`

Props: `{ pageId: string; pageName: string; onClose: () => void }`

Estructura interna:
```
CompetitorPanel
  ├── Header: nombre de la página + botón X
  ├── [useQuery fetchCompetitorAds(pageId)]
  ├── Skeleton (loading)
  ├── RadarTable       ← sección 1
  ├── CreativeLibrary  ← sección 2
  ├── IntensityIndex   ← sección 3
  └── MarketMap        ← sección 4
```

Todos los sub-componentes reciben `data: CompetitorAdItem[]` como prop. No hacen fetch propio.

---

## 8. Las 4 vistas del panel

### 8.1 Radar competitivo (`RadarTable`)
Tabla resumen calculada client-side:

| Campo | Cálculo |
|---|---|
| Anuncios activos | items donde `ad_delivery_stop_time` es null o en el futuro |
| Anuncios inactivos | resto |
| Vida media (días) | promedio de `(stop - start)` en items con stop conocido |
| Plataformas usadas | union de todos los `publisher_platforms` |
| Formato predominante | inferido de si `ad_snapshot_url` contiene "video" o del campo `media_type` si existe |

### 8.2 Biblioteca creativa (`CreativeLibrary`)
Grid de tarjetas. Cada tarjeta muestra:
- `ad_creative_bodies[0]` (copy principal, truncado a 120 chars)
- `ad_creative_link_titles[0]` (título del CTA)
- `ad_delivery_start_time` formateado
- Plataformas como badges
- Link a `ad_snapshot_url` ("Ver anuncio →")

### 8.3 Índice de intensidad (`IntensityIndex`)
Score numérico 0–100 calculado así:
```
score = (anuncios_activos / 50 * 40)
      + (vida_media_dias / 30 * 30)
      + (num_plataformas / 3 * 30)
```
Clampeado a 100. Se muestra como barra de progreso con etiqueta cualitativa:
- 0–30: Baja presión
- 31–60: Presión media
- 61–100: Alta presión

### 8.4 Mapa de mercado (`MarketMap`)
Tres bloques visuales:
- **Plataformas:** conteo de anuncios por plataforma (Facebook, Instagram, etc.) como bar chart horizontal
- **Idiomas:** lista de idiomas detectados con frecuencia
- **Cobertura:** los países del request default (`CO, MX, AR, CL, PE, US, ES`) mostrados como tags indicando que son los países monitoreados

---

## 9. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Query < 2 chars | No llama API, dropdown oculto |
| Sin sugerencias | "Sin páginas encontradas" en dropdown |
| Error de red en búsqueda | Inline error debajo del input |
| Competidor sin anuncios | "Este competidor no tiene anuncios activos en los países monitoreados" |
| Error 403 de Meta (sin permiso `ads_read`) | "Tu token no tiene acceso al Ad Library API. Requiere el permiso `ads_read`" |
| Loading de ads | Skeleton en cada sección del panel |

---

## 10. Cambios en `PageDashboardPage`

Estado nuevo:
```ts
const [selectedCompetitor, setSelectedCompetitor] = useState<{
  id: string;
  name: string;
} | null>(null);
const [showCompetitorSearch, setShowCompetitorSearch] = useState(false);
```

Layout condicional:
- Sin competidor: `<div className="w-full space-y-6">` (comportamiento actual)
- Con competidor: `<div className="flex gap-4">` con dos hijos `w-1/2`

El contenido existente (KpiGrid, RetentionModule, ConversionFunnelCard, TrafficQualityCard, GeoMap, ChoroplethMap, AdDiagnosticsTable) se mueve dentro del `div` izquierdo sin ningún otro cambio.

---

## 11. Lo que este módulo NO hace

- No trae CTR, CPA, CPC, CPM ni conversiones reales de terceros (no disponible en Ad Library API).
- No permite comparar métricas financieras exactas entre tu cuenta y el competidor.
- No persiste el competidor seleccionado entre sesiones.
- No soporta comparar más de un competidor a la vez en esta versión.

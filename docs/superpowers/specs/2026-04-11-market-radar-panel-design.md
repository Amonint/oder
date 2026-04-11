# Radar de Mercado — Spec de Diseño

**Fecha:** 2026-04-11
**Contexto:** Dashboard de página (`PageDashboardPage.tsx`) dentro de Oderbiz Analytics
**Objetivo:** Dado el token Meta de cualquier cliente, auto-descubrir quién más está pautando en el mismo segmento y presentar inteligencia de mercado accionable para decisiones de presupuesto publicitario.

---

## 1. Problema que resuelve

El módulo "Buscar competidor" existente requiere que el usuario ya sepa quién es su competidor.
Este módulo responde la pregunta previa: **¿quién más está pautando en mi segmento y dónde debo invertir yo?**

---

## 2. Entry point UI

En `PageDashboardPage.tsx`, junto al botón "Buscar competidor" existente, se agrega un segundo botón: **"Radar de Mercado"**.

- Al hacer click: abre el panel derecho con el mismo split layout ya implementado (`lg:w-1/2`)
- El panel izquierdo (dashboard del cliente) permanece sin cambios
- "Radar de Mercado" y "Buscar competidor" son mutuamente excluyentes — abrir uno cierra el otro
- El panel se cierra con botón ✕ en el header del panel

```
Sin panel:
┌──────────────────────────────────────────┐
│  Dashboard cliente (ancho completo)      │
└──────────────────────────────────────────┘

Con Radar de Mercado:
┌────────────────────┬─────────────────────┐
│  Dashboard cliente │  🎯 Radar de Mercado│
│  lg:w-1/2          │  lg:w-1/2           │
└────────────────────┴─────────────────────┘
```

En viewport < 1024px: paneles apilados verticalmente, Radar debajo del dashboard.

---

## 3. Flujo de datos

```
1. Usuario abre "Radar de Mercado"
        ↓
2. Frontend llama GET /competitor/market-radar?page_id={pid}
        ↓
3. Backend: GET /{pid}?fields=category,name → extrae category
        ↓
4. Backend: mapea category → keywords del segmento
   "Education" → ["educación superior", "universidad", "rector", "liderazgo académico"]
        ↓
5. Backend: search_ads_by_terms(keywords) → lista de páginas con ads
        ↓
6. Backend: para cada página → get_ads_archive(page_id) → ads completos
        ↓
7. Backend: agrega y devuelve estructura MarketRadarResponse
        ↓
8. Frontend: renderiza MarketRadarPanel con 4 secciones
```

---

## 4. Arquitectura de archivos

### Backend — nuevo endpoint

**`backend/src/oderbiz_analytics/api/routes/competitor.py`** — agregar:

```
GET /api/v1/competitor/market-radar?page_id={page_id}
```

Parámetros:
- `page_id` (str, required): ID de la página del cliente

Respuesta `MarketRadarResponse`:
```python
{
  "client_page": {
    "page_id": str,
    "name": str,
    "category": str,
    "keywords_used": list[str]
  },
  "competitors": [
    {
      "page_id": str,
      "name": str,
      "active_ads": int,        # ads con ad_delivery_stop_time null o futuro
      "total_ads": int,
      "platforms": list[str],   # union de publisher_platforms
      "countries": list[str],   # union de ad_reached_countries
      "languages": list[str],   # union de languages
      "media_types": list[str], # union de media_type
      "latest_ad_date": str,    # max ad_creation_time
      "monthly_activity": dict  # {"2026-01": 3, "2026-02": 5, ...}
    }
  ],
  "market_summary": {
    "top_countries": [{"country": "CO", "advertiser_count": 8}, ...],
    "top_platforms": [{"platform": "facebook", "ad_count": 120}, ...],
    "top_words": [{"word": "internacionalización", "count": 34}, ...],
    "monthly_market_activity": dict  # actividad agregada de todos los competidores
  }
}
```

**`backend/src/oderbiz_analytics/adapters/youtube/client.py`** — nuevo:

```python
GET https://www.googleapis.com/youtube/v3/channels
  ?part=statistics,snippet
  &forHandle={handle}
  &key={YOUTUBE_API_KEY}
```

Devuelve: `subscriberCount`, `viewCount`, `videoCount`, `publishedAt`, `title`
Quota cost: 1 unit por llamada.

**`backend/src/oderbiz_analytics/adapters/trends/client.py`** — nuevo:

```python
pytrends.build_payload(kw_list=[term1, term2], geo='', timeframe='today 12-m')
interest_over_time()  # series de tiempo comparativa
interest_by_region(resolution='COUNTRY')  # por país
```

### Backend — nuevo archivo de configuración

**`backend/src/oderbiz_analytics/config.py`** — agregar:
```
YOUTUBE_API_KEY: str = ""  # opcional, habilita sección YouTube
```

### Frontend — nuevos archivos

```
frontend/src/
  components/
    MarketRadarPanel.tsx          ← componente principal del panel
    market-radar/
      TopAdvertisers.tsx          ← sección 1
      GeoOpportunity.tsx          ← sección 2
      MarketSeasonality.tsx       ← sección 3
      MessageIntelligence.tsx     ← sección 4
  hooks/
    useMarketRadar.ts             ← fetch + estado del panel
  api/
    client.ts                     ← +1 función fetchMarketRadar
```

### Frontend — archivos modificados

```
frontend/src/routes/PageDashboardPage.tsx  ← +botón + estado marketRadarOpen
```

---

## 5. Endpoint GET /competitor/market-radar

### Mapeo de categorías Meta → keywords

```python
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Education": ["educación superior", "universidad", "rector", "liderazgo académico"],
    "Hotel": ["hotel", "hospedaje", "turismo", "alojamiento"],
    "Restaurant": ["restaurante", "gastronomía", "comida", "chef"],
    "Health": ["salud", "clínica", "médico", "bienestar"],
    # fallback si categoría no mapeada:
    "_default": ["{page_name}"]  # usa el nombre de la página como keyword
}
```

Si la categoría no está en el mapa → usa el nombre de la página como search term.

### Lógica de aggregation (backend, client-side del servidor)

**active_ads:** `ad_delivery_stop_time` es null O es fecha futura

**top_words:** tokenizar `ad_creative_bodies` + `ad_creative_link_titles`, filtrar stopwords ES/PT/EN, top 10 por frecuencia

**monthly_activity:** agrupar `ad_creation_time` por `YYYY-MM`, contar ads

**top_countries:** agrupar `ad_reached_countries` por país, contar páginas únicas que tienen ads en ese país

### Límites de la llamada

- `search_ads_by_terms`: `limit=20` (máximo 20 páginas del segmento)
- `get_ads_archive` por página: `limit=50` ads
- Timeout total: 30s (llamadas en paralelo con `asyncio.gather`)

---

## 6. Hook `useMarketRadar`

```ts
function useMarketRadar(pageId: string | null) {
  // Llama fetchMarketRadar solo cuando pageId no es null
  // Retorna: { data, isLoading, error }
  // Implementado con React Query (queryKey: ["market-radar", pageId])
  // staleTime: 10 minutos (datos de mercado no cambian tan rápido)
}
```

---

## 7. Componente `MarketRadarPanel`

Props: `{ pageId: string; onClose: () => void }`

Estructura:
```
MarketRadarPanel
  ├── Header: "🎯 Radar de Mercado — [categoría detectada]" + botón ✕
  ├── Keywords chip list: "educación superior" "universidad" ...
  ├── [useMarketRadar(pageId)]
  ├── Skeleton (loading: 1 card esqueleto por sección)
  └── Cuando data disponible:
      ├── TopAdvertisers       ← sección 1
      ├── GeoOpportunity       ← sección 2
      ├── MarketSeasonality    ← sección 3
      └── MessageIntelligence  ← sección 4
```

Todos los sub-componentes reciben `data: MarketRadarResponse` como prop.

---

## 8. Las 4 secciones del panel

### 8.1 TopAdvertisers

Tabla con columnas: Página | Ads activos | Plataformas | Países | Ver →

- Fila del cliente resaltada con badge "Tú"
- Click en "Ver →" → llama `onSelectCompetitor(page_id, name)` que activa el `CompetitorPanel` existente (reemplaza el MarketRadarPanel)
- Ordenada por `active_ads` descendente
- Si `active_ads === 0`: fila con opacidad reducida

### 8.2 GeoOpportunity

Tabla de países ordenada por `advertiser_count` descendente:

```
País  | Anunciantes activos | Insight
CO    |         8           | Alta competencia
MX    |         5           | Competencia media
EC    |         1           | ⚡ Baja competencia
HN    |         0           | 🔥 Sin competencia
```

Insight automático: países con 0 o 1 competidores muestran badge "Oportunidad".

No requiere tabla externa de IES — solo datos de Ad Library.

### 8.3 MarketSeasonality

Bar chart horizontal: meses (eje Y) vs conteo de ads del mercado (eje X).
Usa el componente `chart` existente de shadcn/ui.
Muestra últimos 6 meses de `market_summary.monthly_market_activity`.
Tooltip: "El mercado publica más en marzo–abril".

### 8.4 MessageIntelligence

Lista de top 10 palabras/frases con barra de frecuencia relativa.
Debajo: campo comparativo — "¿Usas estas palabras en tus ads?" (comparar contra los creative bodies del cliente, calculado client-side).

---

## 9. YouTube on-demand (opcional, si YOUTUBE_API_KEY configurada)

En `TopAdvertisers`, cada fila tiene un botón expandible "▶ YouTube".
Al expandir: llama `GET /competitor/{page_id}/youtube-stats?handle={handle}`.
Muestra: suscriptores, videos, último upload.

Si `YOUTUBE_API_KEY` no está configurada: la columna no aparece.

---

## 10. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Categoría no mapeada | Usa nombre de página como keyword, muestra banner amarillo "Usando nombre de página como búsqueda" |
| Sin competidores encontrados | "No encontramos páginas con anuncios activos en este segmento. Intenta con otro periodo." |
| Error Meta API (403) | "Token sin permiso `ads_read`. Requiere activar Ad Library API." |
| Timeout > 30s | Muestra resultados parciales con nota "Algunos datos no pudieron cargarse" |
| YouTube API key ausente | Sección YouTube oculta sin error |

---

## 11. Cambios en PageDashboardPage

Estado nuevo:
```ts
const [marketRadarOpen, setMarketRadarOpen] = useState(false);
```

Regla de exclusión mutua:
```ts
// Abrir Radar cierra CompetitorPanel
function openMarketRadar() {
  setSelectedCompetitor(null);
  setMarketRadarOpen(true);
}
// Abrir CompetitorPanel cierra Radar
function openCompetitor(id, name) {
  setMarketRadarOpen(false);
  setSelectedCompetitor({ id, name });
}
```

El layout derecho muestra `MarketRadarPanel` si `marketRadarOpen`, o `CompetitorPanel` si `selectedCompetitor`, o nada.

---

## 12. Lo que este módulo NO hace

- No muestra gasto publicitario de competidores (imposible — Meta no lo expone)
- No da granularidad por ciudad o provincia (solo países — `delivery_by_region` solo aplica a ads políticos)
- No persiste competidores entre sesiones
- No requiere base de datos externa (UNESCO, BigQuery, etc.)
- No usa Cloud Scheduler ni GCP
- No hace web scraping
- Google Trends no está en el MVP — es extensión futura si pytrends resulta estable

---

## 13. Dependencias externas nuevas

| Dependencia | Versión | Por qué |
|---|---|---|
| `pytrends` | ≥4.9 | Google Trends (extensión futura, no MVP) |
| `google-api-python-client` | ≥2.x | YouTube Data API v3 (opcional) |

El MVP funciona SIN estas dependencias si `YOUTUBE_API_KEY` no está configurada.

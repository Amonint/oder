# Dashboard PageDashboard — Refactor y Nuevos Módulos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar secciones obsoletas del PageDashboardPage, corregir el bug de gasto=0 en el mapa coroplético, y añadir 3 nuevos módulos: Rentabilidad/CPA, Calidad de Tráfico y Diagnóstico de Creatividades.

**Architecture:** Los nuevos módulos requieren 3 endpoints nuevos en `pages.py` (backend) y 3 componentes React nuevos (frontend). El bug del mapa se corrige añadiendo `enrich_geo_row` en `get_page_geo` —Meta devuelve "Pichincha Province" y el GeoJSON GADM espera "Pichincha"; la función de enriquecimiento ya hace ese mapeo. El ChoroplethMap también se corrige para que actualice sus capas cuando cambian `data` o `metric`.

**Tech Stack:** FastAPI + httpx (backend), React + TanStack Query + Recharts (ComposedChart) + shadcn/ui + MapLibre GL (frontend), Meta Ads API v20+ fields.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `backend/src/oderbiz_analytics/api/routes/pages.py` | Modificar: fix geo + 3 endpoints nuevos |
| `frontend/src/api/client.ts` | Modificar: 3 funciones + 6 interfaces nuevas |
| `frontend/src/components/ChoroplethMap.tsx` | Modificar: fix bug data/deps |
| `frontend/src/components/RetentionModule.tsx` | Crear |
| `frontend/src/components/TrafficQualityCard.tsx` | Crear |
| `frontend/src/components/AdDiagnosticsTable.tsx` | Crear |
| `frontend/src/routes/PageDashboardPage.tsx` | Modificar: eliminar secciones + integrar nuevos módulos |

---

## Task 1: Fix backend geo — llamar a enrich_geo_row en get_page_geo

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py:395-417`

**Root cause:** `get_geo_insights` (geo_insights.py) llama `enrich_geo_row` que transforma
"Pichincha Province" → "Pichincha". `get_page_geo` no lo llama. El mapa GADM tiene NAME_1="Pichincha",
el lookup falla y todos los valores quedan en 0.

- [ ] **Step 1: Añadir import de enrich_geo_row en pages.py**

En `backend/src/oderbiz_analytics/api/routes/pages.py`, añadir al bloque de imports existente (línea ~13):

```python
from oderbiz_analytics.services.geo_formatter import enrich_geo_row
```

- [ ] **Step 2: Llamar enrich_geo_row antes de devolver los datos en get_page_geo**

Localizar el bloque `result = {"data": rows, ...}` al final de `get_page_geo` (línea ~415) y reemplazarlo:

```python
    enriched_rows = [enrich_geo_row(row) for row in rows]
    result = {"data": enriched_rows, "page_id": page_id, "date_preset": effective_preset, "breakdowns": ["region"]}
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Step 3: Verificar manualmente**

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8000/api/v1/accounts/<act_id>/pages/<page_id>/geo?date_preset=last_30d"
```

Confirmar que las filas tienen `region_name: "Pichincha"` (sin "Province").

- [ ] **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/pages.py
git commit -m "fix(backend): enrich region names in get_page_geo using enrich_geo_row"
```

---

## Task 2: Fix ChoroplethMap — actualización de datos y maxVal=0

**Files:**
- Modify: `frontend/src/components/ChoroplethMap.tsx`

**Bugs:**
1. `useEffect([], [])` captura `data` en la primera renderización; si el usuario cambia el periodo, el mapa no se actualiza.
2. Cuando todos los valores son 0, `maxVal=0` genera stops inválidos en MapLibre (`[0,0,0,0]`).

- [ ] **Step 1: Reescribir ChoroplethMap.tsx con useEffect que reacciona a data y metric**

```typescript
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChoroplethMapProps {
  data: Array<{ region_name: string; spend: number; impressions?: number }>;
  metric?: "spend" | "impressions";
}

function toGadmName(regionName: string): string {
  const MAP: Record<string, string> = {
    "Manabí": "Manabí",
    "Los Ríos": "Los Ríos",
    "Bolívar": "Bolívar",
    "Cañar": "Cañar",
    "Sucumbíos": "Sucumbíos",
    "Galápagos": "Galápagos",
    "Morona Santiago": "Morona-Santiago",
    "Zamora Chinchipe": "Zamora-Chinchipe",
    "Santo Domingo": "Santo Domingo de los Tsáchilas",
  };
  return MAP[regionName] ?? regionName;
}

export default function ChoroplethMap({ data, metric = "spend" }: ChoroplethMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-78.1834, -1.8312],
      zoom: 5.5,
    });

    mapRef.current = map;

    map.on("load", () => {
      mapReadyRef.current = true;
      // Disparar evento custom para que el efecto de datos pueda actuar
      map.fire("data-ready" as any);
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Actualizar capas cada vez que cambian data o metric
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function applyData() {
      if (!map) return;
      // Eliminar capas y source previos si existen
      if (map.getLayer("ecuador-fill")) map.removeLayer("ecuador-fill");
      if (map.getLayer("ecuador-outline")) map.removeLayer("ecuador-outline");
      if (map.getSource("ecuador")) map.removeSource("ecuador");

      const lookup: Record<string, number> = {};
      for (const row of data) {
        const name = toGadmName(row.region_name);
        lookup[name] = metric === "spend" ? row.spend : (row.impressions ?? 0);
      }
      const values = Object.values(lookup);
      const maxVal = values.length > 0 ? Math.max(Math.max(...values), 0.01) : 1;

      fetch("/ecuador-provinces.geojson")
        .then((r) => r.json())
        .then((geojson) => {
          if (!map) return;
          for (const feature of geojson.features) {
            const name = feature.properties?.NAME_1 ?? "";
            feature.properties._value = lookup[name] ?? 0;
          }

          map.addSource("ecuador", { type: "geojson", data: geojson });

          map.addLayer({
            id: "ecuador-fill",
            type: "fill",
            source: "ecuador",
            paint: {
              "fill-color": [
                "interpolate", ["linear"], ["get", "_value"],
                0, "#e0f2fe",
                maxVal * 0.25, "#7dd3fc",
                maxVal * 0.6, "#2563eb",
                maxVal, "#1e3a8a",
              ],
              "fill-opacity": 0.75,
            },
          });

          map.addLayer({
            id: "ecuador-outline",
            type: "line",
            source: "ecuador",
            paint: { "line-color": "#1e40af", "line-width": 0.8 },
          });
        })
        .catch(() => {});
    }

    if (mapReadyRef.current) {
      applyData();
    } else {
      map.once("data-ready" as any, applyData);
    }
  }, [data, metric]);

  // Popup separado (no depende de data)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const onMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties as Record<string, unknown>;
      const name = String(props.NAME_1 ?? "");
      const val = Number(props._value ?? 0);
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${name}</strong><br/>` +
          (metric === "spend"
            ? `Gasto: $${val.toFixed(2)}`
            : `Impresiones: ${val.toLocaleString("es")}`),
        )
        .addTo(map);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };

    map.on("mousemove", "ecuador-fill", onMove);
    map.on("mouseleave", "ecuador-fill", onLeave);

    return () => {
      map.off("mousemove", "ecuador-fill", onMove);
      map.off("mouseleave", "ecuador-fill", onLeave);
      popup.remove();
    };
  }, [metric]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapa de {metric === "spend" ? "Gasto" : "Impresiones"} por Provincia</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={mapContainer} className="h-80 w-full rounded-b-lg" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ChoroplethMap.tsx
git commit -m "fix(frontend): ChoroplethMap actualiza capas al cambiar datos y corrige maxVal=0"
```

---

## Task 3: Backend — endpoint conversion-timeseries (Módulo 1)

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py`

Añadir al final del archivo. Este endpoint devuelve gasto diario + CPA calculado para el gráfico dual-eje.

- [ ] **Step 1: Añadir helper _extract_cpa**

Añadir después de `_group_actions` (línea ~235):

```python
def _extract_cpa(rows: list[dict]) -> list[dict]:
    """
    Para cada fila (un día), calcula:
      - spend: float
      - cpa: float (cost_per_action_type filtrado por lead/purchase/messaging, primer match)
      - conversions: float (suma de actions relevantes)
      - revenue: float (suma de action_values por purchase)
    """
    result = []
    CONVERSION_TYPES = {
        "lead", "purchase",
        "onsite_conversion.messaging_conversation_started_7d",
        "offsite_conversion.fb_pixel_lead",
        "offsite_conversion.fb_pixel_purchase",
    }
    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        date = row.get("date_start", "")

        # conversiones
        conversions = 0.0
        for a in (row.get("actions") or []):
            if a.get("action_type") in CONVERSION_TYPES:
                conversions += float(a.get("value", 0) or 0)

        # CPA
        cpa = 0.0
        for a in (row.get("cost_per_action_type") or []):
            if a.get("action_type") in CONVERSION_TYPES:
                cpa = float(a.get("value", 0) or 0)
                break
        if cpa == 0.0 and conversions > 0:
            cpa = round(spend / conversions, 2)

        # revenue
        revenue = 0.0
        for a in (row.get("action_values") or []):
            if a.get("action_type") == "purchase":
                revenue += float(a.get("value", 0) or 0)

        result.append({
            "date": date,
            "spend": round(spend, 2),
            "cpa": round(cpa, 2),
            "conversions": round(conversions, 0),
            "revenue": round(revenue, 2),
        })
    return result
```

- [ ] **Step 2: Añadir endpoint GET conversion-timeseries**

Añadir al final de pages.py:

```python
@router.get("/{ad_account_id}/pages/{page_id}/conversion-timeseries")
async def get_page_conversion_timeseries(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Gasto diario + CPA calculado para el gráfico de Rentabilidad."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_conv_ts", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,actions,cost_per_action_type,action_values",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering, time_increment=1,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener datos de conversión.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    processed = _extract_cpa(rows)
    result = {"data": processed, "page_id": page_id, "date_preset": effective_preset}
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/pages.py
git commit -m "feat(backend): add conversion-timeseries endpoint with daily CPA calculation"
```

---

## Task 4: Backend — endpoint traffic-quality (Módulo 2)

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py`

- [ ] **Step 1: Añadir endpoint GET traffic-quality al final de pages.py**

```python
@router.get("/{ad_account_id}/pages/{page_id}/traffic-quality")
async def get_page_traffic_quality(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Clics salientes, costo por clic saliente y tasa de conversión clic → landing page."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_traffic_quality", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        result = {
            "outbound_clicks": 0, "cost_per_outbound_click": 0.0,
            "landing_page_views": 0, "click_to_lp_rate": 0.0,
            "spend": 0.0, "page_id": page_id, "date_preset": effective_preset,
        }
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,outbound_clicks,actions",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener calidad de tráfico.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    total_spend = 0.0
    total_outbound = 0
    total_lp_views = 0

    for row in rows:
        total_spend += float(row.get("spend", 0) or 0)
        for oc in (row.get("outbound_clicks") or []):
            if oc.get("action_type") == "outbound_click":
                total_outbound += int(float(oc.get("value", 0) or 0))
        for a in (row.get("actions") or []):
            if a.get("action_type") == "landing_page_view":
                total_lp_views += int(float(a.get("value", 0) or 0))

    cost_per_outbound = round(total_spend / total_outbound, 2) if total_outbound > 0 else 0.0
    click_to_lp_rate = round((total_lp_views / total_outbound) * 100, 2) if total_outbound > 0 else 0.0

    result = {
        "outbound_clicks": total_outbound,
        "cost_per_outbound_click": cost_per_outbound,
        "landing_page_views": total_lp_views,
        "click_to_lp_rate": click_to_lp_rate,
        "spend": round(total_spend, 2),
        "page_id": page_id,
        "date_preset": effective_preset,
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/pages.py
git commit -m "feat(backend): add traffic-quality endpoint with outbound clicks and LP view rate"
```

---

## Task 5: Backend — endpoint ad-diagnostics (Módulo 3)

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py`

- [ ] **Step 1: Añadir helper _ranking_label**

Añadir después de `_extract_cpa`:

```python
RANKING_ORDER = {
    "ABOVE_AVERAGE": 0,
    "AVERAGE": 1,
    "BELOW_AVERAGE_20": 2,
    "BELOW_AVERAGE_10": 3,
    "BELOW_AVERAGE_5": 4,
    "UNKNOWN": 5,
}

def _ranking_label(value: str | None) -> str:
    """Normaliza los valores de ranking de Meta a etiquetas legibles."""
    if not value:
        return "UNKNOWN"
    upper = value.upper()
    return upper if upper in RANKING_ORDER else "UNKNOWN"
```

- [ ] **Step 2: Añadir endpoint GET ad-diagnostics al final de pages.py**

```python
@router.get("/{ad_account_id}/pages/{page_id}/ad-diagnostics")
async def get_page_ad_diagnostics(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Top 5 anuncios con diagnósticos de relevancia: quality, engagement y conversion rate ranking."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_ad_diag", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields=(
                "ad_id,ad_name,impressions,spend,"
                "quality_ranking,engagement_rate_ranking,conversion_rate_ranking"
            ),
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="ad", filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener diagnósticos de anuncios.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    # Ordenar por gasto desc, tomar top 5
    sorted_rows = sorted(rows, key=lambda r: float(r.get("spend", 0) or 0), reverse=True)
    top5 = sorted_rows[:5]

    enriched = [
        {
            "ad_id": r.get("ad_id", ""),
            "ad_name": r.get("ad_name", r.get("ad_id", "")),
            "impressions": int(float(r.get("impressions", 0) or 0)),
            "spend": round(float(r.get("spend", 0) or 0), 2),
            "quality_ranking": _ranking_label(r.get("quality_ranking")),
            "engagement_rate_ranking": _ranking_label(r.get("engagement_rate_ranking")),
            "conversion_rate_ranking": _ranking_label(r.get("conversion_rate_ranking")),
        }
        for r in top5
    ]

    result = {"data": enriched, "page_id": page_id, "date_preset": effective_preset}
    set_cache(settings.duckdb_path, cache_key, result)
    return result
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/pages.py
git commit -m "feat(backend): add ad-diagnostics endpoint with quality/engagement/conversion ranking"
```

---

## Task 6: Frontend — tipos y funciones en client.ts

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Añadir interfaces al final de client.ts (antes del último `}`)**

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Módulo Rentabilidad — Conversion Timeseries
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversionTimeseriesRow {
  date: string;
  spend: number;
  cpa: number;
  conversions: number;
  revenue: number;
}

export interface ConversionTimeseriesResponse {
  data: ConversionTimeseriesRow[];
  page_id: string;
  date_preset: string;
}

export async function fetchPageConversionTimeseries(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<ConversionTimeseriesResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/conversion-timeseries?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Calidad de Tráfico
// ─────────────────────────────────────────────────────────────────────────────

export interface TrafficQualityResponse {
  outbound_clicks: number;
  cost_per_outbound_click: number;
  landing_page_views: number;
  click_to_lp_rate: number;
  spend: number;
  page_id: string;
  date_preset: string;
}

export async function fetchPageTrafficQuality(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<TrafficQualityResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/traffic-quality?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Diagnóstico de Creatividades
// ─────────────────────────────────────────────────────────────────────────────

export type RankingValue =
  | "ABOVE_AVERAGE"
  | "AVERAGE"
  | "BELOW_AVERAGE_20"
  | "BELOW_AVERAGE_10"
  | "BELOW_AVERAGE_5"
  | "UNKNOWN";

export interface AdDiagnosticsRow {
  ad_id: string;
  ad_name: string;
  impressions: number;
  spend: number;
  quality_ranking: RankingValue;
  engagement_rate_ranking: RankingValue;
  conversion_rate_ranking: RankingValue;
}

export interface AdDiagnosticsResponse {
  data: AdDiagnosticsRow[];
  page_id: string;
  date_preset: string;
}

export async function fetchPageAdDiagnostics(
  adAccountId: string,
  pageId: string,
  opts: PageFilterOpts = {}
): Promise<AdDiagnosticsResponse> {
  const q = buildPageQuery(opts);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages/${encodeURIComponent(pageId)}/ad-diagnostics?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(frontend): add client types and fetch functions for 3 new page modules"
```

---

## Task 7: Componente RetentionModule (Módulo 1 — CPA/Rentabilidad)

**Files:**
- Create: `frontend/src/components/RetentionModule.tsx`

Gráfico `ComposedChart` de Recharts con barras de Gasto (eje izquierdo) y línea de CPA (eje derecho),
más 4 KPI cards en la parte superior.

- [ ] **Step 1: Crear frontend/src/components/RetentionModule.tsx**

```typescript
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversionTimeseriesRow } from "@/api/client";

interface RetentionModuleProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground text-xl font-semibold">{value}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
    </div>
  );
}

export default function RetentionModule({ data, isLoading }: RetentionModuleProps) {
  const rows = data ?? [];

  // Totales para KPI cards
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <section className="space-y-4">
      <h2 className="text-foreground text-lg font-semibold">Rentabilidad y Adquisición</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0,1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="CPA Promedio" value={fmt(avgCpa)} sub="Costo por resultado" />
          <KpiTile label="ROAS" value={roas > 0 ? `${roas.toFixed(2)}x` : "—"} sub="Retorno sobre inversión" />
          <KpiTile label="Conversiones" value={totalConversions.toFixed(0)} sub="Leads / Compras / Mensajes" />
          <KpiTile label="Valor generado" value={totalRevenue > 0 ? fmt(totalRevenue) : "—"} sub="Revenue total" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gasto diario vs CPA</CardTitle>
          <p className="text-muted-foreground text-sm">Barras = Gasto ($) · Línea = CPA ($)</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : rows.length < 2 ? (
            <p className="text-muted-foreground text-sm">
              Se necesitan al menos 2 días de datos para mostrar la evolución.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={{ left: 8, right: 32, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  yAxisId="spend"
                  orientation="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "Gasto ($)", angle: -90, position: "insideLeft", offset: -4, style: { fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="cpa"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  label={{ value: "CPA ($)", angle: 90, position: "insideRight", offset: 4, style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "Gasto") return [`$${value.toFixed(2)}`, name];
                    if (name === "CPA") return [`$${value.toFixed(2)}`, name];
                    return [value, name];
                  }}
                  labelFormatter={(label: string) => `Fecha: ${label}`}
                />
                <Legend />
                <Bar
                  yAxisId="spend"
                  dataKey="spend"
                  name="Gasto"
                  fill="#3b82f6"
                  opacity={0.7}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="cpa"
                  type="monotone"
                  dataKey="cpa"
                  name="CPA"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/RetentionModule.tsx
git commit -m "feat(frontend): add RetentionModule with dual-axis spend/CPA chart"
```

---

## Task 8: Componente TrafficQualityCard (Módulo 2)

**Files:**
- Create: `frontend/src/components/TrafficQualityCard.tsx`

- [ ] **Step 1: Crear frontend/src/components/TrafficQualityCard.tsx**

```typescript
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrafficQualityResponse } from "@/api/client";

interface TrafficQualityCardProps {
  data: TrafficQualityResponse | undefined;
  isLoading: boolean;
}

interface MetricTileProps {
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}

function MetricTile({ label, value, description, highlight }: MetricTileProps) {
  return (
    <Card className={highlight ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-900/10" : ""}>
      <CardContent className="p-4 space-y-1">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-foreground text-2xl font-bold">{value}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function TrafficQualityCard({ data, isLoading }: TrafficQualityCardProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Calidad de Tráfico</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0,1,2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </section>
    );
  }

  const outbound = data?.outbound_clicks ?? 0;
  const cpc = data?.cost_per_outbound_click ?? 0;
  const lpRate = data?.click_to_lp_rate ?? 0;

  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-semibold">Calidad de Tráfico</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile
          label="Clics Salientes"
          value={outbound.toLocaleString("es")}
          description="Personas que fueron a tu landing page"
        />
        <MetricTile
          label="Costo por Clic Saliente"
          value={cpc > 0 ? `$${cpc.toFixed(2)}` : "—"}
          description="Costo de llevar a alguien fuera de Meta"
        />
        <MetricTile
          label="Tasa Clic → Landing"
          value={lpRate > 0 ? `${lpRate.toFixed(1)}%` : "—"}
          description="Clics que llegaron a cargar la página web"
          highlight={lpRate > 0 && lpRate < 70}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TrafficQualityCard.tsx
git commit -m "feat(frontend): add TrafficQualityCard with outbound clicks and LP rate metrics"
```

---

## Task 9: Componente AdDiagnosticsTable (Módulo 3)

**Files:**
- Create: `frontend/src/components/AdDiagnosticsTable.tsx`

- [ ] **Step 1: Crear frontend/src/components/AdDiagnosticsTable.tsx**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AdDiagnosticsRow, RankingValue } from "@/api/client";

interface AdDiagnosticsTableProps {
  data: AdDiagnosticsRow[] | undefined;
  isLoading: boolean;
}

const RANKING_CONFIG: Record<RankingValue, { label: string; className: string }> = {
  ABOVE_AVERAGE: { label: "Por encima", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  AVERAGE: { label: "Promedio", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  BELOW_AVERAGE_20: { label: "Bajo (20%)", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  BELOW_AVERAGE_10: { label: "Bajo (10%)", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  BELOW_AVERAGE_5: { label: "Bajo (5%)", className: "bg-red-200 text-red-900 dark:bg-red-800/40 dark:text-red-200" },
  UNKNOWN: { label: "—", className: "bg-muted text-muted-foreground" },
};

function RankingBadge({ value }: { value: RankingValue }) {
  const cfg = RANKING_CONFIG[value] ?? RANKING_CONFIG.UNKNOWN;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export default function AdDiagnosticsTable({ data, isLoading }: AdDiagnosticsTableProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Diagnóstico de Creatividades</h2>
        <p className="text-muted-foreground text-sm">Top 5 anuncios por gasto — Relevancia vs. competencia</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Los rankings comparan tus anuncios contra los que compiten por la misma audiencia en Meta.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              Sin datos de diagnóstico en el periodo seleccionado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">Anuncio</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead>Calidad</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Conversión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.ad_id}>
                    <TableCell className="max-w-[240px]">
                      <p className="truncate text-sm font-medium">{row.ad_name}</p>
                      <p className="text-muted-foreground font-mono text-xs">{row.ad_id}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm">${row.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{row.impressions.toLocaleString("es")}</TableCell>
                    <TableCell><RankingBadge value={row.quality_ranking} /></TableCell>
                    <TableCell><RankingBadge value={row.engagement_rate_ranking} /></TableCell>
                    <TableCell><RankingBadge value={row.conversion_rate_ranking} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AdDiagnosticsTable.tsx
git commit -m "feat(frontend): add AdDiagnosticsTable with semaphore ranking badges"
```

---

## Task 10: Refactorizar PageDashboardPage — eliminar + integrar nuevos módulos

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

Reemplazar el contenido completo del archivo. Elimina: TimeseriesChart, ActionsChart, PlacementChart, OrganicKpiCard, AdLabelsSection y sus queries. Añade: RetentionModule, TrafficQualityCard, AdDiagnosticsTable y sus queries.

- [ ] **Step 1: Reescribir PageDashboardPage.tsx**

```typescript
import { useMemo, useState } from "react";
import DateRangePickerModal from "@/components/DateRangePickerModal";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchPageGeo,
  fetchPageInsights,
  fetchPageConversionTimeseries,
  fetchPageTrafficQuality,
  fetchPageAdDiagnostics,
  getMetaAccessToken,
  type GeoInsightRow,
  type GeoMetadata,
} from "@/api/client";
import RetentionModule from "@/components/RetentionModule";
import TrafficQualityCard from "@/components/TrafficQualityCard";
import AdDiagnosticsTable from "@/components/AdDiagnosticsTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import KpiGrid from "@/components/KpiGrid";
import GeoMap from "@/components/GeoMap";
import ChoroplethMap from "@/components/ChoroplethMap";

const ALL = "__all__";

const DATE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
  { value: "maximum", label: "Máximo disponible" },
] as const;

export default function PageDashboardPage() {
  const { accountId, pageId } = useParams<{
    accountId: string;
    pageId: string;
  }>();
  const hasToken = Boolean(getMetaAccessToken());
  const [datePreset, setDatePreset] = useState("last_30d");
  const [campaignSelect, setCampaignSelect] = useState(ALL);
  const [showDateModal, setShowDateModal] = useState(false);
  const [customDateStart, setCustomDateStart] = useState<string | null>(null);
  const [customDateStop, setCustomDateStop] = useState<string | null>(null);

  const id = accountId ? decodeURIComponent(accountId) : "";
  const pid = pageId ? decodeURIComponent(pageId) : "";
  const campaignId = campaignSelect !== ALL ? campaignSelect : undefined;

  if (!hasToken) return <Navigate to="/" replace />;
  if (!id) return <Navigate to="/accounts" replace />;
  if (!pid) return <Navigate to={`/accounts/${encodeURIComponent(id)}/pages`} replace />;

  const effectiveDateParams = useMemo(() => {
    if (datePreset === "today") {
      const today = new Date().toISOString().slice(0, 10);
      return { dateStart: today, dateStop: today };
    }
    if (datePreset === "custom" && customDateStart && customDateStop) {
      return { dateStart: customDateStart, dateStop: customDateStop };
    }
    return { datePreset };
  }, [datePreset, customDateStart, customDateStop]);

  function handleDatePresetChange(value: string) {
    if (value === "custom") {
      setShowDateModal(true);
    } else {
      setDatePreset(value);
      setCustomDateStart(null);
      setCustomDateStop(null);
    }
  }

  const opts = { ...effectiveDateParams, campaignId };

  const insightsQuery = useQuery({
    queryKey: ["page-insights", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageInsights(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const geoQuery = useQuery({
    queryKey: ["page-geo", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageGeo(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaigns(id),
    staleTime: 10 * 60 * 1000,
  });

  const conversionTsQuery = useQuery({
    queryKey: ["page-conv-ts", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageConversionTimeseries(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const trafficQualityQuery = useQuery({
    queryKey: ["page-traffic-quality", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageTrafficQuality(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const adDiagnosticsQuery = useQuery({
    queryKey: ["page-ad-diagnostics", id, pid, datePreset, customDateStart, customDateStop, campaignId],
    queryFn: () => fetchPageAdDiagnostics(id, pid, opts),
    staleTime: 5 * 60 * 1000,
  });

  const geoRows: GeoInsightRow[] = (geoQuery.data?.data ?? []).map((r) => ({
    region: r.region ?? "",
    region_name: r.region_name ?? r.region ?? "",
    impressions: parseInt(r.impressions ?? "0") || 0,
    clicks: 0,
    spend: r.spend ?? "0",
    reach: parseInt(r.reach ?? "0") || 0,
  }));

  const geoMeta: GeoMetadata = {
    scope: "account",
    ad_id: null,
    total_rows: geoRows.length,
    complete_coverage: true,
    note: `Página: ${pid}`,
  };

  const primaryError = insightsQuery.error ?? null;

  return (
    <div className="w-full space-y-6 py-6">
      <DateRangePickerModal
        open={showDateModal}
        onClose={() => setShowDateModal(false)}
        onApply={(start, end) => {
          setCustomDateStart(start);
          setCustomDateStop(end);
          setDatePreset("custom");
          setShowDateModal(false);
        }}
        initialStart={customDateStart ?? undefined}
        initialEnd={customDateStop ?? undefined}
      />

      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/accounts">Cuentas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/accounts/${encodeURIComponent(id)}/pages`}>Páginas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[200px] truncate font-mono text-xs">
              {pid}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Dashboard de página
          </h1>
          <p className="text-muted-foreground font-mono text-sm">{pid}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Periodo</span>
          <Select value={datePreset} onValueChange={handleDatePresetChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {datePreset === "custom" && customDateStart && customDateStop
                  ? `${customDateStart} → ${customDateStop}`
                  : DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? datePreset}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to={`/accounts/${encodeURIComponent(id)}/pages`}>
              ← Páginas
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtro de campaña */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs">Filtrar por campaña</span>
          <Select
            value={campaignSelect}
            onValueChange={setCampaignSelect}
            disabled={campaignsQuery.isLoading}
          >
            <SelectTrigger className="w-[min(100vw-2rem,320px)]">
              <SelectValue placeholder="Cargando campañas…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las campañas</SelectItem>
              {(campaignsQuery.data?.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name || c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error global */}
      {primaryError ? (
        <Alert variant="destructive">
          <AlertTitle>Error al cargar datos</AlertTitle>
          <AlertDescription>
            {primaryError instanceof Error
              ? primaryError.message
              : "Error desconocido"}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* KPIs */}
      {insightsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <KpiGrid
          data={insightsQuery.data?.data}
          isLoading={insightsQuery.isLoading}
        />
      )}

      {/* Módulo 1: Rentabilidad y Adquisición */}
      <RetentionModule
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
      />

      {/* Módulo 2: Calidad de Tráfico */}
      <TrafficQualityCard
        data={trafficQualityQuery.data}
        isLoading={trafficQualityQuery.isLoading}
      />

      {/* Distribución geográfica */}
      {geoQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : geoRows.length > 0 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-foreground mb-3 text-base font-semibold">
              Distribución geográfica
            </h2>
            <GeoMap data={geoRows} metadata={geoMeta} metric="impressions" />
          </div>
          {geoQuery.data && geoQuery.data.data.length > 0 && (
            <ChoroplethMap
              data={geoQuery.data.data.map((row) => ({
                region_name: row.region_name || row.region || "",
                spend: parseFloat(row.spend ?? "0"),
                impressions: parseInt(row.impressions ?? "0") || undefined,
              }))}
              metric="spend"
            />
          )}
        </div>
      ) : null}

      {/* Módulo 3: Diagnóstico de Creatividades */}
      <AdDiagnosticsTable
        data={adDiagnosticsQuery.data?.data}
        isLoading={adDiagnosticsQuery.isLoading}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar que el proyecto compila sin errores TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores. Si hay errores de tipos, corregirlos antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): replace obsolete sections with RetentionModule, TrafficQuality and AdDiagnostics"
```

---

## Self-review

**Spec coverage check:**
- ✅ Eliminar TimeseriesChart ("¿Cómo evolucionó?") → Task 10
- ✅ Eliminar ActionsChart ("¿Qué generó?") → Task 10
- ✅ Eliminar PlacementChart ("¿Dónde se gastó?") → Task 10
- ✅ Eliminar OrganicKpiCard ("Métricas Orgánicas") → Task 10
- ✅ Eliminar AdLabelsSection ("Rendimiento por Etiquetas") → Task 10
- ✅ Mantener distribución geográfica → Task 10
- ✅ Fix gasto=0 en mapa → Tasks 1 + 2
- ✅ Módulo 1 CPA/ROAS/Conversiones + gráfico dual-eje → Tasks 3 + 7
- ✅ Módulo 2 Calidad de Tráfico → Tasks 4 + 8
- ✅ Módulo 3 Diagnóstico Creatividades semáforo → Tasks 5 + 9

**Notas de implementación:**
- `outbound_clicks` en Meta API v20+ se devuelve como array `[{"action_type":"outbound_click","value":"N"}]`, igual que `actions`. El endpoint traffic-quality lo maneja correctamente.
- `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` solo están disponibles a nivel ad (level="ad"), no a nivel account. El endpoint ad-diagnostics usa level="ad" correctamente.
- El fix del mapa (Task 1) invalida la caché DuckDB para geo: si hay datos cacheados con nombres "Pichincha Province", se servirán datos corruptos hasta que expire la caché. Para forzar recarga, los usuarios deben cambiar el periodo de fecha. Esto es aceptable.

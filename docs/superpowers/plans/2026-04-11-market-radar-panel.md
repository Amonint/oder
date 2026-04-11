# Market Radar Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón "Radar de Mercado" al dashboard de página que auto-descubre quién más está pautando en el mismo segmento del cliente y presenta inteligencia de mercado accionable (top anunciantes, geografía, estacionalidad, análisis de mensajes).

**Architecture:** Nuevo endpoint `GET /competitor/market-radar?page_id=X` que (1) detecta la categoría de la página vía Meta Graph API, (2) busca competidores en Ad Library con keywords del segmento en paralelo por país, (3) agrega los ads encontrados. En el frontend, un nuevo panel derecho `MarketRadarPanel` con 4 secciones reutilizando el split layout existente en `PageDashboardPage`. Click en cualquier competidor abre el `CompetitorPanel` existente.

**Tech Stack:** FastAPI + httpx + asyncio.gather (backend), React + React Query + shadcn/ui (frontend). Sin dependencias externas nuevas en el MVP (YouTube/pytrends son opcionales).

---

## Mapa de archivos

### Archivos nuevos (backend)
- `backend/src/oderbiz_analytics/api/routes/competitor.py` — agregar endpoint `/market-radar` y helpers de agregación
- `backend/tests/test_market_radar_route.py` — tests del nuevo endpoint

### Archivos modificados (backend)
- `backend/src/oderbiz_analytics/adapters/meta/client.py` — método `get_page_public_profile`
- `backend/src/oderbiz_analytics/config.py` — campo `youtube_api_key` (opcional)

### Archivos nuevos (frontend)
- `frontend/src/components/MarketRadarPanel.tsx`
- `frontend/src/components/market-radar/TopAdvertisers.tsx`
- `frontend/src/components/market-radar/GeoOpportunity.tsx`
- `frontend/src/components/market-radar/MarketSeasonality.tsx`
- `frontend/src/components/market-radar/MessageIntelligence.tsx`
- `frontend/src/hooks/useMarketRadar.ts`

### Archivos modificados (frontend)
- `frontend/src/api/client.ts` — `fetchMarketRadar` + tipos `MarketRadarResponse`
- `frontend/src/routes/PageDashboardPage.tsx` — botón + estado `marketRadarOpen`

---

## Task 1: Backend — `get_page_public_profile` en MetaGraphClient

**Files:**
- Modify: `backend/src/oderbiz_analytics/adapters/meta/client.py` (al final)
- Test: `backend/tests/test_market_radar_route.py` (crear archivo)

- [ ] **Step 1: Crear archivo de tests con fixture**

```python
# backend/tests/test_market_radar_route.py
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    return TestClient(app)
```

- [ ] **Step 2: Escribir test para `get_page_public_profile`**

Añadir al mismo archivo:

```python
@respx.mock
def test_market_radar_detects_category(client):
    # lookup page → category Education
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    # search_ads_by_terms broad (all countries)
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_edu")
    assert r.status_code == 200
    body = r.json()
    assert body["client_page"]["category"] == "Education"
    assert "educación superior" in body["client_page"]["keywords_used"]
    assert body["competitors"] == []
```

- [ ] **Step 3: Ejecutar — verificar que falla**

```bash
cd backend
python -m pytest tests/test_market_radar_route.py::test_market_radar_detects_category -v
```

Expected: `FAILED` — endpoint no existe aún.

- [ ] **Step 4: Agregar `get_page_public_profile` al cliente Meta**

En `backend/src/oderbiz_analytics/adapters/meta/client.py`, al final de la clase `MetaGraphClient`:

```python
async def get_page_public_profile(self, *, page_id: str) -> dict:
    """Obtiene perfil público de una página (id, name, category)."""
    r = await self._client.get(
        f"{self._base}/{page_id}",
        params={"fields": "id,name,category", "access_token": self._token},
    )
    if r.is_error:
        raise MetaGraphApiError(
            status_code=r.status_code,
            message=_meta_error_message(r),
        )
    data = r.json()
    if not isinstance(data, dict) or "id" not in data:
        raise MetaGraphApiError(status_code=404, message="Página no encontrada")
    return data
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/meta/client.py \
        backend/tests/test_market_radar_route.py
git commit -m "feat(backend): add get_page_public_profile to MetaGraphClient"
```

---

## Task 2: Backend — endpoint `/market-radar` + helpers de agregación

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/competitor.py`
- Test: `backend/tests/test_market_radar_route.py`

- [ ] **Step 1: Escribir tests de agregación**

Añadir a `backend/tests/test_market_radar_route.py`:

```python
@respx.mock
def test_market_radar_returns_competitors(client):
    # lookup page
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    # search_ads_by_terms broad + per-country (múltiples calls a ads_archive)
    # respx permite mock genérico para la misma URL
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"page_id": "comp_001", "page_name": "UDUAL"}]},
        )
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_edu")
    assert r.status_code == 200
    body = r.json()
    assert len(body["competitors"]) >= 1
    comp = body["competitors"][0]
    assert comp["page_id"] == "comp_001"
    assert comp["name"] == "UDUAL"
    assert "active_ads" in comp
    assert "platforms" in comp
    assert "monthly_activity" in comp
    assert "market_summary" in body
    assert "top_countries" in body["market_summary"]
    assert "top_platforms" in body["market_summary"]
    assert "top_words" in body["market_summary"]


@respx.mock
def test_market_radar_excludes_client_page(client):
    """El cliente no debe aparecer en la lista de competidores."""
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={"data": [
                {"page_id": "page_edu", "page_name": "Rectoral Board"},
                {"page_id": "comp_002", "page_name": "CRISCOS"},
            ]},
        )
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_edu")
    body = r.json()
    ids = [c["page_id"] for c in body["competitors"]]
    assert "page_edu" not in ids
    assert "comp_002" in ids


@respx.mock
def test_market_radar_unknown_category_uses_page_name(client):
    """Si la categoría no está mapeada, usa el nombre de la página como keyword."""
    respx.get("https://graph.facebook.com/v25.0/page_xyz").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_xyz", "name": "Bodega Estudio", "category": "Arts and crafts"},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/market-radar?page_id=page_xyz")
    body = r.json()
    assert "Bodega Estudio" in body["client_page"]["keywords_used"]
```

- [ ] **Step 2: Ejecutar — verificar que fallan**

```bash
python -m pytest tests/test_market_radar_route.py -v
```

Expected: todos FAILED.

- [ ] **Step 3: Implementar helpers de agregación**

Añadir al inicio de `backend/src/oderbiz_analytics/api/routes/competitor.py` (después de los imports existentes):

```python
import asyncio
import re
from collections import Counter
from datetime import datetime, timezone

_MONITOR_COUNTRIES = ["EC", "CO", "MX", "AR", "CL", "PE", "VE", "HN", "GT", "BO", "US", "ES"]

_RADAR_AD_FIELDS = (
    "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,"
    "ad_delivery_start_time,ad_delivery_stop_time,"
    "publisher_platforms,languages,page_name,page_id,media_type"
)

_STOPWORDS = {
    "de", "la", "el", "en", "y", "a", "los", "las", "un", "una", "que", "con",
    "su", "por", "para", "es", "del", "se", "the", "and", "of", "to", "in",
    "for", "que", "no", "al", "más", "por", "con", "una", "sus", "pero",
}

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Education": ["educación superior", "universidad", "rector", "liderazgo académico"],
    "Hotel": ["hotel", "hospedaje", "turismo", "alojamiento"],
    "Restaurant": ["restaurante", "gastronomía", "comida", "chef"],
    "Health/medical": ["salud", "clínica", "médico", "bienestar"],
    "Consulting/business services": ["consultoría", "gestión empresarial", "management"],
    "Nonprofit organization": ["organización", "fundación", "asociación", "ONG"],
    "E-commerce": ["tienda online", "ecommerce", "compra online", "envíos"],
    "Real estate": ["inmobiliaria", "bienes raíces", "apartamento", "propiedad"],
}


def _keywords_for_category(category: str, page_name: str) -> list[str]:
    for key, kws in CATEGORY_KEYWORDS.items():
        if key.lower() in category.lower():
            return kws
    return [page_name]


def _is_active(ad: dict) -> bool:
    stop = ad.get("ad_delivery_stop_time")
    if stop is None:
        return True
    try:
        stop_dt = datetime.fromisoformat(stop.replace("+0000", "+00:00"))
        return stop_dt > datetime.now(timezone.utc)
    except Exception:
        return False


def _monthly_activity(ads: list[dict]) -> dict[str, int]:
    months: Counter = Counter()
    for ad in ads:
        t = ad.get("ad_creation_time") or ""
        if len(t) >= 7:
            months[t[:7]] += 1
    return dict(sorted(months.items()))


def _top_words(all_ads: list[list[dict]], top_n: int = 10) -> list[dict]:
    words: Counter = Counter()
    for ads in all_ads:
        for ad in ads:
            texts: list[str] = []
            texts.extend(ad.get("ad_creative_bodies") or [])
            texts.extend(ad.get("ad_creative_link_titles") or [])
            for text in texts:
                tokens = re.findall(r"\b[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{4,}\b", text.lower())
                for tok in tokens:
                    if tok not in _STOPWORDS:
                        words[tok] += 1
    return [{"word": w, "count": c} for w, c in words.most_common(top_n)]


def _build_competitor_entry(page: dict, ads: list[dict]) -> dict:
    active = sum(1 for ad in ads if _is_active(ad))
    platforms: set[str] = set()
    languages: set[str] = set()
    media_types: set[str] = set()
    for ad in ads:
        platforms.update(ad.get("publisher_platforms") or [])
        languages.update(ad.get("languages") or [])
        if ad.get("media_type"):
            media_types.add(ad["media_type"])
    dates = [ad["ad_creation_time"] for ad in ads if ad.get("ad_creation_time")]
    return {
        "page_id": page["page_id"],
        "name": page["name"],
        "active_ads": active,
        "total_ads": len(ads),
        "platforms": sorted(platforms),
        "languages": sorted(languages),
        "media_types": sorted(media_types),
        "latest_ad_date": max(dates) if dates else None,
        "monthly_activity": _monthly_activity(ads),
    }


def _build_market_summary(
    competitors: list[dict],
    country_results: list[list[dict] | Exception],
) -> dict:
    # top_countries: cuántos anunciantes únicos encontrados por país
    top_countries = []
    for i, country in enumerate(_MONITOR_COUNTRIES):
        result = country_results[i]
        if isinstance(result, list):
            top_countries.append({"country": country, "advertiser_count": len(result)})

    # top_platforms: conteo de ads por plataforma agregado de todos los competidores
    platform_count: Counter = Counter()
    for comp in competitors:
        for platform in comp["platforms"]:
            platform_count[platform] += comp["total_ads"]

    return {
        "top_countries": sorted(top_countries, key=lambda x: x["advertiser_count"], reverse=True),
        "top_platforms": [
            {"platform": p, "ad_count": c} for p, c in platform_count.most_common()
        ],
    }
```

- [ ] **Step 4: Implementar el endpoint `/market-radar`**

Añadir al final de `backend/src/oderbiz_analytics/api/routes/competitor.py`:

```python
@router.get("/market-radar")
async def get_market_radar(
    page_id: str,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Auto-descubre competidores en el mismo segmento de la página dada."""
    # 1. Detectar categoría de la página del cliente
    try:
        page_data = await client.get_page_public_profile(page_id=page_id)
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    category = page_data.get("category", "")
    page_name = page_data.get("name", page_id)
    keywords = _keywords_for_category(category, page_name)
    primary_keyword = keywords[0]

    # 2. Buscar competidores con todos los países monitoreados
    try:
        competitor_pages = await client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=_MONITOR_COUNTRIES,
            limit=20,
        )
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Excluir la propia página del cliente
    competitor_pages = [p for p in competitor_pages if p["page_id"] != page_id]

    # 3. En paralelo: ads por competidor + búsqueda por país
    ads_tasks = [
        client.get_ads_archive(
            page_id=p["page_id"],
            countries=_MONITOR_COUNTRIES,
            fields=_RADAR_AD_FIELDS,
            limit=50,
        )
        for p in competitor_pages
    ]
    country_tasks = [
        client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=[country],
            limit=10,
        )
        for country in _MONITOR_COUNTRIES
    ]

    all_results = await asyncio.gather(
        *ads_tasks, *country_tasks, return_exceptions=True
    )

    n_comp = len(competitor_pages)
    ads_results = all_results[:n_comp]
    country_results = all_results[n_comp:]

    # 4. Construir respuesta
    competitors = []
    for page, ads_result in zip(competitor_pages, ads_results):
        ads = ads_result if isinstance(ads_result, list) else []
        competitors.append(_build_competitor_entry(page, ads))

    # Ordenar por active_ads descendente
    competitors.sort(key=lambda c: c["active_ads"], reverse=True)

    all_ads_nested = [
        ads_results[i] for i in range(n_comp) if isinstance(ads_results[i], list)
    ]
    market_summary = _build_market_summary(competitors, list(country_results))
    market_summary["top_words"] = _top_words(all_ads_nested)  # type: ignore[assignment]

    return {
        "client_page": {
            "page_id": page_id,
            "name": page_name,
            "category": category,
            "keywords_used": keywords,
        },
        "competitors": competitors,
        "market_summary": market_summary,
    }
```

- [ ] **Step 5: Ejecutar tests**

```bash
python -m pytest tests/test_market_radar_route.py -v
```

Expected: todos PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/competitor.py \
        backend/tests/test_market_radar_route.py
git commit -m "feat(backend): add GET /competitor/market-radar endpoint"
```

---

## Task 3: Frontend — tipos y `fetchMarketRadar` en client.ts

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Leer el final de client.ts para saber dónde agregar**

```bash
grep -n "fetchCompetitorAds\|export" frontend/src/api/client.ts | tail -20
```

- [ ] **Step 2: Agregar tipos e interfaz en `client.ts`**

Añadir al final de `frontend/src/api/client.ts`:

```typescript
// ─── Market Radar ────────────────────────────────────────────────────────────

export interface MarketRadarCompetitor {
  page_id: string;
  name: string;
  active_ads: number;
  total_ads: number;
  platforms: string[];
  languages: string[];
  media_types: string[];
  latest_ad_date: string | null;
  monthly_activity: Record<string, number>; // { "2026-01": 3, ... }
}

export interface MarketRadarResponse {
  client_page: {
    page_id: string;
    name: string;
    category: string;
    keywords_used: string[];
  };
  competitors: MarketRadarCompetitor[];
  market_summary: {
    top_countries: { country: string; advertiser_count: number }[];
    top_platforms: { platform: string; ad_count: number }[];
    top_words: { word: string; count: number }[];
  };
}

export async function fetchMarketRadar(pageId: string): Promise<MarketRadarResponse> {
  const token = getMetaAccessToken();
  const res = await fetch(
    `${API_BASE}/competitor/market-radar?page_id=${encodeURIComponent(pageId)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Error al cargar Radar de Mercado");
  }
  return res.json();
}
```

- [ ] **Step 3: Verificar que el build no rompe**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(frontend): add fetchMarketRadar + MarketRadarResponse types"
```

---

## Task 4: Frontend — hook `useMarketRadar`

**Files:**
- Create: `frontend/src/hooks/useMarketRadar.ts`

- [ ] **Step 1: Crear el hook**

```typescript
// frontend/src/hooks/useMarketRadar.ts
import { useQuery } from "@tanstack/react-query";
import { fetchMarketRadar, type MarketRadarResponse } from "@/api/client";

export function useMarketRadar(pageId: string | null) {
  return useQuery<MarketRadarResponse, Error>({
    queryKey: ["market-radar", pageId],
    queryFn: () => fetchMarketRadar(pageId!),
    enabled: pageId !== null,
    staleTime: 10 * 60 * 1000, // 10 minutos
  });
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useMarketRadar.ts
git commit -m "feat(frontend): add useMarketRadar hook"
```

---

## Task 5: Frontend — `TopAdvertisers` component

**Files:**
- Create: `frontend/src/components/market-radar/TopAdvertisers.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/market-radar/TopAdvertisers.tsx
import { Badge } from "@/components/ui/badge";
import type { MarketRadarCompetitor } from "@/api/client";

interface Props {
  competitors: MarketRadarCompetitor[];
  clientPageId: string;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "FB",
  instagram: "IG",
  messenger: "MSG",
  audience_network: "AN",
  whatsapp: "WA",
  threads: "THR",
};

export default function TopAdvertisers({ competitors, clientPageId, onSelectCompetitor }: Props) {
  if (competitors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No se encontraron anunciantes activos en este segmento.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Quién pauta en tu segmento</h3>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Página</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Activos</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Plataformas</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp) => {
              const isClient = comp.page_id === clientPageId;
              return (
                <tr
                  key={comp.page_id}
                  className={`border-t ${isClient ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium truncate max-w-[140px] block">
                      {comp.name}
                    </span>
                    {isClient && (
                      <Badge variant="secondary" className="text-[10px] mt-0.5">Tú</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={comp.active_ads === 0 ? "text-muted-foreground" : "font-semibold"}>
                      {comp.active_ads}
                    </span>
                    <span className="text-muted-foreground text-xs"> /{comp.total_ads}</span>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {comp.platforms.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px] px-1">
                          {PLATFORM_LABEL[p] ?? p}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!isClient && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => onSelectCompetitor(comp.page_id, comp.name)}
                      >
                        Ver ads →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/market-radar/TopAdvertisers.tsx
git commit -m "feat(frontend): add TopAdvertisers component"
```

---

## Task 6: Frontend — `GeoOpportunity` component

**Files:**
- Create: `frontend/src/components/market-radar/GeoOpportunity.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/market-radar/GeoOpportunity.tsx
import { Badge } from "@/components/ui/badge";

const COUNTRY_NAMES: Record<string, string> = {
  EC: "Ecuador", CO: "Colombia", MX: "México", AR: "Argentina",
  CL: "Chile", PE: "Perú", VE: "Venezuela", HN: "Honduras",
  GT: "Guatemala", BO: "Bolivia", US: "Estados Unidos", ES: "España",
};

interface Props {
  topCountries: { country: string; advertiser_count: number }[];
}

function opportunityLabel(count: number): { label: string; variant: "default" | "secondary" | "outline" } {
  if (count === 0) return { label: "🔥 Sin competencia", variant: "default" };
  if (count === 1) return { label: "⚡ Baja", variant: "secondary" };
  if (count <= 4) return { label: "Media", variant: "outline" };
  return { label: "Alta competencia", variant: "outline" };
}

export default function GeoOpportunity({ topCountries }: Props) {
  if (topCountries.length === 0) return null;

  const sorted = [...topCountries].sort((a, b) => a.advertiser_count - b.advertiser_count);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Dónde pauta el segmento</h3>
      <p className="text-xs text-muted-foreground">
        Países con pocos anunciantes = menor competencia = CPM potencialmente más bajo para ti.
      </p>
      <div className="space-y-1">
        {sorted.map(({ country, advertiser_count }) => {
          const { label, variant } = opportunityLabel(advertiser_count);
          return (
            <div key={country} className="flex items-center justify-between py-1 border-b last:border-0">
              <span className="text-sm">{COUNTRY_NAMES[country] ?? country}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {advertiser_count} anunciante{advertiser_count !== 1 ? "s" : ""}
                </span>
                <Badge variant={variant} className="text-[10px]">{label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/market-radar/GeoOpportunity.tsx
git commit -m "feat(frontend): add GeoOpportunity component"
```

---

## Task 7: Frontend — `MarketSeasonality` component

**Files:**
- Create: `frontend/src/components/market-radar/MarketSeasonality.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/market-radar/MarketSeasonality.tsx
import type { MarketRadarCompetitor } from "@/api/client";

interface Props {
  competitors: MarketRadarCompetitor[];
}

function aggregateMonthly(competitors: MarketRadarCompetitor[]): { month: string; count: number }[] {
  const totals: Record<string, number> = {};
  for (const comp of competitors) {
    for (const [month, count] of Object.entries(comp.monthly_activity)) {
      totals[month] = (totals[month] ?? 0) + count;
    }
  }
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6) // últimos 6 meses
    .map(([month, count]) => ({ month, count }));
}

function formatMonth(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("es", { month: "short", year: "2-digit" });
}

export default function MarketSeasonality({ competitors }: Props) {
  const monthly = aggregateMonthly(competitors);
  if (monthly.length === 0) return null;

  const max = Math.max(...monthly.map((m) => m.count), 1);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Cuándo pauta el segmento</h3>
      <div className="space-y-1">
        {monthly.map(({ month, count }) => (
          <div key={month} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12 shrink-0">{formatMonth(month)}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{count}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Ads publicados por el segmento en los últimos 6 meses.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/market-radar/MarketSeasonality.tsx
git commit -m "feat(frontend): add MarketSeasonality component"
```

---

## Task 8: Frontend — `MessageIntelligence` component

**Files:**
- Create: `frontend/src/components/market-radar/MessageIntelligence.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/market-radar/MessageIntelligence.tsx

interface Props {
  topWords: { word: string; count: number }[];
}

export default function MessageIntelligence({ topWords }: Props) {
  if (topWords.length === 0) return null;

  const max = Math.max(...topWords.map((w) => w.count), 1);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Qué dice el mercado</h3>
      <p className="text-xs text-muted-foreground">
        Palabras más frecuentes en los anuncios del segmento.
      </p>
      <div className="space-y-1">
        {topWords.slice(0, 8).map(({ word, count }) => (
          <div key={word} className="flex items-center gap-2">
            <span className="text-xs w-28 shrink-0 truncate font-medium">{word}</span>
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary/70 h-1.5 rounded-full"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/market-radar/MessageIntelligence.tsx
git commit -m "feat(frontend): add MessageIntelligence component"
```

---

## Task 9: Frontend — `MarketRadarPanel` componente principal

**Files:**
- Create: `frontend/src/components/MarketRadarPanel.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/MarketRadarPanel.tsx
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMarketRadar } from "@/hooks/useMarketRadar";
import TopAdvertisers from "@/components/market-radar/TopAdvertisers";
import GeoOpportunity from "@/components/market-radar/GeoOpportunity";
import MarketSeasonality from "@/components/market-radar/MarketSeasonality";
import MessageIntelligence from "@/components/market-radar/MessageIntelligence";

interface Props {
  pageId: string;
  onClose: () => void;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export default function MarketRadarPanel({ pageId, onClose, onSelectCompetitor }: Props) {
  const { data, isLoading, error } = useMarketRadar(pageId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Radar de Mercado</p>
          {data && (
            <h2 className="text-base font-semibold text-foreground">
              {data.client_page.category || "Segmento detectado"}
            </h2>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar Radar de Mercado">
          ✕
        </Button>
      </div>

      {/* Keywords chips */}
      {data && (
        <div className="flex flex-wrap gap-1">
          {data.client_page.keywords_used.map((kw) => (
            <Badge key={kw} variant="secondary" className="text-xs">
              {kw}
            </Badge>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Data */}
      {data && !isLoading && (
        <div className="space-y-6">
          <TopAdvertisers
            competitors={data.competitors}
            clientPageId={pageId}
            onSelectCompetitor={onSelectCompetitor}
          />
          <GeoOpportunity topCountries={data.market_summary.top_countries} />
          <MarketSeasonality competitors={data.competitors} />
          <MessageIntelligence topWords={data.market_summary.top_words} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MarketRadarPanel.tsx
git commit -m "feat(frontend): add MarketRadarPanel component"
```

---

## Task 10: Frontend — integrar en `PageDashboardPage`

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 1: Agregar import de `MarketRadarPanel`**

En `frontend/src/routes/PageDashboardPage.tsx`, agregar al bloque de imports existente (junto a `CompetitorPanel`):

```typescript
import MarketRadarPanel from "@/components/MarketRadarPanel";
```

- [ ] **Step 2: Agregar estado `marketRadarOpen`**

Dentro del componente `PageDashboardPage`, junto al estado `showCompetitorSearch` existente (línea ~73), agregar:

```typescript
const [marketRadarOpen, setMarketRadarOpen] = useState(false);
```

- [ ] **Step 3: Agregar funciones de apertura con exclusión mutua**

Después de los `useEffect` existentes, añadir:

```typescript
function handleOpenMarketRadar() {
  setSelectedCompetitor(null);
  setShowCompetitorSearch(false);
  setCompetitorInput("");
  setMarketRadarOpen(true);
}

function handleSelectCompetitorFromRadar(id: string, name: string) {
  setMarketRadarOpen(false);
  setSelectedCompetitor({ id, name });
}
```

- [ ] **Step 4: Agregar botón "Radar de Mercado" en el toolbar**

Localizar el bloque del buscador de competidor (línea ~363, la sección `{/* Buscador de competidor */}`). Añadir el botón **antes** de ese bloque:

```tsx
{/* Radar de Mercado */}
<div className="space-y-1.5">
  <span className="text-muted-foreground text-xs">Radar de Mercado</span>
  {marketRadarOpen ? (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="font-medium text-primary">Activo</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 ml-1"
        onClick={() => setMarketRadarOpen(false)}
        aria-label="Cerrar Radar"
      >
        ✕
      </Button>
    </div>
  ) : (
    <Button variant="outline" onClick={handleOpenMarketRadar}>
      🎯 Radar de Mercado
    </Button>
  )}
</div>
```

- [ ] **Step 5: Actualizar el layout condicional del panel derecho**

Reemplazar el bloque final del return (líneas ~440–455 actuales):

```tsx
{selectedCompetitor || marketRadarOpen ? (
  <div className="flex gap-4 lg:flex-row flex-col mt-6">
    <div className="lg:w-1/2 w-full min-w-0 space-y-6">
      {mainContent}
    </div>
    <div className="lg:w-1/2 w-full min-w-0">
      {selectedCompetitor && (
        <CompetitorPanel
          pageId={selectedCompetitor.id}
          pageName={selectedCompetitor.name}
          onClose={() => setSelectedCompetitor(null)}
        />
      )}
      {marketRadarOpen && (
        <MarketRadarPanel
          pageId={pid}
          onClose={() => setMarketRadarOpen(false)}
          onSelectCompetitor={handleSelectCompetitorFromRadar}
        />
      )}
    </div>
  </div>
) : (
  <div className="mt-6">{mainContent}</div>
)}
```

- [ ] **Step 6: Verificar tipos y build**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 7: Smoke test manual**

1. Arrancar backend: `cd backend && uvicorn oderbiz_analytics.api.main:app --reload`
2. Arrancar frontend: `cd frontend && npm run dev`
3. Conectar token Meta
4. Navegar a una página → hacer click en "🎯 Radar de Mercado"
5. Verificar que el panel derecho se abre y el dashboard del cliente permanece en la izquierda
6. Verificar que hace click en "Ver ads →" de un competidor abre el CompetitorPanel y cierra el Radar
7. Verificar que el botón ✕ cierra el panel y el layout vuelve a ancho completo

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): integrate MarketRadarPanel into PageDashboardPage"
```

---

## Task 11: Backend — correr suite completa de tests

- [ ] **Step 1: Correr todos los tests del backend**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: todos PASSED. Si hay fallos en tests existentes (`test_competitor_route.py`, etc.), verificar que no hayan sido afectados por los nuevos imports añadidos al módulo `competitor.py`.

- [ ] **Step 2: Si hay imports rotos**

Los nuevos imports `asyncio`, `re`, `Counter`, `datetime` son de stdlib — no deben causar problemas. Si hay error de `MetaGraphApiError` no importado en algún test, verificar que el import en `competitor.py` sigue siendo:

```python
from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
```

- [ ] **Step 3: Commit final de limpieza si fue necesario**

```bash
git add -p
git commit -m "fix(backend): ensure new imports don't break existing tests"
```

---

## Resumen de entregables

| Tarea | Archivo clave | Estado |
|---|---|---|
| 1 | `adapters/meta/client.py` — `get_page_public_profile` | - |
| 2 | `routes/competitor.py` — `/market-radar` endpoint | - |
| 3 | `api/client.ts` — tipos + `fetchMarketRadar` | - |
| 4 | `hooks/useMarketRadar.ts` | - |
| 5 | `components/market-radar/TopAdvertisers.tsx` | - |
| 6 | `components/market-radar/GeoOpportunity.tsx` | - |
| 7 | `components/market-radar/MarketSeasonality.tsx` | - |
| 8 | `components/market-radar/MessageIntelligence.tsx` | - |
| 9 | `components/MarketRadarPanel.tsx` | - |
| 10 | `routes/PageDashboardPage.tsx` — integración | - |
| 11 | Suite completa de tests | - |

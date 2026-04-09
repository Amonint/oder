# Competitor Intelligence Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un panel de inteligencia competitiva al dashboard de página que permite buscar un competidor por nombre, dividir la pantalla en dos columnas y mostrar 4 vistas de análisis usando la Meta Ad Library API.

**Architecture:** Hook + componentes separados. Backend proxea Meta directamente en 2 endpoints nuevos. Frontend: `useCompetitorSearch` maneja autocomplete, `CompetitorPanel` agrupa las 4 vistas, `PageDashboardPage` orquesta el split layout.

**Tech Stack:** FastAPI, httpx, respx (tests), React 18, React Query, shadcn/ui, TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-09-competitor-intelligence-module-design.md`

---

## Mapa de archivos

| Acción | Archivo |
|--------|---------|
| MODIFY | `backend/src/oderbiz_analytics/adapters/meta/client.py` |
| CREATE | `backend/src/oderbiz_analytics/api/routes/competitor.py` |
| MODIFY | `backend/src/oderbiz_analytics/api/main.py` |
| CREATE | `backend/tests/test_competitor_route.py` |
| MODIFY | `frontend/src/api/client.ts` |
| CREATE | `frontend/src/hooks/useCompetitorSearch.ts` |
| CREATE | `frontend/src/components/competitor/RadarTable.tsx` |
| CREATE | `frontend/src/components/competitor/CreativeLibrary.tsx` |
| CREATE | `frontend/src/components/competitor/IntensityIndex.tsx` |
| CREATE | `frontend/src/components/competitor/MarketMap.tsx` |
| CREATE | `frontend/src/components/CompetitorPanel.tsx` |
| MODIFY | `frontend/src/routes/PageDashboardPage.tsx` |

---

## Task 1: Agregar métodos al MetaGraphClient

**Files:**
- Modify: `backend/src/oderbiz_analytics/adapters/meta/client.py`

- [ ] **Step 1: Agregar método `search_pages`**

Al final de la clase `MetaGraphClient`, después de `list_ad_accounts`, agregar:

```python
async def search_pages(self, *, query: str, fields: str = "id,name,category,fan_count") -> list[dict]:
    """Busca páginas de Facebook por nombre usando /pages/search."""
    r = await self._client.get(
        f"{self._base}/pages/search",
        params={"q": query, "fields": fields, "access_token": self._token},
    )
    if r.is_error:
        raise MetaGraphApiError(
            status_code=r.status_code,
            message=_meta_error_message(r),
        )
    payload = r.json()
    data = payload.get("data", [])
    if not isinstance(data, list):
        raise MetaGraphApiError(status_code=502, message="Respuesta de /pages/search sin lista `data`")
    return data
```

- [ ] **Step 2: Agregar método `get_ads_archive`**

Inmediatamente después del método `search_pages`:

```python
async def get_ads_archive(
    self,
    *,
    page_id: str,
    countries: list[str],
    fields: str,
    ad_active_status: str = "ALL",
    limit: int = 50,
) -> list[dict]:
    """Consulta la Meta Ad Library API (ads_archive) para una página competidora."""
    import json
    r = await self._client.get(
        f"{self._base}/ads_archive",
        params={
            "search_page_ids": page_id,
            "ad_reached_countries": json.dumps(countries),
            "ad_active_status": ad_active_status,
            "fields": fields,
            "limit": limit,
            "access_token": self._token,
        },
    )
    if r.is_error:
        raise MetaGraphApiError(
            status_code=r.status_code,
            message=_meta_error_message(r),
        )
    payload = r.json()
    data = payload.get("data", [])
    if not isinstance(data, list):
        raise MetaGraphApiError(status_code=502, message="Respuesta de /ads_archive sin lista `data`")
    return data
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/meta/client.py
git commit -m "feat(meta-client): add search_pages and get_ads_archive methods"
```

---

## Task 2: Crear ruta backend `/competitor`

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/competitor.py`

- [ ] **Step 1: Crear el archivo con los dos endpoints**

```python
# backend/src/oderbiz_analytics/api/routes/competitor.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client

router = APIRouter(prefix="/competitor", tags=["competitor"])

_ADS_ARCHIVE_FIELDS = (
    "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,"
    "ad_creative_link_descriptions,ad_creative_link_captions,"
    "ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,"
    "publisher_platforms,languages,page_name,page_id"
)

_DEFAULT_COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "US", "ES"]


@router.get("/search")
async def search_competitor_pages(
    q: str = Query(..., min_length=2, description="Nombre de la página a buscar"),
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Busca páginas de Facebook por nombre para autocompletar el buscador de competidores."""
    try:
        data = await client.search_pages(query=q)
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {"data": data}


@router.get("/{page_id}/ads")
async def get_competitor_ads(
    page_id: str,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Devuelve los anuncios de Ad Library de una página competidora."""
    try:
        data = await client.get_ads_archive(
            page_id=page_id,
            countries=_DEFAULT_COUNTRIES,
            fields=_ADS_ARCHIVE_FIELDS,
        )
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    page_name = data[0].get("page_name", "") if data else ""
    return {"data": data, "page_name": page_name, "page_id": page_id}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/competitor.py
git commit -m "feat(backend): add competitor search and ads_archive endpoints"
```

---

## Task 3: Registrar el router en main.py

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/main.py`

- [ ] **Step 1: Agregar import y registro**

En `backend/src/oderbiz_analytics/api/main.py`, agregar el import junto a los demás routers (después de la línea `from oderbiz_analytics.api.routes.ad_labels import router as ad_labels_router`):

```python
from oderbiz_analytics.api.routes.competitor import router as competitor_router
```

Y agregar el registro después de `app.include_router(ad_labels_router, prefix="/api/v1")`:

```python
app.include_router(competitor_router, prefix="/api/v1")
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/oderbiz_analytics/api/main.py
git commit -m "feat(backend): register competitor router"
```

---

## Task 4: Tests del backend para las rutas de competidor

**Files:**
- Create: `backend/tests/test_competitor_route.py`

- [ ] **Step 1: Escribir tests**

```python
# backend/tests/test_competitor_route.py
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


@respx.mock
def test_search_returns_suggestions(client):
    respx.get("https://graph.facebook.com/v25.0/pages/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"id": "111", "name": "Competidor SA", "category": "Retail", "fan_count": 5000},
                    {"id": "222", "name": "Competidor SB", "category": "E-commerce", "fan_count": 1200},
                ]
            },
        )
    )
    r = client.get("/api/v1/competitor/search?q=Competidor")
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
    assert body["data"][0]["id"] == "111"
    assert body["data"][0]["name"] == "Competidor SA"


@respx.mock
def test_search_requires_min_2_chars(client):
    r = client.get("/api/v1/competitor/search?q=a")
    assert r.status_code == 422


@respx.mock
def test_search_propagates_meta_error(client):
    respx.get("https://graph.facebook.com/v25.0/pages/search").mock(
        return_value=httpx.Response(
            403,
            json={"error": {"message": "Invalid OAuth access token"}},
        )
    )
    r = client.get("/api/v1/competitor/search?q=Nike")
    assert r.status_code == 403
    assert "Invalid OAuth" in r.json()["detail"]


@respx.mock
def test_get_competitor_ads_returns_data(client):
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "ad_001",
                        "page_id": "111",
                        "page_name": "Competidor SA",
                        "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                        "ad_delivery_stop_time": None,
                        "publisher_platforms": ["facebook", "instagram"],
                        "languages": ["es"],
                    }
                ]
            },
        )
    )
    r = client.get("/api/v1/competitor/111/ads")
    assert r.status_code == 200
    body = r.json()
    assert body["page_id"] == "111"
    assert body["page_name"] == "Competidor SA"
    assert len(body["data"]) == 1
    assert body["data"][0]["id"] == "ad_001"


@respx.mock
def test_get_competitor_ads_empty_returns_empty_list(client):
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/999/ads")
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["page_name"] == ""
    assert body["page_id"] == "999"
```

- [ ] **Step 2: Ejecutar tests**

```bash
cd backend && python -m pytest tests/test_competitor_route.py -v
```

Salida esperada: 5 tests PASSED.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_competitor_route.py
git commit -m "test(backend): add competitor route tests"
```

---

## Task 5: Tipos y funciones API en el cliente frontend

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Agregar interfaces y funciones al final de `client.ts`**

Al final del archivo, agregar:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Módulo Inteligencia Competitiva
// ─────────────────────────────────────────────────────────────────────────────

export interface CompetitorPageSuggestion {
  id: string;
  name: string;
  category?: string;
  fan_count?: number;
}

export interface CompetitorAdItem {
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

export interface CompetitorAdsResponse {
  data: CompetitorAdItem[];
  page_name: string;
  page_id: string;
}

export async function searchCompetitorPages(
  query: string
): Promise<{ data: CompetitorPageSuggestion[] }> {
  const q = new URLSearchParams({ q: query });
  const r = await apiFetch(`/api/v1/competitor/search?${q}`);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchCompetitorAds(
  pageId: string
): Promise<CompetitorAdsResponse> {
  const r = await apiFetch(`/api/v1/competitor/${encodeURIComponent(pageId)}/ads`);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(frontend): add competitor API client types and functions"
```

---

## Task 6: Hook `useCompetitorSearch`

**Files:**
- Create: `frontend/src/hooks/useCompetitorSearch.ts`

- [ ] **Step 1: Crear el hook**

```typescript
// frontend/src/hooks/useCompetitorSearch.ts
import { useEffect, useState } from "react";
import { searchCompetitorPages, type CompetitorPageSuggestion } from "@/api/client";

interface UseCompetitorSearchResult {
  suggestions: CompetitorPageSuggestion[];
  isLoading: boolean;
  error: string | null;
}

export function useCompetitorSearch(query: string): UseCompetitorSearchResult {
  const [suggestions, setSuggestions] = useState<CompetitorPageSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await searchCompetitorPages(query);
        if (!controller.signal.aborted) {
          setSuggestions(result.data);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Error al buscar páginas");
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { suggestions, isLoading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useCompetitorSearch.ts
git commit -m "feat(frontend): add useCompetitorSearch hook with debounce"
```

---

## Task 7: Componente `RadarTable`

**Files:**
- Create: `frontend/src/components/competitor/RadarTable.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// frontend/src/components/competitor/RadarTable.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

function calcDurationDays(start?: string, stop?: string | null): number | null {
  if (!start) return null;
  const s = new Date(start).getTime();
  const e = stop ? new Date(stop).getTime() : Date.now();
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

export default function RadarTable({ data }: Props) {
  const now = new Date();
  const active = data.filter(
    (ad) => !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time) > now
  );
  const inactive = data.filter(
    (ad) => ad.ad_delivery_stop_time && new Date(ad.ad_delivery_stop_time) <= now
  );

  const duraciones = inactive
    .map((ad) => calcDurationDays(ad.ad_delivery_start_time, ad.ad_delivery_stop_time))
    .filter((d): d is number => d !== null);
  const vidaMedia =
    duraciones.length > 0
      ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length)
      : null;

  const plataformas = Array.from(
    new Set(data.flatMap((ad) => ad.publisher_platforms ?? []))
  );

  const rows = [
    { label: "Anuncios activos", value: active.length.toString() },
    { label: "Anuncios inactivos", value: inactive.length.toString() },
    { label: "Total anuncios", value: data.length.toString() },
    { label: "Vida media del anuncio", value: vidaMedia !== null ? `${vidaMedia} días` : "—" },
    {
      label: "Plataformas",
      value: (
        <div className="flex flex-wrap gap-1">
          {plataformas.length > 0
            ? plataformas.map((p) => (
                <Badge key={p} variant="secondary" className="capitalize text-xs">
                  {p}
                </Badge>
              ))
            : "—"}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Radar competitivo</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-2 pr-4 text-muted-foreground">{row.label}</td>
                <td className="py-2 font-medium">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor/RadarTable.tsx
git commit -m "feat(frontend): add RadarTable competitor component"
```

---

## Task 8: Componente `IntensityIndex`

**Files:**
- Create: `frontend/src/components/competitor/IntensityIndex.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// frontend/src/components/competitor/IntensityIndex.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

function calcScore(data: CompetitorAdItem[]): number {
  const now = new Date();
  const active = data.filter(
    (ad) => !ad.ad_delivery_stop_time || new Date(ad.ad_delivery_stop_time) > now
  );

  const inactive = data.filter(
    (ad) => ad.ad_delivery_stop_time && new Date(ad.ad_delivery_stop_time) <= now
  );
  const duraciones = inactive.map((ad) => {
    const s = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time).getTime() : null;
    const e = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).getTime() : null;
    if (!s || !e) return null;
    return (e - s) / (1000 * 60 * 60 * 24);
  }).filter((d): d is number => d !== null);

  const vidaMedia =
    duraciones.length > 0
      ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length
      : 0;

  const plataformas = new Set(data.flatMap((ad) => ad.publisher_platforms ?? [])).size;

  const scoreActivos = Math.min(active.length / 50, 1) * 40;
  const scoreVida = Math.min(vidaMedia / 30, 1) * 30;
  const scorePlataformas = Math.min(plataformas / 3, 1) * 30;

  return Math.min(Math.round(scoreActivos + scoreVida + scorePlataformas), 100);
}

function label(score: number): { text: string; color: string } {
  if (score <= 30) return { text: "Baja presión", color: "text-green-600" };
  if (score <= 60) return { text: "Presión media", color: "text-yellow-600" };
  return { text: "Alta presión", color: "text-red-600" };
}

export default function IntensityIndex({ data }: Props) {
  const score = calcScore(data);
  const { text, color } = label(score);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Índice de intensidad publicitaria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums">{score}</span>
          <span className="text-muted-foreground text-sm mb-1">/100</span>
          <span className={`text-sm font-medium mb-1 ${color}`}>{text}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Basado en volumen de anuncios activos, vida media y amplitud de plataformas.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor/IntensityIndex.tsx
git commit -m "feat(frontend): add IntensityIndex competitor component"
```

---

## Task 9: Componente `CreativeLibrary`

**Files:**
- Create: `frontend/src/components/competitor/CreativeLibrary.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// frontend/src/components/competitor/CreativeLibrary.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function CreativeLibrary({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Biblioteca creativa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin anuncios disponibles.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Biblioteca creativa ({data.length} anuncios)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3">
          {data.slice(0, 20).map((ad) => {
            const body = ad.ad_creative_bodies?.[0];
            const title = ad.ad_creative_link_titles?.[0];
            const caption = ad.ad_creative_link_captions?.[0];
            return (
              <div
                key={ad.id}
                className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm"
              >
                {body && (
                  <p className="text-foreground leading-snug">
                    {truncate(body, 120)}
                  </p>
                )}
                {title && (
                  <p className="font-medium text-xs text-muted-foreground">
                    {truncate(title, 80)}
                  </p>
                )}
                {caption && (
                  <p className="text-xs text-muted-foreground italic">
                    {truncate(caption, 60)}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Desde {formatDate(ad.ad_delivery_start_time)}
                  </span>
                  {(ad.publisher_platforms ?? []).map((p) => (
                    <Badge key={p} variant="outline" className="text-xs capitalize">
                      {p}
                    </Badge>
                  ))}
                  {ad.ad_snapshot_url && (
                    <a
                      href={ad.ad_snapshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline-offset-2 hover:underline ml-auto"
                    >
                      Ver anuncio →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor/CreativeLibrary.tsx
git commit -m "feat(frontend): add CreativeLibrary competitor component"
```

---

## Task 10: Componente `MarketMap`

**Files:**
- Create: `frontend/src/components/competitor/MarketMap.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// frontend/src/components/competitor/MarketMap.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompetitorAdItem } from "@/api/client";

interface Props {
  data: CompetitorAdItem[];
}

const MONITORED_COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "US", "ES"];

export default function MarketMap({ data }: Props) {
  // Plataformas con conteo
  const platformCount: Record<string, number> = {};
  for (const ad of data) {
    for (const p of ad.publisher_platforms ?? []) {
      platformCount[p] = (platformCount[p] ?? 0) + 1;
    }
  }
  const platforms = Object.entries(platformCount).sort((a, b) => b[1] - a[1]);
  const maxPlatform = platforms[0]?.[1] ?? 1;

  // Idiomas con frecuencia
  const langCount: Record<string, number> = {};
  for (const ad of data) {
    for (const lang of ad.languages ?? []) {
      langCount[lang] = (langCount[lang] ?? 0) + 1;
    }
  }
  const langs = Object.entries(langCount).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Mapa de mercado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Plataformas */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Plataformas</p>
          {platforms.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {platforms.map(([platform, count]) => (
                <div key={platform} className="flex items-center gap-2">
                  <span className="w-20 text-xs capitalize shrink-0">{platform}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(count / maxPlatform) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Idiomas */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Idiomas detectados</p>
          {langs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {langs.map(([lang, count]) => (
                <Badge key={lang} variant="secondary" className="text-xs">
                  {lang.toUpperCase()} · {count}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Países monitoreados */}
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-2">Países monitoreados</p>
          <div className="flex flex-wrap gap-1.5">
            {MONITORED_COUNTRIES.map((c) => (
              <Badge key={c} variant="outline" className="text-xs font-mono">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor/MarketMap.tsx
git commit -m "feat(frontend): add MarketMap competitor component"
```

---

## Task 11: Componente `CompetitorPanel`

**Files:**
- Create: `frontend/src/components/CompetitorPanel.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// frontend/src/components/CompetitorPanel.tsx
import { useQuery } from "@tanstack/react-query";
import { fetchCompetitorAds } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import RadarTable from "@/components/competitor/RadarTable";
import CreativeLibrary from "@/components/competitor/CreativeLibrary";
import IntensityIndex from "@/components/competitor/IntensityIndex";
import MarketMap from "@/components/competitor/MarketMap";

interface Props {
  pageId: string;
  pageName: string;
  onClose: () => void;
}

export default function CompetitorPanel({ pageId, pageName, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["competitor-ads", pageId],
    queryFn: () => fetchCompetitorAds(pageId),
    staleTime: 5 * 60 * 1000,
  });

  const ads = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Competidor</p>
          <h2 className="text-base font-semibold text-foreground truncate max-w-[240px]">
            {pageName}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Cerrar panel de competidor"
        >
          ✕
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error
              ? error.message.includes("ads_read") || error.message.includes("403")
                ? "Tu token no tiene acceso al Ad Library API. Requiere el permiso ads_read."
                : error.message
              : "Error al cargar datos del competidor"}
          </AlertDescription>
        </Alert>
      )}

      {/* Sin anuncios */}
      {!isLoading && !error && ads.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Este competidor no tiene anuncios activos en los países monitoreados.
        </p>
      )}

      {/* Vistas */}
      {!isLoading && !error && ads.length > 0 && (
        <>
          <RadarTable data={ads} />
          <IntensityIndex data={ads} />
          <CreativeLibrary data={ads} />
          <MarketMap data={ads} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CompetitorPanel.tsx
git commit -m "feat(frontend): add CompetitorPanel with 4 competitive views"
```

---

## Task 12: Integrar en `PageDashboardPage` — búsqueda y split layout

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 1: Agregar imports en `PageDashboardPage.tsx`**

Agregar al bloque de imports existente:

```tsx
import { useRef, useEffect } from "react";
import CompetitorPanel from "@/components/CompetitorPanel";
import { useCompetitorSearch } from "@/hooks/useCompetitorSearch";
import type { CompetitorPageSuggestion } from "@/api/client";
```

- [ ] **Step 2: Agregar estado del competidor**

Después de la línea `const [customDateStop, setCustomDateStop] = useState<string | null>(null);` (línea ~64), agregar:

```tsx
const [selectedCompetitor, setSelectedCompetitor] = useState<{
  id: string;
  name: string;
} | null>(null);
const [showCompetitorSearch, setShowCompetitorSearch] = useState(false);
const [competitorQuery, setCompetitorQuery] = useState("");
const [showSuggestions, setShowSuggestions] = useState(false);
const searchRef = useRef<HTMLDivElement>(null);

const { suggestions, isLoading: searchLoading } = useCompetitorSearch(competitorQuery);

useEffect(() => {
  function handleClick(e: MouseEvent) {
    if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
      setShowSuggestions(false);
    }
  }
  document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, []);
```

- [ ] **Step 3: Reemplazar el bloque "Filtro de campaña"**

Reemplazar el bloque completo desde `{/* Filtro de campaña */}` hasta el cierre del `</div>` (líneas 230–252 del archivo original) con:

```tsx
{/* Filtro de campaña + Buscar competidor */}
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

  {/* Buscador de competidor */}
  <div className="space-y-1.5">
    <span className="text-muted-foreground text-xs">Inteligencia competitiva</span>
    {selectedCompetitor ? (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="font-medium truncate max-w-[200px]">{selectedCompetitor.name}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 ml-1"
          onClick={() => {
            setSelectedCompetitor(null);
            setShowCompetitorSearch(false);
            setCompetitorQuery("");
          }}
          aria-label="Quitar competidor"
        >
          ✕
        </Button>
      </div>
    ) : showCompetitorSearch ? (
      <div ref={searchRef} className="relative">
        <Input
          autoFocus
          placeholder="Buscar competidor…"
          value={competitorQuery}
          onChange={(e) => {
            setCompetitorQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="w-[min(100vw-2rem,280px)]"
        />
        {showSuggestions && competitorQuery.length >= 2 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            {searchLoading && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Buscando…</div>
            )}
            {!searchLoading && suggestions.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Sin páginas encontradas</div>
            )}
            {suggestions.map((s: CompetitorPageSuggestion) => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedCompetitor({ id: s.id, name: s.name });
                  setShowCompetitorSearch(false);
                  setShowSuggestions(false);
                  setCompetitorQuery("");
                }}
              >
                <span className="font-medium">{s.name}</span>
                {s.category && (
                  <span className="ml-2 text-xs text-muted-foreground">{s.category}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    ) : (
      <Button variant="outline" onClick={() => setShowCompetitorSearch(true)}>
        Buscar competidor
      </Button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Agregar el import de `Input` al bloque de imports de shadcn/ui**

En el bloque de imports de componentes de shadcn/ui, agregar:

```tsx
import { Input } from "@/components/ui/input";
```

- [ ] **Step 5: Reemplazar el layout principal con split condicional**

Reemplazar la línea:

```tsx
return (
  <div className="w-full space-y-6 py-6">
```

por:

```tsx
const mainContent = (
  <div className="w-full space-y-6">
```

Y al final del componente, antes del cierre del return, cambiar la estructura para que el return sea:

```tsx
return (
  <div className="w-full py-6">
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

    {/* Breadcrumb, Header, Filtros — siempre ancho completo */}
    {/* [mantener el breadcrumb, header y bloque de filtros aquí — no dentro del split] */}

    {selectedCompetitor ? (
      <div className="flex gap-4 lg:flex-row flex-col mt-6">
        <div className="lg:w-1/2 w-full min-w-0 space-y-6">
          {mainContent}
        </div>
        <div className="lg:w-1/2 w-full min-w-0">
          <CompetitorPanel
            pageId={selectedCompetitor.id}
            pageName={selectedCompetitor.name}
            onClose={() => setSelectedCompetitor(null)}
          />
        </div>
      </div>
    ) : (
      <div className="mt-6">{mainContent}</div>
    )}
  </div>
);
```

**Nota:** El `mainContent` debe contener todo desde `{/* Error global */}` hasta el final del `<AdDiagnosticsTable>`. El Breadcrumb, Header y bloque de Filtros quedan fuera del `mainContent`, antes del split, para que siempre ocupen el ancho completo.

- [ ] **Step 6: Verificar que el servidor de desarrollo compila sin errores**

```bash
cd frontend && npm run dev
```

Abrir `http://localhost:5173` y verificar:
- El botón "Buscar competidor" aparece a la derecha de "Filtrar por campaña"
- Al hacer clic se muestra el input de búsqueda
- Al escribir 2+ caracteres aparece el dropdown de sugerencias
- Al seleccionar un competidor la pantalla se divide en dos
- El panel derecho muestra skeleton mientras carga y luego las 4 vistas
- El botón X cierra el panel y vuelve al layout completo
- En pantallas pequeñas (< 1024px) las columnas se apilan verticalmente

- [ ] **Step 7: Commit final**

```bash
git add frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): integrate competitor split layout in PageDashboardPage"
```

---

## Self-review checklist

- [x] **Spec §2 (Entry point):** Task 12 agrega el botón "Buscar competidor" a la derecha de "Filtrar por campaña", con input + dropdown de sugerencias.
- [x] **Spec §3 (Split layout):** Task 12 implementa `flex gap-4` con `w-1/2` para cada lado. Responsive con `lg:flex-row flex-col`.
- [x] **Spec §4 (Archivos):** Todos los archivos del mapa están cubiertos por tasks.
- [x] **Spec §5 (Funciones API):** Task 5 agrega `searchCompetitorPages` y `fetchCompetitorAds` con exactamente las interfaces del spec.
- [x] **Spec §6 (useCompetitorSearch):** Task 6, debounce 300ms, mínimo 2 chars, AbortController.
- [x] **Spec §7 (CompetitorPanel):** Task 11, props `{ pageId, pageName, onClose }`, React Query con `staleTime: 5*60*1000`.
- [x] **Spec §8.1 (RadarTable):** Task 7, calcula activos/inactivos/vida media/plataformas.
- [x] **Spec §8.2 (CreativeLibrary):** Task 9, grid de tarjetas con copy truncado, fechas, plataformas, link a snapshot.
- [x] **Spec §8.3 (IntensityIndex):** Task 8, fórmula `(activos/50*40) + (vida/30*30) + (plataformas/3*30)`, barra de progreso, etiqueta cualitativa.
- [x] **Spec §8.4 (MarketMap):** Task 10, bar chart horizontal de plataformas, idiomas con frecuencia, países monitoreados como badges.
- [x] **Spec §9 (Errores):** Task 11 (CompetitorPanel) maneja: sin anuncios, error 403, loading skeletons. Task 6 (hook) maneja: sin resultados, error de red. Task 12 maneja: query < 2 chars.
- [x] **Spec §11 (Limitaciones):** No se implementa ninguna métrica de performance financiero de terceros.
- [x] Tipos consistentes: `CompetitorAdItem` definido en Task 5, usado en Tasks 7–11 con mismo nombre.
- [x] Sin placeholders, TBDs ni pasos sin código.

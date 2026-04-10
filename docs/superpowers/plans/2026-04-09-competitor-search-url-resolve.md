# Competitor Search URL Resolve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el buscador de competidores por resolución directa de URLs de Facebook/Instagram, con fallback de texto libre.

**Architecture:** Un nuevo endpoint `POST /competitor/resolve` detecta automáticamente si el input es URL de Facebook, URL de Instagram, o texto libre, y usa la estrategia óptima para cada caso. El frontend usa un hook `useCompetitorResolve` que reemplaza `useCompetitorSearch` y actualiza la UI sin cambiar `CompetitorPanel`.

**Tech Stack:** FastAPI + httpx (backend), React + TanStack Query + TypeScript (frontend), respx + pytest (tests).

---

## File Map

**Crear:**
- `backend/src/oderbiz_analytics/api/routes/url_parser.py` — detecta tipo de input y extrae alias/id/username
- `frontend/src/hooks/useCompetitorResolve.ts` — hook que reemplaza `useCompetitorSearch`

**Modificar:**
- `backend/src/oderbiz_analytics/adapters/meta/client.py` — 3 métodos nuevos: `lookup_page`, `get_ig_user_id`, `instagram_business_discovery`, `search_ads_by_terms`
- `backend/src/oderbiz_analytics/api/routes/competitor.py` — agregar endpoint `POST /resolve`
- `backend/tests/test_competitor_route.py` — tests para `/resolve`
- `frontend/src/api/client.ts` — tipos nuevos + función `resolveCompetitor`
- `frontend/src/routes/PageDashboardPage.tsx` — reemplazar UI de búsqueda

---

## Task 1: URL Parser Module

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/url_parser.py`

- [ ] **Step 1: Crear el archivo con los tests primero**

Crear `backend/tests/test_url_parser.py`:

```python
# backend/tests/test_url_parser.py
import pytest
from oderbiz_analytics.api.routes.url_parser import parse_competitor_input, ResolveStrategy


@pytest.mark.parametrize("url,expected_strategy,expected_value", [
    ("https://www.facebook.com/FarmaciasAmericanas", ResolveStrategy.FACEBOOK_ALIAS, "FarmaciasAmericanas"),
    ("https://facebook.com/farmacias.americanas.ec", ResolveStrategy.FACEBOOK_ALIAS, "farmacias.americanas.ec"),
    ("https://www.facebook.com/profile.php?id=123456789", ResolveStrategy.FACEBOOK_ID, "123456789"),
    ("https://www.facebook.com/pages/Farmacias/123456789", ResolveStrategy.FACEBOOK_ID, "123456789"),
    ("https://www.instagram.com/farmaciasamericanas_ec/", ResolveStrategy.INSTAGRAM_USERNAME, "farmaciasamericanas_ec"),
    ("https://instagram.com/farmaciasamericanas_ec", ResolveStrategy.INSTAGRAM_USERNAME, "farmaciasamericanas_ec"),
    ("Farmacias Americanas", ResolveStrategy.FREE_TEXT, "Farmacias Americanas"),
    ("Nike Ecuador", ResolveStrategy.FREE_TEXT, "Nike Ecuador"),
])
def test_parse_competitor_input(url, expected_strategy, expected_value):
    result = parse_competitor_input(url)
    assert result.strategy == expected_strategy
    assert result.value == expected_value


def test_facebook_home_url_is_free_text():
    result = parse_competitor_input("https://www.facebook.com/home")
    assert result.strategy == ResolveStrategy.FREE_TEXT


def test_instagram_reel_url_is_free_text():
    result = parse_competitor_input("https://www.instagram.com/reel/abc123")
    assert result.strategy == ResolveStrategy.FREE_TEXT
```

- [ ] **Step 2: Correr los tests — verificar que fallan**

```bash
cd backend && python -m pytest tests/test_url_parser.py -v
```

Esperado: `ModuleNotFoundError` o `ImportError`.

- [ ] **Step 3: Crear el módulo url_parser.py**

```python
# backend/src/oderbiz_analytics/api/routes/url_parser.py
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class ResolveStrategy(str, Enum):
    FACEBOOK_ALIAS = "facebook_alias"
    FACEBOOK_ID = "facebook_id"
    INSTAGRAM_USERNAME = "instagram_username"
    FREE_TEXT = "free_text"


@dataclass
class ParseResult:
    strategy: ResolveStrategy
    value: str


_FB_PROFILE_ID = re.compile(r'facebook\.com/profile\.php\?id=(\d+)', re.IGNORECASE)
_FB_PAGES_ID   = re.compile(r'facebook\.com/pages/[^/]+/(\d+)', re.IGNORECASE)
_FB_ALIAS      = re.compile(r'facebook\.com/([A-Za-z0-9._%-]+)', re.IGNORECASE)
_IG_USERNAME   = re.compile(r'instagram\.com/([A-Za-z0-9._]+)/?', re.IGNORECASE)

_FB_RESERVED = frozenset({
    "home", "login", "watch", "groups", "events", "marketplace",
    "pages", "help", "share", "sharer",
})
_IG_RESERVED = frozenset({"p", "reel", "explore", "accounts", "direct", "stories"})


def parse_competitor_input(text: str) -> ParseResult:
    text = text.strip()

    m = _FB_PROFILE_ID.search(text)
    if m:
        return ParseResult(strategy=ResolveStrategy.FACEBOOK_ID, value=m.group(1))

    m = _FB_PAGES_ID.search(text)
    if m:
        return ParseResult(strategy=ResolveStrategy.FACEBOOK_ID, value=m.group(1))

    m = _FB_ALIAS.search(text)
    if m:
        alias = m.group(1).rstrip("/")
        if alias.lower() not in _FB_RESERVED:
            return ParseResult(strategy=ResolveStrategy.FACEBOOK_ALIAS, value=alias)
        return ParseResult(strategy=ResolveStrategy.FREE_TEXT, value=text)

    m = _IG_USERNAME.search(text)
    if m:
        username = m.group(1)
        if username.lower() not in _IG_RESERVED:
            return ParseResult(strategy=ResolveStrategy.INSTAGRAM_USERNAME, value=username)
        return ParseResult(strategy=ResolveStrategy.FREE_TEXT, value=text)

    return ParseResult(strategy=ResolveStrategy.FREE_TEXT, value=text)
```

- [ ] **Step 4: Correr los tests — verificar que pasan**

```bash
cd backend && python -m pytest tests/test_url_parser.py -v
```

Esperado: todos `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/url_parser.py backend/tests/test_url_parser.py
git commit -m "feat(backend): add competitor URL parser module"
```

---

## Task 2: Nuevos métodos en MetaGraphClient

**Files:**
- Modify: `backend/src/oderbiz_analytics/adapters/meta/client.py`

- [ ] **Step 1: Agregar los 4 métodos al final de la clase `MetaGraphClient`**

Abrir `backend/src/oderbiz_analytics/adapters/meta/client.py` y agregar al final de la clase, después de `get_ads_archive`:

```python
    async def lookup_page(
        self,
        *,
        alias_or_id: str,
        fields: str = "id,name,fan_count,category",
    ) -> dict:
        """Lookup directo de página Facebook por alias o ID numérico."""
        r = await self._client.get(
            f"{self._base}/{alias_or_id}",
            params={"fields": fields, "access_token": self._token},
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

    async def get_ig_user_id(self, *, page_id: str) -> str:
        """Obtiene el IG User ID vinculado a una página de Facebook."""
        r = await self._client.get(
            f"{self._base}/{page_id}",
            params={"fields": "instagram_business_account", "access_token": self._token},
        )
        if r.is_error:
            raise MetaGraphApiError(
                status_code=r.status_code,
                message=_meta_error_message(r),
            )
        data = r.json()
        ig = data.get("instagram_business_account")
        if not ig or not isinstance(ig, dict) or "id" not in ig:
            raise MetaGraphApiError(
                status_code=422,
                message="Esta página de Facebook no tiene una cuenta de Instagram de negocio vinculada.",
            )
        return ig["id"]

    async def instagram_business_discovery(
        self,
        *,
        ig_user_id: str,
        username: str,
    ) -> dict:
        """Busca una cuenta de Instagram business/creator por username."""
        fields = (
            "business_discovery.fields("
            "id,username,name,followers_count,media_count"
            ")"
        )
        r = await self._client.get(
            f"{self._base}/{ig_user_id}",
            params={
                "fields": fields,
                "username": username,
                "access_token": self._token,
            },
        )
        if r.is_error:
            raise MetaGraphApiError(
                status_code=r.status_code,
                message=_meta_error_message(r),
            )
        data = r.json()
        if "business_discovery" not in data:
            raise MetaGraphApiError(
                status_code=422,
                message=(
                    "Esta cuenta de Instagram no es una cuenta de negocio/creador. "
                    "Business Discovery solo funciona con esas cuentas."
                ),
            )
        return data

    async def search_ads_by_terms(
        self,
        *,
        search_terms: str,
        countries: list[str],
        limit: int = 10,
    ) -> list[dict]:
        """Busca en ads_archive por texto libre; devuelve páginas únicas deduplicadas."""
        r = await self._client.get(
            f"{self._base}/ads_archive",
            params={
                "search_terms": search_terms,
                "ad_reached_countries": json.dumps(countries),
                "ad_active_status": "ALL",
                "fields": "page_id,page_name",
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
        seen: set[str] = set()
        pages: list[dict] = []
        for ad in data:
            pid = ad.get("page_id")
            pname = ad.get("page_name") or pid or ""
            if pid and pid not in seen:
                seen.add(pid)
                pages.append({"page_id": pid, "name": pname})
        return pages
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/meta/client.py
git commit -m "feat(backend): add lookup_page, instagram_business_discovery, search_ads_by_terms to MetaGraphClient"
```

---

## Task 3: Endpoint POST /competitor/resolve

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/competitor.py`

- [ ] **Step 1: Reemplazar el contenido del archivo**

```python
# backend/src/oderbiz_analytics/api/routes/competitor.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client
from oderbiz_analytics.api.routes.url_parser import ResolveStrategy, parse_competitor_input

router = APIRouter(prefix="/competitor", tags=["competitor"])

_ADS_ARCHIVE_FIELDS = (
    "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,"
    "ad_creative_link_descriptions,ad_creative_link_captions,"
    "ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,"
    "publisher_platforms,languages,page_name,page_id"
)

_DEFAULT_COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "US", "ES"]


class ResolveRequest(BaseModel):
    input: str
    page_id: str | None = None


@router.post("/resolve")
async def resolve_competitor(
    body: ResolveRequest,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Resuelve URL de Facebook/Instagram o texto libre a un perfil competidor."""
    parsed = parse_competitor_input(body.input)

    if parsed.strategy in (ResolveStrategy.FACEBOOK_ALIAS, ResolveStrategy.FACEBOOK_ID):
        try:
            page = await client.lookup_page(alias_or_id=parsed.value)
        except MetaGraphApiError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        return {
            "platform": "facebook",
            "page_id": page["id"],
            "name": page.get("name", ""),
            "fan_count": page.get("fan_count"),
            "category": page.get("category"),
            "is_approximate": False,
        }

    if parsed.strategy == ResolveStrategy.INSTAGRAM_USERNAME:
        if not body.page_id:
            raise HTTPException(
                status_code=400,
                detail="Se requiere page_id para resolver cuentas de Instagram.",
            )
        try:
            ig_user_id = await client.get_ig_user_id(page_id=body.page_id)
            ig_data = await client.instagram_business_discovery(
                ig_user_id=ig_user_id,
                username=parsed.value,
            )
        except MetaGraphApiError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        bd = ig_data.get("business_discovery", {})
        return {
            "platform": "instagram",
            "page_id": bd.get("id", parsed.value),
            "name": bd.get("name") or bd.get("username") or parsed.value,
            "fan_count": bd.get("followers_count"),
            "category": None,
            "is_approximate": False,
        }

    # FREE_TEXT — fallback con ads_archive
    try:
        pages = await client.search_ads_by_terms(
            search_terms=parsed.value,
            countries=_DEFAULT_COUNTRIES,
        )
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {
        "platform": "facebook",
        "results": [
            {"page_id": p["page_id"], "name": p["name"], "is_approximate": True}
            for p in pages
        ],
    }


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
git commit -m "feat(backend): add POST /competitor/resolve endpoint"
```

---

## Task 4: Tests del endpoint /resolve

**Files:**
- Modify: `backend/tests/test_competitor_route.py`

- [ ] **Step 1: Agregar tests al final del archivo existente**

```python
# Agregar al final de backend/tests/test_competitor_route.py

@respx.mock
def test_resolve_facebook_url(client):
    respx.get("https://graph.facebook.com/v25.0/FarmaciasAmericanas").mock(
        return_value=httpx.Response(
            200,
            json={"id": "111222333", "name": "Farmacias Americanas Ecuador", "fan_count": 45000, "category": "Pharmacy"},
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.facebook.com/FarmaciasAmericanas"})
    assert r.status_code == 200
    body = r.json()
    assert body["platform"] == "facebook"
    assert body["page_id"] == "111222333"
    assert body["name"] == "Farmacias Americanas Ecuador"
    assert body["is_approximate"] is False


@respx.mock
def test_resolve_facebook_profile_id_url(client):
    respx.get("https://graph.facebook.com/v25.0/999888777").mock(
        return_value=httpx.Response(
            200,
            json={"id": "999888777", "name": "Test Page", "fan_count": 1000, "category": "Retail"},
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.facebook.com/profile.php?id=999888777"})
    assert r.status_code == 200
    assert r.json()["page_id"] == "999888777"
    assert r.json()["is_approximate"] is False


@respx.mock
def test_resolve_instagram_url(client):
    respx.get("https://graph.facebook.com/v25.0/page123").mock(
        return_value=httpx.Response(
            200,
            json={"instagram_business_account": {"id": "ig_own_456"}, "id": "page123"},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ig_own_456").mock(
        return_value=httpx.Response(
            200,
            json={
                "business_discovery": {
                    "id": "ig_competitor_789",
                    "username": "farmaciasec",
                    "name": "Farmacias EC",
                    "followers_count": 12000,
                },
                "id": "ig_own_456",
            },
        )
    )
    r = client.post(
        "/api/v1/competitor/resolve",
        json={"input": "https://www.instagram.com/farmaciasec/", "page_id": "page123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["platform"] == "instagram"
    assert body["page_id"] == "ig_competitor_789"
    assert body["name"] == "Farmacias EC"
    assert body["is_approximate"] is False


@respx.mock
def test_resolve_instagram_requires_page_id(client):
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.instagram.com/someuser/"})
    assert r.status_code == 400
    assert "page_id" in r.json()["detail"]


@respx.mock
def test_resolve_free_text_returns_suggestions(client):
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"page_id": "aaa", "page_name": "Farmacias SA"},
                    {"page_id": "bbb", "page_name": "Farmacias SB"},
                    {"page_id": "aaa", "page_name": "Farmacias SA"},  # duplicado
                ]
            },
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "Farmacias"})
    assert r.status_code == 200
    body = r.json()
    assert "results" in body
    assert len(body["results"]) == 2  # deduplicado
    assert body["results"][0]["is_approximate"] is True


@respx.mock
def test_resolve_facebook_not_found(client):
    respx.get("https://graph.facebook.com/v25.0/nonexistent").mock(
        return_value=httpx.Response(
            404,
            json={"error": {"message": "Page not found"}},
        )
    )
    r = client.post("/api/v1/competitor/resolve", json={"input": "https://www.facebook.com/nonexistent"})
    assert r.status_code == 404
```

- [ ] **Step 2: Correr todos los tests del módulo competitor**

```bash
cd backend && python -m pytest tests/test_competitor_route.py -v
```

Esperado: todos `PASSED`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_competitor_route.py
git commit -m "test(backend): add tests for POST /competitor/resolve"
```

---

## Task 5: Frontend — tipos y función en client.ts

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Agregar después del bloque `CompetitorAdsResponse` (línea ~861)**

Buscar `export async function fetchCompetitorAds` y agregar antes de esa función:

```typescript
export interface CompetitorResolvedDirect {
  platform: "facebook" | "instagram";
  page_id: string;
  name: string;
  fan_count?: number;
  category?: string | null;
  is_approximate: false;
}

export interface CompetitorResolvedSuggestion {
  page_id: string;
  name: string;
  is_approximate: true;
}

export interface CompetitorResolveResponse {
  platform: "facebook" | "instagram";
  page_id?: string;
  name?: string;
  fan_count?: number;
  category?: string | null;
  is_approximate?: boolean;
  results?: CompetitorResolvedSuggestion[];
}

export async function resolveCompetitor(
  input: string,
  pageId?: string,
): Promise<CompetitorResolveResponse> {
  const r = await apiFetch("/api/v1/competitor/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, page_id: pageId ?? null }),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2: Verificar que el proyecto compila sin errores**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(frontend): add resolveCompetitor function and types to client"
```

---

## Task 6: Hook useCompetitorResolve

**Files:**
- Create: `frontend/src/hooks/useCompetitorResolve.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// frontend/src/hooks/useCompetitorResolve.ts
import { useEffect, useRef, useState } from "react";
import {
  resolveCompetitor,
  type CompetitorResolvedSuggestion,
} from "@/api/client";

function isCompetitorUrl(text: string): boolean {
  return /facebook\.com|instagram\.com/i.test(text);
}

export type ResolveState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved"; platform: string; page_id: string; name: string; fan_count?: number; category?: string | null }
  | { status: "suggestions"; items: CompetitorResolvedSuggestion[] }
  | { status: "error"; message: string };

export function useCompetitorResolve(
  input: string,
  pageId?: string,
): ResolveState {
  const [state, setState] = useState<ResolveState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = input.trim();

    if (trimmed.length < 2) {
      setState({ status: "idle" });
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const url = isCompetitorUrl(trimmed);
    const delay = url ? 0 : 300;

    setState({ status: "resolving" });

    const timer = setTimeout(async () => {
      if (abortRef.current?.signal.aborted) return;
      try {
        const result = await resolveCompetitor(trimmed, pageId);
        if (abortRef.current?.signal.aborted) return;

        if (result.results) {
          setState({ status: "suggestions", items: result.results });
        } else if (result.page_id && result.name) {
          setState({
            status: "resolved",
            platform: result.platform,
            page_id: result.page_id,
            name: result.name,
            fan_count: result.fan_count,
            category: result.category,
          });
        } else {
          setState({ status: "error", message: "No se encontró el perfil." });
        }
      } catch (e) {
        if (!abortRef.current?.signal.aborted) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Error al resolver el perfil.",
          });
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [input, pageId]);

  return state;
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCompetitorResolve.ts
git commit -m "feat(frontend): add useCompetitorResolve hook"
```

---

## Task 7: PageDashboardPage — reemplazar UI del buscador

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 1: Actualizar los imports (líneas 1-19)**

Reemplazar las líneas de imports relacionados con el buscador anterior:

```typescript
// Eliminar estas dos líneas:
// import { useCompetitorSearch } from "@/hooks/useCompetitorSearch";
// import type { CompetitorPageSuggestion } from "@/api/client";

// Agregar en su lugar:
import { useCompetitorResolve } from "@/hooks/useCompetitorResolve";
import type { CompetitorResolvedSuggestion } from "@/api/client";
```

- [ ] **Step 2: Actualizar el estado local (alrededor de líneas 69-88)**

Buscar el bloque:
```typescript
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

Reemplazar con:
```typescript
  const [showCompetitorSearch, setShowCompetitorSearch] = useState(false);
  const [competitorInput, setCompetitorInput] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  const resolveState = useCompetitorResolve(competitorInput, pid);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setCompetitorInput("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
```

- [ ] **Step 3: Agregar efecto de auto-selección para URLs directas**

Buscar el `useEffect` del click handler (alrededor de línea 80) y agregar justo después:

```typescript
  useEffect(() => {
    if (resolveState.status === "resolved") {
      setSelectedCompetitor({ id: resolveState.page_id, name: resolveState.name });
      setShowCompetitorSearch(false);
      setCompetitorInput("");
    }
  }, [resolveState]);
```

- [ ] **Step 4: Reemplazar el bloque de búsqueda en el render (líneas ~375-421)**

Buscar el bloque que empieza en `} : showCompetitorSearch ? (` y reemplazar hasta el botón "Buscar competidor":

```tsx
          ) : showCompetitorSearch ? (
            <div ref={searchRef} className="relative">
              <Input
                autoFocus
                placeholder="Pega URL de Facebook o Instagram, o escribe el nombre…"
                value={competitorInput}
                onChange={(e) => setCompetitorInput(e.target.value)}
                className="w-[min(100vw-2rem,320px)]"
              />

              {/* Resolving */}
              {resolveState.status === "resolving" && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                  Buscando…
                </div>
              )}

              {/* Error */}
              {resolveState.status === "error" && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-destructive">
                  {resolveState.message}
                </div>
              )}

              {/* Sugerencias (texto libre) */}
              {resolveState.status === "suggestions" && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <div className="px-3 py-1.5 text-xs text-amber-600 border-b">
                    ⚠ Resultados aproximados — pega la URL para exactitud
                  </div>
                  {resolveState.items.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                  )}
                  {resolveState.items.map((s: CompetitorResolvedSuggestion) => (
                    <button
                      key={s.page_id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedCompetitor({ id: s.page_id, name: s.name });
                        setShowCompetitorSearch(false);
                        setCompetitorInput("");
                      }}
                    >
                      <span className="font-medium">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowCompetitorSearch(true)}>
              Buscar competidor
            </Button>
```

- [ ] **Step 5: Verificar que compila**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Correr el servidor de desarrollo y probar manualmente**

```bash
# Terminal 1
cd backend && uvicorn oderbiz_analytics.api.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Probar:
1. Pegar `https://www.facebook.com/NikeEcuador` → debe resolver directo sin dropdown
2. Pegar `https://www.instagram.com/nike/` → debe resolver (si la página tiene IG vinculado)
3. Escribir `Nike` → debe mostrar dropdown con badge ⚠

- [ ] **Step 7: Commit final**

```bash
git add frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): replace competitor search with URL resolver UI"
```

---

## Task 8: Correr suite completa de tests

- [ ] **Step 1: Correr todos los tests del backend**

```bash
cd backend && python -m pytest tests/ -v
```

Esperado: todos `PASSED`.

- [ ] **Step 2: Si algún test existente falla**

Los tests de `test_competitor_route.py` que mockeaban `/competitor/search` (el endpoint GET antiguo) ya no son válidos. El endpoint GET `/competitor/search` fue eliminado en Task 3.

Eliminar estos tests del archivo si persisten:
- `test_search_returns_suggestions`
- `test_search_requires_min_2_chars`
- `test_search_propagates_meta_error`

- [ ] **Step 3: Commit limpieza si aplica**

```bash
git add backend/tests/test_competitor_route.py
git commit -m "test(backend): remove obsolete /competitor/search tests"
```

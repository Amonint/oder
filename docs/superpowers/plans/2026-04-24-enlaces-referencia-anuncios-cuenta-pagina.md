# Enlaces De Referencia De Anuncios (Cuenta + Página) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar un enlace clicable de referencia oficial para anuncios/publicaciones en todas las vistas/tablas relevantes de Cuenta y Página.

**Architecture:** Centralizar la resolución de URL de referencia en backend (priorizando `permalink_url` oficial de Meta para `effective_object_story_id`) y en frontend (resolver URL final con fallback consistente). Reutilizar un componente UI único de enlace para renderizarlo encima del nombre en tablas/listados. Evitar lógica duplicada entre `DashboardPage` y `PageDashboardPage` creando helpers compartidos.

**Tech Stack:** FastAPI + httpx + pytest/respx (backend), React + TypeScript + React Query + Vite (frontend).

---

## File Structure (locked before tasks)

- **Modify:** `backend/src/oderbiz_analytics/api/routes/entities.py`
  - Añadir resolución por lote de `permalink_url` para anuncios listados en `/accounts/{id}/ads`.
- **Modify:** `backend/src/oderbiz_analytics/api/routes/ads_ranking.py`
  - Añadir `effective_object_story_permalink` al payload de `/ads/performance` para tablas de ranking/embudo por anuncio.
- **Create:** `backend/tests/test_entities_routes.py`
  - Cobertura TDD para `permalink_url` en endpoint de ads.
- **Modify:** `backend/tests/test_ads_ranking_route.py`
  - Cobertura TDD para `effective_object_story_permalink` en ranking.
- **Create:** `frontend/src/lib/adReference.ts`
  - Helper compartido para resolver URL final (permalink oficial > link CTA > story fallback > Ads Manager).
- **Create:** `frontend/src/components/AdReferenceLink.tsx`
  - Componente presentacional reutilizable para “Ver referencia”.
- **Modify:** `frontend/src/api/client.ts`
  - Tipos para `effective_object_story_permalink` y metadatos de referencia.
- **Modify:** `frontend/src/routes/DashboardPage.tsx`
  - Reemplazar lógica inline por helper/componente compartido y cubrir todas las tablas/listados de anuncios en Cuenta.
- **Modify:** `frontend/src/routes/PageDashboardPage.tsx`
  - Cargar `fetchAdsList` para construir mapa de enlaces en Página y pasarlo a componentes.
- **Modify:** `frontend/src/components/AdDiagnosticsTable.tsx`
  - Mostrar enlace de referencia encima del nombre del anuncio.
- **Modify:** `frontend/src/components/CreativeFatigueTable.tsx`
  - Mostrar enlace de referencia en tabla de fatiga por anuncio.
- **Modify:** `frontend/src/components/FunnelLevelTable.tsx`
  - Soportar enlace en filas `level="ad"` sin afectar `campaign`.

---

### Task 1: Backend TDD para permalink oficial en Ads List

**Files:**
- Create: `backend/tests/test_entities_routes.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/entities.py`
- Test: `backend/tests/test_entities_routes.py`

- [ ] **Step 1: Write the failing test**

```python
import httpx
import respx
import pytest
from fastapi.testclient import TestClient
from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as c:
        yield c


@respx.mock
def test_list_ads_includes_official_story_permalink(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "ad_1",
                        "name": "Ad 1",
                        "creative": {"effective_object_story_id": "111_222"},
                    }
                ]
            },
        )
    )
    respx.get("https://graph.facebook.com/v25.0/").mock(
        return_value=httpx.Response(
            200,
            json={
                "111_222": {
                    "id": "111_222",
                    "permalink_url": "https://www.facebook.com/111/posts/222/"
                }
            },
        )
    )

    r = client.get("/api/v1/accounts/act_123/ads", headers={"Authorization": "Bearer tok"})
    assert r.status_code == 200
    creative = r.json()["data"][0]["creative"]
    assert creative["effective_object_story_permalink"] == "https://www.facebook.com/111/posts/222/"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=src pytest tests/test_entities_routes.py::test_list_ads_includes_official_story_permalink -q`  
Expected: FAIL porque aún no existe `effective_object_story_permalink`.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/api/routes/entities.py
async def _fetch_post_permalinks(base: str, access_token: str, story_ids: set[str]) -> dict[str, str]:
    ...

@router.get("/{account_id}/ads")
async def list_ads(...):
    ...
    story_ids = {...}
    post_permalink_by_story_id = await _fetch_post_permalinks(base, access_token, story_ids)
    for row in data:
        ...
        if isinstance(creative, dict) and story_id:
            creative["effective_object_story_permalink"] = post_permalink_by_story_id.get(str(story_id))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && PYTHONPATH=src pytest tests/test_entities_routes.py -q`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/entities.py backend/tests/test_entities_routes.py
git commit -m "feat: expose official post permalink in ads list endpoint"
```

---

### Task 2: Backend TDD para permalink en Ads Performance (ranking)

**Files:**
- Modify: `backend/tests/test_ads_ranking_route.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py`
- Test: `backend/tests/test_ads_ranking_route.py`

- [ ] **Step 1: Write the failing test**

```python
@respx.mock
def test_ads_performance_includes_story_permalink(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": [{"ad_id": "ad_1", "spend": "10"}]})
    )
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={"data": [{"id": "ad_1", "name": "Ad 1", "creative": {"effective_object_story_id": "111_222"}}]},
        )
    )
    respx.get("https://graph.facebook.com/v25.0/").mock(
        return_value=httpx.Response(
            200,
            json={"111_222": {"id": "111_222", "permalink_url": "https://www.facebook.com/111/posts/222/"}},
        )
    )

    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert r.json()["data"][0]["effective_object_story_permalink"] == "https://www.facebook.com/111/posts/222/"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && PYTHONPATH=src pytest tests/test_ads_ranking_route.py::test_ads_performance_includes_story_permalink -q`  
Expected: FAIL por campo ausente.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/api/routes/ads_ranking.py
async def _fetch_post_permalinks(base: str, access_token: str, story_ids: set[str]) -> dict[str, str]:
    ...

story_ids = {...}
story_permalink_by_id = await _fetch_post_permalinks(base, access_token, story_ids)

enriched = {
    **row,
    "effective_object_story_id": story_id,
    "effective_object_story_permalink": story_permalink,
    ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && PYTHONPATH=src pytest tests/test_ads_ranking_route.py -q`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ads_ranking.py backend/tests/test_ads_ranking_route.py
git commit -m "feat: include official story permalink in ads performance rows"
```

---

### Task 3: Extraer util frontend compartido para URL de referencia

**Files:**
- Create: `frontend/src/lib/adReference.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/lib/adReference.ts` (validación por build + smoke)

- [ ] **Step 1: Write the failing type usage (build-level)**

```ts
// frontend/src/lib/adReference.ts
import type { AdRow, AdPerformanceRow } from "@/api/client";

export function adReferenceUrlFromCreativeLike(...) {
  // usará effective_object_story_permalink (aún no tipado en ambos modelos)
}
```

- [ ] **Step 2: Run build to verify it fails (si faltan tipos/campos)**

Run: `cd frontend && npm run build`  
Expected: FAIL si faltan campos tipados.

- [ ] **Step 3: Write minimal implementation + types**

```ts
// frontend/src/api/client.ts
export interface AdRow {
  ...
  creative?: {
    ...
    effective_object_story_permalink?: string;
  };
}
export interface AdPerformanceRow {
  ...
  effective_object_story_permalink?: string | null;
}

// frontend/src/lib/adReference.ts
export function adReferenceUrlFromCreativeLike(args: {
  adId?: string | null;
  accountId?: string | null;
  creative?: Record<string, unknown> | null;
  storyId?: string | null;
  storyPermalink?: string | null;
}): string | null {
  // prioridad: permalink oficial -> link_data/cta/template/photo -> story fallback -> ads manager
}

export function buildAdReferenceMapFromAdsList(rows: AdRow[], accountId: string): Map<string, string> {
  ...
}
```

- [ ] **Step 4: Run build to verify it passes**

Run: `cd frontend && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/adReference.ts frontend/src/api/client.ts
git commit -m "refactor: centralize ad reference url resolution in shared utility"
```

---

### Task 4: Componente UI reutilizable para “Ver referencia”

**Files:**
- Create: `frontend/src/components/AdReferenceLink.tsx`
- Test: `frontend/src/components/AdReferenceLink.tsx` (build-level)

- [ ] **Step 1: Write minimal usage snippet in component consumers (failing import)**

```tsx
import AdReferenceLink from "@/components/AdReferenceLink";
```

- [ ] **Step 2: Run build to verify it fails**

Run: `cd frontend && npm run build`  
Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implement component**

```tsx
// frontend/src/components/AdReferenceLink.tsx
import { ExternalLink } from "lucide-react";

export default function AdReferenceLink({ href, compact = false }: { href: string | null; compact?: boolean }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-primary hover:underline ${compact ? "text-[11px]" : "text-xs"}`}
      onClick={(e) => e.stopPropagation()}
    >
      Ver referencia
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
```

- [ ] **Step 4: Run build to verify it passes**

Run: `cd frontend && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AdReferenceLink.tsx
git commit -m "feat: add reusable ad reference link component"
```

---

### Task 5: Cobertura total en vista Cuenta

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx`
- Modify: `frontend/src/components/FunnelLevelTable.tsx`
- Modify: `frontend/src/components/CreativeFatigueTable.tsx`
- Test: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Write failing integration points (imports/props nuevos)**

```tsx
// DashboardPage.tsx
import { buildAdReferenceMapFromAdsList, adReferenceUrlFromCreativeLike } from "@/lib/adReference";
import AdReferenceLink from "@/components/AdReferenceLink";
```

```tsx
// FunnelLevelTable.tsx
interface FunnelLevelTableProps {
  rows: FunnelLevelRow[];
  level: "campaign" | "ad";
  adReferenceUrlById?: Map<string, string>;
}
```

```tsx
// CreativeFatigueTable.tsx
interface CreativeFatigueTableProps {
  ...
  adReferenceUrlById?: Map<string, string>;
}
```

- [ ] **Step 2: Run build to verify it fails**

Run: `cd frontend && npm run build`  
Expected: FAIL por props no cableadas.

- [ ] **Step 3: Implement minimal wiring in Cuenta**

```tsx
// DashboardPage.tsx
const adReferenceUrlById = useMemo(
  () => buildAdReferenceMapFromAdsList(adsListQuery.data?.data ?? [], id),
  [adsListQuery.data?.data, id],
);

// Ranking table row cell (encima del nombre)
<AdReferenceLink href={adReferenceUrlById.get(String(row.ad_id ?? "")) ?? adReferenceUrlFromCreativeLike(...)} />

// ActionDistributionSection props
<ActionDistributionSection ... adReferenceUrlById={adReferenceUrlById} />

// Creative cards list
<AdReferenceLink href={adReferenceUrlFromCreativeLike(...)} />

// Fatiga y embudo por anuncio
<CreativeFatigueTable ... adReferenceUrlById={adReferenceUrlById} />
<FunnelLevelTable rows={adRows} level="ad" adReferenceUrlById={adReferenceUrlById} />
```

- [ ] **Step 4: Run build + smoke QA**

Run:
- `cd frontend && npm run build`
- `cd .. && docker compose down && docker compose up -d --build`

Expected:
- Build PASS.
- En Cuenta, todas las tablas/listados con anuncios muestran “Ver referencia” encima del nombre.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx frontend/src/components/FunnelLevelTable.tsx frontend/src/components/CreativeFatigueTable.tsx
git commit -m "feat: add ad reference links across account-level ad views"
```

---

### Task 6: Cobertura total en vista Página

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`
- Modify: `frontend/src/components/AdDiagnosticsTable.tsx`
- Modify: `frontend/src/components/FunnelLevelTable.tsx` (reuso props)
- Test: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 1: Write failing wiring for Página**

```tsx
// PageDashboardPage.tsx
import { fetchAdsList } from "@/api/client";
import { buildAdReferenceMapFromAdsList } from "@/lib/adReference";
```

```tsx
const adsListQuery = useQuery({
  queryKey: ["ads-list", id, campaignId],
  queryFn: () => fetchAdsList(id, { campaignId }),
});
```

- [ ] **Step 2: Run build to verify it fails**

Run: `cd frontend && npm run build`  
Expected: FAIL hasta pasar props en todos los consumidores.

- [ ] **Step 3: Implement minimal wiring en Página**

```tsx
// PageDashboardPage.tsx
const adReferenceUrlById = useMemo(
  () => buildAdReferenceMapFromAdsList(adsListQuery.data?.data ?? [], id),
  [adsListQuery.data?.data, id],
);

<AdDiagnosticsTable
  data={adDiagnosticsQuery.data?.data}
  isLoading={adDiagnosticsQuery.isLoading}
  adReferenceUrlById={adReferenceUrlById}
/>

<ConversionFunnelCard ... adReferenceUrlById={adReferenceUrlById} />
```

```tsx
// AdDiagnosticsTable.tsx
interface AdDiagnosticsTableProps {
  ...
  adReferenceUrlById?: Map<string, string>;
}

// celda anuncio
<AdReferenceLink href={adReferenceUrlById?.get(row.ad_id) ?? null} compact />
<span className="truncate">{row.ad_name}</span>
```

- [ ] **Step 4: Run build + smoke QA**

Run:
- `cd frontend && npm run build`
- `cd .. && docker compose down && docker compose up -d --build`

Expected:
- Build PASS.
- En Página, las tablas/listados por anuncio tienen “Ver referencia”.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/PageDashboardPage.tsx frontend/src/components/AdDiagnosticsTable.tsx
git commit -m "feat: add ad reference links across page-level ad views"
```

---

### Task 7: QA final end-to-end + documentación breve

**Files:**
- Modify: `README.md`
- Test: manual E2E de Cuenta y Página

- [ ] **Step 1: Write acceptance checklist in docs**

```md
## Referencias de anuncios
- Dónde aparece “Ver referencia” en Cuenta.
- Dónde aparece “Ver referencia” en Página.
- Prioridad de URL: permalink oficial -> destino creativo -> story fallback -> Ads Manager.
```

- [ ] **Step 2: Run full verification**

Run:
- `cd backend && PYTHONPATH=src pytest tests/test_ads_ranking_route.py tests/test_entities_routes.py -q`
- `cd ../frontend && npm run build`
- `cd .. && docker compose down && docker compose up -d --build`

Expected:
- Tests PASS.
- Build PASS.
- Docker arriba sin errores.

- [ ] **Step 3: Manual QA script**

```text
1) Vista Cuenta > Ranking de anuncios: confirmar link abre referencia.
2) Vista Cuenta > Fatiga: confirmar link por fila.
3) Vista Cuenta > Embudo por anuncio: confirmar link por fila.
4) Vista Página > Diagnóstico de Creatividades: confirmar link por fila.
5) Caso sin permalink/publicación: confirmar fallback a Ads Manager.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document ad reference link behavior for account and page views"
```

---

## Spec Coverage Self-Review

- **Cobertura Cuenta:** `DashboardPage` (ranking, distribución por anuncio, listado de anuncios/creativos, fatiga, embudo por anuncio) cubierto.
- **Cobertura Página:** `PageDashboardPage` + `AdDiagnosticsTable` y componentes por anuncio cubiertos con mapa de referencias.
- **Fuente oficial Meta:** backend resuelve `permalink_url` por `effective_object_story_id` en ambos endpoints (`/ads`, `/ads/performance`).
- **Fallbacks:** definidos de forma determinística y reutilizable.
- **Docker al final:** incluido explícitamente en tareas de verificación.

## Placeholder Scan

- Sin “TODO/TBD”.
- Cada tarea incluye archivos exactos, comandos concretos y resultado esperado.
- Cada cambio de código incluye snippet mínimo implementable.

## Type Consistency Check

- Campo canónico: `effective_object_story_permalink` en backend y frontend.
- Mapa compartido: `adReferenceUrlById: Map<string, string>`.
- Componente único para UI: `AdReferenceLink`.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-24-enlaces-referencia-anuncios-cuenta-pagina.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

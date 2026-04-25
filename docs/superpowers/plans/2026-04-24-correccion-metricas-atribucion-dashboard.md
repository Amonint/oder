# Corrección métricas, atribución y consistencia dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear ventanas de atribución y definiciones de métricas entre ranking de anuncios, embudo de cuenta/página y módulo de atribución; hacer explícitos resultados/CPA/ROAS; corregir UX engañosa (KPI página, calidad de tráfico, diagnóstico de conjuntos); endurecer persistencia/scoring competitivo donde aplique.

**Architecture:** Reutilizar el mapeo `WINDOW_TO_META` ya presente en `backend/src/oderbiz_analytics/api/routes/attribution.py` (o extraer a módulo compartido `oderbiz_analytics/services/attribution_windows.py`) para que `fetch_insights_all_pages` en `ads/performance` reciba `action_attribution_windows` coherentes con la UI. El frontend pasa un único `attributionWindow` opcional desde `DashboardPage`/`client.ts` hacia `fetchAdsPerformance` y hacia el bloque de embudo. Cambios de producto acotados (YAGNI): no refactor masivo de carpetas.

**Tech Stack:** FastAPI, httpx/respx, React 18, TypeScript, TanStack Query, Meta Marketing API (Graph insights).

---

## Mapa de archivos (responsabilidades)

| Archivo | Rol |
|---------|-----|
| `backend/src/oderbiz_analytics/api/routes/attribution.py` | Fuente de verdad para códigos de ventana (`click_7d` → `7d_click`). |
| `backend/src/oderbiz_analytics/api/routes/ads_ranking.py` | Añadir query `attribution_window`, propagar a `fetch_insights_all_pages`. |
| `backend/src/oderbiz_analytics/adapters/meta/insights.py` | Ya soporta `action_attribution_windows`; sin cambio de firma salvo documentación. |
| `backend/tests/test_ads_ranking_route.py` | Nuevos tests de query string hacia Graph. |
| `frontend/src/api/client.ts` | `fetchAdsPerformance` + tipos: `attributionWindow?`. |
| `frontend/src/routes/DashboardPage.tsx` | Estado de ventana, pasar a `fetchAdsPerformance` y embudo. |
| `frontend/src/components/FunnelLevelTable.tsx` | Columnas/labels: `unique_clicks` vs `clicks`. |
| `frontend/src/components/KpiGrid.tsx` | Segunda métrica CTR enlace + renombre CTR. |
| `backend/src/oderbiz_analytics/api/routes/pages.py` | `get_page_insights`: añadir `inline_link_click_ctr` (y opcional `inline_link_clicks`) al `fields=`. |
| `frontend/src/routes/PageDashboardPage.tsx` | Tipos si el grid consume nuevos campos. |
| `frontend/src/components/dashboard-unificado/AdsetDiagnosticView.tsx` | Sustituir placeholder o renombrar honestamente. |
| `backend/src/oderbiz_analytics/services/competitor_classifier.py` | Ajuste listas negativas/positivas o lectura de env. |
| `backend/src/oderbiz_analytics/services/competitor_scoring_service.py` | Opcional: UPSERT o índice único lógico. |

---

### Task 1: Módulo compartido de ventanas de atribución (backend)

**Files:**
- Create: `backend/src/oderbiz_analytics/services/attribution_windows.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/attribution.py` (importar desde el módulo nuevo, eliminar duplicados locales)
- Test: `backend/tests/test_attribution_route.py` (sin cambio de comportamiento; ejecutar suite)

- [ ] **Step 1: Crear módulo con constantes y helper**

Create `backend/src/oderbiz_analytics/services/attribution_windows.py`:

```python
from __future__ import annotations

VALID_UI_WINDOWS: dict[str, str] = {
    "click_1d": "1 día tras clic",
    "click_7d": "7 días tras clic",
    "click_28d": "28 días tras clic",
    "view_1d": "1 día tras impresión",
    "view_7d": "7 días tras impresión",
}

UI_TO_META: dict[str, str] = {
    "click_1d": "1d_click",
    "click_7d": "7d_click",
    "click_28d": "28d_click",
    "view_1d": "1d_view",
    "view_7d": "7d_view",
}


def meta_window_list(ui_code: str) -> list[str]:
    if ui_code not in VALID_UI_WINDOWS:
        raise ValueError(f"unknown attribution window: {ui_code}")
    return [UI_TO_META[ui_code]]
```

- [ ] **Step 2: Refactor `attribution.py`** para usar `VALID_UI_WINDOWS`, `UI_TO_META` y `meta_window_list` del nuevo módulo (misma API HTTP pública del endpoint).

- [ ] **Step 3: Ejecutar tests de atribución**

Run: `cd "/Users/lamnda/Documents/oderbiz analitics/backend" && pytest tests/test_attribution_route.py -v`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/services/attribution_windows.py backend/src/oderbiz_analytics/api/routes/attribution.py
git commit -m "refactor(attribution): extract window mapping for reuse"
```

---

### Task 2: `ads/performance` — propagar `action_attribution_windows`

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py`
- Modify: `backend/src/oderbiz_analytics/services/attribution_windows.py` (si hace falta exportar lista de keys para OpenAPI)
- Test: `backend/tests/test_ads_ranking_route.py`

- [ ] **Step 1: Escribir test que falle — verificar query a Graph**

Append to `backend/tests/test_ads_ranking_route.py`:

```python
@respx.mock
def test_ads_performance_passes_attribution_window_to_graph(client):
    route = respx.get(url__regex=r"https://graph\.facebook\.com/v[\d.]+/act_123/insights.*").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get(
        "/api/v1/accounts/act_123/ads/performance",
        params={"date_preset": "last_7d", "attribution_window": "click_1d"},
        headers={"Authorization": "Bearer test_tok"},
    )
    assert r.status_code == 200
    assert route.calls.last.request.url.params.get("action_attribution_windows") == '["1d_click"]'
```

Run: `pytest backend/tests/test_ads_ranking_route.py::test_ads_performance_passes_attribution_window_to_graph -v`  
Expected: **FAIL** (param no existe o no se propaga).

- [ ] **Step 2: Implementar en `ads_ranking.py`**

- Añadir query opcional:  
  `attribution_window: str | None = Query(None, description="Misma semántica que GET .../insights/attribution: click_1d, click_7d, ...")`
- Si `attribution_window` es `None`, llamar `fetch_insights_all_pages` **sin** `action_attribution_windows` (comportamiento actual preservado).
- Si viene valor, validar contra `VALID_UI_WINDOWS` (422 si inválido) y pasar  
  `action_attribution_windows=meta_window_list(attribution_window)` a `fetch_insights_all_pages`.

- [ ] **Step 3: Ejecutar test**

Run: `pytest backend/tests/test_ads_ranking_route.py::test_ads_performance_passes_attribution_window_to_graph -v`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ads_ranking.py backend/src/oderbiz_analytics/services/attribution_windows.py backend/tests/test_ads_ranking_route.py
git commit -m "feat(ads): pass attribution_window to insights for ads performance"
```

---

### Task 3: Frontend — `fetchAdsPerformance` y Dashboard

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Extender tipo y query en `client.ts`**

En la interfaz de opciones de `fetchAdsPerformance`, añadir:

```ts
attributionWindow?:
  | "click_1d"
  | "click_7d"
  | "click_28d"
  | "view_1d"
  | "view_7d";
```

Y en el cuerpo de la función:

```ts
if (opts.attributionWindow) q.set("attribution_window", opts.attributionWindow);
```

- [ ] **Step 2: Estado en `DashboardPage.tsx`**

- Reutilizar o alinear con cualquier selector existente de la pestaña Avanzado/atribución: una variable `attributionWindow` con default `click_7d` (alineado con default de Meta cuando no se pasa param, según documentación).
- Pasar `attributionWindow` a todas las llamadas `fetchAdsPerformance` que alimentan ranking y embudo comercial.

- [ ] **Step 3: Verificación manual rápida**

Arrancar backend + frontend, cambiar ventana, comprobar en Network que la URL de `ads/performance` incluye `attribution_window=click_1d`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/routes/DashboardPage.tsx
git commit -m "feat(dashboard): wire attribution window to ads performance"
```

---

### Task 4: ROAS y resultados vacíos (backend + UI mínima)

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py` (asegurar `roas: null` cuando no hay señal, nunca `0` falso)
- Modify: `frontend/src/routes/DashboardPage.tsx` (render “—” si `roas == null`)

- [ ] **Step 1: Test de ROAS**

En `test_ads_ranking_route.py`, mock con `spend: "10"`, sin `purchase_roas`, sin `action_values` de compra; assert `body["data"][0]["roas"] is None`.

- [ ] **Step 2: Ajustar lógica** en el bucle `enriched` de `ads_ranking.py`: si `purchase_roas <= 0` y `roas_derived <= 0`, establecer `roas` en `None` (no `0.0`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ads_ranking.py backend/tests/test_ads_ranking_route.py frontend/src/routes/DashboardPage.tsx
git commit -m "fix(ads): omit roas when no purchase signal from Meta"
```

---

### Task 5: Embudo cuenta — `unique_clicks` alineado con página

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py` (`PERF_FIELDS` incluye `unique_clicks` si no está)
- Modify: `frontend/src/routes/DashboardPage.tsx` (mapeo `FunnelLevelRow`)
- Modify: `frontend/src/components/FunnelLevelTable.tsx` (labels “Clics únicos”)

- [ ] **Step 1: Añadir `unique_clicks` a `PERF_FIELDS`** en `ads_ranking.py` (hoy incluye `clicks` pero no `unique_clicks`).

- [ ] **Step 2: En `DashboardPage.tsx`**, donde se construye `FunnelLevelRow`, usar  
  `clicks: Number(row.unique_clicks ?? row.clicks ?? 0)` solo si la intención es alinear con embudo de página; renombrar propiedad TypeScript a `uniqueClicks` si se prefiere claridad (entonces actualizar `FunnelLevelTable`).

- [ ] **Step 3: Actualizar `FunnelLevelTable`** descripción y cabecera de columna a **“Clics únicos”** y tooltip: “Misma definición que unique_clicks en Insights.”

- [ ] **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ads_ranking.py frontend/src/routes/DashboardPage.tsx frontend/src/components/FunnelLevelTable.tsx
git commit -m "fix(funnel): use unique clicks for account funnel consistency"
```

---

### Task 6: KPI página — CTR enlace + backend fields

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py` (`get_page_insights` fields)
- Modify: `frontend/src/components/KpiGrid.tsx`
- Modify: `frontend/src/api/client.ts` (tipo `PageKpiRow` si aplica)

- [ ] **Step 1: Backend** — extender `fields=` en `get_page_insights`:

```python
fields="spend,impressions,reach,frequency,cpm,ctr,inline_link_click_ctr,inline_link_clicks"
```

- [ ] **Step 2: Frontend `KpiGrid`** — duplicar entrada en `KPI_DEFS`:

- Renombrar label de `ctr` a **“CTR (todos los clics)”** (tooltip citando definición Meta).
- Nueva fila `inline_link_click_ctr` con label **“CTR enlace”**.

- [ ] **Step 3: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/pages.py frontend/src/components/KpiGrid.tsx frontend/src/api/client.ts
git commit -m "feat(page-kpis): show inline link CTR alongside all-clicks CTR"
```

---

### Task 7: Calidad de tráfico — honestidad de naming

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx` (título de sección / card)
- Opcional: `backend/src/oderbiz_analytics/api/routes/pages.py` docstring de `get_page_traffic_quality`

- [ ] **Step 1:** Cambiar copy visible de **“Calidad de tráfico”** a **“Clics y coste (Ads)”** o equivalente, más subtítulo: “No incluye comportamiento en sitio (Pixel/GA4).”

- [ ] **Step 2: Commit**

```bash
git add frontend/src/routes/PageDashboardPage.tsx backend/src/oderbiz_analytics/api/routes/pages.py
git commit -m "docs(ui): clarify traffic quality block is Meta click signals only"
```

---

### Task 8: Diagnóstico de conjuntos — Opción B rápida (recomendada antes que motor completo)

**Files:**
- Modify: `frontend/src/components/dashboard-unificado/AdsetDiagnosticView.tsx`

- [ ] **Step 1:** Sustituir título por **“Contexto de filtro (conjunto)”** y texto que remite a geo/placement/audiencia **sin** prometer diagnóstico automático hasta implementar reglas (Task 8b futura).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard-unificado/AdsetDiagnosticView.tsx
git commit -m "fix(ui): de-hype adset panel until diagnostics exist"
```

*(Task 8b opcional posterior: portar reglas de `insights_diagnostics.py` a endpoint + UI con umbrales `min_impressions`.)*

---

### Task 9: Radar competitivo — colisiones léxicas y persistencia

**Files:**
- Modify: `backend/src/oderbiz_analytics/services/competitor_classifier.py`
- Modify: `backend/src/oderbiz_analytics/services/competitor_scoring_service.py`
- Test: nuevo `backend/tests/test_competitor_classifier.py` (si no existe)

- [ ] **Step 1: Test de regresión** — texto “terapia bienestar salud mental” no debe penalizarse como “gym” solo por “salud”; ajustar listas: quitar `fitness`, `gym` de `default_negative_keywords` o moverlos a categoría opcional cargada por env `COMPETITOR_NEGATIVE_EXTRA`.

- [ ] **Step 2: Persistencia** — añadir método `save_classification_latest` que haga `DELETE` previo por tupla `(page_id, user_page_id, search_term, country)` + `INSERT`, o usar `INSERT OR REPLACE` si se añade clave única en DuckDB (migración explícita en `_init_tables`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/oderbiz_analytics/services/competitor_classifier.py backend/src/oderbiz_analytics/services/competitor_scoring_service.py backend/tests/test_competitor_classifier.py
git commit -m "fix(competitor): soften negative keywords and dedupe classifications"
```

---

### Task 10: Módulo atribución — nota anti-doble conteo (UI)

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx` (pestaña/sección que usa `fetchAttributionInsights`, ~línea 642 según código actual)

- [ ] **Step 1:** Añadir `Alert` visible junto al selector de ventana: “No sumes valores de distintas ventanas; cada ventana es un modelo de atribución distinto.”

- [ ] **Step 2: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx
git commit -m "docs(attribution): warn users not to sum across windows"
```

---

## Self-review (checklist interna)

1. **Cobertura del spec de auditoría:** Atribución en ranking (Tasks 1–3), ROAS (4), embudo clics (5), KPI CTR (6), calidad tráfico (7), diagnóstico conjuntos (8), radar (9), doble conteo (10). **Gaps intencionales (YAGNI):** normalización avanzada de placements por formato; tests E2E browser; Task 8b motor de diagnóstico completo.
2. **Placeholders:** Ninguno “TBD”; rutas explícitas en cada tarea.
3. **Consistencia:** `attribution_window` en API alineado con códigos UI ya usados en `attribution.py`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-correccion-metricas-atribucion-dashboard.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — Un subagente por tarea, revisión entre tareas, iteración rápida (skill: `subagent-driven-development`).

2. **Inline Execution** — Ejecutar tareas en esta sesión con checkpoints (skill: `executing-plans`).

**Which approach?**

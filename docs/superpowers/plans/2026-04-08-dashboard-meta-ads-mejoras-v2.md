# Dashboard Meta Ads — Mejoras v2 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar mejoras funcionales al dashboard de analítica Meta Ads: selector de fechas extendido (Hoy + Personalizado), gráficos de rendimiento con más métricas, mapa coroplético de Ecuador, sección de etiquetas de anuncios, limpieza de tablas de páginas/cuentas, y métricas de engagement orgánico.

**Architecture:** El frontend usa React 19 + TanStack Query + shadcn/ui + Recharts. El backend usa FastAPI + httpx para llamar a la Marketing API de Meta. Los filtros de fecha globales fluyen desde `FilterContext` hacia todos los endpoints via parámetros `date_preset` o `time_range`. Se agregan 2 nuevos routers (ad_labels, organic) y se extienden los existentes.

**Tech Stack:** TypeScript/React 19, shadcn/ui v4, Recharts 3, MapLibre GL JS, Python 3.12, FastAPI, httpx, respx (testing), pytest

---

> **Nota de subsistemas:** Este plan cubre 6 subsistemas independientes. Se pueden ejecutar por separado en este orden recomendado: A (fechas) → B (gráficos) → C (geo) → D (labels) → E (cleanup) → F (orgánico). El Subsistema A es fundación para B, C, D.

---

## Mapa de Archivos

### Archivos Nuevos
| Archivo | Responsabilidad |
|---|---|
| `frontend/src/components/DateRangePickerModal.tsx` | Modal de selección de rango de fechas con shadcn Calendar |
| `frontend/src/components/GeoBarChart.tsx` | Barras horizontales de provincias (extraído/renombrado de GeoMap) |
| `frontend/src/components/ChoroplethMap.tsx` | Mapa MapLibre coroplético de Ecuador |
| `frontend/src/components/AdLabelsSection.tsx` | Sección de rendimiento por etiquetas (barras + tabla) |
| `frontend/src/components/OrganicKpiCard.tsx` | Tarjetas KPI de engagement orgánico |
| `frontend/public/ecuador-provinces.geojson` | GeoJSON estático de provincias de Ecuador |
| `backend/src/oderbiz_analytics/api/routes/ad_labels.py` | Endpoint que agrega insights por etiqueta |
| `backend/src/oderbiz_analytics/api/routes/organic.py` | Endpoint de Page Insights para métricas orgánicas |
| `backend/tests/test_date_range_dashboard.py` | Tests del parámetro `time_range` en dashboard |
| `backend/tests/test_ad_labels_route.py` | Tests del endpoint de etiquetas |
| `backend/tests/test_organic_route.py` | Tests del endpoint orgánico |

### Archivos Modificados
| Archivo | Cambio |
|---|---|
| `frontend/src/context/FilterContext.tsx` | Agregar `dateStart`, `dateStop` al estado |
| `frontend/src/api/client.ts` | Pasar `dateStart`/`dateStop` en todas las funciones de página; agregar `fetchAdLabelsPerformance`, `fetchOrganicEngagement` |
| `frontend/src/routes/PageDashboardPage.tsx` | Usar nuevo selector de fechas, integrar ChoroplethMap, AdLabelsSection, OrganicKpiCard |
| `frontend/src/routes/DashboardPage.tsx` | Nuevo selector de fechas |
| `frontend/src/routes/PagesPage.tsx` | Actualizar presets de fecha |
| `frontend/src/routes/AccountsPage.tsx` | Mejorar separación de tablas con estados vacíos |
| `frontend/src/components/GeoMap.tsx` | Escala Y dinámica + renombrar componente internamente |
| `frontend/src/components/TimeseriesChart.tsx` | Agregar series CPM, CTR, CPC con checkboxes |
| `backend/src/oderbiz_analytics/api/routes/dashboard.py` | Agregar `date_start`/`date_stop` Query params |
| `backend/src/oderbiz_analytics/api/routes/pages.py` | Agregar `date_start`/`date_stop`, agregar cpc/cpm/ctr a timeseries |
| `backend/src/oderbiz_analytics/services/geo_formatter.py` | Agregar mapeo de provincias de Ecuador |
| `backend/src/oderbiz_analytics/api/main.py` | Registrar `ad_labels_router` y `organic_router` |

---

## SUBSISTEMA A: Selector de Fechas

### Task 1: Backend — soporte `date_start`/`date_stop` en dashboard y pages

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/dashboard.py:60-107`
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py:34-481` (cada endpoint)
- Test: `backend/tests/test_date_range_dashboard.py`

- [ ] **Step 1.1: Escribir test para `date_start`/`date_stop` en dashboard**

```python
# backend/tests/test_date_range_dashboard.py
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
def test_dashboard_with_date_start_stop_passes_time_range(client):
    route = respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "impressions": "100", "clicks": "5", "spend": "2.00",
                        "reach": "90", "frequency": "1.1", "cpm": "20",
                        "cpp": "22", "ctr": "5", "actions": [], "cost_per_action_type": [],
                        "date_start": "2026-04-08", "date_stop": "2026-04-08",
                    }
                ]
            },
        )
    )
    r = client.get(
        "/api/v1/accounts/act_123/dashboard",
        params={"date_start": "2026-04-08", "date_stop": "2026-04-08"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["insights_empty"] is False
    assert body["summary"]["impressions"] == 100.0
    # Verifica que se usó time_range y NO date_preset
    called_url = str(route.calls[0].request.url)
    assert "time_range" in called_url
    assert "date_preset" not in called_url


@respx.mock
def test_dashboard_date_preset_still_works(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get(
        "/api/v1/accounts/act_123/dashboard",
        params={"date_preset": "last_7d"},
    )
    assert r.status_code == 200
    assert r.json()["insights_empty"] is True
```

- [ ] **Step 1.2: Correr test — debe fallar**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/test_date_range_dashboard.py -v
```
Expected: FAIL — `time_range` no se pasa todavía.

- [ ] **Step 1.3: Agregar `date_start`/`date_stop` al endpoint `dashboard.py`**

```python
# backend/src/oderbiz_analytics/api/routes/dashboard.py
# Reemplazar la firma de get_account_dashboard:

@router.get("/{ad_account_id}/dashboard")
async def get_account_dashboard(
    ad_account_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None, description="YYYY-MM-DD. Si se especifica junto con date_stop, sobreescribe date_preset."),
    date_stop: str | None = Query(None, description="YYYY-MM-DD."),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    cid = (campaign_id or "").strip()

    # Resuelve time_range vs date_preset
    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    effective_date_preset: str | None = date_preset
    if ds and de:
        effective_time_range = {"since": ds, "until": de}
        effective_date_preset = None

    try:
        if cid:
            rows = await fetch_insights_all_pages(
                base_url=base,
                access_token=access_token,
                ad_account_id=normalized_id,
                fields=FIELDS,
                level="campaign",
                date_preset=effective_date_preset,
                time_range=effective_time_range,
                filtering=[{"field": "campaign.id", "operator": "IN", "value": [cid]}],
                max_pages=10,
            )
        else:
            rows = await fetch_account_insights(
                base_url=base,
                access_token=access_token,
                ad_account_id=normalized_id,
                date_preset=effective_date_preset,
                time_range=effective_time_range,
                fields=FIELDS,
            )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="La API de Meta devolvió un error al obtener insights.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    empty_summary = {k: 0.0 for k in SUMMARY_KEYS}
    if not rows:
        return {
            "ad_account_id": normalized_id,
            "date_preset": date_preset,
            "campaign_id": cid or None,
            "scope": "campaign" if cid else "account",
            "insights_empty": True,
            "summary": empty_summary,
            "actions": [],
            "cost_per_action_type": [],
            "date_start": None,
            "date_stop": None,
        }

    row = rows[0]
    return {
        "ad_account_id": normalized_id,
        "date_preset": date_preset,
        "campaign_id": cid or None,
        "scope": "campaign" if cid else "account",
        "insights_empty": False,
        "summary": _build_summary_row(row),
        "actions": _action_entries(row.get("actions")),
        "cost_per_action_type": _action_entries(row.get("cost_per_action_type")),
        "date_start": row.get("date_start"),
        "date_stop": row.get("date_stop"),
    }
```

También necesitas verificar que `fetch_account_insights` acepte `time_range`. Busca su definición en `adapters/meta/insights.py` — ya acepta `time_range: dict | None`. Si el wrapper `fetch_account_insights` no lo expone, agrégalo:

```python
# backend/src/oderbiz_analytics/adapters/meta/insights.py
# Verificar que fetch_account_insights tenga la firma:
async def fetch_account_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    fields: str,
    date_preset: str | None = None,
    time_range: dict[str, str] | None = None,  # <— agregar si falta
    ...
```

- [ ] **Step 1.4: Agregar `date_start`/`date_stop` a todos los endpoints de `pages.py`**

Para cada endpoint (`get_pages_list`, `get_page_insights`, `get_page_placements`, `get_page_geo`, `get_page_actions`, `get_page_timeseries`), agregar:

```python
# Patrón a aplicar a cada función — ejemplo para get_page_insights:
@router.get("/{ad_account_id}/pages/{page_id}/insights")
async def get_page_insights(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}
        effective_preset = date_preset or ""  # no se usará si time_range está activo
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid, sid, aid = (campaign_id or "").strip(), (adset_id or "").strip(), (ad_id or "").strip()

    cache_key = _make_cache_key(normalized_id, "page_insights", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    # ... resto del cuerpo sin cambios, pero pasar time_range a fetch_insights_all_pages:
    rows = await fetch_insights_all_pages(
        base_url=base, access_token=access_token, ad_account_id=normalized_id,
        fields="spend,impressions,reach,frequency,cpm,ctr",
        date_preset=effective_preset if not effective_time_range else None,
        time_range=effective_time_range,
        level="account", filtering=filtering,
    )
```

Aplicar este mismo patrón a los 5 endpoints restantes de `pages.py`.

- [ ] **Step 1.5: Correr tests y verificar que pasan**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/test_date_range_dashboard.py tests/test_dashboard_route.py -v
```
Expected: todos PASS.

- [ ] **Step 1.6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/dashboard.py \
        backend/src/oderbiz_analytics/api/routes/pages.py \
        backend/tests/test_date_range_dashboard.py
git commit -m "feat(backend): add date_start/date_stop support to dashboard and pages routes"
```

---

### Task 2: FilterContext + client.ts — soporte de rango personalizado

**Files:**
- Modify: `frontend/src/context/FilterContext.tsx`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 2.1: Extender `FilterContext` con `dateStart`/`dateStop`**

```typescript
// frontend/src/context/FilterContext.tsx — reemplazar completamente
import { createContext, useContext, useState, type ReactNode } from "react";

export interface FilterState {
  datePreset: string;
  dateStart: string | null;
  dateStop: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
}

interface FilterContextValue extends FilterState {
  setFilter: (partial: Partial<FilterState>) => void;
  /** Devuelve los parámetros de fecha resueltos para pasar a fetchXxx */
  dateParams: () => { datePreset?: string; dateStart?: string; dateStop?: string };
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FilterState>({
    datePreset: "last_30d",
    dateStart: null,
    dateStop: null,
    campaignId: null,
    adsetId: null,
    adId: null,
  });

  function setFilter(partial: Partial<FilterState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function dateParams() {
    if (state.datePreset === "today") {
      const today = new Date().toISOString().slice(0, 10);
      return { dateStart: today, dateStop: today };
    }
    if (state.datePreset === "custom" && state.dateStart && state.dateStop) {
      return { dateStart: state.dateStart, dateStop: state.dateStop };
    }
    return { datePreset: state.datePreset };
  }

  return (
    <FilterContext.Provider value={{ ...state, setFilter, dateParams }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within FilterProvider");
  return ctx;
}
```

- [ ] **Step 2.2: Actualizar `fetchAccountDashboard` en `client.ts`**

```typescript
// frontend/src/api/client.ts — reemplazar fetchAccountDashboard:
export async function fetchAccountDashboard(
  adAccountId: string,
  datePreset: string,
  opts?: {
    campaignId?: string | null;
    dateStart?: string;
    dateStop?: string;
  }
): Promise<DashboardResponse> {
  const q = new URLSearchParams();
  if (opts?.dateStart && opts?.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else {
    q.set("date_preset", datePreset);
  }
  if (opts?.campaignId) q.set("campaign_id", opts.campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/dashboard?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2.3: Actualizar `buildPageQuery` en `client.ts`**

```typescript
// frontend/src/api/client.ts — reemplazar type PageFilterOpts y buildPageQuery:
type PageFilterOpts = {
  datePreset?: string;
  dateStart?: string;
  dateStop?: string;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
};

function buildPageQuery(opts: PageFilterOpts): URLSearchParams {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  if (opts.adId) q.set("ad_id", opts.adId);
  return q;
}
```

- [ ] **Step 2.4: Actualizar `fetchPages` en `client.ts`**

```typescript
export async function fetchPages(
  adAccountId: string,
  opts: { datePreset?: string; dateStart?: string; dateStop?: string } = {}
): Promise<PagesListResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/pages?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2.5: Build TypeScript para verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 2.6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/context/FilterContext.tsx frontend/src/api/client.ts
git commit -m "feat(frontend): extend FilterContext and client with custom date range support"
```

---

### Task 3: Componente DateRangePickerModal (shadcn Calendar + Dialog)

**Files:**
- Create: `frontend/src/components/DateRangePickerModal.tsx`

- [ ] **Step 3.1: Instalar shadcn Calendar y Dialog**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && pnpm dlx shadcn@latest add calendar dialog
```
Expected: aparecen `frontend/src/components/ui/calendar.tsx` y `frontend/src/components/ui/dialog.tsx`.

- [ ] **Step 3.2: Crear `DateRangePickerModal.tsx`**

```tsx
// frontend/src/components/DateRangePickerModal.tsx
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface DateRangePickerModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
  initialStart?: string;
  initialEnd?: string;
}

export default function DateRangePickerModal({
  open,
  onClose,
  onApply,
  initialStart,
  initialEnd,
}: DateRangePickerModalProps) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (initialStart && initialEnd) {
      return {
        from: new Date(initialStart + "T00:00:00"),
        to: new Date(initialEnd + "T00:00:00"),
      };
    }
    return undefined;
  });

  const isValid =
    range?.from != null &&
    range?.to != null &&
    range.from <= range.to;

  function handleApply() {
    if (!isValid || !range?.from || !range?.to) return;
    onApply(
      format(range.from, "yyyy-MM-dd"),
      format(range.to, "yyyy-MM-dd"),
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Seleccionar rango de fechas</DialogTitle>
        </DialogHeader>
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          locale={es}
          numberOfMonths={1}
          toDate={new Date()}
        />
        {range?.from && range?.to && !isValid && (
          <p className="text-destructive text-xs">
            La fecha de inicio debe ser menor o igual a la fecha fin.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!isValid} onClick={handleApply}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3.3: Instalar `date-fns` si no está disponible**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && pnpm add date-fns
```

- [ ] **Step 3.4: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3.5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/DateRangePickerModal.tsx \
        frontend/src/components/ui/calendar.tsx \
        frontend/src/components/ui/dialog.tsx \
        frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add DateRangePickerModal with shadcn Calendar"
```

---

### Task 4: Actualizar selector de fechas en DashboardPage y PageDashboardPage

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx:71-76`
- Modify: `frontend/src/routes/PageDashboardPage.tsx:40-45`

- [ ] **Step 4.1: Actualizar `DATE_PRESETS` y lógica en `DashboardPage.tsx`**

Buscar el bloque `const DATE_PRESETS = [...]` (línea ~71) y reemplazarlo + agregar estado para modal:

```typescript
// Reemplazar DATE_PRESETS
const DATE_PRESETS = [
  { value: "today", label: "Hoy" },
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
  { value: "maximum", label: "Máximo disponible" },
] as const;
```

Agregar dentro del componente `DashboardPage` (después de los `useState` existentes):

```typescript
const [showDateModal, setShowDateModal] = useState(false);
const [customDateStart, setCustomDateStart] = useState<string | null>(null);
const [customDateStop, setCustomDateStop] = useState<string | null>(null);

// Parámetros efectivos de fecha para queries
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
```

Reemplazar la llamada al `Select` de fecha actual. Agregar handler `onValueChange`:

```typescript
function handleDatePresetChange(value: string) {
  if (value === "custom") {
    setShowDateModal(true);
  } else {
    setDatePreset(value);
    setCustomDateStart(null);
    setCustomDateStop(null);
  }
}
```

En el `Select` de fecha, cambiar `onValueChange={setDatePreset}` a `onValueChange={handleDatePresetChange}`.

En el valor del trigger, agregar label para rango personalizado:

```tsx
<SelectValue>
  {datePreset === "custom" && customDateStart && customDateStop
    ? `${customDateStart} → ${customDateStop}`
    : DATE_PRESETS.find((p) => p.value === datePreset)?.label ?? datePreset}
</SelectValue>
```

Agregar el modal al JSX del componente (antes del `return` final):

```tsx
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
```

Actualizar todas las llamadas `useQuery` que usan `datePreset` para pasar `effectiveDateParams`:

```typescript
// Ejemplo para fetchAccountDashboard:
queryFn: () => fetchAccountDashboard(id, datePreset, {
  campaignId: campaignKey,
  ...effectiveDateParams,
}),
```

Agregar import al top del archivo:

```typescript
import DateRangePickerModal from "@/components/DateRangePickerModal";
```

- [ ] **Step 4.2: Mismo patrón en `PageDashboardPage.tsx`**

Reemplazar `DATE_PRESETS` con la misma lista de 6 opciones. Agregar `showDateModal`, `customDateStart`, `customDateStop` y `effectiveDateParams` con la misma lógica. Actualizar todas las `useQuery` que usan `opts = { datePreset, ... }` para incluir `dateStart`/`dateStop` de `effectiveDateParams`.

- [ ] **Step 4.3: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4.4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/DashboardPage.tsx frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): add Hoy and Personalizado date presets with calendar modal"
```

---

## SUBSISTEMA B: Gráficos de Rendimiento

### Task 5: Backend — agregar CPM, CTR, CPC al endpoint timeseries

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py:439-481` (get_page_timeseries)

- [ ] **Step 5.1: Actualizar campos en `get_page_timeseries`**

```python
# En get_page_timeseries, cambiar la llamada a fetch_insights_all_pages:
rows = await fetch_insights_all_pages(
    base_url=base, access_token=access_token, ad_account_id=normalized_id,
    fields="spend,impressions,reach,cpm,ctr,cpc",  # agregar cpm,ctr,cpc
    date_preset=effective_preset if not effective_time_range else None,
    time_range=effective_time_range,
    level="account", filtering=filtering, time_increment=1,
)
```

- [ ] **Step 5.2: Actualizar `PageTimeseriesRow` en `client.ts`**

```typescript
// frontend/src/api/client.ts — agregar campos a PageTimeseriesRow:
export interface PageTimeseriesRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  cpm?: string;
  ctr?: string;
  cpc?: string;
  date_start?: string;
  date_stop?: string;
}
```

- [ ] **Step 5.3: Correr tests existentes para verificar que no se rompió nada**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/ -v -k "page"
```
Expected: PASS.

- [ ] **Step 5.4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/pages.py frontend/src/api/client.ts
git commit -m "feat(backend): add cpm/ctr/cpc fields to page timeseries endpoint"
```

---

### Task 6: Frontend — TimeseriesChart con series toggle

**Files:**
- Modify: `frontend/src/components/TimeseriesChart.tsx`

- [ ] **Step 6.1: Reemplazar `TimeseriesChart.tsx` con versión de múltiples series**

```tsx
// frontend/src/components/TimeseriesChart.tsx
import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PageTimeseriesRow } from "@/api/client";

interface TimeseriesChartProps {
  data: PageTimeseriesRow[] | undefined;
  isLoading: boolean;
}

const SERIES = [
  { key: "spend", label: "Gasto ($)", yAxis: "money", stroke: "#3b82f6", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "impressions", label: "Impresiones", yAxis: "count", stroke: "#8b5cf6", format: (v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v) },
  { key: "cpm", label: "CPM", yAxis: "money", stroke: "#f59e0b", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "ctr", label: "CTR (%)", yAxis: "pct", stroke: "#10b981", format: (v: number) => `${v.toFixed(2)}%` },
  { key: "cpc", label: "CPC ($)", yAxis: "money", stroke: "#ef4444", format: (v: number) => `$${v.toFixed(2)}` },
] as const;

export default function TimeseriesChart({ data, isLoading }: TimeseriesChartProps) {
  const [active, setActive] = useState<Set<string>>(new Set(["spend", "impressions"]));

  const rows = (data ?? []).map((r) => ({
    date: r.date_start ?? "",
    spend: parseFloat(r.spend ?? "0"),
    impressions: parseInt(r.impressions ?? "0"),
    cpm: parseFloat(r.cpm ?? "0"),
    ctr: parseFloat(r.ctr ?? "0"),
    cpc: parseFloat(r.cpc ?? "0"),
  }));

  function toggleSerie(key: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Cómo evolucionó?</CardTitle>
        <div className="flex flex-wrap gap-2 pt-1">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSerie(s.key)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                active.has(s.key)
                  ? "border-transparent text-white"
                  : "border-border text-muted-foreground bg-background"
              }`}
              style={active.has(s.key) ? { backgroundColor: s.stroke, borderColor: s.stroke } : {}}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : rows.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Se necesitan al menos 2 días de datos para mostrar la evolución.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rows} margin={{ left: 8, right: 32 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                yAxisId="money"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `$${v}`}
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                formatter={(v: number, name: string) => {
                  const s = SERIES.find((x) => x.label === name);
                  return [s ? s.format(v) : String(v), name];
                }}
              />
              <Legend />
              {SERIES.filter((s) => active.has(s.key)).map((s) => (
                <Line
                  key={s.key}
                  yAxisId={s.yAxis}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.stroke}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6.2: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 6.3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/TimeseriesChart.tsx
git commit -m "feat(frontend): add CPM/CTR/CPC series with toggle to TimeseriesChart"
```

---

### Task 7: GeoMap.tsx — escala Y dinámica

**Files:**
- Modify: `frontend/src/components/GeoMap.tsx`

- [ ] **Step 7.1: Reemplazar el `<YAxis />` en `GeoMap.tsx` con escala dinámica**

```tsx
// frontend/src/components/GeoMap.tsx — reemplazar <YAxis /> (línea ~48):
// Antes:
// <YAxis />
// Después:
const maxVal = Math.max(...chartData.map((d) => (typeof d.value === "number" ? d.value : 0)));
const yDomain: [number, number] = [0, maxVal > 0 ? Math.ceil(maxVal * 1.15) : 1];

// En el JSX:
<YAxis domain={yDomain} tick={{ fontSize: 11 }} />
```

El componente completo actualizado:

```tsx
// frontend/src/components/GeoMap.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GeoInsightRow, GeoMetadata } from "@/api/client";

interface GeoMapProps {
  data: GeoInsightRow[];
  metadata: GeoMetadata;
  metric?: "impressions" | "clicks" | "spend" | "reach";
}

export default function GeoMap({ data, metadata, metric = "impressions" }: GeoMapProps) {
  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertDescription>No hay datos geográficos disponibles.</AlertDescription>
      </Alert>
    );
  }

  const chartData = data
    .map((row) => ({
      region: row.region_name || row.region,
      value: metric === "spend" ? parseFloat(row.spend) : Number(row[metric]),
    }))
    .sort((a, b) => b.value - a.value);

  const maxVal = Math.max(...chartData.map((d) => d.value));
  const yDomain: [number, number] = [0, maxVal > 0 ? Math.ceil(maxVal * 1.15) : 1];

  const metricLabel =
    metric === "impressions" ? "Impresiones"
    : metric === "clicks" ? "Clicks"
    : metric === "spend" ? "Gasto"
    : "Alcance";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución Geográfica — {metricLabel}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {metadata.scope === "account" ? "Toda la cuenta" : `Anuncio: ${metadata.ad_id}`} • {metadata.total_rows} regiones
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={yDomain} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="region" width={120} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => {
                if (typeof value !== "number") return String(value);
                return metric === "spend" ? `$${value.toFixed(2)}` : value.toLocaleString("es");
              }}
            />
            <Bar dataKey="value" fill="#3b82f6" radius={[0, 3, 3, 0]}>
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={idx === 0 ? "#2563eb" : "#93c5fd"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7.2: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 7.3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/GeoMap.tsx
git commit -m "feat(frontend): dynamic Y axis and horizontal bars in GeoMap"
```

---

## SUBSISTEMA C: Distribución Geográfica

### Task 8: Backend — mapeo de provincias de Ecuador en geo_formatter

**Files:**
- Modify: `backend/src/oderbiz_analytics/services/geo_formatter.py`

- [ ] **Step 8.1: Agregar mapeo de Ecuador a `geo_formatter.py`**

```python
# backend/src/oderbiz_analytics/services/geo_formatter.py
# Agregar a continuación del dict GEO_REGION_NAMES existente:

EC_REGION_NAMES: dict[str, str] = {
    # Meta API devuelve nombres con "Province" suffix para Ecuador
    "Pichincha Province": "Pichincha",
    "Guayas Province": "Guayas",
    "Azuay Province": "Azuay",
    "Manabi Province": "Manabí",
    "El Oro Province": "El Oro",
    "Los Rios Province": "Los Ríos",
    "Loja Province": "Loja",
    "Tungurahua Province": "Tungurahua",
    "Chimborazo Province": "Chimborazo",
    "Imbabura Province": "Imbabura",
    "Cotopaxi Province": "Cotopaxi",
    "Esmeraldas Province": "Esmeraldas",
    "Bolivar Province": "Bolívar",
    "Canar Province": "Cañar",
    "Carchi Province": "Carchi",
    "Napo Province": "Napo",
    "Pastaza Province": "Pastaza",
    "Morona-Santiago Province": "Morona Santiago",
    "Zamora-Chinchipe Province": "Zamora Chinchipe",
    "Sucumbios Province": "Sucumbíos",
    "Orellana Province": "Orellana",
    "Santo Domingo de los Tsachilas Province": "Santo Domingo",
    "Santa Elena Province": "Santa Elena",
    "Galapagos Province": "Galápagos",
}

# Mapa unificado (EC tiene prioridad para desambiguación)
UNIFIED_REGION_NAMES = {**GEO_REGION_NAMES, **EC_REGION_NAMES}
```

Actualizar `enrich_geo_row` para usar `UNIFIED_REGION_NAMES`:

```python
def enrich_geo_row(row: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(row)
    region_code = enriched.get("region", "") or ""
    enriched["region_name"] = UNIFIED_REGION_NAMES.get(region_code, region_code)
    return enriched
```

- [ ] **Step 8.2: Correr tests de geo**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/ -v -k "geo"
```
Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/services/geo_formatter.py
git commit -m "feat(backend): add Ecuador province name mapping to geo_formatter"
```

---

### Task 9: Agregar GeoJSON de Ecuador y componente ChoroplethMap

**Files:**
- Create: `frontend/public/ecuador-provinces.geojson`
- Create: `frontend/src/components/ChoroplethMap.tsx`

- [ ] **Step 9.1: Obtener GeoJSON de Ecuador**

Descargar el GeoJSON de provincias de Ecuador desde una fuente pública (sin API key):

```bash
# Descarga desde gadm.org level 1 (provincias) para Ecuador
curl -L "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_ECU_1.json" \
  -o "/Users/lamnda/Documents/oderbiz analitics/frontend/public/ecuador-provinces.geojson"
```

Si el archivo es muy grande (>2MB), procésalo para dejar solo las propiedades necesarias:

```bash
# Verificar tamaño
ls -lh "/Users/lamnda/Documents/oderbiz analitics/frontend/public/ecuador-provinces.geojson"
```

La propiedad de nombre de provincia en GADM es `NAME_1`. Verificar:

```bash
python3 -c "
import json
with open('/Users/lamnda/Documents/oderbiz analitics/frontend/public/ecuador-provinces.geojson') as f:
    gj = json.load(f)
print([f['properties'].get('NAME_1') for f in gj['features'][:5]])
"
```
Expected: lista de nombres como `['Azuay', 'Bolívar', 'Cañar', ...]`

- [ ] **Step 9.2: Instalar MapLibre GL**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && pnpm add maplibre-gl
```

- [ ] **Step 9.3: Crear `ChoroplethMap.tsx`**

```tsx
// frontend/src/components/ChoroplethMap.tsx
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChoroplethMapProps {
  data: Array<{ region_name: string; spend: number; impressions?: number }>;
  metric?: "spend" | "impressions";
}

// Convierte nombre normalizado (de geo_formatter) a nombre en GADM NAME_1
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
  const popupRef = useRef<maplibregl.Popup | null>(null);

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
      // Construir lookup de valor por provincia
      const lookup: Record<string, number> = {};
      for (const row of data) {
        const name = toGadmName(row.region_name);
        lookup[name] = metric === "spend" ? row.spend : (row.impressions ?? 0);
      }
      const values = Object.values(lookup);
      const maxVal = values.length > 0 ? Math.max(...values) : 1;

      fetch("/ecuador-provinces.geojson")
        .then((r) => r.json())
        .then((geojson) => {
          // Inyectar valor en cada feature
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
                "interpolate",
                ["linear"],
                ["get", "_value"],
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
        });

      // Popup on hover
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      popupRef.current = popup;

      map.on("mousemove", "ecuador-fill", (e) => {
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
      });

      map.on("mouseleave", "ecuador-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-colorear al cambiar datos sin recrear el mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("ecuador")) return;
    const lookup: Record<string, number> = {};
    for (const row of data) {
      lookup[toGadmName(row.region_name)] = metric === "spend" ? row.spend : (row.impressions ?? 0);
    }
    const maxVal = Math.max(...Object.values(lookup), 1);
    map.setPaintProperty("ecuador-fill", "fill-color", [
      "interpolate", ["linear"], ["get", "_value"],
      0, "#e0f2fe",
      maxVal * 0.25, "#7dd3fc",
      maxVal * 0.6, "#2563eb",
      maxVal, "#1e3a8a",
    ]);
  }, [data, metric]);

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

- [ ] **Step 9.4: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 9.5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/public/ecuador-provinces.geojson \
        frontend/src/components/ChoroplethMap.tsx \
        frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add Ecuador GeoJSON and ChoroplethMap with MapLibre"
```

---

### Task 10: Integrar ChoroplethMap en PageDashboardPage

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 10.1: Agregar import y usar `ChoroplethMap` en la sección geo**

Encontrar donde se renderiza `<GeoMap ... />` en `PageDashboardPage.tsx`. Añadir debajo de él:

```tsx
import ChoroplethMap from "@/components/ChoroplethMap";

// En el JSX, dentro de la sección de distribución geográfica,
// DESPUÉS de <GeoMap>:
{geoQuery.data && geoQuery.data.data.length > 0 && (
  <ChoroplethMap
    data={geoQuery.data.data.map((row) => ({
      region_name: row.region_name || row.region || "",
      spend: parseFloat(row.spend ?? "0"),
      impressions: row.impressions,
    }))}
    metric="spend"
  />
)}
```

- [ ] **Step 10.2: Verificar tipos y build**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 10.3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): integrate ChoroplethMap into PageDashboardPage geo section"
```

---

## SUBSISTEMA D: Rendimiento por Etiquetas de Anuncios

### Task 11: Backend — endpoint de rendimiento por etiquetas

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/ad_labels.py`
- Create: `backend/tests/test_ad_labels_route.py`

- [ ] **Step 11.1: Escribir test**

```python
# backend/tests/test_ad_labels_route.py
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
def test_ad_labels_returns_aggregated_by_label(client):
    # Mock de /act_123/ads — devuelve ads con labels
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"id": "ad_1", "name": "Ad Promo Verano", "adlabels": [{"id": "lbl_1", "name": "verano"}]},
                    {"id": "ad_2", "name": "Ad Promo Navidad", "adlabels": [{"id": "lbl_2", "name": "navidad"}]},
                    {"id": "ad_3", "name": "Ad Sin Label", "adlabels": []},
                ]
            },
        )
    )
    # Mock de insights para cada ad
    respx.get("https://graph.facebook.com/v25.0/act_123/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {"ad_id": "ad_1", "spend": "10.00", "impressions": "1000", "clicks": "50",
                     "ctr": "5.0", "cpc": "0.20", "cpm": "10.0",
                     "actions": [{"action_type": "link_click", "value": "50"}],
                     "cost_per_action_type": [{"action_type": "link_click", "value": "0.20"}]},
                    {"ad_id": "ad_2", "spend": "20.00", "impressions": "2000", "clicks": "80",
                     "ctr": "4.0", "cpc": "0.25", "cpm": "10.0",
                     "actions": [{"action_type": "link_click", "value": "80"}],
                     "cost_per_action_type": [{"action_type": "link_click", "value": "0.25"}]},
                    {"ad_id": "ad_3", "spend": "5.00", "impressions": "500", "clicks": "10",
                     "ctr": "2.0", "cpc": "0.50", "cpm": "10.0",
                     "actions": [], "cost_per_action_type": []},
                ]
            },
        )
    )

    r = client.get("/api/v1/accounts/act_123/ads/labels/performance?date_preset=last_30d")
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    labels = {row["label"]: row for row in body["data"]}
    assert "verano" in labels
    assert "navidad" in labels
    assert "(sin etiqueta)" in labels
    assert labels["verano"]["spend"] == pytest.approx(10.0)
    assert labels["navidad"]["spend"] == pytest.approx(20.0)
```

- [ ] **Step 11.2: Correr test — debe fallar**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/test_ad_labels_route.py -v
```
Expected: FAIL — ruta no existe.

- [ ] **Step 11.3: Crear `ad_labels.py`**

```python
# backend/src/oderbiz_analytics/api/routes/ad_labels.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.graph_edges import fetch_graph_edge_all_pages
from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["ad-labels"])

AD_INSIGHT_FIELDS = "ad_id,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type"


def _to_float(v: object) -> float:
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return 0.0


def _sum_actions(rows: list[dict]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for row in rows:
        for act in row.get("actions") or []:
            k = str(act.get("action_type", ""))
            totals[k] = totals.get(k, 0.0) + _to_float(act.get("value"))
    return totals


def _first_cpa(rows: list[dict]) -> float | None:
    for row in rows:
        for cpa in row.get("cost_per_action_type") or []:
            v = _to_float(cpa.get("value"))
            if v > 0:
                return v
    return None


@router.get("/{ad_account_id}/ads/labels/performance")
async def get_ad_labels_performance(
    ad_account_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Agrega métricas de insights por etiqueta de anuncio (ad label).

    1. Obtiene todos los ads con sus adlabels desde /ads?fields=adlabels
    2. Obtiene insights a nivel ad para el período indicado
    3. Agrupa por etiqueta y suma métricas
    """
    normalized_id = normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = {"since": ds, "until": de} if ds and de else None
    effective_preset: str | None = date_preset if not effective_time_range else None

    # Build filtering
    filtering: list[dict] = []
    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    if sid:
        filtering = [{"field": "adset.id", "operator": "IN", "value": [sid]}]
    elif cid:
        filtering = [{"field": "campaign.id", "operator": "IN", "value": [cid]}]

    try:
        ads = await fetch_graph_edge_all_pages(
            base_url=base,
            access_token=access_token,
            path=f"{normalized_id}/ads",
            fields="id,name,adlabels",
        )
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=502, detail="Error al obtener ads de Meta.") from exc

    # Build ad → labels map
    ad_labels: dict[str, list[str]] = {}
    for ad in ads:
        labels = [lbl["name"] for lbl in (ad.get("adlabels") or []) if lbl.get("name")]
        ad_labels[ad["id"]] = labels if labels else ["(sin etiqueta)"]

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=AD_INSIGHT_FIELDS,
            date_preset=effective_preset,
            time_range=effective_time_range,
            level="ad",
            filtering=filtering or None,
        )
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=502, detail="Error al obtener insights de Meta.") from exc

    # Aggregate by label
    label_totals: dict[str, dict] = {}

    def _get_bucket(label: str) -> dict:
        if label not in label_totals:
            label_totals[label] = {
                "label": label,
                "spend": 0.0,
                "impressions": 0,
                "clicks": 0,
                "actions": {},
                "_cpa_samples": [],
            }
        return label_totals[label]

    for row in rows:
        ad_id = str(row.get("ad_id", ""))
        labels = ad_labels.get(ad_id, ["(sin etiqueta)"])
        spend = _to_float(row.get("spend"))
        impr = int(_to_float(row.get("impressions")))
        clicks = int(_to_float(row.get("clicks")))
        for label in labels:
            b = _get_bucket(label)
            b["spend"] += spend
            b["impressions"] += impr
            b["clicks"] += clicks
            cpa = _first_cpa([row])
            if cpa is not None:
                b["_cpa_samples"].append(cpa)

    # Build final response
    result_rows = []
    for b in sorted(label_totals.values(), key=lambda x: -x["spend"]):
        cpa_samples = b.pop("_cpa_samples")
        b["ctr"] = round(b["clicks"] / b["impressions"] * 100, 2) if b["impressions"] else 0.0
        b["cpm"] = round(b["spend"] / b["impressions"] * 1000, 2) if b["impressions"] else 0.0
        b["cpc"] = round(b["spend"] / b["clicks"], 2) if b["clicks"] else 0.0
        b["cpa"] = round(sum(cpa_samples) / len(cpa_samples), 2) if cpa_samples else None
        del b["actions"]  # quitamos el sub-dict, no lo exponemos en este endpoint
        result_rows.append(b)

    return {
        "data": result_rows,
        "date_preset": date_preset,
        "time_range": effective_time_range,
        "ad_account_id": normalized_id,
    }
```

- [ ] **Step 11.4: Registrar router en `main.py`**

```python
# backend/src/oderbiz_analytics/api/main.py — agregar:
from oderbiz_analytics.api.routes.ad_labels import router as ad_labels_router
# ...
app.include_router(ad_labels_router, prefix="/api/v1")
```

- [ ] **Step 11.5: Correr test**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/test_ad_labels_route.py -v
```
Expected: PASS.

- [ ] **Step 11.6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/ad_labels.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_ad_labels_route.py
git commit -m "feat(backend): add ad labels performance aggregation endpoint"
```

---

### Task 12: Frontend — AdLabelsSection component + client

**Files:**
- Create: `frontend/src/components/AdLabelsSection.tsx`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 12.1: Agregar tipos y función en `client.ts`**

```typescript
// frontend/src/api/client.ts — agregar al final:

export interface AdLabelRow {
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpa: number | null;
}

export interface AdLabelsResponse {
  data: AdLabelRow[];
  date_preset: string;
  time_range: { since: string; until: string } | null;
  ad_account_id: string;
}

export async function fetchAdLabelsPerformance(
  adAccountId: string,
  opts: {
    datePreset?: string;
    dateStart?: string;
    dateStop?: string;
    campaignId?: string;
    adsetId?: string;
  }
): Promise<AdLabelsResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  if (opts.adsetId) q.set("adset_id", opts.adsetId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/ads/labels/performance?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 12.2: Crear `AdLabelsSection.tsx`**

```tsx
// frontend/src/components/AdLabelsSection.tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdLabelRow } from "@/api/client";

interface AdLabelsSectionProps {
  data: AdLabelRow[] | undefined;
  isLoading: boolean;
  metric?: "spend" | "cpa" | "cpc" | "ctr";
}

export default function AdLabelsSection({
  data,
  isLoading,
  metric = "cpa",
}: AdLabelsSectionProps) {
  const rows = data ?? [];

  const chartData = rows
    .map((r) => ({
      label: r.label.length > 20 ? r.label.slice(0, 18) + "…" : r.label,
      value:
        metric === "spend" ? r.spend
        : metric === "cpa" ? (r.cpa ?? 0)
        : metric === "cpc" ? r.cpc
        : r.ctr,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const yLabel =
    metric === "spend" ? "Gasto ($)"
    : metric === "cpa" ? "Costo por Resultado ($)"
    : metric === "cpc" ? "CPC ($)"
    : "CTR (%)";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rendimiento por Etiqueta — {yLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin datos de etiquetas para este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}`, yLabel]} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tabla de Etiquetas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etiqueta</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">CPR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right">${r.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.impressions.toLocaleString("es")}</TableCell>
                    <TableCell className="text-right">{r.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">${r.cpc.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {r.cpa != null ? `$${r.cpa.toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 12.3: Integrar `AdLabelsSection` en `PageDashboardPage.tsx`**

```tsx
// En PageDashboardPage.tsx — agregar query:
import AdLabelsSection from "@/components/AdLabelsSection";
import { fetchAdLabelsPerformance } from "@/api/client";

// Dentro del componente, agregar:
const labelsQuery = useQuery({
  queryKey: ["ad-labels", id, datePreset, campaignId],
  queryFn: () =>
    fetchAdLabelsPerformance(id, {
      ...effectiveDateParams,
      campaignId: campaignId || undefined,
    }),
  staleTime: 5 * 60 * 1000,
});

// En el JSX, agregar una sección al final del dashboard:
<section className="space-y-2">
  <h2 className="text-foreground text-lg font-semibold">Rendimiento por Etiquetas</h2>
  <AdLabelsSection
    data={labelsQuery.data?.data}
    isLoading={labelsQuery.isLoading}
    metric="cpa"
  />
</section>
```

- [ ] **Step 12.4: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 12.5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/AdLabelsSection.tsx \
        frontend/src/api/client.ts \
        frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): add AdLabelsSection component and integrate into PageDashboardPage"
```

---

## SUBSISTEMA E: Limpieza de Páginas y Cuentas

### Task 13: PagesPage — actualizar opciones de fecha

**Files:**
- Modify: `frontend/src/routes/PagesPage.tsx:22-28`

- [ ] **Step 13.1: Reemplazar `DATE_OPTIONS` en `PagesPage.tsx`**

```typescript
// frontend/src/routes/PagesPage.tsx — reemplazar DATE_OPTIONS:
const DATE_OPTIONS = [
  { value: "last_7d", label: "Últimos 7 días" },
  { value: "last_30d", label: "30 días" },
  { value: "last_90d", label: "90 días" },
  { value: "maximum", label: "Máximo disponible" },
];
```

Cambiar el `useState` inicial de `"last_30d"` a `"last_7d"` si se quiere que el default ya no sea 30d:

```typescript
const [datePreset, setDatePreset] = useState("last_7d");
```

- [ ] **Step 13.2: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/PagesPage.tsx
git commit -m "fix(frontend): update PagesPage date options, remove this_month/last_month, change default to last_7d"
```

---

### Task 14: AccountsPage — mejorar estados vacíos de tablas

**Files:**
- Modify: `frontend/src/routes/AccountsPage.tsx`

- [ ] **Step 14.1: Leer el resto de AccountsPage para entender las tablas**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics" && grep -n "portfolioQuery\|data\.data\|emptyAccounts" frontend/src/routes/AccountsPage.tsx | head -30
```

- [ ] **Step 14.2: Agregar estado vacío explícito para tabla de BM**

Encontrar el bloque que renderiza la tabla "Por negocio (Meta Business)". Después de él, agregar estado vacío cuando no hay datos:

```tsx
{/* Estado vacío para tabla de negocio */}
{!portfolioQuery.isLoading &&
  !portfolioQuery.isError &&
  portfolioQuery.data?.data?.length === 0 && (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground text-sm">
          No hay cuentas de negocio disponibles para este token.
        </p>
      </CardContent>
    </Card>
  )}
```

Después de la tabla plana de cuentas, agregar estado vacío:

```tsx
{/* Estado vacío para tabla plana de cuentas */}
{!isLoading && !isError && data?.data?.length === 0 && !emptyAccounts && (
  <Card>
    <CardContent className="py-8 text-center">
      <p className="text-muted-foreground text-sm">
        No hay cuentas publicitarias accesibles con este token.
      </p>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 14.3: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 14.4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/AccountsPage.tsx
git commit -m "fix(frontend): add empty state messaging to BM and accessible accounts tables"
```

---

## SUBSISTEMA F: Engagement Orgánico

### Task 15: Backend — endpoint de métricas orgánicas de página

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/organic.py`
- Create: `backend/tests/test_organic_route.py`

- [ ] **Step 15.1: Escribir test**

```python
# backend/tests/test_organic_route.py
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
def test_organic_insights_returns_page_metrics(client):
    respx.get("https://graph.facebook.com/v25.0/123456789/insights").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "name": "page_impressions",
                        "period": "day",
                        "values": [
                            {"value": 150, "end_time": "2026-04-07T07:00:00+0000"},
                            {"value": 200, "end_time": "2026-04-08T07:00:00+0000"},
                        ],
                        "id": "123456789/insights/page_impressions/day",
                    },
                    {
                        "name": "page_fan_adds",
                        "period": "day",
                        "values": [
                            {"value": 5, "end_time": "2026-04-07T07:00:00+0000"},
                            {"value": 8, "end_time": "2026-04-08T07:00:00+0000"},
                        ],
                        "id": "123456789/insights/page_fan_adds/day",
                    },
                ]
            },
        )
    )

    r = client.get("/api/v1/pages/123456789/organic-insights?date_preset=last_7d")
    assert r.status_code == 200
    body = r.json()
    assert body["page_id"] == "123456789"
    assert "page_impressions" in body["metrics"]
    assert body["metrics"]["page_impressions"]["total"] == 350
    assert "page_fan_adds" in body["metrics"]
    assert body["metrics"]["page_fan_adds"]["total"] == 13


@respx.mock
def test_organic_insights_empty_returns_empty_metrics(client):
    respx.get("https://graph.facebook.com/v25.0/999/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/pages/999/organic-insights")
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"] == {}
```

- [ ] **Step 15.2: Correr test — debe fallar**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/test_organic_route.py -v
```
Expected: FAIL — ruta no existe.

- [ ] **Step 15.3: Crear `organic.py`**

```python
# backend/src/oderbiz_analytics/api/routes/organic.py
from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/pages", tags=["organic"])

# Métricas de Page Insights (orgánicas) que exponemos
PAGE_INSIGHT_METRICS = [
    "page_impressions",
    "page_impressions_unique",
    "page_fan_adds",
    "page_fan_removes",
    "page_post_engagements",
    "page_views_total",
    "page_actions_post_reactions_total",
]


def _date_preset_to_period(date_preset: str) -> tuple[str, str]:
    """Returns (period, since_relative) for Page Insights API."""
    mapping = {
        "last_7d": ("day", "-7d"),
        "last_30d": ("day", "-30d"),
        "last_90d": ("day", "-90d"),
        "today": ("day", "today"),
        "maximum": ("day", "-180d"),
    }
    return mapping.get(date_preset, ("day", "-30d"))


@router.get("/{page_id}/organic-insights")
async def get_organic_insights(
    page_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Métricas orgánicas de una Página de Facebook usando Page Insights API.
    Requiere permiso pages_read_engagement.
    """
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    metrics_str = ",".join(PAGE_INSIGHT_METRICS)
    period, _ = _date_preset_to_period(date_preset)

    params: dict = {
        "metric": metrics_str,
        "period": period,
        "access_token": access_token,
    }

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    if ds and de:
        params["since"] = ds
        params["until"] = de
    else:
        params["date_preset"] = date_preset

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{base}/{page_id}/insights", params=params)
            r.raise_for_status()
            data = r.json().get("data", [])
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener Page Insights de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    metrics: dict[str, dict] = {}
    for metric_obj in data:
        name = metric_obj.get("name", "")
        values = metric_obj.get("values", [])
        total = sum(v.get("value", 0) if isinstance(v.get("value"), (int, float)) else 0 for v in values)
        daily = [{"date": v.get("end_time", "")[:10], "value": v.get("value", 0)} for v in values]
        metrics[name] = {"total": total, "daily": daily}

    return {
        "page_id": page_id,
        "date_preset": date_preset,
        "metrics": metrics,
    }
```

- [ ] **Step 15.4: Registrar router en `main.py`**

```python
# backend/src/oderbiz_analytics/api/main.py — agregar:
from oderbiz_analytics.api.routes.organic import router as organic_router
# ...
app.include_router(organic_router, prefix="/api/v1")
```

- [ ] **Step 15.5: Correr tests**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && python -m pytest tests/test_organic_route.py -v
```
Expected: PASS.

- [ ] **Step 15.6: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add backend/src/oderbiz_analytics/api/routes/organic.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_organic_route.py
git commit -m "feat(backend): add organic page insights endpoint"
```

---

### Task 16: Frontend — OrganicKpiCard + integración

**Files:**
- Create: `frontend/src/components/OrganicKpiCard.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 16.1: Agregar tipos y función en `client.ts`**

```typescript
// frontend/src/api/client.ts — agregar al final:

export interface OrganicMetric {
  total: number;
  daily: Array<{ date: string; value: number }>;
}

export interface OrganicInsightsResponse {
  page_id: string;
  date_preset: string;
  metrics: Record<string, OrganicMetric>;
}

export async function fetchOrganicInsights(
  pageId: string,
  opts: { datePreset?: string; dateStart?: string; dateStop?: string } = {}
): Promise<OrganicInsightsResponse> {
  const q = new URLSearchParams();
  if (opts.dateStart && opts.dateStop) {
    q.set("date_start", opts.dateStart);
    q.set("date_stop", opts.dateStop);
  } else if (opts.datePreset) {
    q.set("date_preset", opts.datePreset);
  }
  const path = `/api/v1/pages/${encodeURIComponent(pageId)}/organic-insights?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 16.2: Crear `OrganicKpiCard.tsx`**

```tsx
// frontend/src/components/OrganicKpiCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrganicMetric } from "@/api/client";

interface OrganicKpiCardProps {
  metrics: Record<string, OrganicMetric> | undefined;
  isLoading: boolean;
}

const METRIC_LABELS: Record<string, string> = {
  page_impressions: "Impresiones Orgánicas",
  page_impressions_unique: "Alcance Orgánico",
  page_fan_adds: "Nuevos Seguidores",
  page_fan_removes: "Seguidores Perdidos",
  page_post_engagements: "Engagement",
  page_views_total: "Visitas a la Página",
  page_actions_post_reactions_total: "Reacciones",
};

export default function OrganicKpiCard({ metrics, isLoading }: OrganicKpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Engagement Orgánico</CardTitle>
        <p className="text-muted-foreground text-xs">Métricas de Page Insights (no pagadas)</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !metrics || Object.keys(metrics).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin datos de engagement orgánico.{" "}
            <span className="text-xs">
              (Requiere permiso <code>pages_read_engagement</code> y acceso de administrador a la página.)
            </span>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(metrics).map(([key, val]) => (
              <div
                key={key}
                className="bg-muted/40 rounded-lg p-3 text-center"
              >
                <p className="text-muted-foreground text-xs">
                  {METRIC_LABELS[key] ?? key}
                </p>
                <p className="text-foreground text-xl font-bold">
                  {val.total >= 1000
                    ? `${(val.total / 1000).toFixed(1)}k`
                    : val.total.toLocaleString("es")}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 16.3: Integrar `OrganicKpiCard` en `PageDashboardPage.tsx`**

```tsx
// En PageDashboardPage.tsx — agregar import:
import OrganicKpiCard from "@/components/OrganicKpiCard";
import { fetchOrganicInsights } from "@/api/client";

// Agregar query:
const organicQuery = useQuery({
  queryKey: ["organic-insights", pid, datePreset],
  queryFn: () =>
    fetchOrganicInsights(pid, { ...effectiveDateParams }),
  staleTime: 5 * 60 * 1000,
});

// En el JSX, agregar sección antes de Ad Labels:
<section className="space-y-2">
  <h2 className="text-foreground text-lg font-semibold">Métricas Orgánicas</h2>
  <OrganicKpiCard
    metrics={organicQuery.data?.metrics}
    isLoading={organicQuery.isLoading}
  />
</section>
```

- [ ] **Step 16.4: Verificar tipos**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/frontend" && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 16.5: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/OrganicKpiCard.tsx \
        frontend/src/api/client.ts \
        frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(frontend): add OrganicKpiCard and integrate organic engagement into PageDashboardPage"
```

---

## Self-Review

**Cobertura del spec:**

| Sección | Task(s) | Estado |
|---|---|---|
| 2.1 Nuevos presets de fecha (Hoy, Personalizado, orden correcto) | Task 4 | ✅ |
| 2.2 Opción "Hoy" (time_range since=until=today) | Tasks 1, 2, 4 | ✅ |
| 2.3 Modal Personalizado con shadcn Calendar | Tasks 3, 4 | ✅ |
| 3.1 Gráfico Gasto vs métricas significativas (CPM, CTR, CPC) | Tasks 5, 6 | ✅ |
| 3.2 Gráfico acciones por tipo | Existente en ActionsChart, sin cambio requerido | ✅ |
| 3.3 Filtros adicionales por campaña/adset/ad | Existente en PageDashboardPage | ✅ |
| 4.1 Escala dinámica eje Y en geo | Task 7 | ✅ |
| 4.2 Mapa MapLibre coroplético | Tasks 9, 10 | ✅ |
| 4.3 Gráfico barras horizontales por provincia | Task 7 (convertido a horizontal) | ✅ |
| 4.4 Normalización nombres de región (Ecuador) | Task 8 | ✅ |
| 5.1-5.3 Rendimiento por etiquetas | Tasks 11, 12 | ✅ |
| 6.1 Tabla de páginas | Existente en PagesPage | ✅ |
| 6.2 Remover filtro "Últimos 30 días" hardcoded | Task 13 | ✅ |
| 7.1-7.4 Separación cuentas BM vs accesibles | Task 14 (ya separadas, mejorar empty states) | ✅ |
| 8.1-8.2 Engagement orgánico | Tasks 15, 16 | ✅ |

**Gaps identificados:**
- Sección 3.3 menciona filtros de campaña/adset/ad en gráficos de rendimiento. En `PageDashboardPage` ya existe filtro de campaña. El filtro de adset/ad no está en el dashboard de página pero sí en `DashboardPage`. Si se requiere en `PageDashboardPage`, se puede agregar como task adicional.
- El mapa coroplético (Task 9) requiere descargar el GeoJSON de Ecuador manualmente. El plan incluye el comando curl, pero si la URL no está disponible se debe buscar una alternativa en gadm.org o natural earth.

**Verificación de tipos entre tasks:**
- `FilterContextValue.dateParams()` retorna `{ datePreset?: string; dateStart?: string; dateStop?: string }` — usado en Tasks 4, 12, 16 ✅
- `PageTimeseriesRow.cpm/ctr/cpc` agregados en Task 5 — usados en Task 6 ✅
- `AdLabelRow` definida en Task 12.1 — usada en `AdLabelsSection.tsx` Task 12.2 ✅
- `OrganicMetric` / `OrganicInsightsResponse` definidas en Task 16.1 — usadas en `OrganicKpiCard.tsx` Task 16.2 ✅

# Plan de Implementacion: Unificacion del Flujo Dashboard Meta BI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar la experiencia de analisis en una sola ruta y un solo flujo mental (Cuenta -> Campana -> Ad Set -> Anuncio) con vistas claras para ejecutivos y analistas, reduciendo la necesidad de mantener barras y navegacion duplicada.

**Architecture:** Se consolida la UI en un Dashboard unificado con layout de 5 zonas (Resumen, Ranking Campanas, Diagnostico Ad Set, Creatividad, Insights/Decisiones) y un contrato de datos unico por nivel. En backend se extienden endpoints de insights para incluir metricas y breakdowns faltantes (ROAS/action_values/cost_per_result/country/device/hourly) y se centraliza un motor de diagnostico basado en reglas.

**Tech Stack:** FastAPI, React + TanStack Query, Meta Marketing API Insights, TypeScript, shadcn/ui, Recharts.

---

## File Structure (target)

- Modify: `frontend/src/routes/DashboardPage.tsx`
- Create: `frontend/src/components/dashboard-unificado/GlobalFilterBar.tsx`
- Create: `frontend/src/components/dashboard-unificado/ExecutiveSummary.tsx`
- Create: `frontend/src/components/dashboard-unificado/CampaignRankingTable.tsx`
- Create: `frontend/src/components/dashboard-unificado/AdsetDiagnosticView.tsx`
- Create: `frontend/src/components/dashboard-unificado/CreativePerformanceView.tsx`
- Create: `frontend/src/components/dashboard-unificado/InsightsDecisionPanel.tsx`
- Create: `frontend/src/lib/dashboardDiagnostics.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `backend/src/oderbiz_analytics/api/routes/dashboard.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/placement_insights.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/geo_insights.py`
- Create: `backend/src/oderbiz_analytics/api/routes/time_insights.py`
- Create: `backend/src/oderbiz_analytics/services/insights_diagnostics.py`
- Modify: `backend/src/oderbiz_analytics/jobs/ingest_daily.py`
- Create: `backend/tests/test_unified_dashboard_contract.py`
- Create: `frontend/src/lib/__tests__/dashboardDiagnostics.test.ts`

---

### Task 1: Definir contrato unificado de datos (single source of truth)

**Files:**

- Modify: `backend/src/oderbiz_analytics/api/routes/dashboard.py`
- Create: `backend/tests/test_unified_dashboard_contract.py`
- Modify: `frontend/src/api/client.ts`
- **Step 1: Escribir prueba de contrato backend (falla al inicio)**

Definir test para exigir payload minimo:

- `summary` con `spend/impressions/reach/frequency/ctr/cpc/cpm/cost_per_result`
- `derived` con `results/cpa/roas`
- `context` con `level`, `entity_id`, `date_start`, `date_stop`, `attribution_window`
- **Step 2: Implementar esquema de respuesta en `/accounts/{id}/dashboard`**

Agregar estructura:

```python
return {
    "context": {...},
    "summary": {...},
    "derived": {"results": ..., "cpa": ..., "roas": ...},
    "actions": [...],
    "action_values": [...],
    "cost_per_action_type": [...],
    "diagnostic_inputs": {...},
}
```

- **Step 3: Ajustar cliente TypeScript al nuevo contrato**

Actualizar interfaz:

```ts
export interface UnifiedDashboardResponse {
  context: {...}
  summary: Record<string, number>
  derived: { results: number; cpa: number | null; roas: number | null }
  actions: InsightActionItem[]
  action_values: InsightActionItem[]
  cost_per_action_type: InsightActionItem[]
  diagnostic_inputs: Record<string, number | null>
}
```

- **Step 4: Validar pruebas**

Run: `cd backend && pytest tests/test_unified_dashboard_contract.py -v`  
Expected: PASS

- **Step 5: Commit**

Run:

```bash
git add backend/src/oderbiz_analytics/api/routes/dashboard.py backend/tests/test_unified_dashboard_contract.py frontend/src/api/client.ts
git commit -m "feat: define unified dashboard data contract across backend and frontend"
```

---

### Task 2: Completar metricas clave para analista (ROAS, cost_per_result, action_values)

**Files:**

- Modify: `backend/src/oderbiz_analytics/jobs/ingest_daily.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/dashboard.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/ads_ranking.py`
- **Step 1: Extender campos solicitados a Meta**

Incluir en `FIELDS`/`PERF_FIELDS`:

```python
"cost_per_result,actions,action_values,cost_per_action_type,purchase_roas,inline_link_clicks"
```

- **Step 2: Implementar derivados consistentes**

Reglas:

- `results`: primer action_type objetivo o suma configurable
- `cpa`: `cost_per_result` o `spend/results`
- `roas`: `purchase_roas` o `sum(action_values_purchase)/spend`
- **Step 3: Exponer los mismos calculos en ranking de campanas/anuncios**

Asegurar que filas de ranking incluyen:
`results`, `cost_per_result`, `roas`, `delta_vs_prev`.

- **Step 4: Validar manualmente endpoint**

Run:

```bash
cd backend && uvicorn oderbiz_analytics.api.app:app --reload
```

Llamar:
`GET /api/v1/accounts/{id}/dashboard?...` y verificar presencia de nuevos campos.

- **Step 5: Commit**

Run:

```bash
git add backend/src/oderbiz_analytics/jobs/ingest_daily.py backend/src/oderbiz_analytics/api/routes/dashboard.py backend/src/oderbiz_analytics/api/routes/ads_ranking.py
git commit -m "feat: add core Meta performance metrics and derived CPA/ROAS"
```

---

### Task 3: Completar breakdowns faltantes (country/device/hourly)

**Files:**

- Modify: `backend/src/oderbiz_analytics/api/routes/geo_insights.py`
- Create: `backend/src/oderbiz_analytics/api/routes/time_insights.py`
- Modify: `backend/src/oderbiz_analytics/api/routes/placement_insights.py`
- Modify: `frontend/src/api/client.ts`
- **Step 1: Agregar `country` en geo**

Permitir query `geo_breakdown=region|country` y mapear salida.

- **Step 2: Agregar breakdown de dispositivo**

En endpoint de placement aceptar modo:
`breakdowns=["publisher_platform","platform_position","device_platform","impression_device"]`
(de forma compatible con restricciones de Meta).

- **Step 3: Crear endpoint de distribucion horaria**

Nueva ruta:
`GET /accounts/{id}/insights/time` con
`hourly_stats_aggregated_by_advertiser_time_zone` y `time_increment`.

- **Step 4: Exponer funciones cliente**

Agregar en `frontend/src/api/client.ts`:

- `fetchGeoInsights(..., breakdown: "region" | "country")`
- `fetchDeviceInsights(...)`
- `fetchTimeInsights(...)`
- **Step 5: Commit**

Run:

```bash
git add backend/src/oderbiz_analytics/api/routes/geo_insights.py backend/src/oderbiz_analytics/api/routes/time_insights.py backend/src/oderbiz_analytics/api/routes/placement_insights.py frontend/src/api/client.ts
git commit -m "feat: support country device and hourly breakdowns for diagnostics"
```

---

### Task 4: Redisenar experiencia de navegacion y filtros globales

**Files:**

- Create: `frontend/src/components/dashboard-unificado/GlobalFilterBar.tsx`
- Modify: `frontend/src/routes/DashboardPage.tsx`
- **Step 1: Extraer barra global de filtros**

Controlar en un solo componente:

- Cuenta
- Rango de fechas (con comparacion anterior)
- Campana
- Ad Set
- Anuncio
- Ventana de atribucion
- **Step 2: Unificar estado de filtros**

Crear estado unico:

```ts
type DashboardFilters = {
  accountId: string
  datePreset?: string
  dateStart?: string
  dateStop?: string
  campaignId?: string
  adsetId?: string
  adId?: string
  attributionWindow?: string
}
```

- **Step 3: Sincronizar URL con filtros**

Persistir filtros en query params para compartir vistas entre analistas.

- **Step 4: Validar UX**

Verificar que no se repite barra/filtros entre tabs y que cambiar un filtro actualiza todos los bloques.

- **Step 5: Commit**

Run:

```bash
git add frontend/src/components/dashboard-unificado/GlobalFilterBar.tsx frontend/src/routes/DashboardPage.tsx
git commit -m "refactor: unify dashboard navigation and global filtering workflow"
```

---

### Task 5: Reorganizar contenido en 5 vistas para lectura analitica

**Files:**

- Create: `frontend/src/components/dashboard-unificado/ExecutiveSummary.tsx`
- Create: `frontend/src/components/dashboard-unificado/CampaignRankingTable.tsx`
- Create: `frontend/src/components/dashboard-unificado/AdsetDiagnosticView.tsx`
- Create: `frontend/src/components/dashboard-unificado/CreativePerformanceView.tsx`
- Modify: `frontend/src/routes/DashboardPage.tsx`
- **Step 1: Implementar Resumen Ejecutivo**

Tarjetas + tendencias:

- spend, impressions, reach, frequency, ctr, cpc, cpm, results, cpa, roas
- delta vs periodo anterior.
- **Step 2: Implementar Ranking Campanas**

Tabla ordenable por:

- gasto
- CPA
- ROAS
- deterioro vs periodo previo.
- **Step 3: Implementar Diagnostico Ad Set**

Vista orientada a preguntas de segmentacion:

- audiencia
- geografia (country/region)
- placement/plataforma
- frecuencia/CTR/CPA.
- **Step 4: Implementar Creatividad**

Tabla de anuncios con:

- metricas de eficiencia
- alertas de fatiga
- acceso rapido a creativo/copy/formato.
- **Step 5: Commit**

Run:

```bash
git add frontend/src/components/dashboard-unificado/ExecutiveSummary.tsx frontend/src/components/dashboard-unificado/CampaignRankingTable.tsx frontend/src/components/dashboard-unificado/AdsetDiagnosticView.tsx frontend/src/components/dashboard-unificado/CreativePerformanceView.tsx frontend/src/routes/DashboardPage.tsx
git commit -m "feat: implement unified analyst-first dashboard layout"
```

---

### Task 6: Motor de insights y decisiones accionables

**Files:**

- Create: `backend/src/oderbiz_analytics/services/insights_diagnostics.py`
- Create: `frontend/src/lib/dashboardDiagnostics.ts`
- Create: `frontend/src/components/dashboard-unificado/InsightsDecisionPanel.tsx`
- Create: `frontend/src/lib/__tests__/dashboardDiagnostics.test.ts`
- **Step 1: Definir reglas diagnosticas**

Implementar reglas:

- CPM sube + CTR estable -> mercado mas caro
- CTR baja + CPM estable -> problema creativo
- Frecuencia alta + CTR cae -> fatiga
- CTR buena + conversion baja -> revisar landing/tracking
- CPA alto segmentado (region/edad/genero) -> problema de segmentacion
- **Step 2: Generar salida explicativa estandar**

Formato:

```ts
type Insight = {
  severity: "high" | "medium" | "low"
  finding: string
  evidence: string[]
  recommendation: string
}
```

- **Step 3: Renderizar panel de decisiones**

Bloques:

- Que escalar
- Que pausar
- Que testear
- Riesgos de tracking/atribucion.
- **Step 4: Probar reglas**

Run: `cd frontend && npm test -- dashboardDiagnostics.test.ts`  
Expected: PASS con cobertura de reglas principales.

- **Step 5: Commit**

Run:

```bash
git add backend/src/oderbiz_analytics/services/insights_diagnostics.py frontend/src/lib/dashboardDiagnostics.ts frontend/src/components/dashboard-unificado/InsightsDecisionPanel.tsx frontend/src/lib/__tests__/dashboardDiagnostics.test.ts
git commit -m "feat: add actionable diagnostics engine for marketing analysts"
```

---

### Task 7: Validacion integral y rollout controlado

**Files:**

- Modify: `frontend/src/routes/DashboardPage.tsx`
- Modify: `docs/FLUJO_APLICACION.md`
- **Step 1: Agregar feature flag de rollout**

Permitir alternar:

- flujo actual
- flujo unificado (`VITE_UNIFIED_DASHBOARD=true`).
- **Step 2: Ejecutar verificacion tecnica**

Run:

```bash
cd backend && pytest -q
cd frontend && npm run lint
cd frontend && npm run build
```

Expected: sin errores bloqueantes.

- **Step 3: Ejecutar checklist funcional de analista**

Checklist minimo:

- filtrar por fecha y comparar periodo
- detectar campana ganadora/perdedora
- bajar a adset y aislar problema por region/placement
- bajar a anuncio y confirmar fatiga/creativo
- obtener recomendacion accionable.
- **Step 4: Actualizar documentacion de uso**

Documentar nuevo flujo operativo en `docs/FLUJO_APLICACION.md` con capturas/ejemplos de preguntas de negocio.

- **Step 5: Commit**

Run:

```bash
git add frontend/src/routes/DashboardPage.tsx docs/FLUJO_APLICACION.md
git commit -m "docs: roll out and document unified Meta BI analyst workflow"
```

---

## Criterios de exito del plan

- Un analista puede responder en < 5 minutos:
  1. que pasa en la cuenta,
  2. que campana explica el cambio,
  3. que adset/origen lo causa,
  4. que anuncio corregir.
- La UI se controla con una sola barra de filtros globales.
- El dashboard muestra KPIs ejecutivos y tambien explicaciones accionables.
- El backend expone contractos consistentes por nivel (`account/campaign/adset/ad`).

## Riesgos y mitigacion

- **Riesgo:** combinaciones invalidas de breakdowns en Meta.  
**Mitigacion:** matriz de combinaciones permitidas + fallback automatico.
- **Riesgo:** discrepancias por atribucion frente a Ads Manager.  
**Mitigacion:** mostrar siempre ventana de atribucion y definicion de resultados en UI.
- **Riesgo:** sobrecarga visual por exceso de tablas.  
**Mitigacion:** priorizar narrativa `resumen -> diagnostico -> detalle -> recomendacion`.


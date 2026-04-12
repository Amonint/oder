# Meta Ads Manual CRM & Health Score — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar capa manual de validación comercial (sin CRM), semáforos configurables por KPI, embudo comercial extendido y score de salud 0-100 al Dashboard de Meta Ads.

**Architecture:** Los datos manuales se persisten en DuckDB (tabla `manual_data`) con endpoints POST/GET en FastAPI. Los KPIs derivados se calculan en frontend. Semáforos y score de salud son puramente frontend (reglas configurables guardadas en localStorage). Todo se integra como nuevo tab "Comercial" en DashboardPage.

**Tech Stack:** FastAPI + DuckDB (backend), React + TypeScript + TanStack Query + shadcn/ui + localStorage (frontend).

---

## File Map

### Backend — nuevos archivos
- `backend/src/oderbiz_analytics/adapters/duckdb/manual_data_repo.py` — CRUD para manual_data en DuckDB
- `backend/src/oderbiz_analytics/api/routes/manual_data.py` — POST/GET manual data
- `backend/tests/test_manual_data_route.py`

### Backend — archivos modificados
- `backend/src/oderbiz_analytics/api/main.py` — registrar nuevo router
- `backend/src/oderbiz_analytics/adapters/duckdb/client.py` — verificar init compatible

### Frontend — nuevos archivos
- `frontend/src/lib/manualKpis.ts` — cálculo de KPIs manuales derivados
- `frontend/src/lib/semaphoreRules.ts` — lógica de semáforos y umbrales
- `frontend/src/lib/healthScore.ts` — cálculo de score 0-100
- `frontend/src/components/ManualDataPanel.tsx` — formulario de carga manual
- `frontend/src/components/SemaphoreKpiCard.tsx` — card KPI con semáforo
- `frontend/src/components/HealthScoreCard.tsx` — score general de salud
- `frontend/src/components/FunnelExtendedCard.tsx` — embudo comercial extendido

### Frontend — archivos modificados
- `frontend/src/api/client.ts` — nuevas interfaces y funciones para manual data
- `frontend/src/routes/DashboardPage.tsx` — nuevo tab "Comercial"

---

## Task 1: Backend — DuckDB repo para datos manuales

**Files:**
- Create: `backend/src/oderbiz_analytics/adapters/duckdb/manual_data_repo.py`

- [ ] **Step 1: Verificar estructura del cliente DuckDB existente**

```bash
cat /Users/lamnda/Documents/oderbiz\ analitics/backend/src/oderbiz_analytics/adapters/duckdb/client.py | head -60
```

Observar cómo se gestiona la conexión para seguir el mismo patrón.

- [ ] **Step 2: Escribir el test que falla**

```python
# backend/tests/test_manual_data_route.py
import pytest
from fastapi.testclient import TestClient
from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as c:
        yield c


def test_save_and_get_manual_data(client):
    payload = {
        "account_id": "act_123",
        "campaign_id": "c1",
        "ad_id": None,
        "useful_messages": 10,
        "accepted_leads": 5,
        "quotes_sent": 4,
        "sales_closed": 2,
        "avg_ticket": 150.0,
        "estimated_revenue": 300.0,
        "notes": "Semana buena",
    }
    r = client.post(
        "/api/v1/accounts/act_123/manual-data",
        json=payload,
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["accepted_leads"] == 5
    assert "id" in body

    r2 = client.get(
        "/api/v1/accounts/act_123/manual-data",
        headers={"Authorization": "Bearer t"},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["data"]) >= 1
    assert data["data"][0]["accepted_leads"] == 5


def test_get_manual_data_empty(client):
    r = client.get(
        "/api/v1/accounts/act_999/manual-data",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 200
    assert r.json()["data"] == []
```

- [ ] **Step 3: Ejecutar test para verificar que falla**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_manual_data_route.py -v 2>&1 | head -20
```

Expected: FAIL — 404 o ImportError.

- [ ] **Step 4: Implementar el repo**

```python
# backend/src/oderbiz_analytics/adapters/duckdb/manual_data_repo.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import duckdb

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS manual_data (
    id VARCHAR PRIMARY KEY,
    account_id VARCHAR NOT NULL,
    campaign_id VARCHAR,
    ad_id VARCHAR,
    useful_messages INTEGER DEFAULT 0,
    accepted_leads INTEGER DEFAULT 0,
    quotes_sent INTEGER DEFAULT 0,
    sales_closed INTEGER DEFAULT 0,
    avg_ticket DOUBLE DEFAULT 0.0,
    estimated_revenue DOUBLE DEFAULT 0.0,
    notes VARCHAR DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def init_manual_data_table(db_path: str) -> None:
    con = duckdb.connect(db_path)
    con.execute(SCHEMA_SQL)
    con.close()


def insert_manual_data(db_path: str, record: dict) -> dict:
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    con = duckdb.connect(db_path)
    con.execute(
        """
        INSERT INTO manual_data (
            id, account_id, campaign_id, ad_id,
            useful_messages, accepted_leads, quotes_sent, sales_closed,
            avg_ticket, estimated_revenue, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            record_id,
            record.get("account_id"),
            record.get("campaign_id"),
            record.get("ad_id"),
            record.get("useful_messages", 0),
            record.get("accepted_leads", 0),
            record.get("quotes_sent", 0),
            record.get("sales_closed", 0),
            record.get("avg_ticket", 0.0),
            record.get("estimated_revenue", 0.0),
            record.get("notes", ""),
            now,
            now,
        ],
    )
    con.close()
    return {"id": record_id, **record, "created_at": now, "updated_at": now}


def get_manual_data(db_path: str, account_id: str, campaign_id: str | None = None) -> list[dict]:
    con = duckdb.connect(db_path)
    if campaign_id:
        rows = con.execute(
            "SELECT * FROM manual_data WHERE account_id = ? AND campaign_id = ? ORDER BY created_at DESC",
            [account_id, campaign_id],
        ).fetchall()
        cols = [d[0] for d in con.description]  # type: ignore[index]
    else:
        rows = con.execute(
            "SELECT * FROM manual_data WHERE account_id = ? ORDER BY created_at DESC",
            [account_id],
        ).fetchall()
        cols = [d[0] for d in con.description]  # type: ignore[index]
    con.close()
    return [dict(zip(cols, row)) for row in rows]
```

- [ ] **Step 5: Implementar el router**

```python
# backend/src/oderbiz_analytics/api/routes/manual_data.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from oderbiz_analytics.adapters.duckdb.manual_data_repo import get_manual_data, insert_manual_data
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["manual_data"])


class ManualDataIn(BaseModel):
    account_id: str
    campaign_id: Optional[str] = None
    ad_id: Optional[str] = None
    useful_messages: int = 0
    accepted_leads: int = 0
    quotes_sent: int = 0
    sales_closed: int = 0
    avg_ticket: float = 0.0
    estimated_revenue: float = 0.0
    notes: str = ""


@router.post("/{ad_account_id}/manual-data", status_code=201)
async def save_manual_data(
    ad_account_id: str,
    body: ManualDataIn,
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    if body.account_id != ad_account_id:
        raise HTTPException(status_code=422, detail="account_id en el body debe coincidir con el URL.")
    from oderbiz_analytics.adapters.duckdb.manual_data_repo import init_manual_data_table
    init_manual_data_table(settings.duckdb_path)
    saved = insert_manual_data(settings.duckdb_path, body.model_dump())
    return saved


@router.get("/{ad_account_id}/manual-data")
async def get_manual_data_route(
    ad_account_id: str,
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    from oderbiz_analytics.adapters.duckdb.manual_data_repo import init_manual_data_table
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(settings.duckdb_path, ad_account_id, campaign_id=campaign_id)
    return {"data": rows, "account_id": ad_account_id}
```

- [ ] **Step 6: Registrar router en main.py**

```python
from oderbiz_analytics.api.routes.manual_data import router as manual_data_router
# ...
app.include_router(manual_data_router, prefix="/api/v1")
```

- [ ] **Step 7: Ejecutar test para verificar que pasa**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/test_manual_data_route.py -v
```

Expected: 2 PASSED.

- [ ] **Step 8: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/duckdb/manual_data_repo.py \
        backend/src/oderbiz_analytics/api/routes/manual_data.py \
        backend/src/oderbiz_analytics/api/main.py \
        backend/tests/test_manual_data_route.py
git commit -m "feat(crm): add manual data DuckDB repo and POST/GET endpoints"
```

---

## Task 2: Frontend — Tipos y fetch para datos manuales

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Añadir al final de client.ts**

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Manual CRM Data
// ─────────────────────────────────────────────────────────────────────────────

export interface ManualDataRecord {
  id?: string;
  account_id: string;
  campaign_id?: string | null;
  ad_id?: string | null;
  useful_messages: number;
  accepted_leads: number;
  quotes_sent: number;
  sales_closed: number;
  avg_ticket: number;
  estimated_revenue: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface ManualDataResponse {
  data: ManualDataRecord[];
  account_id: string;
}

export async function saveManualData(
  adAccountId: string,
  record: Omit<ManualDataRecord, "id" | "created_at" | "updated_at">
): Promise<ManualDataRecord> {
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/manual-data`;
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}

export async function fetchManualData(
  adAccountId: string,
  opts: { campaignId?: string } = {}
): Promise<ManualDataResponse> {
  const q = new URLSearchParams();
  if (opts.campaignId) q.set("campaign_id", opts.campaignId);
  const path = `/api/v1/accounts/${encodeURIComponent(adAccountId)}/manual-data?${q}`;
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(await readErrorMessage(r));
  return r.json();
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep -i manual
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(crm): add ManualDataRecord types and fetch functions"
```

---

## Task 3: Frontend — Utilidad manualKpis.ts

**Files:**
- Create: `frontend/src/lib/manualKpis.ts`

- [ ] **Step 1: Crear la utilidad**

```typescript
// frontend/src/lib/manualKpis.ts
import type { ManualDataRecord } from "@/api/client";

export interface ManualKpis {
  acceptance_rate: number | null;     // leads aceptados / mensajes útiles
  close_rate: number | null;          // ventas cerradas / leads aceptados
  cost_per_accepted_lead: number | null;   // gasto / leads aceptados
  cost_per_sale: number | null;       // gasto / ventas cerradas
  estimated_revenue: number;          // ventas * ticket promedio
  estimated_roas: number | null;      // ingresos estimados / gasto
}

/**
 * Calcula KPIs manuales derivados desde datos manuales + gasto de Meta.
 * spend viene de los datos de Insights (data.summary.spend).
 */
export function computeManualKpis(record: ManualDataRecord, spend: number): ManualKpis {
  const { useful_messages, accepted_leads, quotes_sent, sales_closed, avg_ticket, estimated_revenue } = record;

  const acceptance_rate = useful_messages > 0 ? accepted_leads / useful_messages : null;
  const close_rate = accepted_leads > 0 ? sales_closed / accepted_leads : null;
  const cost_per_accepted_lead = accepted_leads > 0 ? spend / accepted_leads : null;
  const cost_per_sale = sales_closed > 0 ? spend / sales_closed : null;
  const revenue = estimated_revenue > 0 ? estimated_revenue : sales_closed * avg_ticket;
  const estimated_roas = spend > 0 && revenue > 0 ? revenue / spend : null;

  return {
    acceptance_rate,
    close_rate,
    cost_per_accepted_lead,
    cost_per_sale,
    estimated_revenue: revenue,
    estimated_roas,
  };
}

/**
 * Agrega múltiples registros manuales en uno (suma numérica).
 */
export function aggregateManualRecords(records: ManualDataRecord[]): ManualDataRecord {
  return records.reduce(
    (acc, r) => ({
      ...acc,
      useful_messages: acc.useful_messages + r.useful_messages,
      accepted_leads: acc.accepted_leads + r.accepted_leads,
      quotes_sent: acc.quotes_sent + r.quotes_sent,
      sales_closed: acc.sales_closed + r.sales_closed,
      avg_ticket: r.avg_ticket > 0 ? r.avg_ticket : acc.avg_ticket,
      estimated_revenue: acc.estimated_revenue + r.estimated_revenue,
    }),
    {
      account_id: records[0]?.account_id ?? "",
      useful_messages: 0,
      accepted_leads: 0,
      quotes_sent: 0,
      sales_closed: 0,
      avg_ticket: 0,
      estimated_revenue: 0,
      notes: "",
    } as ManualDataRecord
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep manualKpis
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/manualKpis.ts
git commit -m "feat(crm): add manualKpis utility for derived KPI calculations"
```

---

## Task 4: Frontend — Utilidades semaphoreRules.ts y healthScore.ts

**Files:**
- Create: `frontend/src/lib/semaphoreRules.ts`
- Create: `frontend/src/lib/healthScore.ts`

- [ ] **Step 1: Crear semaphoreRules.ts**

```typescript
// frontend/src/lib/semaphoreRules.ts

export type SemaphoreStatus = "green" | "yellow" | "red" | "gray";

export interface ThresholdConfig {
  greenMin?: number;
  greenMax?: number;
  yellowMin?: number;
  yellowMax?: number;
  redMin?: number;
  redMax?: number;
  /** true = lower is better (CPA, costo) */
  lowerIsBetter?: boolean;
}

const STORAGE_KEY = "dashboard_thresholds";

export interface ThresholdsMap {
  ctr: ThresholdConfig;
  frequency: ThresholdConfig;
  cpa: ThresholdConfig;
  cost_per_replied: ThresholdConfig;
  acceptance_rate: ThresholdConfig;
  close_rate: ThresholdConfig;
  cost_per_accepted_lead: ThresholdConfig;
  cost_per_sale: ThresholdConfig;
  roas: ThresholdConfig;
}

export const DEFAULT_THRESHOLDS: ThresholdsMap = {
  ctr: { greenMin: 2, yellowMin: 1, lowerIsBetter: false },
  frequency: { greenMax: 3, yellowMax: 5, lowerIsBetter: true },
  cpa: { greenMax: 10, yellowMax: 25, lowerIsBetter: true },
  cost_per_replied: { greenMax: 5, yellowMax: 15, lowerIsBetter: true },
  acceptance_rate: { greenMin: 0.5, yellowMin: 0.25, lowerIsBetter: false },
  close_rate: { greenMin: 0.3, yellowMin: 0.15, lowerIsBetter: false },
  cost_per_accepted_lead: { greenMax: 20, yellowMax: 50, lowerIsBetter: true },
  cost_per_sale: { greenMax: 50, yellowMax: 120, lowerIsBetter: true },
  roas: { greenMin: 3, yellowMin: 1.5, lowerIsBetter: false },
};

export function loadThresholds(): ThresholdsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_THRESHOLDS };
}

export function saveThresholds(t: Partial<ThresholdsMap>): void {
  const current = loadThresholds();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...t }));
}

/**
 * Evalúa el estado semáforo de un valor dado la configuración de umbrales.
 */
export function evaluateSemaphore(
  value: number | null,
  config: ThresholdConfig
): SemaphoreStatus {
  if (value == null) return "gray";
  const { lowerIsBetter, greenMin, greenMax, yellowMin, yellowMax } = config;

  if (lowerIsBetter) {
    // Menor es mejor: verde si <= greenMax, amarillo si <= yellowMax, rojo si pasa
    if (greenMax != null && value <= greenMax) return "green";
    if (yellowMax != null && value <= yellowMax) return "yellow";
    return "red";
  } else {
    // Mayor es mejor: verde si >= greenMin, amarillo si >= yellowMin, rojo si menos
    if (greenMin != null && value >= greenMin) return "green";
    if (yellowMin != null && value >= yellowMin) return "yellow";
    return "red";
  }
}

export const STATUS_COLORS: Record<SemaphoreStatus, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  gray: "bg-muted text-muted-foreground",
};

export const STATUS_DOT: Record<SemaphoreStatus, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  gray: "bg-gray-400",
};
```

- [ ] **Step 2: Crear healthScore.ts**

```typescript
// frontend/src/lib/healthScore.ts
import type { ManualKpis } from "./manualKpis";
import { evaluateSemaphore, type ThresholdsMap } from "./semaphoreRules";

export interface HealthScoreResult {
  score: number;        // 0-100
  status: "healthy" | "watch" | "critical";
  breakdown: Record<string, { score: number; weight: number; status: string }>;
}

interface ScoringInput {
  ctr?: number | null;
  frequency?: number | null;
  manualKpis: ManualKpis | null;
}

/**
 * Calcula score de salud 0-100.
 * - 80-100: saludable
 * - 60-79: vigilar
 * - 0-59: crítico
 *
 * Pesos configurables: CTR (20), frecuencia (20), aceptación (20), cierre (20), ROAS (20).
 * Cada componente 0-100 según semáforo: verde=100, amarillo=50, rojo=0, gris=50 (neutral).
 */
export function computeHealthScore(
  input: ScoringInput,
  thresholds: ThresholdsMap
): HealthScoreResult {
  const semaphoreScore = (status: string): number => {
    if (status === "green") return 100;
    if (status === "yellow") return 50;
    if (status === "red") return 0;
    return 50; // gray = neutral
  };

  const components: Record<string, { score: number; weight: number; status: string }> = {
    ctr: {
      weight: 20,
      status: evaluateSemaphore(input.ctr ?? null, thresholds.ctr),
      score: semaphoreScore(evaluateSemaphore(input.ctr ?? null, thresholds.ctr)),
    },
    frequency: {
      weight: 20,
      status: evaluateSemaphore(input.frequency ?? null, thresholds.frequency),
      score: semaphoreScore(evaluateSemaphore(input.frequency ?? null, thresholds.frequency)),
    },
    acceptance_rate: {
      weight: 20,
      status: evaluateSemaphore(input.manualKpis?.acceptance_rate ?? null, thresholds.acceptance_rate),
      score: semaphoreScore(evaluateSemaphore(input.manualKpis?.acceptance_rate ?? null, thresholds.acceptance_rate)),
    },
    close_rate: {
      weight: 20,
      status: evaluateSemaphore(input.manualKpis?.close_rate ?? null, thresholds.close_rate),
      score: semaphoreScore(evaluateSemaphore(input.manualKpis?.close_rate ?? null, thresholds.close_rate)),
    },
    roas: {
      weight: 20,
      status: evaluateSemaphore(input.manualKpis?.estimated_roas ?? null, thresholds.roas),
      score: semaphoreScore(evaluateSemaphore(input.manualKpis?.estimated_roas ?? null, thresholds.roas)),
    },
  };

  const totalWeight = Object.values(components).reduce((s, c) => s + c.weight, 0);
  const weightedScore = Object.values(components).reduce(
    (s, c) => s + (c.score * c.weight) / totalWeight,
    0
  );

  const score = Math.round(weightedScore);
  const status = score >= 80 ? "healthy" : score >= 60 ? "watch" : "critical";

  return { score, status, breakdown: components };
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep -E "semaphore|healthScore"
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/semaphoreRules.ts frontend/src/lib/healthScore.ts
git commit -m "feat(crm): add semaphore rules and health score utilities"
```

---

## Task 5: Frontend — Componente SemaphoreKpiCard

**Files:**
- Create: `frontend/src/components/SemaphoreKpiCard.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/SemaphoreKpiCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import { STATUS_COLORS, STATUS_DOT, type SemaphoreStatus } from "@/lib/semaphoreRules";

interface SemaphoreKpiCardProps {
  label: string;
  value: string;
  tooltip: string;
  status: SemaphoreStatus;
  sub?: string;
}

export default function SemaphoreKpiCard({
  label,
  value,
  tooltip,
  status,
  sub,
}: SemaphoreKpiCardProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-medium flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            {label}
            <InfoTooltip text={tooltip} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep SemaphoreKpi
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SemaphoreKpiCard.tsx
git commit -m "feat(crm): add SemaphoreKpiCard with traffic light indicator"
```

---

## Task 6: Frontend — Componente HealthScoreCard

**Files:**
- Create: `frontend/src/components/HealthScoreCard.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/HealthScoreCard.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { HealthScoreResult } from "@/lib/healthScore";

interface HealthScoreCardProps {
  result: HealthScoreResult | null;
}

const STATUS_CONFIG = {
  healthy: { label: "Saludable", colorClass: "text-green-600 dark:text-green-400" },
  watch: { label: "Vigilar", colorClass: "text-yellow-600 dark:text-yellow-400" },
  critical: { label: "Crítico", colorClass: "text-red-600 dark:text-red-400" },
};

const COMPONENT_LABELS: Record<string, string> = {
  ctr: "CTR",
  frequency: "Frecuencia",
  acceptance_rate: "Tasa de aceptación",
  close_rate: "Tasa de cierre",
  roas: "ROAS estimado",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  gray: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  green: "Bien",
  yellow: "Revisar",
  red: "Mal",
  gray: "Sin dato",
};

export default function HealthScoreCard({ result }: HealthScoreCardProps) {
  if (!result) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-muted-foreground text-sm">
            Ingresa datos manuales para calcular el score de salud.
          </p>
        </CardContent>
      </Card>
    );
  }

  const cfg = STATUS_CONFIG[result.status];

  return (
    <TooltipProvider delayDuration={300}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            Score de salud
            <InfoTooltip text="Score 0-100 basado en CTR, frecuencia, tasa de aceptación, tasa de cierre y ROAS estimado. 80-100 = saludable, 60-79 = vigilar, 0-59 = crítico." />
          </CardTitle>
          <CardDescription>Lectura única del rendimiento general</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className={`text-5xl font-bold tabular-nums ${cfg.colorClass}`}>
              {result.score}
            </span>
            <span className="text-muted-foreground text-sm">/ 100</span>
            <Badge className={`ml-2 ${STATUS_BADGE_CLASS[result.status === "healthy" ? "green" : result.status === "watch" ? "yellow" : "red"]}`}>
              {cfg.label}
            </Badge>
          </div>

          {/* Barra de progreso */}
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                result.status === "healthy" ? "bg-green-500" :
                result.status === "watch" ? "bg-yellow-400" : "bg-red-500"
              }`}
              style={{ width: `${result.score}%` }}
            />
          </div>

          {/* Desglose por componente */}
          <div className="space-y-1.5">
            {Object.entries(result.breakdown).map(([key, comp]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{COMPONENT_LABELS[key] ?? key}</span>
                <Badge className={STATUS_BADGE_CLASS[comp.status]}>
                  {STATUS_LABEL[comp.status]}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep HealthScore
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HealthScoreCard.tsx
git commit -m "feat(crm): add HealthScoreCard component with score bar and breakdown"
```

---

## Task 7: Frontend — Componente ManualDataPanel

**Files:**
- Create: `frontend/src/components/ManualDataPanel.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/ManualDataPanel.tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { saveManualData, type ManualDataRecord } from "@/api/client";

interface ManualDataPanelProps {
  adAccountId: string;
  campaignId?: string | null;
  existingRecord?: ManualDataRecord | null;
  onSaved: () => void;
}

const FIELD_CONFIG: Array<{
  key: keyof ManualDataRecord;
  label: string;
  type: "number" | "text";
  min?: number;
  step?: number;
  tooltip: string;
}> = [
  { key: "useful_messages", label: "Mensajes útiles / calificados", type: "number", min: 0, tooltip: "Total de conversaciones que tienen potencial de conversión." },
  { key: "accepted_leads", label: "Leads aceptados", type: "number", min: 0, tooltip: "Personas que expresaron interés real y pasaron filtro de calificación." },
  { key: "quotes_sent", label: "Cotizaciones enviadas", type: "number", min: 0, tooltip: "Presupuestos o propuestas enviadas al cliente." },
  { key: "sales_closed", label: "Ventas cerradas", type: "number", min: 0, tooltip: "Conversiones reales en ventas dentro del período." },
  { key: "avg_ticket", label: "Ticket promedio ($)", type: "number", min: 0, step: 0.01, tooltip: "Valor promedio de cada venta cerrada." },
  { key: "estimated_revenue", label: "Ingreso real / estimado ($)", type: "number", min: 0, step: 0.01, tooltip: "Ingresos totales del período. Si no se conoce, se calcula como ventas × ticket." },
  { key: "notes", label: "Observaciones", type: "text", tooltip: "Contexto del equipo comercial: objeciones comunes, calidad del tráfico, etc." },
];

function defaultRecord(accountId: string, campaignId?: string | null): ManualDataRecord {
  return {
    account_id: accountId,
    campaign_id: campaignId ?? null,
    ad_id: null,
    useful_messages: 0,
    accepted_leads: 0,
    quotes_sent: 0,
    sales_closed: 0,
    avg_ticket: 0,
    estimated_revenue: 0,
    notes: "",
  };
}

export default function ManualDataPanel({
  adAccountId,
  campaignId,
  existingRecord,
  onSaved,
}: ManualDataPanelProps) {
  const [form, setForm] = useState<ManualDataRecord>(
    existingRecord ?? defaultRecord(adAccountId, campaignId)
  );
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => saveManualData(adAccountId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-data", adAccountId] });
      onSaved();
    },
  });

  function handleChange(key: keyof ManualDataRecord, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Carga manual de datos comerciales</CardTitle>
        <CardDescription>
          Sin CRM — ingresa resultados reales del equipo de ventas para calcular métricas de cierre.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {FIELD_CONFIG.map((field) => (
          <div key={String(field.key)} className="space-y-1">
            <label className="text-sm text-foreground font-medium" htmlFor={String(field.key)}>
              {field.label}
            </label>
            {field.type === "text" ? (
              <textarea
                id={String(field.key)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                value={String(form[field.key] ?? "")}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.tooltip}
              />
            ) : (
              <input
                id={String(field.key)}
                type="number"
                min={field.min ?? 0}
                step={field.step ?? 1}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={Number(form[field.key] ?? 0)}
                onChange={(e) => handleChange(field.key, Number(e.target.value))}
              />
            )}
            <p className="text-muted-foreground text-xs">{field.tooltip}</p>
          </div>
        ))}

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertTitle>Error al guardar</AlertTitle>
            <AlertDescription>
              {mutation.error instanceof Error ? mutation.error.message : "Error desconocido"}
            </AlertDescription>
          </Alert>
        )}

        {mutation.isSuccess && (
          <Alert>
            <AlertTitle>Guardado</AlertTitle>
            <AlertDescription>Datos manuales guardados correctamente.</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full"
        >
          {mutation.isPending ? "Guardando…" : "Guardar datos"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep ManualData
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ManualDataPanel.tsx
git commit -m "feat(crm): add ManualDataPanel form component"
```

---

## Task 8: Frontend — Componente FunnelExtendedCard

**Files:**
- Create: `frontend/src/components/FunnelExtendedCard.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// frontend/src/components/FunnelExtendedCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { ManualDataRecord } from "@/api/client";

interface FunnelExtendedCardProps {
  /** De Meta Insights */
  conversationsStarted: number;
  firstReplies: number;
  /** De carga manual */
  manualRecord: ManualDataRecord | null;
}

interface FunnelStep {
  label: string;
  value: number;
  sub: string;
  tooltip: string;
  isManual?: boolean;
}

function pct(from: number, to: number): string {
  if (from === 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("es");
}

export default function FunnelExtendedCard({
  conversationsStarted,
  firstReplies,
  manualRecord,
}: FunnelExtendedCardProps) {
  const steps: FunnelStep[] = [
    {
      label: "Mensajes iniciados",
      value: conversationsStarted,
      sub: "Meta Insights",
      tooltip: "Conversaciones iniciadas reportadas por Meta.",
    },
    {
      label: "Respuestas",
      value: firstReplies,
      sub: "Meta Insights",
      tooltip: "Primeras respuestas reportadas por Meta (messaging_first_reply).",
    },
    {
      label: "Leads aceptados",
      value: manualRecord?.accepted_leads ?? 0,
      sub: "Manual",
      tooltip: "Leads que pasaron el filtro de calificación del equipo.",
      isManual: true,
    },
    {
      label: "Cotizaciones",
      value: manualRecord?.quotes_sent ?? 0,
      sub: "Manual",
      tooltip: "Presupuestos enviados al cliente.",
      isManual: true,
    },
    {
      label: "Ventas cerradas",
      value: manualRecord?.sales_closed ?? 0,
      sub: "Manual",
      tooltip: "Conversiones reales en ventas.",
      isManual: true,
    },
  ];

  const conversions = [
    pct(steps[0].value, steps[1].value),
    pct(steps[1].value, steps[2].value),
    pct(steps[2].value, steps[3].value),
    pct(steps[3].value, steps[4].value),
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-foreground text-lg font-semibold">Embudo comercial extendido</h2>
        <span className="text-muted-foreground text-xs">Meta Insights + datos manuales</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Flecha = tasa de avance al siguiente paso. Pasos en cursiva = carga manual.
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-1 overflow-x-auto">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1 min-w-0">
                  <div className={`flex flex-col items-center text-center min-w-[90px] px-2 py-3 rounded-xl ${step.isManual ? "bg-muted/60 border border-dashed border-muted-foreground/30" : "bg-muted/40"}`}>
                    <span className="text-foreground text-xl font-bold leading-tight">{fmt(step.value)}</span>
                    <span className={`text-xs font-medium mt-0.5 flex items-center gap-0.5 ${step.isManual ? "text-muted-foreground italic" : "text-foreground"}`}>
                      {step.label}
                      <InfoTooltip text={step.tooltip} />
                    </span>
                    <span className="text-muted-foreground text-[10px] mt-0.5">{step.sub}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex flex-col items-center min-w-[44px]">
                      <span className="text-muted-foreground text-[10px] font-medium">{conversions[i]}</span>
                      <span className="text-muted-foreground text-base leading-none">→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | grep FunnelExtended
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FunnelExtendedCard.tsx
git commit -m "feat(crm): add FunnelExtendedCard combining Meta and manual data stages"
```

---

## Task 9: Frontend — Tab Comercial en DashboardPage

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx`

- [ ] **Step 1: Añadir imports en DashboardPage.tsx**

```tsx
import ManualDataPanel from "@/components/ManualDataPanel";
import SemaphoreKpiCard from "@/components/SemaphoreKpiCard";
import HealthScoreCard from "@/components/HealthScoreCard";
import FunnelExtendedCard from "@/components/FunnelExtendedCard";
import { fetchManualData } from "@/api/client";
import { computeManualKpis, aggregateManualRecords } from "@/lib/manualKpis";
import { loadThresholds, evaluateSemaphore } from "@/lib/semaphoreRules";
import { computeHealthScore } from "@/lib/healthScore";
```

- [ ] **Step 2: Añadir estados y query para datos manuales**

Después de los estados existentes:

```tsx
  const [showManualForm, setShowManualForm] = useState(false);
  const thresholds = useMemo(() => loadThresholds(), []);
```

Query para datos manuales:

```tsx
  const manualDataQuery = useQuery({
    queryKey: ["manual-data", id, campaignKey],
    queryFn: () => fetchManualData(id, { campaignId: campaignKey ?? undefined }),
    enabled: hasToken && Boolean(id) && mainTab === "comercial",
    staleTime: 5 * 60 * 1000,
  });
```

- [ ] **Step 3: Añadir memoización de KPIs manuales y health score**

```tsx
  const aggregatedManual = useMemo(() => {
    const rows = manualDataQuery.data?.data ?? [];
    if (rows.length === 0) return null;
    return aggregateManualRecords(rows);
  }, [manualDataQuery.data]);

  const manualKpis = useMemo(() => {
    if (!aggregatedManual) return null;
    const spend = data?.summary?.spend ?? 0;
    return computeManualKpis(aggregatedManual, spend);
  }, [aggregatedManual, data?.summary?.spend]);

  const healthScore = useMemo(() => {
    const ctr = data?.summary?.ctr ?? null;
    const frequency = data?.summary?.frequency ?? null;
    return computeHealthScore({ ctr, frequency, manualKpis }, thresholds);
  }, [data?.summary, manualKpis, thresholds]);
```

- [ ] **Step 4: Añadir tab Comercial en TabsList**

```tsx
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
```

- [ ] **Step 5: Añadir TabsContent Comercial antes del cierre de Tabs**

```tsx
        {/* ── Tab: Comercial (manual CRM + health score) ── */}
        <TabsContent value="comercial" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* KPIs con semáforo */}
              <div>
                <h2 className="text-foreground text-lg font-semibold mb-3">KPIs comerciales</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SemaphoreKpiCard
                    label="Tasa de aceptación"
                    value={manualKpis?.acceptance_rate != null ? `${(manualKpis.acceptance_rate * 100).toFixed(1)}%` : "—"}
                    tooltip="Leads aceptados ÷ mensajes útiles. Indica calidad de conversaciones."
                    status={evaluateSemaphore(manualKpis?.acceptance_rate ?? null, thresholds.acceptance_rate)}
                  />
                  <SemaphoreKpiCard
                    label="Tasa de cierre"
                    value={manualKpis?.close_rate != null ? `${(manualKpis.close_rate * 100).toFixed(1)}%` : "—"}
                    tooltip="Ventas cerradas ÷ leads aceptados. Indica efectividad de ventas."
                    status={evaluateSemaphore(manualKpis?.close_rate ?? null, thresholds.close_rate)}
                  />
                  <SemaphoreKpiCard
                    label="Costo por lead aceptado"
                    value={manualKpis?.cost_per_accepted_lead != null ? `$${manualKpis.cost_per_accepted_lead.toFixed(2)}` : "—"}
                    tooltip="Gasto de Meta ÷ leads aceptados. Métrica de eficiencia real."
                    status={evaluateSemaphore(manualKpis?.cost_per_accepted_lead ?? null, thresholds.cost_per_accepted_lead)}
                  />
                  <SemaphoreKpiCard
                    label="Costo por venta"
                    value={manualKpis?.cost_per_sale != null ? `$${manualKpis.cost_per_sale.toFixed(2)}` : "—"}
                    tooltip="Gasto de Meta ÷ ventas cerradas. Costo real de adquisición de cliente."
                    status={evaluateSemaphore(manualKpis?.cost_per_sale ?? null, thresholds.cost_per_sale)}
                  />
                  <SemaphoreKpiCard
                    label="Ingreso estimado"
                    value={manualKpis?.estimated_revenue != null && manualKpis.estimated_revenue > 0 ? `$${manualKpis.estimated_revenue.toFixed(2)}` : "—"}
                    tooltip="Ventas cerradas × ticket promedio, o ingreso real si fue ingresado."
                    status="gray"
                  />
                  <SemaphoreKpiCard
                    label="ROAS estimado"
                    value={manualKpis?.estimated_roas != null ? `${manualKpis.estimated_roas.toFixed(2)}x` : "—"}
                    tooltip="Ingreso estimado ÷ gasto. ROAS calculado desde datos manuales."
                    status={evaluateSemaphore(manualKpis?.estimated_roas ?? null, thresholds.roas)}
                  />
                </div>
              </div>

              {/* Embudo extendido */}
              <FunnelExtendedCard
                conversationsStarted={0}
                firstReplies={0}
                manualRecord={aggregatedManual}
              />
            </div>

            {/* Health Score */}
            <div className="space-y-4">
              <HealthScoreCard result={healthScore} />

              {/* Botón para abrir formulario */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowManualForm((v) => !v)}
              >
                {showManualForm ? "Cerrar formulario" : "Ingresar datos manuales"}
              </Button>

              {showManualForm && (
                <ManualDataPanel
                  adAccountId={id}
                  campaignId={campaignKey}
                  onSaved={() => setShowManualForm(false)}
                />
              )}
            </div>
          </div>
        </TabsContent>
```

- [ ] **Step 6: Verificar TypeScript**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(crm): add Comercial tab with manual KPIs, semaphores, health score and extended funnel"
```

---

## Task 10: Verificación final

- [ ] **Step 1: Suite completa backend**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/backend
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: todos PASSED.

- [ ] **Step 2: TypeScript frontend limpio**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Build frontend**

```bash
cd /Users/lamnda/Documents/oderbiz\ analitics/frontend
npm run build 2>&1 | tail -10
```

Expected: build exitoso.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(crm): complete Manual CRM layer with health score, semaphores, and extended funnel"
```

---

## Spec Coverage Check

| Requerimiento | Task |
|---|---|
| Carga manual: mensajes útiles, leads aceptados, cotizaciones, ventas, ticket, ingreso, notas | Task 7 |
| KPI: tasa aceptación, tasa cierre, costo/lead aceptado, costo/venta, ingreso estimado, ROAS | Task 3 |
| Embudo comercial extendido (mensajes → respuestas → leads → cotizaciones → ventas) | Task 8 |
| Semáforos por KPI (verde/amarillo/rojo) | Task 4 (semaphoreRules) + Task 5 (SemaphoreKpiCard) |
| Umbrales configurables por cliente | Task 4 (loadThresholds/saveThresholds via localStorage) |
| Score general de salud 0-100 | Task 4 (healthScore) + Task 6 (HealthScoreCard) |
| Score basado en CTR, frecuencia, aceptación, cierre, ROAS | Task 4 healthScore.ts |

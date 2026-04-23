# Dashboard Pending 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4 remaining audit gaps: tooltips en KPIs de rentabilidad, rankings múltiples en fatiga creativa, distribución de acciones por campaña/anuncio, y embudo por nivel (cuenta/campaña/anuncio).

**Architecture:** All changes are frontend-only. No new backend endpoints needed. Tasks 1-3 modify existing components. Task 4 adds a new FunnelLevelTable component and wires it into DashboardPage. All data comes from existing queries: `data` (dashboard), `rankingQuery` (ads performance with actions), `fatigueQuery` (creative fatigue).

**Tech Stack:** React 18, TypeScript, TanStack Query, shadcn/ui (Card, Table, Select, Badge, Tabs), Tailwind CSS, InfoTooltip (existing component)

---

## File Structure

**Modified:**
- `frontend/src/routes/DashboardPage.tsx` — Tasks 1, 3, 4 (KPI tooltips, acciones por anuncio, embudo por nivel)
- `frontend/src/components/CreativeFatigueTable.tsx` — Task 2 (sort selector + multi-ranking)
- `frontend/src/lib/metaInsightsLabels.ts` — Task 1 (add KPI tooltip map)

**Created:**
- `frontend/src/components/FunnelLevelTable.tsx` — Task 4 (tabla de embudo por campaña o anuncio)

---

## Task 1: Tooltips + card comparativa en KPIs de Rentabilidad

**Files:**
- Modify: `frontend/src/lib/metaInsightsLabels.ts`
- Modify: `frontend/src/routes/DashboardPage.tsx` (lines ~744–772 in Resumen tab)

### Context

The Resumen tab renders KPI cards from `data.summary` (a `Record<string, number>`) using `DASHBOARD_KPI_LABELS`. Currently no tooltips. We need to:
1. Add a `DASHBOARD_KPI_TOOLTIPS` map in `metaInsightsLabels.ts`
2. Wrap KPI cards with `<TooltipProvider>` + `<InfoTooltip>` from existing `@/components/InfoTooltip`
3. Add a "Costos de adquisición" comparative card showing 4 derived costs side by side

The existing KPI card in Resumen (DashboardPage.tsx ~line 744):
```tsx
{Object.entries(data.summary).map(([key, val]) => (
  <Card key={key}>
    <CardHeader className="pb-2">
      <CardDescription>{DASHBOARD_KPI_LABELS[key] ?? key}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">{formatNum(val)}</CardTitle>
    </CardHeader>
  </Card>
))}
```

- [ ] **Step 1: Add DASHBOARD_KPI_TOOLTIPS to metaInsightsLabels.ts**

Open `frontend/src/lib/metaInsightsLabels.ts` and add after the `DASHBOARD_KPI_LABELS` block:

```typescript
/** Tooltips descriptivos para KPIs del resumen */
export const DASHBOARD_KPI_TOOLTIPS: Record<string, { description: string; formula: string; source: string; type: "nativo" | "derivado" }> = {
  impressions: {
    description: "Número de veces que los anuncios fueron mostrados.",
    formula: "Suma de impresiones en el período.",
    source: "Meta Ads Insights",
    type: "nativo",
  },
  clicks: {
    description: "Clics realizados en el anuncio hacia un destino.",
    formula: "Suma de clicks en el período.",
    source: "Meta Ads Insights",
    type: "nativo",
  },
  spend: {
    description: "Total invertido en publicidad en el período.",
    formula: "Suma de gasto diario.",
    source: "Meta Ads Insights",
    type: "nativo",
  },
  reach: {
    description: "Personas únicas que vieron al menos un anuncio.",
    formula: "Usuarios únicos alcanzados.",
    source: "Meta Ads Insights",
    type: "nativo",
  },
  frequency: {
    description: "Promedio de veces que cada persona vio los anuncios.",
    formula: "Impresiones ÷ Alcance.",
    source: "Meta Ads Insights",
    type: "derivado",
  },
  cpm: {
    description: "Costo promedio por cada 1,000 impresiones.",
    formula: "(Gasto ÷ Impresiones) × 1,000.",
    source: "Meta Ads Insights",
    type: "derivado",
  },
  cpp: {
    description: "Costo promedio por cada 1,000 personas alcanzadas.",
    formula: "(Gasto ÷ Alcance) × 1,000.",
    source: "Meta Ads Insights",
    type: "derivado",
  },
  ctr: {
    description: "Porcentaje de impresiones que resultaron en un clic.",
    formula: "(Clics ÷ Impresiones) × 100.",
    source: "Meta Ads Insights",
    type: "derivado",
  },
};
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to metaInsightsLabels.ts

- [ ] **Step 3: Update DashboardPage import to include DASHBOARD_KPI_TOOLTIPS**

In `frontend/src/routes/DashboardPage.tsx`, find the import line:
```tsx
import {
  DASHBOARD_KPI_LABELS,
  RANKING_METRIC_LABELS,
  labelForMetaActionType,
  shortActionTypeLabel,
} from "@/lib/metaInsightsLabels";
```

Replace with:
```tsx
import {
  DASHBOARD_KPI_LABELS,
  DASHBOARD_KPI_TOOLTIPS,
  RANKING_METRIC_LABELS,
  labelForMetaActionType,
  shortActionTypeLabel,
} from "@/lib/metaInsightsLabels";
```

- [ ] **Step 4: Add TooltipProvider + InfoTooltip to KPI cards**

In `DashboardPage.tsx`, find the KPI card grid block (starts with `<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">`). Replace the `Object.entries(data.summary).map(...)` section with:

```tsx
<TooltipProvider delayDuration={300}>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Object.entries(data.summary).map(([key, val]) => {
      const tipData = DASHBOARD_KPI_TOOLTIPS[key];
      const tipText = tipData
        ? `${tipData.description} Fórmula: ${tipData.formula} Fuente: ${tipData.source} (${tipData.type})`
        : undefined;
      return (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              {DASHBOARD_KPI_LABELS[key] ?? key}
              {tipText && <InfoTooltip text={tipText} />}
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatNum(val)}</CardTitle>
          </CardHeader>
        </Card>
      );
    })}
    {(() => {
      const spend = Number(data.summary.spend ?? 0);
      const replies = (data.actions ?? [])
        .filter((a) => String(a.action_type) === "messaging_first_reply")
        .reduce((s, a) => s + Number(a.value ?? 0), 0);
      if (replies === 0) return null;
      const cpc = spend / replies;
      return (
        <Card key="costo_conv">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              Costo / conversación respondida
              <InfoTooltip text="KPI derivado. Fórmula: Gasto ÷ primeras respuestas (messaging_first_reply). Fuente: Meta Insights (derivado). Puede no estar disponible en todas las cuentas." />
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">${cpc.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      );
    })()}
  </div>
</TooltipProvider>
```

Note: `TooltipProvider` and `InfoTooltip` are already imported in the file. Verify the existing imports include them; if not, add:
```tsx
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
```

- [ ] **Step 5: Add comparative "Costos de adquisición" card**

In `DashboardPage.tsx`, after the closing `</TooltipProvider>` of the KPI grid (and before the `<p className="text-muted-foreground text-sm">` scope description), add:

```tsx
{/* ── Card comparativa: costos de adquisición ── */}
{(() => {
  const spend = Number(data.summary.spend ?? 0);
  if (spend === 0) return null;

  const actions = data.actions ?? [];
  const costActions = data.cost_per_action_type ?? [];

  // Costo por resultado: primer cost_per_action_type disponible (excluyendo triviales)
  const TRIVIAL = new Set(["post_engagement", "page_engagement", "photo_view", "video_view"]);
  const mainCostAction = costActions.find((a) => !TRIVIAL.has(String(a.action_type)));
  const costPerResult = mainCostAction ? Number(mainCostAction.value) : null;

  // CPA promedio = gasto / total acciones de resultado
  const totalResults = actions
    .filter((a) => !TRIVIAL.has(String(a.action_type)))
    .reduce((s, a) => s + Number(a.value ?? 0), 0);
  const cpaAvg = totalResults > 0 ? spend / totalResults : null;

  // Costo por conversación iniciada
  const convsStarted = actions
    .filter((a) => String(a.action_type) === "onsite_conversion.messaging_conversation_started_7d")
    .reduce((s, a) => s + Number(a.value ?? 0), 0);
  const costPerConvStarted = convsStarted > 0 ? spend / convsStarted : null;

  // Costo por conversación respondida
  const replies = actions
    .filter((a) => String(a.action_type) === "messaging_first_reply")
    .reduce((s, a) => s + Number(a.value ?? 0), 0);
  const costPerReplied = replies > 0 ? spend / replies : null;

  const costs = [
    { label: "CPA promedio", value: cpaAvg, tip: "Gasto ÷ total de resultados (excluyendo interacciones triviales). Derivado.", available: cpaAvg !== null },
    { label: "Costo por resultado", value: costPerResult, tip: "Primer cost_per_action_type devuelto por Meta para el objetivo principal. Nativo.", available: costPerResult !== null },
    { label: "Costo / conv. iniciada", value: costPerConvStarted, tip: "Gasto ÷ conversaciones iniciadas (onsite_conversion.messaging_conversation_started_7d). Derivado.", available: costPerConvStarted !== null },
    { label: "Costo / conv. respondida", value: costPerReplied, tip: "Gasto ÷ primeras respuestas (messaging_first_reply). Derivado. Puede no estar disponible en todas las cuentas.", available: costPerReplied !== null },
  ];

  if (costs.every((c) => !c.available)) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Costos de adquisición</CardTitle>
          <CardDescription>Comparativa de costos según etapa del embudo publicitario</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {costs.map((c) => (
              <div key={c.label} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs flex items-center gap-0.5">
                  {c.label}
                  <InfoTooltip text={c.tip} />
                </span>
                <span className="text-foreground text-xl font-bold tabular-nums">
                  {c.available ? `$${(c.value as number).toFixed(2)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
})()}
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/lib/metaInsightsLabels.ts frontend/src/routes/DashboardPage.tsx
git commit -m "feat(dashboard): add KPI tooltips and acquisition costs comparative card"
```

---

## Task 2: Rankings múltiples en Fatiga creativa

**Files:**
- Modify: `frontend/src/components/CreativeFatigueTable.tsx`

### Context

`CreativeFatigueTable` receives `data: FatigueRow[]`. Each `FatigueRow` has:
- `ad_id`, `ad_name`, `impressions`, `frequency`, `spend`, `ctr`, `results`, `cpa`, `fatigue_score`, `fatigue_status`

Currently sorted externally (backend returns them by fatigue_score desc). We need to add a client-side sort selector with 5 options:
- `fatigue` — by `fatigue_score` desc (current default)
- `spend` — by `spend` desc (top by gasto)
- `cpa` — by `cpa` asc (top by menor CPA = más eficiente)
- `response_rate` — by `results / impressions` desc (tasa de respuesta)
- `scale` — by `spend` desc AND `fatigue_score < 40` (oportunidades de escala: alto gasto + baja fatiga)

The component currently accepts `data, alerts, isLoading, isError, errorMessage` props. We add internal state for sortBy.

- [ ] **Step 1: Add sort state and logic to CreativeFatigueTable**

Replace the full content of `frontend/src/components/CreativeFatigueTable.tsx` with:

```tsx
import { useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { FatigueRow, FatigueAlert } from "@/api/client";

type SortBy = "fatigue" | "spend" | "cpa" | "response_rate" | "scale";

interface CreativeFatigueTableProps {
  data: FatigueRow[] | undefined;
  alerts: FatigueAlert[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  healthy: { label: "Saludable", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  watch: { label: "Vigilar", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  fatigued: { label: "Fatigado", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const SORT_OPTIONS: { value: SortBy; label: string; description: string }[] = [
  { value: "fatigue", label: "Top fatigados", description: "Anuncios con mayor riesgo de saturación (score alto)" },
  { value: "spend", label: "Top por gasto", description: "Anuncios que más gastan" },
  { value: "cpa", label: "Top por CPA", description: "Anuncios con menor costo por resultado (más eficientes)" },
  { value: "response_rate", label: "Top por tasa de respuesta", description: "Anuncios con mayor ratio resultados/impresiones" },
  { value: "scale", label: "Oportunidades de escala", description: "Alto gasto y baja fatiga (candidatos a aumentar presupuesto)" },
];

function sortRows(rows: FatigueRow[], sortBy: SortBy): FatigueRow[] {
  const copy = [...rows];
  switch (sortBy) {
    case "fatigue":
      return copy.sort((a, b) => b.fatigue_score - a.fatigue_score);
    case "spend":
      return copy.sort((a, b) => b.spend - a.spend);
    case "cpa":
      // null CPAs go to end
      return copy.sort((a, b) => {
        if (a.cpa === null && b.cpa === null) return 0;
        if (a.cpa === null) return 1;
        if (b.cpa === null) return -1;
        return a.cpa - b.cpa;
      });
    case "response_rate":
      return copy.sort((a, b) => {
        const rateA = a.impressions > 0 ? a.results / a.impressions : 0;
        const rateB = b.impressions > 0 ? b.results / b.impressions : 0;
        return rateB - rateA;
      });
    case "scale":
      // Filter healthy/watch (fatigue_score < 40) then sort by spend desc
      return copy
        .filter((r) => r.fatigue_score < 40)
        .sort((a, b) => b.spend - a.spend);
    default:
      return copy;
  }
}

export default function CreativeFatigueTable({
  data,
  alerts,
  isLoading,
  isError,
  errorMessage,
}: CreativeFatigueTableProps) {
  const [sortBy, setSortBy] = useState<SortBy>("fatigue");

  const rawRows = data ?? [];
  const rows = sortRows(rawRows, sortBy);
  const activeAlerts = alerts ?? [];
  const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy)!;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Fatiga de creatividades</h2>
        <p className="text-muted-foreground text-sm">
          Score basado en frecuencia y CTR. Mayor score = mayor riesgo de saturación.
        </p>
      </div>

      {activeAlerts.length > 0 && (
        <Alert>
          <AlertTitle>Alertas de fatiga</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1 text-sm">
              {activeAlerts.map((a, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="font-medium">{a.ad_name}:</span>
                  <span className="text-muted-foreground">{a.message}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Diagnóstico por anuncio</CardTitle>
              <CardDescription className="flex items-center gap-1 mt-0.5">
                {currentSort.description}
                <InfoTooltip text="Score 0-100: saludable <40, vigilar 40-69, fatigado ≥70. Oportunidades de escala = baja fatiga + alto gasto." />
              </CardDescription>
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <Alert variant="destructive" className="m-4">
              <AlertTitle>Error al cargar fatiga</AlertTitle>
              <AlertDescription>{errorMessage ?? "Error desconocido"}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              {sortBy === "scale"
                ? "Sin anuncios con baja fatiga y alto gasto en este periodo."
                : "Sin datos de creatividades en este periodo."}
            </p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Anuncio</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Frecuencia
                          <InfoTooltip text="Promedio de veces que una persona vio este anuncio. Frecuencia alta con CTR bajo indica saturación." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          Tasa resp.
                          <InfoTooltip text="Resultados ÷ Impresiones × 100. Indica efectividad del anuncio." />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">CPA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const cfg = STATUS_CONFIG[row.fatigue_status] ?? STATUS_CONFIG.watch;
                      const responseRate = row.impressions > 0
                        ? ((row.results / row.impressions) * 100).toFixed(2)
                        : null;
                      return (
                        <TableRow key={row.ad_id}>
                          <TableCell>
                            <p className="truncate text-sm font-medium max-w-[200px]">{row.ad_name}</p>
                            <p className="text-muted-foreground font-mono text-xs">{row.ad_id}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className={cfg.className}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {row.fatigue_score}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.frequency.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.ctr.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            ${row.spend.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {responseRate !== null ? `${responseRate}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.cpa != null ? `$${row.cpa.toFixed(2)}` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/CreativeFatigueTable.tsx
git commit -m "feat(fatiga): add multi-ranking selector (fatigue, spend, CPA, response rate, scale opportunities)"
```

---

## Task 3: Distribución de acciones por campaña y por anuncio

**Files:**
- Modify: `frontend/src/routes/DashboardPage.tsx` (Resumen tab, after the existing actions charts ~line 912)

### Context

The Resumen tab already shows 3 charts with aggregated actions data. We need to add a section below them showing which campaigns/ads generate the most of a specific action type. Data source: `rankingQuery.data?.data` — each `AdPerformanceRow` has `actions?: InsightActionItem[]` and `campaign_name: string`.

We'll add:
1. An action type selector (only shows types present in the data)
2. A table of top ads by that action type (volume + cost)
3. A grouped-by-campaign view below that

The state variable `rankingQuery` already exists in `DashboardPage`. No new queries needed.

- [ ] **Step 1: Add action distribution section to Resumen tab**

In `DashboardPage.tsx`, find the closing of the actions section:
```tsx
            </>
          ) : null}
        </TabsContent>

        {/* ── Tab: Ranking ── */}
```

Insert a new section before `</TabsContent>` of the Resumen tab (before `{/* ── Tab: Ranking ── */}`). Find the exact line that closes the Resumen TabsContent and add before it:

```tsx
              {/* ── Distribución de acciones por anuncio/campaña ── */}
              {(() => {
                const adRows = rankingQuery.data?.data ?? [];
                if (adRows.length === 0) return null;

                // Collect all action types present in the data
                const actionTypeCounts: Map<string, number> = new Map();
                for (const row of adRows) {
                  for (const a of row.actions ?? []) {
                    const t = String(a.action_type);
                    actionTypeCounts.set(t, (actionTypeCounts.get(t) ?? 0) + Number(a.value ?? 0));
                  }
                }
                const availableTypes = Array.from(actionTypeCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([t]) => t);

                if (availableTypes.length === 0) return null;

                return <ActionDistributionSection adRows={adRows} availableTypes={availableTypes} />;
              })()}
```

- [ ] **Step 2: Add ActionDistributionSection component inline in DashboardPage.tsx**

Add this component definition BEFORE the `export default function DashboardPage()` declaration (after the imports and helper functions like `formatNum`):

```tsx
// ── Inline component: distribución de acciones por anuncio/campaña ──
import { labelForMetaActionType } from "@/lib/metaInsightsLabels"; // already imported

interface ActionDistributionSectionProps {
  adRows: import("@/api/client").AdPerformanceRow[];
  availableTypes: string[];
}

function ActionDistributionSection({ adRows, availableTypes }: ActionDistributionSectionProps) {
  const [selectedActionType, setSelectedActionType] = useState<string>(availableTypes[0] ?? "");

  // Aggregate by ad
  type AdActionRow = {
    ad_id: string;
    ad_name: string;
    campaign_name: string;
    volume: number;
    cost: number | null;
  };

  const byAd: AdActionRow[] = adRows
    .map((row) => {
      const vol = (row.actions ?? [])
        .filter((a) => String(a.action_type) === selectedActionType)
        .reduce((s, a) => s + Number(a.value ?? 0), 0);
      const cost = (row.cost_per_action_type ?? [])
        .find((a) => String(a.action_type) === selectedActionType);
      return {
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        campaign_name: row.campaign_name,
        volume: vol,
        cost: cost ? Number(cost.value) : null,
      };
    })
    .filter((r) => r.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  // Aggregate by campaign
  const byCampaign = Object.values(
    byAd.reduce<Record<string, { campaign_name: string; volume: number; totalCost: number; count: number }>>(
      (acc, row) => {
        if (!acc[row.campaign_name]) {
          acc[row.campaign_name] = { campaign_name: row.campaign_name, volume: 0, totalCost: 0, count: 0 };
        }
        acc[row.campaign_name].volume += row.volume;
        if (row.cost !== null) {
          acc[row.campaign_name].totalCost += row.cost;
          acc[row.campaign_name].count += 1;
        }
        return acc;
      },
      {}
    )
  ).sort((a, b) => b.volume - a.volume);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-foreground font-semibold">Distribución de acciones</h3>
        <Select value={selectedActionType} onValueChange={setSelectedActionType}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Tipo de acción" />
          </SelectTrigger>
          <SelectContent>
            {availableTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {labelForMetaActionType(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Por anuncio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por anuncio (top 10)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {byAd.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">Sin datos para este tipo de acción.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anuncio</TableHead>
                      <TableHead className="text-right">Volumen</TableHead>
                      <TableHead className="text-right">Costo / acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byAd.map((row) => (
                      <TableRow key={row.ad_id}>
                        <TableCell>
                          <p className="truncate text-sm font-medium max-w-[180px]">{row.ad_name}</p>
                          <p className="text-muted-foreground text-xs">{row.campaign_name}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.volume.toLocaleString("es")}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.cost !== null ? `$${row.cost.toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por campaña */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por campaña</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {byCampaign.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">Sin datos para este tipo de acción.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaña</TableHead>
                      <TableHead className="text-right">Volumen</TableHead>
                      <TableHead className="text-right">CPA promedio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCampaign.map((row) => (
                      <TableRow key={row.campaign_name}>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">{row.campaign_name}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.volume.toLocaleString("es")}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {row.count > 0 ? `$${(row.totalCost / row.count).toFixed(2)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**IMPORTANT:** This component uses `useState` — it must be defined OUTSIDE of `DashboardPage` (before the export default). Also it uses `labelForMetaActionType` which is already imported. The import of `AdPerformanceRow` type is done inline with `import("@/api/client")`.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors. If there are type errors with the inline import, change `import("@/api/client").AdPerformanceRow[]` to just `AdPerformanceRow[]` and add `AdPerformanceRow` to the top-level client.ts import.

- [ ] **Step 4: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/routes/DashboardPage.tsx
git commit -m "feat(resumen): add actions distribution by ad and campaign with type selector"
```

---

## Task 4: Embudo por nivel (cuenta / campaña / anuncio)

**Files:**
- Create: `frontend/src/components/FunnelLevelTable.tsx`
- Modify: `frontend/src/routes/DashboardPage.tsx` (Comercial tab)

### Context

The Comercial tab currently shows `FunnelExtendedCard` which uses account-level data from `data.actions`. We need to add a level selector with 3 options:
- **Cuenta** — current behavior (account-level `data.actions`)
- **Por campaña** — aggregate `rankingQuery.data?.data` rows by campaign, show a table with funnel steps per campaign
- **Por anuncio** — one row per ad with funnel steps

For campaign/ad levels, we extract `messaging_conversation_started_7d` and `messaging_first_reply` from each row's `actions`. Manual data is only available at account level (no per-campaign/ad manual records).

`FunnelLevelTable` is a new component that accepts aggregated funnel rows and renders a sortable table.

- [ ] **Step 1: Create FunnelLevelTable component**

Create `frontend/src/components/FunnelLevelTable.tsx`:

```tsx
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export interface FunnelLevelRow {
  id: string;
  name: string;
  impressions: number;
  reach: number;
  clicks: number;
  conversations_started: number;
  first_replies: number;
  spend: number;
}

interface FunnelLevelTableProps {
  rows: FunnelLevelRow[];
  level: "campaign" | "ad";
}

function pct(from: number, to: number): string {
  if (from === 0) return "—";
  return `${((to / from) * 100).toFixed(1)}%`;
}

export default function FunnelLevelTable({ rows, level }: FunnelLevelTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm p-2">
        Sin datos de embudo para {level === "campaign" ? "campañas" : "anuncios"} en este periodo.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Embudo por {level === "campaign" ? "campaña" : "anuncio"}
        </CardTitle>
        <CardDescription>
          Etapas: Impresiones → Alcance → Clics → Conv. iniciadas → Respuestas. Tasas entre etapas en paréntesis.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">
                  {level === "campaign" ? "Campaña" : "Anuncio"}
                </TableHead>
                <TableHead className="text-right">Impresiones</TableHead>
                <TableHead className="text-right">Alcance</TableHead>
                <TableHead className="text-right">Clics</TableHead>
                <TableHead className="text-right">Conv. iniciadas</TableHead>
                <TableHead className="text-right">Respuestas</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="truncate text-sm font-medium max-w-[220px]">{row.name}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.impressions.toLocaleString("es")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.reach.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.impressions, row.reach)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.clicks.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.reach || row.impressions, row.clicks)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.conversations_started.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.clicks, row.conversations_started)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    <div>{row.first_replies.toLocaleString("es")}</div>
                    <div className="text-muted-foreground text-xs">{pct(row.conversations_started, row.first_replies)}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    ${row.spend.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 3: Add funnelLevel state and import to DashboardPage**

In `DashboardPage.tsx`, add to imports:
```tsx
import FunnelLevelTable, { type FunnelLevelRow } from "@/components/FunnelLevelTable";
```

Add to state declarations (with other `useState` calls):
```tsx
const [funnelLevel, setFunnelLevel] = useState<"account" | "campaign" | "ad">("account");
```

- [ ] **Step 4: Add level selector + FunnelLevelTable to Comercial tab**

In `DashboardPage.tsx`, find the Comercial tab section. It begins with:
```tsx
<TabsContent value="comercial" className="space-y-6 pt-4">
  {(() => {
    const actions = data?.actions ?? [];
```

Add the funnel level selector and table AFTER the `FunnelExtendedCard` closing tag and BEFORE the closing of the grid `</div>`. Find the `<FunnelExtendedCard .../>` call and the code after it:

```tsx
                  <FunnelExtendedCard
                    conversationsStarted={conversationsStarted}
                    firstReplies={firstReplies}
                    manualRecord={aggregatedManual}
                  />
                </div>
```

Replace with:

```tsx
                  <FunnelExtendedCard
                    conversationsStarted={conversationsStarted}
                    firstReplies={firstReplies}
                    manualRecord={aggregatedManual}
                  />

                  {/* ── Embudo por nivel ── */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-foreground text-sm font-medium">Nivel de análisis:</span>
                      <Select value={funnelLevel} onValueChange={(v) => setFunnelLevel(v as typeof funnelLevel)}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Nivel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="account">Consolidado (cuenta)</SelectItem>
                          <SelectItem value="campaign">Por campaña</SelectItem>
                          <SelectItem value="ad">Por anuncio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {funnelLevel !== "account" && (() => {
                      const adRows = rankingQuery.data?.data ?? [];

                      if (funnelLevel === "ad") {
                        const rows: FunnelLevelRow[] = adRows.map((row) => {
                          const actions = row.actions ?? [];
                          return {
                            id: row.ad_id,
                            name: row.ad_name,
                            impressions: Number(row.impressions ?? 0),
                            reach: Number(row.reach ?? 0),
                            clicks: Number(row.clicks ?? 0),
                            conversations_started: actions
                              .filter((a) => String(a.action_type) === "onsite_conversion.messaging_conversation_started_7d")
                              .reduce((s, a) => s + Number(a.value ?? 0), 0),
                            first_replies: actions
                              .filter((a) => String(a.action_type) === "messaging_first_reply")
                              .reduce((s, a) => s + Number(a.value ?? 0), 0),
                            spend: Number(row.spend ?? 0),
                          };
                        }).sort((a, b) => b.conversations_started - a.conversations_started);
                        return <FunnelLevelTable rows={rows} level="ad" />;
                      }

                      // By campaign: group adRows by campaign_id
                      const campaignMap: Record<string, FunnelLevelRow> = {};
                      for (const row of adRows) {
                        const cid = row.campaign_id ?? row.campaign_name;
                        if (!campaignMap[cid]) {
                          campaignMap[cid] = {
                            id: cid,
                            name: row.campaign_name,
                            impressions: 0,
                            reach: 0,
                            clicks: 0,
                            conversations_started: 0,
                            first_replies: 0,
                            spend: 0,
                          };
                        }
                        const entry = campaignMap[cid];
                        entry.impressions += Number(row.impressions ?? 0);
                        entry.reach += Number(row.reach ?? 0);
                        entry.clicks += Number(row.clicks ?? 0);
                        entry.spend += Number(row.spend ?? 0);
                        for (const a of row.actions ?? []) {
                          if (String(a.action_type) === "onsite_conversion.messaging_conversation_started_7d") {
                            entry.conversations_started += Number(a.value ?? 0);
                          }
                          if (String(a.action_type) === "messaging_first_reply") {
                            entry.first_replies += Number(a.value ?? 0);
                          }
                        }
                      }
                      const rows = Object.values(campaignMap).sort((a, b) => b.conversations_started - a.conversations_started);
                      return <FunnelLevelTable rows={rows} level="campaign" />;
                    })()}
                  </div>
                </div>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors. Common fix: if `row.campaign_id` is typed as `string | undefined`, use `row.campaign_id ?? row.campaign_name` (already in the code above).

- [ ] **Step 6: Run full build**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: `✓ built in Xs`

- [ ] **Step 7: Run backend tests**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics/backend" && PYTHONPATH=src python3 -m pytest tests/ -q 2>&1 | tail -5
```

Expected: `155 passed`

- [ ] **Step 8: Commit**

```bash
cd "/Users/lamnda/Documents/oderbiz analitics"
git add frontend/src/components/FunnelLevelTable.tsx frontend/src/routes/DashboardPage.tsx
git commit -m "feat(comercial): add funnel level selector (account/campaign/ad) with FunnelLevelTable"
```

---

## Self-Review

**Spec coverage check:**

| Gap | Task |
|---|---|
| #17 Tooltips + card comparativa 4 costos | Task 1 ✅ |
| #18 Rankings: top gasto, CPA, tasa resp., escala | Task 2 ✅ |
| #9 Acciones por campaña y anuncio | Task 3 ✅ |
| #2 Embudo por campaña y por anuncio | Task 4 ✅ |

**Placeholder scan:** No TBDs, no "handle edge cases", all code blocks complete.

**Type consistency:**
- `FunnelLevelRow` defined in `FunnelLevelTable.tsx`, imported with `type FunnelLevelRow` in DashboardPage ✅
- `SortBy` type defined and used consistently in `CreativeFatigueTable.tsx` ✅
- `AdPerformanceRow.actions` is `InsightActionItem[]` which has `action_type: unknown` — code uses `String(a.action_type)` consistently ✅
- `AdPerformanceRow.impressions` is `number | string` — code uses `Number(row.impressions ?? 0)` consistently ✅

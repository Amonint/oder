# Page Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestructurar la sección "Rendimiento por Página (Marca)" para mostrar KPIs financieros de negocio relevantes, tendencia de costos de medios, embudo completo de conversación y calidad de conversación diaria.

**Architecture:** Backend expone campos nuevos en endpoints existentes (sin endpoints nuevos). Frontend reemplaza el KpiGrid genérico por KPIs de negocio, agrega dos componentes nuevos (`MediaCostTimeseriesCard`, `ConversationQualityCard`) y expande el embudo existente con los escalones de profundidad que ya devuelve la API de Meta.

**Tech Stack:** Python/FastAPI (backend), React + TypeScript + Recharts + shadcn/ui (frontend), TanStack Query para fetching.

---

## Mapa de archivos

### Backend — modificar

| Archivo | Qué cambia |
|---|---|
| `backend/src/oderbiz_analytics/api/routes/pages.py` | 4 funciones: `get_page_insights` (+ `cpp,cpc`), `_extract_cpa` (+ `cpm/cpc/cpp/depth3/depth5`), `get_page_conversion_timeseries` (+ fields), `get_page_funnel` (+ `depth2/depth3/depth5/conv_replied`) |

### Frontend — modificar

| Archivo | Qué cambia |
|---|---|
| `frontend/src/api/client.ts` | `PageKpiRow` (+ `cpc,cpp`), `ConversionTimeseriesRow` (+ `cpm,cpc,cpp,depth3,depth5`), `PageFunnelResponse` (+ `depth2,depth3,depth5,conv_replied`) |
| `frontend/src/components/KpiGrid.tsx` | Interfaz nueva: acepta `conversations`, `cpa`, `firstReplies` además de `data`; muestra 6 KPIs de negocio |
| `frontend/src/lib/pageDashboardDecisions.ts` | `buildMessagingFunnelSteps` expandida a 7 escalones; `FunnelInput` actualizado |
| `frontend/src/components/ConversionFunnelCard.tsx` | Usa los 7 escalones; muestra conversiones entre cada par |
| `frontend/src/routes/PageDashboardPage.tsx` | Pasa datos nuevos a KpiGrid; agrega 2 queries; reordena sección `mainContent`; invalida caches por cambio de schema |

### Frontend — crear

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/components/MediaCostTimeseriesCard.tsx` | Gráfico de línea CPM/CPC/CPP por día |
| `frontend/src/components/ConversationQualityCard.tsx` | Barras diarias started vs replied + línea tasa de respuesta |

---

## Task 1: Backend — enriquecer `get_page_insights` con `cpp` y `cpc`

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py` (función `get_page_insights`, línea ~468)

- [ ] **Step 1: Agregar `cpp,cpc` al fields del endpoint**

En `get_page_insights`, busca la llamada a `fetch_insights_all_pages` y cambia:
```python
# Antes
fields="spend,impressions,reach,frequency,cpm,ctr,inline_link_click_ctr,inline_link_clicks",
# Después
fields="spend,impressions,reach,frequency,cpm,cpc,cpp,ctr,inline_link_click_ctr,inline_link_clicks",
```

- [ ] **Step 2: Cambiar el sufijo del cache key para que no sirva data vieja**

En la línea donde se construye `cache_key` para `page_insights`, cambia el segundo argumento de `"page_insights"` a `"page_insights_v2"`:
```python
cache_key = _make_cache_key(normalized_id, "page_insights_v2", page_id=page_id, ...)
```

- [ ] **Step 3: Verificar que el backend levanta sin error**

```bash
cd backend && uvicorn src.oderbiz_analytics.api.main:app --reload --port 8000
```
Esperado: arranca sin ImportError ni SyntaxError.

- [ ] **Step 4: Curl de validación**

```bash
curl -s "http://localhost:8000/api/v1/accounts/act_131112367482947/pages/1506380769434870/insights?date_preset=last_30d" \
  -H "Authorization: Bearer TU_TOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data'][0].keys())"
```
Esperado: output incluye `'cpc'` y `'cpp'`.

---

## Task 2: Backend — enriquecer `_extract_cpa` y `get_page_conversion_timeseries`

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py` (función `_extract_cpa` línea ~275, `get_page_conversion_timeseries` línea ~924)

- [ ] **Step 1: Actualizar `_extract_cpa` para extraer `cpm`, `cpc`, `cpp`, `depth3`, `depth5`**

Reemplaza la función completa `_extract_cpa`:

```python
def _extract_cpa(rows: list[dict]) -> list[dict]:
    """
    Para cada fila (un día), calcula CPA y expone costos de medios y profundidad de conversación.
    """
    result = []
    CONVERSION_TYPES = {
        "onsite_conversion.messaging_conversation_started_7d",
        "messaging_conversation_started_7d",
    }
    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        date = row.get("date_start", "")

        conversions = 0.0
        conversations_started = 0.0
        replied = 0.0
        depth2 = 0.0
        depth3 = 0.0
        depth5 = 0.0
        for a in (row.get("actions") or []):
            at = a.get("action_type", "")
            val = float(a.get("value", 0) or 0)
            if at in CONVERSION_TYPES:
                conversions += val
            if at == "onsite_conversion.messaging_conversation_started_7d":
                conversations_started += val
            if at == "onsite_conversion.messaging_conversation_replied_7d":
                replied += val
            if at == "onsite_conversion.messaging_user_depth_2_message_send":
                depth2 += val
            if at == "onsite_conversion.messaging_user_depth_3_message_send":
                depth3 += val
            if at == "onsite_conversion.messaging_user_depth_5_message_send":
                depth5 += val

        cpa = round(spend / conversions, 2) if conversions > 0 else None

        revenue = 0.0
        for a in (row.get("action_values") or []):
            if a.get("action_type") == "purchase":
                revenue += float(a.get("value", 0) or 0)

        def _safe_media(key: str) -> float | None:
            v = row.get(key)
            if v is None or v == "":
                return None
            try:
                f = float(v)
                return round(f, 6) if f > 0 else None
            except (TypeError, ValueError):
                return None

        result.append({
            "date": date,
            "spend": round(spend, 2),
            "cpa": round(cpa, 2) if cpa is not None else None,
            "conversions": round(conversions, 0),
            "conversations_started": round(conversations_started, 0),
            "revenue": round(revenue, 2),
            "replied": round(replied, 0),
            "depth2": round(depth2, 0),
            "depth3": round(depth3, 0),
            "depth5": round(depth5, 0),
            "cpm": _safe_media("cpm"),
            "cpc": _safe_media("cpc"),
            "cpp": _safe_media("cpp"),
        })
    return result
```

- [ ] **Step 2: Agregar `cpm,cpc,cpp` a los fields de `get_page_conversion_timeseries`**

Busca la llamada a `fetch_insights_all_pages` dentro de `get_page_conversion_timeseries` y cambia:
```python
# Antes
fields="spend,actions,cost_per_action_type,action_values",
# Después
fields="spend,cpm,cpc,cpp,actions,cost_per_action_type,action_values",
```

- [ ] **Step 3: Cambiar el sufijo del cache key**

En `get_page_conversion_timeseries`, el cache key ya usa `"page_conv_ts_v2"`. Cámbialo a `"page_conv_ts_v3"`:
```python
cache_key = _make_cache_key(
    normalized_id,
    "page_conv_ts_v3",
    ...
)
```

- [ ] **Step 4: Verificar arranque**

```bash
cd backend && uvicorn src.oderbiz_analytics.api.main:app --reload --port 8000
```

- [ ] **Step 5: Curl de validación**

```bash
curl -s "http://localhost:8000/api/v1/accounts/act_131112367482947/pages/1506380769434870/conversion-timeseries?date_preset=last_30d" \
  -H "Authorization: Bearer TU_TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=d.get('data',[])
print(f'Filas: {len(rows)}')
if rows: print('Keys:', list(rows[0].keys()))
for r in rows[:3]:
    print(r.get('date'), 'cpm=', r.get('cpm'), 'cpc=', r.get('cpc'), 'depth3=', r.get('depth3'))
"
```
Esperado: keys incluye `cpm`, `cpc`, `cpp`, `depth3`, `depth5`.

---

## Task 3: Backend — enriquecer `get_page_funnel`

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/pages.py` (función `get_page_funnel`, línea ~1338)

- [ ] **Step 1: Agregar contadores depth2, depth3, depth5, conv_replied**

En la función `get_page_funnel`, agrega los contadores antes del loop:
```python
    total_impressions = 0
    total_reach = 0
    total_unique_clicks = 0
    total_outbound = 0
    total_conversations = 0
    total_first_replies = 0
    total_depth2 = 0      # nuevo
    total_depth3 = 0      # nuevo
    total_depth5 = 0      # nuevo
    total_conv_replied = 0  # nuevo
```

- [ ] **Step 2: Capturar los nuevos action types en el loop**

Dentro del loop `for row in rows:`, dentro del sub-loop `for a in (row.get("actions") or []):`, agrega después de `total_first_replies`:

```python
            elif at == "onsite_conversion.messaging_user_depth_2_message_send":
                total_depth2 += val
            elif at == "onsite_conversion.messaging_user_depth_3_message_send":
                total_depth3 += val
            elif at == "onsite_conversion.messaging_user_depth_5_message_send":
                total_depth5 += val
            elif at == "onsite_conversion.messaging_conversation_replied_7d":
                total_conv_replied += val
```

- [ ] **Step 3: Agregar los nuevos campos al resultado**

En el diccionario `result` al final de la función:
```python
    result = {
        "impressions": total_impressions,
        "reach": total_reach,
        "unique_clicks": total_unique_clicks,
        "outbound_clicks": total_outbound,
        "conversations_started": total_conversations,
        "first_replies": total_first_replies,
        "depth2": total_depth2,       # nuevo
        "depth3": total_depth3,       # nuevo
        "depth5": total_depth5,       # nuevo
        "conv_replied": total_conv_replied,  # nuevo
        "page_id": page_id,
        "date_preset": effective_preset,
    }
```

También actualiza el diccionario `empty` al inicio de la función para incluir los mismos campos con valor 0:
```python
    empty = {
        "impressions": 0, "reach": 0, "unique_clicks": 0,
        "outbound_clicks": 0, "conversations_started": 0, "first_replies": 0,
        "depth2": 0, "depth3": 0, "depth5": 0, "conv_replied": 0,
        "page_id": page_id, "date_preset": effective_preset,
    }
```

- [ ] **Step 4: Cambiar cache key a `"page_funnel_v2"`**

```python
cache_key = _make_cache_key(normalized_id, "page_funnel_v2", page_id=page_id, ...)
```

- [ ] **Step 5: Curl de validación**

```bash
curl -s "http://localhost:8000/api/v1/accounts/act_131112367482947/pages/1506380769434870/funnel?date_preset=last_30d" \
  -H "Authorization: Bearer TU_TOKEN" | python3 -m json.tool
```
Esperado: respuesta incluye `depth2`, `depth3`, `depth5`, `conv_replied` con valores numéricos.

---

## Task 4: Frontend — actualizar tipos en `client.ts`

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Actualizar `PageKpiRow`**

```typescript
export interface PageKpiRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  cpc?: string;   // nuevo
  cpp?: string;   // nuevo
  ctr?: string;
  inline_link_click_ctr?: string;
  inline_link_clicks?: string;
}
```

- [ ] **Step 2: Actualizar `ConversionTimeseriesRow`**

```typescript
export interface ConversionTimeseriesRow {
  date: string;
  spend: number;
  cpa: number | null;
  conversions: number;
  conversations_started: number;
  revenue: number;
  replied: number;
  depth2: number;
  depth3: number;    // nuevo
  depth5: number;    // nuevo
  cpm?: number | null;  // nuevo
  cpc?: number | null;  // nuevo
  cpp?: number | null;  // nuevo
}
```

- [ ] **Step 3: Actualizar `PageFunnelResponse`**

```typescript
export interface PageFunnelResponse {
  impressions: number;
  reach: number;
  unique_clicks: number;
  outbound_clicks: number;
  conversations_started: number;
  first_replies: number;
  depth2: number;       // nuevo
  depth3: number;       // nuevo
  depth5: number;       // nuevo
  conv_replied: number; // nuevo
  page_id: string;
  date_preset: string;
}
```

- [ ] **Step 4: Verificar que TypeScript no reporta errores**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sin output (0 errores).

---

## Task 5: Frontend — nuevo `MediaCostTimeseriesCard.tsx`

**Files:**
- Create: `frontend/src/components/MediaCostTimeseriesCard.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import {
  LineChart,
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

interface MediaCostTimeseriesCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

function fmt$(v: number): string {
  return `$${v.toFixed(3)}`;
}

export default function MediaCostTimeseriesCard({
  data,
  isLoading,
}: MediaCostTimeseriesCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tendencia de costos de medios</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? [])
    .filter((r) => r.spend > 0)
    .map((r) => ({
      date: r.date,
      cpm: r.cpm ?? null,
      cpc: r.cpc ?? null,
      cpp: r.cpp ?? null,
    }))
    .filter((r) => r.cpm !== null || r.cpc !== null || r.cpp !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Tendencia de costos de medios</CardTitle>
        <p className="text-xs text-muted-foreground">
          CPM = costo por 1,000 impresiones · CPC = costo por clic · CPP = costo por persona alcanzada. Días sin gasto excluidos.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ left: 4, right: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `$${Number(v).toFixed(2)}`}
              width={52}
            />
            <Tooltip
              formatter={(value: number, name: string) => [fmt$(value), name.toUpperCase()]}
              labelFormatter={(l: string) => `Fecha: ${l}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="cpm"
              name="CPM"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cpc"
              name="CPC"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="cpp"
              name="CPP"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores.

---

## Task 6: Frontend — nuevo `ConversationQualityCard.tsx`

**Files:**
- Create: `frontend/src/components/ConversationQualityCard.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
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

interface ConversationQualityCardProps {
  data: ConversionTimeseriesRow[] | undefined;
  isLoading: boolean;
}

export default function ConversationQualityCard({
  data,
  isLoading,
}: ConversationQualityCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Calidad de conversación</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  const rows = (data ?? [])
    .filter((r) => r.conversions > 0 || r.replied > 0)
    .map((r) => ({
      date: r.date,
      iniciadas: r.conversions,
      respondidas: r.replied,
      tasa: r.conversions > 0 ? Math.round((r.replied / r.conversions) * 100) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) return null;

  const totalIniciadas = rows.reduce((s, r) => s + r.iniciadas, 0);
  const totalRespondidas = rows.reduce((s, r) => s + r.respondidas, 0);
  const tasaGlobal =
    totalIniciadas > 0 ? Math.round((totalRespondidas / totalIniciadas) * 100) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Calidad de conversación</CardTitle>
        <p className="text-xs text-muted-foreground">
          Conversaciones iniciadas vs. con respuesta bilateral.{" "}
          {tasaGlobal !== null ? (
            <span className="font-medium text-foreground">
              Tasa global: {tasaGlobal}%
            </span>
          ) : null}
          {" "}· Si la tasa baja del 20%, revisa copy, audiencia o tiempos de respuesta del negocio.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={rows} margin={{ left: 4, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              yAxisId="vol"
              orientation="left"
              tick={{ fontSize: 10 }}
              allowDecimals={false}
              width={36}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
              width={44}
            />
            <Tooltip
              formatter={(value: number, name: string) =>
                name === "Tasa %" ? [`${value}%`, name] : [value, name]
              }
              labelFormatter={(l: string) => `Fecha: ${l}`}
            />
            <Legend />
            <Bar
              yAxisId="vol"
              dataKey="iniciadas"
              name="Iniciadas"
              fill="#6366f1"
              opacity={0.7}
              radius={[3, 3, 0, 0]}
            />
            <Bar
              yAxisId="vol"
              dataKey="respondidas"
              name="Respondidas"
              fill="#10b981"
              opacity={0.85}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="tasa"
              name="Tasa %"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores.

---

## Task 7: Frontend — actualizar `pageDashboardDecisions.ts` y `ConversionFunnelCard.tsx`

**Files:**
- Modify: `frontend/src/lib/pageDashboardDecisions.ts`
- Modify: `frontend/src/components/ConversionFunnelCard.tsx`

- [ ] **Step 1: Actualizar `FunnelInput` y `buildMessagingFunnelSteps` en `pageDashboardDecisions.ts`**

Reemplaza el tipo `FunnelInput` y la función `buildMessagingFunnelSteps`:

```typescript
type FunnelInput = {
  impressions: number;
  unique_clicks: number;
  outbound_clicks: number;
  conversations_started: number;
  first_replies: number;
  depth2: number;
  depth3: number;
  depth5: number;
};

export function buildMessagingFunnelSteps(data: FunnelInput): FunnelDisplayStep[] {
  const clickStep =
    data.outbound_clicks > 0
      ? { label: "Clics salientes", value: data.outbound_clicks, sub: "Salida desde Meta" }
      : { label: "Clics únicos", value: data.unique_clicks, sub: "Personas que hicieron clic" };

  const steps: FunnelDisplayStep[] = [
    { label: "Impresiones", value: data.impressions, sub: "Veces mostrado" },
    clickStep,
    { label: "Conversaciones", value: data.conversations_started, sub: "Iniciadas (Meta)" },
    { label: "1ª Respuesta", value: data.first_replies, sub: "Respondieron al mensaje" },
  ];

  if (data.depth2 > 0) {
    steps.push({ label: "Profundidad 2", value: data.depth2, sub: "2+ mensajes enviados" });
  }
  if (data.depth3 > 0) {
    steps.push({ label: "Profundidad 3", value: data.depth3, sub: "3+ mensajes — interés real" });
  }
  if (data.depth5 > 0) {
    steps.push({ label: "Profundidad 5", value: data.depth5, sub: "5+ mensajes — lead calificado" });
  }

  return steps;
}
```

- [ ] **Step 2: Actualizar `ConversionFunnelCard.tsx` para mostrar tasas entre todos los pares**

Reemplaza la sección de `conversions` (actualmente solo 2 tasas) con una que calcule N-1 tasas dinámicamente:

```tsx
  const steps: FunnelStep[] = buildMessagingFunnelSteps(data).map((step) => ({
    ...step,
    tooltip:
      step.label === "Impresiones"
        ? "Total de veces que el anuncio fue mostrado en pantalla."
        : step.label === "Clics salientes"
        ? "Clics que sacaron tráfico de Meta hacia tu destino."
        : step.label === "Clics únicos"
        ? "Personas que hicieron clic al menos una vez."
        : step.label === "Conversaciones"
        ? "Conversaciones iniciadas atribuidas por Meta (ventana 7d)."
        : step.label === "1ª Respuesta"
        ? "Conversaciones donde hubo al menos una primera respuesta del negocio."
        : step.label === "Profundidad 2"
        ? "Conversaciones con 2 o más mensajes enviados — señal de interés."
        : step.label === "Profundidad 3"
        ? "Conversaciones con 3+ mensajes — interés real del prospecto."
        : "Conversaciones con 5+ mensajes — perfil de lead calificado.",
  }));

  // Tasas dinámicas entre cada par de escalones
  const convRates = steps.slice(0, -1).map((step, i) =>
    pct(step.value, steps[i + 1]?.value ?? 0)
  );
```

En el JSX, reemplaza el uso de `conversions[i]` por `convRates[i]`.

- [ ] **Step 3: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores.

---

## Task 8: Frontend — actualizar `KpiGrid.tsx`

**Files:**
- Modify: `frontend/src/components/KpiGrid.tsx`

- [ ] **Step 1: Reemplazar el componente completo**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import InfoTooltip from "@/components/InfoTooltip";
import type { PageKpiRow } from "@/api/client";

interface KpiGridProps {
  data: PageKpiRow[] | undefined;
  isLoading: boolean;
  /** Totales de negocio calculados en PageDashboardPage desde funnel + timeseries */
  conversations?: number;
  cpa?: number | null;
  firstReplies?: number;
}

function fmt(v: number | string | undefined | null, prefix = "", suffix = "", decimals = 0): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return "—";
  return `${prefix}${n.toLocaleString("es-EC", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

export default function KpiGrid({ data, isLoading, conversations, cpa, firstReplies }: KpiGridProps) {
  const row: PageKpiRow = data?.[0] ?? {};

  const kpis = [
    {
      label: "Gasto",
      value: fmt(row.spend, "$", "", 2),
      tooltip: "Total invertido en el período (Facebook + Instagram).",
    },
    {
      label: "Conversaciones",
      value: fmt(conversations, "", "", 0),
      tooltip: "Conversaciones iniciadas en Messenger atribuidas a la pauta (ventana 7d, fuente: embudo).",
    },
    {
      label: "CPA",
      value: cpa != null ? fmt(cpa, "$", "", 2) : "—",
      tooltip: "Costo por conversación iniciada = Gasto ÷ Conversaciones. Null si no hubo conversaciones en el período.",
    },
    {
      label: "1ª Respuesta",
      value: fmt(firstReplies, "", "", 0),
      tooltip: "Cantidad de conversaciones donde el prospecto recibió al menos una respuesta del negocio.",
    },
    {
      label: "CPM",
      value: fmt(row.cpm, "$", "", 3),
      tooltip: "Costo por 1,000 impresiones. Indica qué tan caro está el inventario publicitario en Meta.",
    },
    {
      label: "CPP",
      value: fmt(row.cpp, "$", "", 2),
      tooltip: "Costo por persona única alcanzada. Más útil que el CPM cuando la audiencia es pequeña y con alta frecuencia.",
    },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium flex items-center">
                {kpi.label}
                <InfoTooltip text={kpi.tooltip} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores. (Habrá errores en PageDashboardPage porque aún no le pasamos los props — se resuelven en Task 9.)

---

## Task 9: Frontend — restructurar `PageDashboardPage.tsx`

**Files:**
- Modify: `frontend/src/routes/PageDashboardPage.tsx`

- [ ] **Step 1: Agregar imports de los 2 nuevos componentes**

```tsx
import MediaCostTimeseriesCard from "@/components/MediaCostTimeseriesCard";
import ConversationQualityCard from "@/components/ConversationQualityCard";
```

- [ ] **Step 2: Calcular `conversations`, `cpa`, `firstReplies` para KpiGrid**

Agrega estas derivaciones junto al resto de los `useMemo` (antes de `mainContent`):

```tsx
  const totalConversations = funnelQuery.data?.conversations_started ?? 0;
  const totalFirstReplies = funnelQuery.data?.first_replies ?? 0;
  const totalSpend = parseFloat(insightsQuery.data?.data?.[0]?.spend ?? "0") || 0;
  const aggregateCpa =
    totalConversations > 0 ? Math.round((totalSpend / totalConversations) * 100) / 100 : null;
```

- [ ] **Step 3: Pasar los nuevos props a `KpiGrid`**

Cambia la llamada a `<KpiGrid>` en `mainContent`:

```tsx
        <KpiGrid
          data={insightsQuery.data?.data}
          isLoading={insightsQuery.isLoading}
          conversations={totalConversations}
          cpa={aggregateCpa}
          firstReplies={totalFirstReplies}
        />
```

- [ ] **Step 4: Reordenar `mainContent` según nueva estructura**

El nuevo orden de `mainContent` dentro del `<div className="w-full space-y-6">`:

```
1. Error global (sin cambios)
2. KpiGrid (con nuevos props)
3. MediaCostTimeseriesCard  ← NUEVO (usa conversionTsQuery)
4. ConversionFunnelCard     (ya usa funnelQuery, ahora muestra 7 escalones)
5. ConversationQualityCard  ← NUEVO (usa conversionTsQuery)
6. ConversionCpaControlChartCard (existente, sin cambios)
7. FunnelReplyGaugeCard     (existente)
8. TrafficQualityCard       (existente)
9. TrafficQualityTimeseriesCard (existente)
10. Distribución geográfica  (existente, ya mejorada)
11. DemographicsPanel        (existente)
12. AdDiagnosticsTable       (existente)
```

Agrega `MediaCostTimeseriesCard` después del KpiGrid:
```tsx
      <MediaCostTimeseriesCard
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
      />
```

Agrega `ConversationQualityCard` después de `ConversionFunnelCard`:
```tsx
      <ConversationQualityCard
        data={conversionTsQuery.data?.data}
        isLoading={conversionTsQuery.isLoading}
      />
```

- [ ] **Step 5: Verificar TypeScript completo**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```
Esperado: sin errores.

- [ ] **Step 6: Commit final**

```bash
git add \
  backend/src/oderbiz_analytics/api/routes/pages.py \
  frontend/src/api/client.ts \
  frontend/src/components/KpiGrid.tsx \
  frontend/src/components/MediaCostTimeseriesCard.tsx \
  frontend/src/components/ConversationQualityCard.tsx \
  frontend/src/components/ConversionFunnelCard.tsx \
  frontend/src/lib/pageDashboardDecisions.ts \
  frontend/src/routes/PageDashboardPage.tsx
git commit -m "feat(page-dashboard): KPIs de negocio, costos de medios, calidad de conversacion y embudo expandido"
```

---

## Self-review checklist

- [x] **Spec coverage:**
  - KPIs financieros (conversaciones, CPA, primera respuesta, CPM, CPP) → Task 8
  - Tendencia CPM/CPC/CPP → Task 5 (`MediaCostTimeseriesCard`)
  - Embudo expandido (depth 2/3/5) → Task 3 (backend), Task 7 (frontend)
  - Calidad de conversación (tasa replied/started) → Task 6 (`ConversationQualityCard`)
  - Control CPA conservado → no se toca
  - Geo ya mejorado → no se toca en este plan

- [x] **Placeholders:** ninguno detectado; todo el código está completo.

- [x] **Type consistency:**
  - `ConversionTimeseriesRow.depth3` y `depth5` definidos en Task 4, usados en Task 5 y 6.
  - `PageFunnelResponse.depth2/depth3/depth5` definidos en Task 4, usados en Task 7 (`FunnelInput`).
  - `KpiGridProps.conversations/cpa/firstReplies` definidos en Task 8, pasados en Task 9.
  - `_extract_cpa` retorna `depth3/depth5/cpm/cpc/cpp` desde Task 2 — alineado con el tipo TS de Task 4.

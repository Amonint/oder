# Inventario Meta Marketing API — prueba real (abril 2026)

## Seguridad (obligatorio)

- **No compartas tokens de acceso en chats, repositorios ni tickets.** El token usado en la prueba debe considerarse **comprometido**: revócalo en Meta for Developers y genera uno nuevo.
- Los endpoints de Graph API pueden devolver URLs de paginación (`next`) que **incrustan el access token**. Trata cualquier log o captura como sensible.

## Alcance de esta prueba

- **API:** Facebook Graph API **v25.0** (llamadas de solo lectura; alineado a la versión que usas en integración).
- **Permisos declarados por el usuario:** `pages_show_list`, `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`.
- **Objetivo:** listar qué objetos y métricas están disponibles para **cuentas publicitarias** asociadas al usuario, y documentar campos observados en respuestas reales.

## Cuentas publicitarias encontradas


| ID (`act_…`)          | Nombre (como en Meta)                  | Moneda | Zona horaria      | Notas                                                                                                                                                      |
| --------------------- | -------------------------------------- | ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `act_131112367482947` | (perfil / cuenta personal de anuncios) | USD    | America/Guayaquil | Devuelve campañas, anuncios e **insights recientes** (`last_30d`).                                                                                         |
| `act_407741550843477` | (Business Manager — “Psicotelcon…”)    | USD    | America/Guayaquil | Con `date_preset=last_30d` / `last_90d` los **insights pueden venir vacíos** si no hay actividad en ese rango; con `maximum` sí hubo agregación histórica. |


## Endpoints verificados (lectura)


| Recurso                                | Método | Uso                                                                                                                                           |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/v25.0/me`                            | GET    | Identificador de usuario de la app (`id`, `name`).                                                                                            |
| `/v25.0/me/adaccounts`                 | GET    | Lista de cuentas publicitarias accesibles (`id`, `name`, `account_id`, `currency`, `account_status`, `business`, `timezone_name`).            |
| `/v25.0/act_{AD_ACCOUNT_ID}/campaigns` | GET    | Campañas: `id`, `name`, `status`, `objective`, `daily_budget` / `lifetime_budget`, `start_time`, `stop_time`, `created_time`, `updated_time`. |
| `/v25.0/act_{AD_ACCOUNT_ID}/ads`       | GET    | Anuncios: `id`, `name`, `status`, `campaign_id`, `adset_id`, `created_time` (+ paginación).                                                   |
| `/v25.0/act_{AD_ACCOUNT_ID}/insights`  | GET    | Métricas agregadas: `date_preset`, `level` (`account`, `campaign`, `adset`, `ad`), `fields` según documentación de Insights.                  |


### Valores válidos observados para `date_preset` (error API #100)

Si se usa un preset inválido, la API responde error. En la prueba, `**last_365d` no es válido**. Ejemplos de valores aceptados mencionados en el error: `today`, `yesterday`, `last_7d`, `last_30d`, `last_90d`, `maximum`, `last_year`, etc.

## Objetivos de campaña observados en tus datos

En las campañas listadas aparecieron objetivos como:

- `MESSAGES` (mensajes / conversaciones en Meta)
- `OUTCOME_ENGAGEMENT`
- `OUTCOME_TRAFFIC`
- `LINK_CLICKS`

Esto orienta qué **tipos de acción** (`action_type` dentro de `actions`) tendrán peso en el dashboard.

## Métricas base en Insights (nivel cuenta, ejemplo real)

Para `act_131112367482947`, `date_preset=last_30d`, `level=account`, campos solicitados:  
`impressions`, `clicks`, `spend`, `reach`, `frequency`, `cpm`, `cpp`, `ctr`, `actions`, `cost_per_action_type`.

**Ejemplo de valores devueltos (agregado, no por usuario):**

- `impressions`, `clicks`, `spend`, `reach`, `frequency`
- `cpm`, `cpp`, `ctr`
- `actions`: lista de pares `{ action_type, value }`
- `cost_per_action_type`: costo estimado por tipo de acción
- `date_start`, `date_stop` (periodo del reporte)

## Tipos de acción (`action_type`) vistos en tus anuncios

Los insights devuelven una lista heterogénea. En la cuenta personal, entre otros, aparecieron:


| `action_type` (ejemplos)                                | Interpretación práctica                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `link_click`                                            | Clics en enlaces del anuncio.                                                   |
| `page_engagement` / `post_engagement`                   | Interacción con la página / publicación.                                        |
| `video_view`                                            | Reproducciones de video (muy frecuente en creativos de video).                  |
| `onsite_conversion.messaging_conversation_started_7d`   | Conversaciones iniciadas (ventana 7 días; típico en anuncios hacia mensajería). |
| `onsite_conversion.messaging_conversation_replied_7d`   | Conversaciones con respuesta en ventana 7 días.                                 |
| `onsite_conversion.messaging_first_reply`               | Primera respuesta del negocio (métrica de mensajería).                          |
| `onsite_conversion.total_messaging_connection`          | Conexiones / hilos de mensajería (según definición Meta en reporting).          |
| `onsite_conversion.messaging_user_depth_*_message_send` | Profundidad de conversación (2, 3, 5 mensajes, etc.).                           |
| `onsite_conversion.messaging_welcome_message_view`      | Vistas del mensaje de bienvenida.                                               |
| `comment`, `post_reaction`, `post_save`, `like`         | Engagement clásico en el post.                                                  |
| `onsite_conversion.messaging_block`                     | Bloqueos reportados como acción.                                                |


**Importante:** la lista exacta depende del formato del anuncio, objetivo y plataforma (Facebook vs Instagram). Debes almacenar `actions` como **JSON flexible** o normalizar a una tabla puente `fact_insight_actions (fecha, ad_id, action_type, value)`.

## Insights a nivel `ad` (muestra)

Para `level=ad` se devolvieron, por cada fila, al menos:

- `ad_id`, `ad_name`
- `campaign_id`, `campaign_name`
- `adset_id`, `adset_name`
- `impressions`, `clicks`, `spend`, `reach`
- `actions`, `cost_per_action_type`

Esto permite **CPL/CPI por tipo de acción** si defines el numerador (por ejemplo `onsite_conversion.messaging_conversation_started_7d`) y el denominador (`spend` o `impressions`).

## Lo que la Marketing API **no** entrega en este enfoque

- **Identificadores de personas** (teléfono, email, nombre) **por usuario** dentro de `insights`: el reporte es **agregado** por anuncio/campaña/cuenta y periodo.
- “Trazabilidad persona a persona” desde solo Ads Insights **no es posible** sin fuentes adicionales (por ejemplo eventos propios, CAPI con datos hasheados, o integraciones fuera de Meta).

El producto v1 “**solo Meta Ads**” debe presentarse como **analítica de inversión y rendimiento publicitario**, no como CRM de leads identificables, salvo que añadas otra fuente.

## Ajustes recomendados al plan (producto)

1. **Renombrar el KPI principal:** de “lead” ambiguo a métricas explícitas según objetivo, por ejemplo:
  - **Costo por conversación iniciada (7d):** `spend / onsite_conversion.messaging_conversation_started_7d`
  - **Costo por clic en enlace:** `spend / link_click`
  - **CTR:** derivado de `ctr` o `clicks/impressions`
2. **Modelo de datos:** tabla de hechos diaria por `ad_id` con columnas numéricas para métricas base + JSON `actions_json` y `cost_per_action_json` (o tablas puente).
3. **Ingesta:** jobs recurrentes con `date_preset` válido; para histórico largo en cuentas con datos antiguos, validar `**maximum`** vs rangos explícitos `time_range` (según necesidad de backfill).
4. **Multi-cuenta:** tu usuario tiene **al menos dos** `ad_account_id`; el sistema debe iterar `/me/adaccounts` y etiquetar todo por `ad_account_id`.

## Próximos pasos técnicos sugeridos

1. Fijar lista cerrada de `fields` de Insights para v1 (evitar pedir campos no permitidos por nivel).
2. Definir `action_type` prioritarios para tablero (mensajes vs tráfico vs engagement).
3. Persistir payloads crudos (`raw_insights`) con hash/idempotencia por (`ad_account_id`, `ad_id`, `date_start`, `date_stop`, `level`, `preset`).
4. Implementar API interna: `/accounts`, `/accounts/{id}/timeseries`, `/accounts/{id}/ads` leyendo del DW.

---

*Documento generado a partir de llamadas reales a Graph API **v25.0** (re-verificado: mismos endpoints y respuestas coherentes con la prueba inicial en v21.0). No incluye secretos ni tokens.*

---

## Investigación profunda (documentación oficial Meta)

Esta sección resume comportamiento y límites del **Marketing API / Insights** relevantes para un DW y un backend **API-first**, sin sustituir la lectura de las guías enlazadas.

### Jerarquía de objetos (mental model)

```
Ad Account (act_...)
├── Campaigns
│   └── Ad Sets
│       └── Ads
│           └── Ad Creative(s)
```

- **Lectura de configuración:** `GET /v25.0/act_{ID}/campaigns`, `/adsets`, `/ads`, `/adcreatives` (según permisos y campos).
- **Lectura de rendimiento:** el edge `**/insights`** existe en cuenta, campaña, ad set y anuncio (`GET .../{object_id}/insights`). La granularidad la fija el parámetro `**level`** cuando el edge se invoca desde la cuenta.

Referencias: [Insights API](https://developers.facebook.com/docs/marketing-api/insights), [Making calls](https://developers.facebook.com/docs/marketing-api/insights-api/getting-started).

### Insights: sincrónico vs asíncrono


| Modo                | Cuándo usarlo                                                   | Notas                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GET síncrono**    | Consultas acotadas (pocos objetos, rangos cortos, pocos campos) | Puede **timeout** o limitar si el volumen crece. Doc recomienda partir rangos o métricas.                                                                                                                            |
| **Jobs asíncronos** | Muchas entidades, filtros, ordenaciones, o reportes pesados     | Flujo típico: `**POST`** al edge `insights` del objeto → recibes un **Ad Report Run** → haces **poll** de `async_status` / `async_percent_completion` → luego `**GET /{report_run_id}/insights`** para el resultado. |


Detalles operativos (oficial):

- Los **Ad Report Runs** **no deben almacenarse como ID permanente**: el doc indica que el identificador de job **expira a los ~30 días**.
- A partir de **Marketing API v25.0**, si un reporte asíncrono falla, la respuesta puede incluir por defecto `error_code`, `error_message`, `error_subcode`, `error_user_title`, `error_user_msg` (útil para observabilidad).

Referencia: [Insights best practices — async](https://developers.facebook.com/docs/marketing-api/insights/best-practices).

### Parámetros de tiempo y granularidad

- `**date_preset`:** rangos relativos predefinidos (`today`, `last_7d`, `last_30d`, `maximum`, etc.). Si usas un valor **no listado**, la API devuelve error `#100` (como ya observaste con `last_365d`).
- `**time_range`:** rango explícito `{'since':'YYYY-MM-DD','until':'YYYY-MM-DD'}` (útil para backfill y paralelizar por ventanas).
- `**time_increment`:** agrega por día (u otras granularidades permitidas según doc de Insights) para series temporales en el DW.
- **Zona horaria:** los insights “diarios” respetan la **zona horaria de la cuenta publicitaria**; para jobs programados conviene anclar la ventana de extracción al huso de la cuenta (doc de best practices).

### Atribución y alineación con Ads Manager

- Parámetro `**use_unified_attribution_setting`** (boolean): orientado a **imitar el comportamiento de atribución de Ads Manager**.
- Documentación reciente indica que **a partir del 10 de junio de 2025** las respuestas de la API se actualizan para alinearse mejor con la **configuración de atribución por defecto** en Ads Manager (revisar changelog/notas de versión al implementar).

En consultas avanzadas existen también:

- `**action_attribution_windows`**
- `**action_report_time`** (p. ej. referencia de tiempo para stats de acciones: impresión vs conversión, etc., según enum en la referencia de `/insights`)

Referencia: [Campaign insights parameters](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/insights).

### Breakdowns y segmentación

Los **breakdowns** permiten cortar métricas por dimensiones (edad, género, placement, etc.). Ejemplos citados en la documentación:

- Demográficos: `age`, `gender` (ej. `breakdowns=age,gender`).
- Tiempo: `**hourly_stats_aggregated_by_advertiser_time_zone`** o `**hourly_stats_aggregated_by_audience_time_zone`**.
- Limitación importante (oficial): con breakdowns **horarios**, campos únicos como `**reach`** y `**frequency`** **no están soportados** / pueden devolver **0** en ese contexto.

Para acciones, existe el eje `**action_breakdowns`** (p. ej. desglose por `action_type` cuando pides el campo `actions`).

Referencias: [Breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns), [Action breakdowns](https://developers.facebook.com/docs/marketing-api/insights/action-breakdowns).

### Prefijos de campos (filtros avanzados y reglas)

En escenarios de **Ad Rules** y filtros complejos, la documentación define un orden de prefijos para campos de Insights:

`{ object_level_prefix? } { attribution_window_prefix? } { time_preset_prefix? } { field_name }`

Incluye prefijos de **ventana de atribución** (`1d_click:`, `7d_view:`, `28d_view_28d_click:`, etc.) y prefijos de **tiempo** (`yesterday_`, `last_7d_`, …). Esto afecta sobre todo a **reglas automatizadas** y filtros, no a todo GET simple, pero es útil si más adelante automatizas alertas en Meta.

Referencia: [Evaluation spec filters / prefixed insights fields](https://developers.facebook.com/docs/marketing-api/ad-rules/guides/evaluation-spec-filters).

### Rate limiting y operación a escala

Meta aplica límites por **caso de uso** y por **cuenta publicitaria**. Para **Insights** (`ads_insights`), la documentación da una fórmula orientativa por ventana de una hora (el coeficiente exacto depende del **tier** de acceso de tu app: desarrollo vs estándar):

- Cupo orientativo de `ads_insights` ∝ **base del tier + k × número de anuncios activos** (menos un ajuste por errores de usuario en algunas definiciones).

**Errores frecuentes de throttling** (para backoff):

- Código **17** (subcódigos asociados): límite de solicitudes de usuario.
- Código **613** / mensajes tipo “too many calls from this ad-account”.
- Código **4**: demasiadas llamadas desde la **app**.

**Cabeceras HTTP útiles** (monitoreo):

- `**x-fb-ads-insights-throttle`:** incluye porcentajes de uso (`app_id_util_pct`, `acc_id_util_pct`) y `ads_api_access_tier`.
- `**x-ad-account-usage`:** uso relacionado con límites por cuenta.

**Buenas prácticas (oficial):** espaciar consultas `/insights`, leer cabeceras y aplicar **backoff exponencial**, evitar ráfagas, alinear extracciones diarias con la **timezone de la cuenta**.

Referencias: [Marketing API rate limiting](https://developers.facebook.com/docs/marketing-apis/rate-limiting), [Insights best practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices).

### Límites conceptuales (privacidad y agregación)

Incluso con permisos amplios:

- **Insights** entrega **agregados** (cuenta/campaña/ad set/anuncio × tiempo × breakdowns permitidos).
- **No** sustituye a un CRM: no obtendrás por esta vía una lista de “personas alcanzadas” identificables. Para atribución a nivel usuario necesitas **datos propios** (pixel, app events, CAPI, etc.) sujetos a políticas y consentimiento.

### Implicaciones para tu arquitectura (checklist técnico)

1. **Ingesta:** combinar GET síncrono para “últimas 24–48 h” + jobs asíncronos para **backfills** y cuentas grandes; persistir siempre `date_start`, `date_stop`, `level`, `preset` o `time_range`, y versión de API (`v25.0`).
2. **DW:** grano recomendado `ad_id × día × ad_account_id` para dashboards; tablas puente para `action_type` si necesitas SQL estricto sobre `actions` y `cost_per_action_type`.
3. **API interna:** exponer series con la misma semántica temporal que la extracción; documentar si los KPI usan **atribución por defecto** o `use_unified_attribution_setting=true`.
4. **Observabilidad:** registrar cabeceras de throttle y errores; en v25.0 capturar campos de error en jobs asíncronos fallidos.
5. **Seguridad:** nunca persistir tokens en repos; asumir que URLs de paginación pueden llevar token en query string.

### Enlaces oficiales clave

- [Marketing API — Overview](https://developers.facebook.com/docs/marketing-api)
- [Insights API](https://developers.facebook.com/docs/marketing-api/insights)
- [Insights API — Best practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices)
- [Rate limiting](https://developers.facebook.com/docs/marketing-apis/rate-limiting)
- [Graph API — Overview rate limiting headers](https://developers.facebook.com/docs/graph-api/overview/rate-limiting)

---

## Ad Sets — campos relevantes para el DW

El edge `/v25.0/act_{ID}/adsets` expone la configuración de segmentación y presupuesto a nivel ad set. Campos útiles para el modelo de datos:


| Campo                              | Tipo              | Descripción                                                                                                   |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                               | string            | ID del ad set                                                                                                 |
| `name`                             | string            | Nombre                                                                                                        |
| `campaign_id`                      | string            | FK a campaña                                                                                                  |
| `status`                           | enum              | `ACTIVE`, `PAUSED`, `DELETED`, `ARCHIVED`                                                                     |
| `effective_status`                 | enum              | Estado real (puede diferir de `status` si la campaña está pausada)                                            |
| `daily_budget` / `lifetime_budget` | string (centavos) | Presupuesto; uno de los dos aplica                                                                            |
| `bid_strategy`                     | enum              | `LOWEST_COST_WITHOUT_CAP`, `LOWEST_COST_WITH_BID_CAP`, `COST_CAP`, etc.                                       |
| `billing_event`                    | enum              | `IMPRESSIONS`, `LINK_CLICKS`, `APP_INSTALLS`, etc.                                                            |
| `optimization_goal`                | enum              | `REACH`, `LINK_CLICKS`, `MESSAGES`, `CONVERSATIONS`, etc.                                                     |
| `targeting`                        | objeto JSON       | Segmentación (edades, géneros, geolocalizaciones, intereses). Almacenar como JSON crudo; no normalizar en v1. |
| `start_time` / `end_time`          | ISO 8601          | Ventana de actividad                                                                                          |
| `created_time` / `updated_time`    | ISO 8601          | Auditoría                                                                                                     |


**Nota:** `daily_budget` y `lifetime_budget` se entregan como string en **centavos de la moneda** de la cuenta (USD → centavos de dólar). Dividir entre 100 para mostrar en la UI.

---

## Ad Creatives — qué es accesible

El edge `/v25.0/act_{ID}/adcreatives` o la referencia directa `/{creative_id}` entrega metadatos del creativo, **no el binario de la imagen/video**:


| Campo                    | Descripción                                                          |
| ------------------------ | -------------------------------------------------------------------- |
| `id`, `name`             | Identificación                                                       |
| `title` / `body`         | Texto del anuncio (si aplica al formato)                             |
| `object_story_spec`      | JSON con la especificación de la historia (link, photo, video, etc.) |
| `thumbnail_url`          | URL de miniatura (requiere token para acceder; **expira**)           |
| `image_url` / `video_id` | Referencias al asset principal                                       |
| `call_to_action_type`    | `MESSAGE_PAGE`, `LEARN_MORE`, `SHOP_NOW`, etc.                       |


**Importante para el DW:** las URLs de asset (thumbnail, imágenes) son **efímeras** y llevan token. Si necesitas persistir vistas previas, descarga y almacena el binario en el momento de la ingesta; no guardes la URL como referencia permanente.

---

## Paginación (cursor-based)

Todas las listas de la Graph API usan paginación con cursores, no offset. La respuesta incluye:

```json
{
  "data": [ ... ],
  "paging": {
    "cursors": {
      "before": "...",
      "after": "..."
    },
    "next": "https://graph.facebook.com/..."
  }
}
```

### Patrón de ingesta completa

```python
def fetch_all_pages(url: str, params: dict, access_token: str) -> list:
    results = []
    params["access_token"] = access_token
    while url:
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        body = resp.json()
        results.extend(body.get("data", []))
        url = body.get("paging", {}).get("next")
        params = {}           # next ya incluye todo en la URL
    return results
```

**Riesgo de seguridad:** la URL `next` puede incrustar `access_token` como query parameter. No loguees `next` directamente; si necesitas log, enmascara el token.

---

## Batch Requests

Para reducir latencia en consultas multi-cuenta, la Graph API acepta **hasta 50 sub-requests** en un solo POST a `/v25.0/`:

```python
import json, requests

batch = [
    {"method": "GET", "relative_url": "act_131112367482947/insights?fields=impressions,clicks,spend&date_preset=last_30d&level=account"},
    {"method": "GET", "relative_url": "act_407741550843477/insights?fields=impressions,clicks,spend&date_preset=last_30d&level=account"},
]

resp = requests.post(
    "https://graph.facebook.com/v25.0/",
    data={
        "access_token": ACCESS_TOKEN,
        "batch": json.dumps(batch),
    }
)

for item in resp.json():
    if item["code"] == 200:
        data = json.loads(item["body"])
        # procesar data["data"]
    else:
        # manejar error: item["code"], item["body"]
        pass
```

**Límites:** máximo 50 items por batch; el rate limit aplica por cada sub-request individualmente, no al batch completo.

---

## Modelo de datos propuesto (v1)

### Tablas principales

```sql
-- Dimensiones
dim_ad_account (
    ad_account_id   TEXT PRIMARY KEY,   -- "act_..."
    name            TEXT,
    currency        TEXT,
    timezone_name   TEXT,
    account_status  INT,
    extracted_at    TIMESTAMPTZ
)

dim_campaign (
    campaign_id     TEXT PRIMARY KEY,
    ad_account_id   TEXT,
    name            TEXT,
    status          TEXT,
    effective_status TEXT,
    objective       TEXT,
    daily_budget    NUMERIC,            -- ya dividido entre 100
    lifetime_budget NUMERIC,
    start_time      TIMESTAMPTZ,
    stop_time       TIMESTAMPTZ,
    created_time    TIMESTAMPTZ,
    updated_time    TIMESTAMPTZ
)

dim_adset (
    adset_id        TEXT PRIMARY KEY,
    campaign_id     TEXT,
    ad_account_id   TEXT,
    name            TEXT,
    status          TEXT,
    effective_status TEXT,
    optimization_goal TEXT,
    billing_event   TEXT,
    bid_strategy    TEXT,
    daily_budget    NUMERIC,
    lifetime_budget NUMERIC,
    targeting_json  JSONB,
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    created_time    TIMESTAMPTZ,
    updated_time    TIMESTAMPTZ
)

dim_ad (
    ad_id           TEXT PRIMARY KEY,
    adset_id        TEXT,
    campaign_id     TEXT,
    ad_account_id   TEXT,
    name            TEXT,
    status          TEXT,
    effective_status TEXT,
    creative_id     TEXT,
    created_time    TIMESTAMPTZ,
    updated_time    TIMESTAMPTZ
)

-- Hechos
fact_insight_daily (
    id                      BIGSERIAL PRIMARY KEY,
    ad_account_id           TEXT NOT NULL,
    ad_id                   TEXT,           -- NULL si level=account o campaign
    adset_id                TEXT,
    campaign_id             TEXT,
    level                   TEXT NOT NULL,  -- 'account'|'campaign'|'adset'|'ad'
    date_start              DATE NOT NULL,
    date_stop               DATE NOT NULL,
    api_version             TEXT DEFAULT 'v25.0',
    -- métricas base
    impressions             BIGINT,
    clicks                  BIGINT,
    spend                   NUMERIC(12,2),
    reach                   BIGINT,
    frequency               NUMERIC(8,4),
    cpm                     NUMERIC(12,4),
    ctr                     NUMERIC(8,4),
    cpp                     NUMERIC(12,4),
    -- JSON crudo (fuente de verdad)
    actions_json            JSONB,
    cost_per_action_json    JSONB,
    -- idempotencia
    extracted_at            TIMESTAMPTZ DEFAULT now(),
    UNIQUE (ad_account_id, COALESCE(ad_id,''), level, date_start, date_stop)
)

-- Tabla puente (opcional; permite queries SQL estrictas sobre action_type)
fact_insight_action (
    insight_id              BIGINT REFERENCES fact_insight_daily(id),
    action_type             TEXT NOT NULL,
    value                   NUMERIC(14,2),
    cost_per_action         NUMERIC(14,4),
    PRIMARY KEY (insight_id, action_type)
)
```

### KPIs derivados (vistas o cálculos en API interna)

```sql
-- Costo por conversación iniciada (7d)
SELECT
    date_start,
    ad_account_id,
    spend,
    (actions_json @> '[{"action_type":"onsite_conversion.messaging_conversation_started_7d"}]'
        -> 'value')::NUMERIC AS conversations_started,
    spend / NULLIF(
        (actions_json @> '[{"action_type":"onsite_conversion.messaging_conversation_started_7d"}]'
            -> 'value')::NUMERIC, 0
    ) AS cost_per_conversation
FROM fact_insight_daily
WHERE level = 'account'
  AND date_start >= CURRENT_DATE - 30;
```

---

## Extracción incremental — configuración recomendada

### Job diario (datos recientes)

```python
# Parámetros sugeridos para el job nocturno
LOOKBACK_DAYS = 3       # re-extrae los últimos 3 días por atribución tardía
LEVEL         = "ad"    # máximo detalle; agregar en el DW
TIME_INCREMENT = 1      # por día
FIELDS = [
    "ad_id", "ad_name", "adset_id", "adset_name",
    "campaign_id", "campaign_name",
    "impressions", "clicks", "spend", "reach", "frequency",
    "cpm", "ctr", "cpp",
    "actions", "cost_per_action_type",
    "date_start", "date_stop",
]

since = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()
until = date.today().isoformat()

params = {
    "level":          LEVEL,
    "time_increment": TIME_INCREMENT,
    "time_range":     json.dumps({"since": since, "until": until}),
    "fields":         ",".join(FIELDS),
}
```

### Backfill histórico (job único)

```python
# Partir en ventanas de 30 días para evitar timeouts síncronos
def backfill_windows(start: date, end: date, window_days: int = 30):
    cursor = start
    while cursor < end:
        window_end = min(cursor + timedelta(days=window_days - 1), end)
        yield cursor.isoformat(), window_end.isoformat()
        cursor = window_end + timedelta(days=1)

# Para cuentas grandes, usar job asíncrono:
# POST /v25.0/act_{ID}/insights  →  {"report_run_id": "..."}
# GET  /v25.0/{report_run_id}    →  poll async_status hasta "Job Completed"
# GET  /v25.0/{report_run_id}/insights  →  resultado paginado
```

---

## Manejo de errores y backoff

```python
import time

RETRYABLE_CODES = {4, 17, 613}  # throttling

def api_get_with_backoff(url, params, max_retries=5):
    for attempt in range(max_retries):
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json()

        body = resp.json()
        error_code = body.get("error", {}).get("code")

        if error_code in RETRYABLE_CODES:
            wait = 2 ** attempt   # 1, 2, 4, 8, 16 s
            time.sleep(wait)
            continue

        resp.raise_for_status()  # error no recuperable

    raise RuntimeError(f"Máximo de reintentos alcanzado para {url}")
```

**Cabeceras a monitorear en cada respuesta:**

```python
throttle = resp.headers.get("x-fb-ads-insights-throttle", "{}")
usage    = resp.headers.get("x-ad-account-usage", "{}")
# Parsear JSON y registrar en métricas de observabilidad
```

---

## Checklist de implementación v1

- **Autenticación:** token de larga duración (60 días) con renovación automática; secreto almacenado en vault / variables de entorno — nunca en repo.
- **Descubrimiento de cuentas:** iterar `/me/adaccounts` al inicio de cada job; no hardcodear IDs.
- **Idempotencia:** UPSERT en `fact_insight_daily` usando clave compuesta `(ad_account_id, ad_id, level, date_start, date_stop)`.
- **Persistencia de raw:** guardar JSON crudo de cada respuesta (`raw_insights`) antes de transformar; permite re-procesar sin re-llamar la API.
- **Zona horaria:** ajustar ventanas de `time_range` a la TZ de cada cuenta (`America/Guayaquil` = UTC-5).
- **Versionado de API:** registrar `api_version` ('v25.0') en cada fila para auditoría de cambios de schema.
- **Paginación:** siempre seguir `paging.next`; nunca asumir que la primera página es completa.
- **Monitoreo:** alertas si `app_id_util_pct` > 70 % o si hay errores 17/613 consecutivos.
- **Atribución:** documentar si los KPIs usan `use_unified_attribution_setting=true` o el default; hacer visible en el dashboard.


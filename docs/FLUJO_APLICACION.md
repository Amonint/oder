# Catálogo de la aplicación y referencia para RDS / Power BI

## Para qué sirve este documento

- Listar **todo lo que la aplicación hace** (pantallas, rutas y bloques funcionales) para que el modelo de datos que guardes en **RDS** y los informes en **Power BI** puedan **replicar las mismas relaciones y cortes** (cuenta → campaña → conjunto → anuncio → página, fechas, desgloses).
- El **inventario de dependencias** enlaza cada bloque con **Meta (Graph / insights)** y con el **endpoint interno** actual como referencia de forma de datos al diseñar tablas y pipelines de ingesta.

---

## Rutas principales (navegación)


| Ruta                                           | Qué es                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                            | Conexión: el usuario introduce el token de acceso a Meta para esta sesión.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/accounts`                                    | Listado de **cuentas publicitarias** (y opcionalmente agrupación por negocio). Al elegir una cuenta, la app navega al listado de **páginas** de esa cuenta.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/accounts/:accountId/pages`                   | **Páginas** asociadas a la cuenta con actividad de pauta en el periodo elegido; desde aquí se entra al panel por página.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `**/accounts/:accountId/dashboard`**           | **Dashboard de cuenta (vista Ads)** — panel principal de analítica **a nivel cuenta publicitaria**: resumen de KPIs (insights agregados por cuenta o por campaña seleccionada), exploración **campaña → conjunto de anuncios → anuncio**, ranking de anuncios, mapa geográfico, pestañas **Resumen**, **Creatividades**, **Audiencia**, **Comercial** (incluye datos manuales), **Avanzado** (atribución), comparación con periodo anterior, distribución de acciones, placements, demografía, leads, fatiga creativa, etc. Es la ruta que concentra la mayor parte de los informes “de cuenta”. |
| `/accounts/:accountId/pages/:pageId/dashboard` | **Dashboard por página de marca**: KPIs y bloques centrados en la **pauta de esa página** (mapa, series, conversiones, calidad de tráfico, diagnósticos, embudo, orgánico, competencia, etc.), con filtro por campaña donde aplica.                                                                                                                                                                                                                                                                                                                                                              |


Desde el Dashboard de cuenta hay enlace para ir al listado de **Páginas** de la misma cuenta; desde el dashboard por página hay enlace para volver a **Páginas** o pasar al **Dashboard de cuenta (Ads)**.

---

## Todo lo que hace la aplicación (por ámbito)

### A. Acceso y catálogos

- Validar sesión con token; sin token no hay datos.
- Cargar **cuentas publicitarias** del usuario; opcionalmente **portafolio por negocio** (negocio → cuentas).
- Cargar **campañas**, **conjuntos** y **anuncios** de la cuenta seleccionada (dimensiones para filtros).

### B. Dashboard de cuenta — ruta `/accounts/:accountId/dashboard`

- **Resumen**: impresiones, clics, gasto, alcance, frecuencia, CPM, CPP, CTR; listas de **acciones** y **coste por tipo de acción**; gráficos por categoría de acción; comparación con **periodo anterior** (misma duración).
- **Filtros jerárquicos**: campaña (acota resumen y muchos bloques), conjunto de anuncio, anuncio concreto.
- **Rendimiento por anuncio**: tabla/serie, periodo agregado o **diario** por anuncio.
- **Ranking** de anuncios por métrica (impresiones, clics, gasto, CTR).
- **Distribución de acciones** (por anuncio y agregado por campaña).
- **Mapa geográfico** (toda la cuenta o un anuncio).
- **Audiencia**: demografía (edad / género); **placements** (plataforma y posición).
- **Avanzado**: insights con distintas **ventanas de atribución**.
- **Comercial**: leads por campaña; **datos manuales** almacenados en base propia (no vienen de Meta).
- **Creatividades**: fatiga creativa (regla sobre métricas de insights).
- **Targeting** del anuncio seleccionado (lectura de anuncio/conjunto).
- Opcional: rendimiento por **etiquetas** en anuncios.

### C. Listado y dashboard por página — rutas `/accounts/:accountId/pages` y `.../pages/:pageId/dashboard`

- Listar **páginas** con pauta en la cuenta (periodo configurable).
- **Panel por página**: KPIs de pauta filtrados por promoción de esa página, mapa, placements, acciones, serie temporal, conversión/rentabilidad en serie, calidad de tráfico, diagnóstico de anuncios, embudo, métricas **orgánicas** de la página (Page Insights), módulos de **competencia / radar** (Ad Library + lógica propia).

### D. Fuentes que no son solo “insights de tu cuenta”

- **Datos manuales** (RDS / API propia).
- **Ingesta histórica** resumida (en el código actual, DuckDB; en tu despliegue puede ser RDS).
- **Competencia**: biblioteca de anuncios y clasificación propia.

---

## Inventario de funcionalidades y dependencias

Leyenda: **Meta Graph** = Marketing API / Graph (`act_`*, objetos, insights). **Page API** = insights orgánicos de página. **Ad Library** = biblioteca pública de anuncios. **Propia** = tu RDS u otra base, sin Meta.


| Funcionalidad                         | Grano sugerido para RDS / Power BI                                | Origen en Meta                                  | Referencia API interna (`/api/v1/...`)              |
| ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Cuentas                               | `dim_ad_account`                                                  | `GET /me/adaccounts`                            | `GET /accounts`                                     |
| Usuario del token                     | Metadato de sesión / auditoría                                    | `GET /me`                                       | `GET /me`                                           |
| Negocios y cuentas anidadas           | `dim_business` + puente a cuentas                                 | `GET /me/businesses`                            | `GET /businesses/portfolio`                         |
| Campañas                              | `dim_campaign` (account_id)                                       | `GET act_*/campaigns`                           | `GET /accounts/{id}/campaigns`                      |
| Conjuntos                             | `dim_adset` (campaign_id)                                         | `GET act_*/adsets`                              | `GET /accounts/{id}/adsets`                         |
| Anuncios                              | `dim_ad` (adset_id, campaign_id)                                  | `GET act_*/ads`                                 | `GET /accounts/{id}/ads`                            |
| **Resumen KPI cuenta/campaña**        | `fact_insights` nivel cuenta o campaña + `date_start`/`date_stop` | `GET act_*/insights` nivel account o campaign   | `**GET /accounts/{id}/dashboard`**                  |
| Rendimiento por anuncio               | `fact_ad_insights` (ad_id, día opcional)                          | `GET act_*/insights` nivel ad, `time_increment` | `GET /accounts/{id}/ads/performance`                |
| Placements                            | `fact_insights_placement` (+ breakdown keys)                      | Insights + `breakdowns`                         | `GET /accounts/{id}/insights/placements`            |
| Geografía                             | `fact_insights_geo` (+ región)                                    | Insights + breakdown geográfico                 | `GET /accounts/{id}/insights/geo`                   |
| Demografía                            | `fact_insights_demo` (+ edad, género)                             | Insights + breakdowns                           | `GET /accounts/{id}/insights/demographics`          |
| Atribución                            | `fact_insights_attr` (+ ventana)                                  | Insights + `action_attribution_windows`         | `GET /accounts/{id}/insights/attribution`           |
| Leads                                 | `fact_leads` o filas en `fact_insights` nivel campaña             | Insights + acciones lead                        | `GET /accounts/{id}/insights/leads`                 |
| Fatiga creativa                       | `fact_creative_fatigue` o columnas derivadas en `dim_ad` × fecha  | Insights nivel ad                               | `GET /accounts/{id}/insights/creative-fatigue`      |
| Targeting                             | JSON o tablas normalizadas por `ad_id` / `adset_id`               | `GET {ad-id}`, `GET {adset-id}`                 | `GET /accounts/{id}/ads/{ad_id}/targeting`          |
| Por etiqueta en anuncio               | Hechos agregados por etiqueta                                     | Insights ad + etiquetas en objeto anuncio       | `GET /accounts/{id}/ads/labels/performance`         |
| Páginas con pauta                     | `dim_page` + métricas resumen periodo                             | Varios insights / promociones                   | `GET /accounts/{id}/pages`                          |
| Panel KPI página                      | `fact_page_campaign_insights` (page_id, filtros)                  | Insights filtrados                              | `GET .../pages/{page_id}/insights`                  |
| Otros bloques página                  | Mismo grano con `page_id` en FK                                   | Mismo patrón insights                           | `.../placements`, `/geo`, `/actions`, `/timeseries` |
| Serie conversiones página             | Serie diaria                                                      | Insights diarios + acciones                     | `.../conversion-timeseries`                         |
| Tráfico / diagnóstico / embudo página | Agregados o top-N                                                 | Insights + sumas de acciones                    | `.../traffic-quality`, `/ad-diagnostics`, `/funnel` |
| Orgánico página                       | `fact_page_organic_daily`                                         | `GET /{page-id}/insights` (Page Insights)       | `GET /pages/{page_id}/organic-insights`             |
| Manual comercial                      | `fact_manual` / tablas de carga                                   | **Propia**                                      | `GET/POST /accounts/{id}/manual-data`               |
| Snapshot ingesta                      | Tabla de snapshots si aplica                                      | **Propia**                                      | `GET /accounts/{id}/summary`                        |
| Competencia                           | Tablas de competidores / ads archivados                           | **Ad Library** + **Propia**                     | `GET /competitor/...`                               |


---

## Cómo usar esto para RDS

- Cada fila del inventario que viene de Meta debería poder **persistirse** como tablas de hechos con **claves foráneas** a `dim_ad_account`, y según el caso `dim_campaign`, `dim_adset`, `dim_ad`, `dim_page`, más **dim_fecha** y dimensiones de desglose (región, placement, demografía, ventana de atribución).
- El endpoint `**GET /accounts/{id}/dashboard`** alimenta el **mismo núcleo de KPIs** que las tarjetas superiores del Dashboard de cuenta: al guardar en RDS ese agregado (por cuenta o por campaña y rango de fechas), alineas el “resumen” de la app con lo que Power BI puede sumar o comparar.
- Los bloques **solo propios** (manual, competencia, snapshots) viven en tablas separadas y se relacionan con `ad_account_id` / `campaign_id` como en la app.

---

## Actualización 2026-04-19 (flujo unificado analista)

- El endpoint `GET /accounts/{id}/dashboard` ahora incluye contrato extendido:
  - `context` (nivel, entidad, rango reportado),
  - `summary` (incluye `cost_per_result`),
  - `derived` (`results`, `cpa`, `roas`),
  - `action_values` y `diagnostic_inputs`.
- Se añadieron campos clave para rendimiento en rutas de Ads:
  - `action_values`, `purchase_roas`, `inline_link_clicks`, `cost_per_result`.
- Se habilitó desglose geográfico configurable:
  - `GET /accounts/{id}/insights/geo?geo_breakdown=region|country`.
- Se habilitó desglose de placement con dispositivo:
  - `GET /accounts/{id}/insights/placements?include_device_breakdowns=true`.
- Se añadió endpoint temporal:
  - `GET /accounts/{id}/insights/time` con `time_increment=1|7|monthly|hourly`.
- En frontend se agregó soporte para modo unificado con `VITE_UNIFIED_DASHBOARD=true`:
  - barra global de filtros,
  - resumen ejecutivo,
  - ranking campañas,
  - bloque de diagnóstico por nivel,
  - panel de insights y decisiones accionables.
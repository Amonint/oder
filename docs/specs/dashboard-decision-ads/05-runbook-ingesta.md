# Runbook de ingesta — Dashboard de decision Ads

**Fecha:** 2026-04-23  
**Objetivo:** Operar ingesta Meta -> DB de forma confiable para analisis de decision.

---

## 1) Alcance operativo

Este runbook cubre:

- frecuencia ETL,
- idempotencia,
- llaves canonicas,
- backfill,
- monitoreo y alertas.

Fuera de alcance: automatizacion de pausado/escalado de anuncios.

---

## 2) Frecuencia ETL recomendada

### 2.1 Carga incremental diaria (obligatoria)

- **Cadencia:** diaria.
- **Ventana incremental recomendada:** `T-3` a `T` para capturar ajustes tardios.
- **Entidad objetivo:**
  - dimensiones: `dim_campaign`, `dim_adset`, `dim_ad`
  - hechos: `fact_insights_daily_ad`, `fact_insights_daily_ad_breakdown`

### 2.2 Reconciliacion periodica (recomendada)

- **Cadencia:** semanal.
- **Ventana:** ultimos `30` dias.
- **Objetivo:** corregir drift por actualizaciones de atribucion/reporting.

---

## 3) Idempotencia

- Re-ejecutar el mismo rango temporal debe producir el mismo estado final.
- Estrategia de escritura: `upsert` por llave canonica.
- Guardar metadatos de proceso:
  - `api_version`
  - `ingested_at`
  - `job_run_id`
  - `source_checksum` (si aplica)
- Retries permitidos con backoff; sin duplicar hechos.

---

## 4) Llaves canonicas

### 4.1 Hechos diarios por anuncio

`fact_insights_daily_ad`:

- `ad_account_id`
- `ad_id`
- `date`
- `attribution_window`

### 4.2 Hechos con breakdown

`fact_insights_daily_ad_breakdown`:

- `ad_account_id`
- `ad_id`
- `date`
- `breakdown_type`
- `breakdown_value`
- `attribution_window`

### 4.3 Dimensiones

- `dim_campaign`: (`ad_account_id`, `campaign_id`)
- `dim_adset`: (`ad_account_id`, `adset_id`)
- `dim_ad`: (`ad_account_id`, `ad_id`)

---

## 5) Flujo de ingesta (alto nivel)

1. Extraer entidades (campaign/adset/ad) de Meta API.
2. Upsert de dimensiones.
3. Extraer insights por `ad_id`, fecha y `attribution_window`.
4. Normalizar metricas (`results`, `cost_per_result`, `roas`) manteniendo trazabilidad.
5. Upsert en hechos.
6. Validaciones de calidad (volumen, duplicados, nulos criticos).
7. Publicar estado de corrida y metricas operativas.

---

## 6) Politica de backfill

### 6.1 Backfill estandar

- **Al activar cuenta:** cargar ultimos `180` dias (o limite definido por producto).
- **Ventanas:** ejecutar por cada `attribution_window` habilitada.
- **Particionado sugerido:** por bloques mensuales para controlar reintentos.

### 6.2 Backfill correctivo

Disparadores:

- bug de transformacion,
- cambio de definicion KPI,
- inconsistencia detectada en QA o monitoreo.

Regla:

- rehacer rango afectado completo,
- registrar `backfill_reason`,
- validar comparabilidad antes de exponer en API.

---

## 7) Monitoreo y alertas

### 7.1 Metricas minimas por corrida

- duracion de job,
- filas insertadas/actualizadas por tabla,
- tasa de error API Meta,
- porcentaje de llaves duplicadas,
- cobertura de fechas esperadas,
- atraso (`data_freshness_lag_hours`).

### 7.2 Alertas recomendadas

- ETL fallida 2 corridas consecutivas.
- Freshness mayor a umbral definido (ej. > 30h).
- Duplicados en llave canonica > 0.
- Caida abrupta de volumen de filas vs media historica.
- Proporcion de `insufficient_data` anomala.

---

## 8) Controles de calidad de datos

- Unicidad por llave canonica.
- No nulos en llaves y metricas obligatorias (`spend`, `impressions`).
- `attribution_window` dentro de catalogo permitido.
- Coherencia temporal (`since <= until`, fechas no futuras).
- Consistencia de moneda por cuenta.

---

## 9) Respuesta ante incidentes

1. Detectar alerta y clasificar severidad.
2. Congelar publicacion de insights si compromete comparabilidad.
3. Reintentar incremental corto (`T-1` a `T`) para recuperacion rapida.
4. Si persiste, ejecutar backfill correctivo del rango afectado.
5. Documentar causa raiz y acciones preventivas.

---

## 10) Checklist operativo de cierre diario

- [ ] Job incremental completado.
- [ ] Sin duplicados en llaves canonicas.
- [ ] Freshness dentro de SLA interno.
- [ ] Endpoints criticos responden con datos del ultimo corte.
- [ ] Incidentes documentados o corrida declarada saludable.

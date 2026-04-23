# Plan de escritura: Dashboard de decisiones Ads (Meta API v25.0 + DB)

> **Spec fuente:** `docs/specs/2026-04-23-dashboard-decision-ads-meta-api-db.md`  
> **Objetivo de este documento:** convertir la spec en plan de ejecución redactable, tickets y checklist QA sin reescribir arquitectura.

---

## 1) Resumen operativo

Este plan implementa una capa de decisión sobre lo existente, sin reemplazar módulos actuales:

- clasificación de anuncios `keep/test/pause`,
- explicación de driver principal,
- benchmark histórico de cuenta,
- score de confianza de insights.

Restricción del producto: no quemar interpretación; solo datos + señales + contexto.

---

## 2) Entregables de escritura (documentación interna)

| Entregable | Contenido mínimo | Prioridad |
|------------|------------------|-----------|
| Brief funcional P0 | preguntas oficiales + definición de estados `keep/test/pause` | Alta |
| Contrato API interno | payloads `ads/decision`, `insights/benchmark`, `insights/drivers`, `insights/confidence` | Alta |
| Diccionario de KPIs | fórmula, ventana de atribución, notas de comparabilidad | Alta |
| QA checklist release | escenarios de volumen bajo, atribución, datos insuficientes | Alta |
| Runbook de ingesta | frecuencia ETL, idempotencia, llaves canónicas, backfill | Media |

Checklist:

- [x] Brief funcional P0 publicado.
- [x] Contratos API revisados por backend/frontend.
- [x] Diccionario KPI enlazado desde el dashboard interno.
- [x] QA checklist cargado en flujo de release.

---

## 3) Orden recomendado (writing + implementación)

1. Definir reglas de decisión (`keep/test/pause`) y umbrales base.
2. Escribir contrato de `GET /ads/decision` (P0 bloqueante).
3. Documentar modelo de datos mínimo para ETL diario.
4. Escribir contratos de benchmark/drivers/confidence.
5. Redactar copy UI neutral (datos/señales/tu interpretación).
6. QA de comparabilidad (atribución, volumen, periodos).

---

## 4) Plan por fases

## Fase 1 — Decisión por anuncio (P0)

Objetivo: entregar valor inmediato para “qué se queda / se va”.

Incluye:

- `fact_insights_daily_ad` + `dim_campaign/dim_adset/dim_ad` (mínimo viable),
- endpoint `GET /api/v1/accounts/{id}/ads/decision`,
- bloque UI “Decisión por anuncio” (`keep/test/pause` + razón breve).

No incluye:

- benchmark percentilar completo,
- score de confianza avanzado.

## Fase 2 — Explicabilidad y benchmark (P1)

Incluye:

- endpoint `GET /api/v1/accounts/{id}/insights/benchmark`,
- endpoint `GET /api/v1/accounts/{id}/insights/drivers`,
- paneles UI “Benchmark histórico” + “Driver principal”.

## Fase 3 — Confiabilidad y operación (P1/P2)

Incluye:

- endpoint `GET /api/v1/accounts/{id}/insights/confidence`,
- score de confianza por insight,
- runbook completo de ETL, backfill y monitoreo.

---

## 5) Tickets listos para pegar (Jira/Linear)

## Epic sugerido

- **Título:** `[Spec 2026-04-23] Capa de decisión Ads basada en Meta API + DB`
- **Descripción:** Implementar clasificación `keep/test/pause`, drivers, benchmark y confianza sobre datos nativos de Meta, sin reemplazar módulos actuales.

---

### OB-DEC-P0-01 — Definir reglas `keep/test/pause`

**Descripción:** Redactar y acordar reglas base por cuenta para estado por anuncio.  
**Salida:** documento de reglas con umbrales mínimos de volumen, eficiencia y estabilidad.  
**Criterios:** incluye fallback “datos insuficientes”.

---

### OB-DEC-P0-02 — Modelo DB mínimo para decisión

**Descripción:** Crear esquema de persistencia mínimo (`fact_insights_daily_ad`, `dim_campaign`, `dim_adset`, `dim_ad`).  
**Criterios:** llaves canónicas (`ad_account_id`, `ad_id`, `date`, `attribution_window`), upsert idempotente.

---

### OB-DEC-P0-03 — ETL diario Meta -> DB

**Descripción:** Ingesta incremental diaria de entidades + insights por anuncio.  
**Criterios:** guardado de metadata (`api_version`, `ingested_at`), tolerancia a reintentos.

---

### OB-DEC-P0-04 — Endpoint `GET /ads/decision`

**Descripción:** Exponer estado por anuncio (`keep/test/pause`) + razones y métricas clave.  
**Criterios:** respuesta incluye periodo, atribución, nivel de confianza básico.

---

### OB-DEC-P0-05 — UI “Decisión por anuncio”

**Descripción:** Añadir bloque en dashboard de cuenta con tabla/etiquetas `keep/test/pause`, razón y acción sugerida.  
**Criterios:** no reemplaza vistas existentes; solo adiciona.

---

### OB-DEC-P1-06 — Endpoint `GET /insights/benchmark`

**Descripción:** Entregar benchmark histórico de cuenta por KPI (percentiles).  
**Criterios:** comparabilidad por misma ventana de atribución.

---

### OB-DEC-P1-07 — Endpoint `GET /insights/drivers`

**Descripción:** Descomponer variación entre periodos (CPM/CTR/frecuencia/resultados).  
**Criterios:** respuesta legible y trazable por fórmula.

---

### OB-DEC-P1-08 — Endpoint `GET /insights/confidence`

**Descripción:** Score de confianza de insights según volumen, consistencia y completitud.  
**Criterios:** devuelve `high|medium|low` + explicación.

---

### OB-DEC-P1-09 — UI Benchmark + Drivers + Confianza

**Descripción:** Añadir paneles de contexto sin eliminar módulos actuales.  
**Criterios:** diseño neutral: datos, señales, interpretación del usuario.

---

### OB-DEC-QA-10 — QA de comparabilidad y neutralidad

**Descripción:** Ejecutar checklist de release para evitar interpretaciones engañosas.  
**Criterios:**

- no recomendar `pause` en bajo volumen,
- atribución visible en KPIs sensibles,
- “datos insuficientes” cuando aplique,
- joins resueltos en DB, no en render frontend.

---

## 6) Criterios de aceptación del plan

- [ ] Existe una salida P0 usable para decidir anuncios (`keep/test/pause`).
- [ ] No se elimina ningún bloque actual del dashboard.
- [ ] Toda recomendación viene con razón y contexto de atribución.
- [ ] El sistema distingue claramente señal fuerte vs dato insuficiente.

---

## 7) Riesgos de ejecución

- **Riesgo:** sobreajuste de reglas globales.
  - **Mitigación:** umbrales configurables por cuenta.

- **Riesgo:** ruido en periodos cortos.
  - **Mitigación:** ventana mínima + score de confianza.

- **Riesgo:** latencia por consulta histórica.
  - **Mitigación:** materializar benchmark y drivers en DB.


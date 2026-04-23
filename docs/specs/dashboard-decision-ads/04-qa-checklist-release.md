# QA checklist release — Dashboard de decision Ads

**Fecha:** 2026-04-23  
**Objetivo:** Validar release sin regresiones funcionales ni sesgos de interpretacion.

---

## 1) Criterios de salida del QA

- No hay regressions en modulos existentes del dashboard.
- Clasificacion `keep/test/pause` disponible y consistente.
- Atribucion visible y consistente en KPIs sensibles.
- Fallback de datos insuficientes aplicado correctamente.
- Joins complejos resueltos en DB/ETL, no en frontend.

---

## 2) Escenarios criticos — Bajo volumen

- [ ] Con `impressions` y `spend` por debajo de minimos, estado = `test`.
- [ ] Con `results = 0` y gasto bajo, estado = `test`, no `pause`.
- [ ] `confidence_level` cae a `low` en baja muestra.
- [ ] Mensaje explicito de `insufficient_data` visible en API y UI.
- [ ] No aparecen razones contradictorias (ej. `pause` con `datos insuficientes`).

---

## 3) Escenarios de atribucion

- [ ] Requests con `attribution_window` valida responden correctamente.
- [ ] KPIs de conversion (`results`, `cost_per_result`, `roas`) devuelven ventana en payload.
- [ ] Comparaciones entre periodos con ventanas distintas marcan `comparable = false` o error de contrato.
- [ ] Etiquetas de atribucion se visualizan en todos los paneles sensibles.
- [ ] No hay mezcla silenciosa de `click` y `view` en un mismo insight.

---

## 4) Escenarios de datos insuficientes

- [ ] Endpoint `/ads/decision` retorna `test` + `insufficient_data` en casos borde.
- [ ] Endpoint `/insights/confidence` retorna `low` cuando faltan senales.
- [ ] Benchmark no fuerza conclusiones cuando historico es corto.
- [ ] Drivers no inventan contribuciones cuando falta base comparativa.
- [ ] Mensajes de caveat son legibles y no bloquean render.

---

## 5) Escenarios de joins en DB

- [ ] Cada fila de `fact_insights_daily_ad` une correctamente con `dim_ad`, `dim_adset`, `dim_campaign`.
- [ ] Llave canonica aplicada: `ad_account_id`, `ad_id`, `date`, `attribution_window`.
- [ ] No existen duplicados por combinacion de llave canonica.
- [ ] `snapshot_targeting_adset` se resuelve por `adset_id` + `snapshot_date` correcto.
- [ ] Frontend no realiza joins de negocio para completar entidad.

---

## 6) Escenarios por endpoint

### 6.1 `/ads/decision`

- [ ] Responde `decision_status`, `decision_reason_code`, `primary_driver`, `confidence_level`.
- [ ] `status_filter` filtra correctamente.
- [ ] `limit/offset` y ordenamiento funcionan.

### 6.2 `/insights/benchmark`

- [ ] Devuelve percentiles (`p25`, `p50`, `p75`) y `position`.
- [ ] Marca `comparable` y `caveat` cuando corresponde.

### 6.3 `/insights/drivers`

- [ ] `primary_driver` coincide con mayor contribucion.
- [ ] Suma de contribuciones es coherente (tolerancia definida).

### 6.4 `/insights/confidence`

- [ ] Devuelve `confidence_score` en rango `[0,1]`.
- [ ] Mapea correctamente a `high|medium|low`.

---

## 7) No-regresion y neutralidad

- [ ] No se removio ningun bloque actual del dashboard.
- [ ] No hay copy imperativo de accion automatica.
- [ ] No hay automatizacion de pausa/escalado desde UI/API.
- [ ] La UI mantiene enfoque: datos, senales, interpretacion del usuario.

---

## 8) Evidencia minima para aprobar release

- [ ] Capturas/exports de responses de los 4 endpoints.
- [ ] Matriz de casos de bajo volumen (al menos 3).
- [ ] Caso de ventana comparable y no comparable.
- [ ] Verificacion de duplicados y cardinalidad de joins en DB.
- [ ] Checklist firmado por backend + frontend + producto.

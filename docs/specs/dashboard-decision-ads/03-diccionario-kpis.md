# Diccionario de KPIs — Dashboard de decision Ads

**Fecha:** 2026-04-23  
**Referencia:** `docs/specs/2026-04-23-dashboard-decision-ads-meta-api-db.md`  
**Objetivo:** Estandarizar formulas, atribucion, comparabilidad y caveats.

---

## 1) Reglas globales de calculo

- Grano base: `ad_account_id + ad_id + date + attribution_window`.
- Ventanas permitidas (`attribution_window`): `1d_click`, `7d_click`, `28d_click`, `1d_view`, `7d_view`.
- Todo KPI de conversion debe mostrar la ventana usada.
- No comparar KPIs de conversion entre ventanas distintas.
- Moneda y zona horaria deben ser consistentes por cuenta.

---

## 2) KPIs base

### 2.1 `spend`

- **Definicion:** gasto total en el periodo.
- **Formula:** suma de `spend`.
- **Atribucion:** no aplica directamente, pero se reporta junto con ventana seleccionada.
- **Comparabilidad:** alta si moneda y periodo son equivalentes.
- **Caveat:** cambios de tipo de cambio o ajustes pueden afectar lectura.

### 2.2 `impressions`

- **Definicion:** impresiones servidas.
- **Formula:** suma de `impressions`.
- **Atribucion:** no aplica.
- **Comparabilidad:** alta en misma segmentacion y periodo.
- **Caveat:** cambios fuertes de presupuesto alteran volumen.

### 2.3 `clicks`

- **Definicion:** clics registrados.
- **Formula:** suma de `clicks`.
- **Atribucion:** no aplica.
- **Comparabilidad:** alta.
- **Caveat:** no implica conversion.

### 2.4 `ctr`

- **Definicion:** tasa de clic sobre impresion.
- **Formula:** `clicks / impressions * 100`.
- **Atribucion:** no aplica.
- **Comparabilidad:** media-alta.
- **Caveat:** puede mejorar mientras conversiones empeoran.

### 2.5 `cpm`

- **Definicion:** costo por mil impresiones.
- **Formula:** `(spend / impressions) * 1000`.
- **Atribucion:** no aplica.
- **Comparabilidad:** media-alta.
- **Caveat:** sensible a subasta/estacionalidad.

### 2.6 `frequency`

- **Definicion:** exposiciones promedio por persona.
- **Formula:** `impressions / reach`.
- **Atribucion:** no aplica.
- **Comparabilidad:** media.
- **Caveat:** frecuencias altas pueden provocar fatiga.

---

## 3) KPIs de resultado (sensibles a atribucion)

### 3.1 `results`

- **Definicion:** cantidad de resultados objetivo (segun evento configurado).
- **Formula:** suma normalizada desde `actions`.
- **Atribucion:** obligatoria (`attribution_window`).
- **Comparabilidad:** solo con misma ventana y mismo evento.
- **Caveat:** cambiar evento objetivo rompe comparabilidad.

### 3.2 `cost_per_result`

- **Definicion:** costo unitario por resultado.
- **Formula:** `spend / results`.
- **Atribucion:** obligatoria.
- **Comparabilidad:** solo misma ventana y mismo tipo de resultado.
- **Caveat:** inestable con bajo volumen de `results`.

### 3.3 `roas`

- **Definicion:** retorno sobre gasto publicitario.
- **Formula:** `revenue_attributed / spend`.
- **Atribucion:** obligatoria.
- **Comparabilidad:** solo misma ventana, misma fuente de revenue y misma moneda.
- **Caveat:** puede retrasarse por latencia de conversiones.

---

## 4) KPIs derivados para decision

### 4.1 `decision_status`

- **Valores:** `keep` | `test` | `pause`.
- **Uso:** recomendacion operativa por anuncio.
- **Caveat:** no implica automatizacion ni verdad absoluta.

### 4.2 `primary_driver`

- **Valores:** `cpm` | `ctr` | `frequency` | `results` | `none`.
- **Uso:** principal explicador de variacion.
- **Caveat:** es explicativo, no causal econometrico.

### 4.3 `confidence_level`

- **Valores:** `high` | `medium` | `low`.
- **Origen:** mapea `confidence_score` en rangos configurables.
- **Caveat:** baja confianza requiere interpretacion conservadora.

### 4.4 `confidence_score`

- **Rango:** `0.0` a `1.0`.
- **Componentes sugeridos:** volumen, consistencia, completitud.
- **Caveat:** score operativo; no es p-value estadistico formal.

---

## 5) Reglas de comparabilidad

Un analisis es `comparable = true` solo si:

- `attribution_window` identica entre periodos;
- mismo KPI y misma definicion de resultado;
- misma moneda;
- periodos equivalentes para comparacion temporal;
- sin vacios criticos de ingesta.

Si no se cumplen, reportar:

- `comparable = false`
- `caveat` explicativo
- y evitar conclusiones fuertes (`test` cuando aplique).

---

## 6) Caveats operativos obligatorios en UI/API

- "Ventana de atribucion visible en KPIs de conversion."
- "Resultados con bajo volumen pueden ser inestables."
- "Benchmark historico depende de periodos comparables."
- "El sistema entrega senales; la interpretacion final es del usuario."

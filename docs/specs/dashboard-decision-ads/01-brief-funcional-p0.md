# Brief funcional P0 — Dashboard de decision Ads

**Fecha:** 2026-04-23  
**Referencia:** `docs/specs/2026-04-23-dashboard-decision-ads-meta-api-db.md`  
**Ambito:** Cuenta publicitaria (`/accounts/:accountId/dashboard`)  
**Estado:** Propuesta lista para implementacion P0

---

## 1) Objetivo funcional P0

Entregar una capa de decision por anuncio para responder, con senales neutrales:

- que anuncios mantener (`keep`),
- que anuncios observar/probar (`test`),
- que anuncios pausar (`pause`),

sin automatizar acciones sobre Meta y sin reemplazar modulos actuales del dashboard.

---

## 2) Preguntas oficiales (P0)

1. Que anuncios mantener (`keep`)?
2. Que anuncios probar (`test`) por falta de evidencia o senal mixta?
3. Que anuncios pausar (`pause`) por bajo rendimiento sostenido?
4. Que esta explicando la mejora/caida principal? (`primary_driver`: `cpm` | `ctr` | `frequency` | `results`)
5. Que insights tienen confianza alta/media/baja?
6. Existe evidencia suficiente para concluir o corresponde `datos_insuficientes`?

---

## 3) Definicion de estados

- **`keep`:** eficiencia superior al benchmark de cuenta y con volumen minimo.
- **`test`:** evidencia insuficiente o senal mixta; no hay fundamento para `keep` ni `pause`.
- **`pause`:** ineficiencia sostenida con gasto suficiente y evidencia consistente.

Regla de producto: el sistema recomienda; **no ejecuta pausa automatica**.

---

## 4) Reglas base (v1) y fallback

### 4.1 Precondiciones de comparabilidad (obligatorias)

Antes de clasificar:

- misma `attribution_window` entre periodo actual y referencia;
- mismo grano de analisis por `ad_id`;
- misma moneda de cuenta;
- periodo explicito (`since`, `until`) y `comparison_mode` definido.

Si falla alguna precondicion, forzar `test` con razon `non_comparable_window`.

### 4.2 Reglas base de volumen minimo

Campos de soporte:

- `min_impressions_for_decision`
- `min_spend_for_decision`
- `min_results_for_decision`

Si no se cumplen minimos, clasificar `test` con `insufficient_data`.

### 4.3 Reglas base para `keep`

Un anuncio clasifica en `keep` cuando:

- cumple volumen minimo;
- `cost_per_result` mejor (menor) que benchmark de cuenta para el KPI objetivo;
- y al menos una senal de soporte:
  - `ctr` por encima del benchmark, o
  - `frequency` en rango saludable segun cuenta, o
  - `roas` por encima del benchmark (si aplica).

### 4.4 Reglas base para `pause`

Un anuncio clasifica en `pause` cuando:

- cumple volumen minimo;
- `cost_per_result` peor (mayor) que benchmark de cuenta de forma sostenida;
- y no existe compensacion relevante en `roas` o volumen de `results`.

### 4.5 Reglas base para `test`

Clasificar en `test` cuando:

- volumen insuficiente;
- senales mixtas (ej. buen `ctr`, mala conversion);
- cambios recientes de aprendizaje o poca estabilidad temporal;
- inconsistencia de datos entre dias.

### 4.6 Fallback "datos insuficientes"

El fallback oficial es:

- `decision_status = "test"`
- `decision_reason_code = "insufficient_data"`
- `confidence_level = "low"`
- `recommended_action = "collect_more_data"`

Mensajes sugeridos:

- "Datos insuficientes para concluir keep/pause en este periodo."
- "Se recomienda acumular mas volumen antes de decidir."

---

## 5) Salida funcional minima por anuncio

Cada fila del panel P0 debe incluir:

- `ad_id`, `ad_name`
- `decision_status` (`keep` | `test` | `pause`)
- `decision_reason_code`
- `primary_driver` (`cpm` | `ctr` | `frequency` | `results` | `none`)
- `confidence_level` (`high` | `medium` | `low`)
- `attribution_window`
- `period` (`since`, `until`)
- metricas: `spend`, `impressions`, `clicks`, `ctr`, `cpm`, `frequency`, `results`, `cost_per_result`, `roas`
- `recommended_action` (texto neutral, no automatizado)

---

## 6) Reglas de experiencia y neutralidad

- Mostrar **datos + senales + contexto**, no conclusiones cerradas.
- Toda metrica de conversion debe mostrar `attribution_window`.
- Si hay baja evidencia, priorizar `test` y mensaje de insuficiencia.
- No ocultar incertidumbre: la confianza se muestra siempre.
- No remover bloques existentes del dashboard.

---

## 7) Criterios de aceptacion P0

- Existe clasificacion por anuncio `keep/test/pause`.
- Cada clasificacion incluye razon, periodo, atribucion y confianza.
- Se aplica fallback de `insufficient_data` de forma explicita.
- No existe automatizacion de pausado de anuncios.
- El panel puede convivir con modulos actuales sin regresiones.

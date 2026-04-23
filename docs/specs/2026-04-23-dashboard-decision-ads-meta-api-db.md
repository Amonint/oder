# Especificación: Dashboard de decisiones de Ads (Meta API v25.0 + capa histórica en DB)

**Versión:** 1.0  
**Fecha:** 2026-04-23  
**Producto:** Oderbiz Analytics  
**Ámbito:** Cuenta publicitaria (`/accounts/:accountId/dashboard`)  
**Restricción de diseño:** no reemplazar lo existente; solo añadir bloques si están justificados por decisión de negocio.

---

## 1) Objetivo de negocio

Construir una capa de decisión para pauta que ayude a usuarios no expertos a responder, con datos de Meta:

- qué anuncios se quedan,
- qué anuncios se pausan,
- qué dimensiones nativas rinden mejor (sin tags manuales),
- cómo evoluciona el rendimiento actual vs histórico.

El sistema **no debe quemar interpretación**: muestra datos, señales y contexto; la conclusión final la define el usuario.

---

## 2) Principios de producto

1. **Neutralidad analítica:** el dashboard no dicta verdades; entrega señales con nivel de confianza.
2. **Atribución explícita:** cualquier KPI de conversión/ROAS/CPA debe mostrar ventana de atribución usada.
3. **Comparabilidad honesta:** no comparar métricas con ventanas/definiciones incompatibles.
4. **Primero decisión, luego visual:** se agrega visual solo si habilita una acción concreta (keep/test/pause, escalar, investigar).
5. **No tags manuales:** solo dimensiones nativas de Meta API + joins internos en DB.

---

## 3) Preguntas oficiales del dashboard (P0)

Estas preguntas son el núcleo mínimo para decidir pauta:

1. **¿Qué anuncios mantener (`keep`)?**
2. **¿Qué anuncios probar (`test`) por falta de evidencia o señal mixta?**
3. **¿Qué anuncios pausar (`pause`) por bajo rendimiento sostenido?**
4. **¿Qué está explicando la caída o mejora?** (driver principal: CPM, CTR, frecuencia, resultados)
5. **¿Qué dimensiones nativas rinden mejor?** (placement, geo, edad, género, dispositivo)
6. **¿Qué funcionó históricamente en esta cuenta en periodos comparables?**
7. **¿Qué cambió entre periodo actual vs previo equivalente?**
8. **¿Qué insights tienen alta vs baja confianza estadística/operativa?**

---

## 4) Viabilidad Meta API v25.0 (abril 2026)

## 4.1 Respuesta nativa (sí)

- Rendimiento por nivel `account/campaign/adset/ad` vía `/{id}/insights`.
- Métricas base (`spend`, `impressions`, `clicks`, `ctr`, `cpm`, `frequency`, `actions`, `cost_per_action_type`).
- Ventanas de atribución soportadas (`1d_click`, `7d_click`, `28d_click`, `1d_view`, `7d_view` según disponibilidad de cuenta/versionado vigente).
- Breakdowns nativos (edad, género, geo, placement, device).

## 4.2 Parcial (requiere capa DB)

- Histórico largo con comparación consistente y rápida.
- Benchmark percentilar por cuenta.
- Identificación robusta de “qué se queda / se va” sin ruido diario.
- Empate entre performance + snapshots de targeting + estado de entidades en el tiempo.

## 4.3 No nativo (fuera de alcance de esta spec)

- Clasificación semántica avanzada de creatividad (hook/ángulo) sin tagging.
- Causalidad econométrica fuerte (MMM) o predicción de ROI completa.

---

## 5) Arquitectura funcional propuesta

## 5.1 Fuente operativa

- Meta Graph API v25.0 para extracción de entidades e insights.

## 5.2 Capa de persistencia analítica

Persistir en DB para empatar y consultar:

- hechos diarios por anuncio,
- dimensiones de campaña/adset/ad/creative,
- snapshots de targeting por adset,
- metadata de ingesta y atribución.

## 5.3 Capa semántica

- vistas/materializaciones para score de decisión:
  - `keep`,
  - `test`,
  - `pause`,
  - `primary_driver`,
  - `confidence_score`.

## 5.4 Capa UI

Presentar por bloque:

- **Datos** (neutros),
- **Señales** (sugerencias no dogmáticas),
- **Tu interpretación** (nota editable por usuario).

---

## 6) Modelo de datos mínimo (adición)

## 6.1 Tablas de dimensión

- `dim_campaign` (`ad_account_id`, `campaign_id`, `name`, `objective`, `status`, `effective_status`, timestamps)
- `dim_adset` (`ad_account_id`, `adset_id`, `campaign_id`, `name`, `optimization_goal`, `billing_event`, status, timestamps)
- `dim_ad` (`ad_account_id`, `ad_id`, `campaign_id`, `adset_id`, `name`, `creative_id`, `creative_name`, `status`, timestamps)

## 6.2 Snapshot de targeting

- `snapshot_targeting_adset` (`ad_account_id`, `adset_id`, `snapshot_date`, `targeting_json`, campos normalizados opcionales)

## 6.3 Hechos

- `fact_insights_daily_ad`
  - grano: `ad_account_id + ad_id + date + attribution_window`
  - métricas: spend, impressions, reach, clicks, ctr, cpm, frequency, results, cost_per_result, roas
  - payloads crudos: actions/action_values/cost_per_action_type
  - metadata: `api_version`, `ingested_at`

- `fact_insights_daily_ad_breakdown`
  - grano: `ad_account_id + ad_id + date + breakdown_type + breakdown_value + attribution_window`
  - métricas base y derivadas.

---

## 7) Reglas de decisión (P0)

Estados por anuncio:

- **keep:** eficiencia superior al benchmark de cuenta y volumen mínimo.
- **test:** señal intermedia o datos insuficientes (sin concluir).
- **pause:** ineficiencia sostenida con gasto suficiente.

Notas:

- Ninguna decisión se toma con volumen bajo.
- Regla configurable por cuenta (umbrales).
- El sistema muestra recomendación, no ejecuta pausa automática en esta fase.

---

## 8) Bloques UI a añadir (sin modificar lo existente)

1. **Panel “Decisión por anuncio”** (`keep/test/pause`) con razones (drivers).
2. **Panel “Driver principal”** (CPM/CTR/Frecuencia/Resultados).
3. **Panel “Benchmark histórico de cuenta”** (percentiles y posición actual).
4. **Panel “Confianza de insight”** (alto/medio/bajo con explicación).

Cada panel debe reutilizar endpoints internos y/o nuevas vistas sobre DB, sin romper contratos actuales.

---

## 9) Endpoints internos (propuesta de adición)

- `GET /api/v1/accounts/{id}/ads/decision`
  - retorna estado `keep/test/pause` por anuncio + motivos.

- `GET /api/v1/accounts/{id}/insights/benchmark`
  - retorna percentiles históricos y valor actual por KPI.

- `GET /api/v1/accounts/{id}/insights/drivers`
  - retorna descomposición del cambio vs periodo previo.

- `GET /api/v1/accounts/{id}/insights/confidence`
  - retorna score de confiabilidad por insight.

---

## 10) Criterios de aceptación

- [ ] No se elimina ni reemplaza ningún bloque actual del dashboard.
- [ ] Toda recomendación (`keep/test/pause`) incluye: métrica, periodo, ventana de atribución y nivel de confianza.
- [ ] Cualquier KPI de conversión muestra explícitamente ventana de atribución usada.
- [ ] El dashboard soporta análisis histórico sin depender de llamadas pesadas en tiempo real a Meta.
- [ ] Todos los joins complejos se resuelven en DB/ETL, no en render del frontend.
- [ ] Si no hay evidencia suficiente, el sistema muestra “datos insuficientes” en vez de conclusión fuerte.

---

## 11) Fuera de alcance

- Etiquetado manual de creatividades.
- Generación de contenido/copy.
- Automatización de cambios en Meta (pausar/escalar) desde el dashboard en esta versión.
- Modelos predictivos avanzados (MMM/forecasting completo).

---

## 12) Plan de implementación incremental

## Fase 1 (rápida, alto impacto)

- Persistencia `fact_insights_daily_ad` + `dim_*`.
- Endpoint `ads/decision`.
- Panel UI `keep/test/pause`.

## Fase 2

- Breakdown persistido y benchmark histórico.
- Paneles de driver y confianza.

## Fase 3

- Refinamiento de umbrales por cuenta.
- Trazabilidad de decisiones y lectura semanal.

---

## 13) Riesgos y mitigaciones

- **Riesgo:** interpretación errónea por cambio de atribución.
  - **Mitigación:** etiqueta obligatoria de atribución en toda visual sensible.

- **Riesgo:** ruido estadístico en bajo volumen.
  - **Mitigación:** umbral mínimo + estado `test` por defecto.

- **Riesgo:** latencia/costos API en histórico.
  - **Mitigación:** ETL incremental diario + consumo primario desde DB.


# PRD — Auditoria Exhaustiva de Metricas del Dashboard Meta

## 1) Objetivo

Validar que todas las metricas mostradas en los dashboards de Cuenta y Pagina sean:

1. Fieles a la respuesta de Meta API (v25).
2. Coherentes entre KPI, grafico, tooltip y tabla.
3. Consistentes al aplicar filtros de fecha/campana/estructura.
4. Trazables con formula explicita y reproducible.

## 2) Problema de negocio

Si el dashboard muestra incoherencias (ej. inversion 0 con resultados > 0, CPA previo mal alineado, KPI agregado que no cuadra con serie), el equipo toma decisiones de presupuesto equivocadas y pierde confianza en la herramienta.

## 3) Alcance

### En alcance

- Dashboard Cuenta (`DashboardPage`).
- Dashboard Pagina (`PageDashboardPage`).
- Modulos: rentabilidad, embudo, trafico, geo, demografia, diagnostico.
- Comparaciones periodo actual vs periodo anterior.
- Filtros de fecha (`today`, `last_7d`, `last_30d`, `last_90d`, `custom`, `maximum`) y campana.

### Fuera de alcance

- Integrar nuevas fuentes externas.
- Rediseno de branding/UI no relacionado con exactitud de metricas.

## 4) Fuentes de verdad

- Meta Marketing API v25 (Insights): `date_preset`, `time_range`, `time_increment`, `actions`, `cost_per_action_type`, `action_values`.
- Backend local (`/api/v1/accounts/...`) como capa de transformacion oficial.

## 5) Requisitos funcionales

### RF-01 Diccionario de metricas obligatorio

Cada metrica debe tener:

- Nombre UI.
- Endpoint backend.
- Campo(s) de Meta.
- Formula.
- Unidad.
- Nivel de agregacion.
- Tolerancia de redondeo.

### RF-02 Coherencia numerica

- KPI agregado de un modulo debe cuadrar con la suma/ratio de su serie base.
- Tooltip diario debe cuadrar con la fila diaria correspondiente.
- Serie anterior debe respetar su rango solicitado.

### RF-03 Coherencia de filtros

- Misma seleccion de filtros debe aplicarse igual en KPI, grafico y tabla.
- No se permiten fugas de cache entre rangos (`date_start/date_stop`).

### RF-04 Transparencia de cobertura

- Mostrar cobertura real de dias con datos cuando Meta devuelva series sparse.
- No inducir comparaciones engañosas sin aviso.

## 6) No funcionales

- Reproducibilidad: misma entrada => mismo valor.
- Trazabilidad: cada valor auditado con evidencia de payload y formula.
- Auditabilidad continua: ejecucion automatica en bucle hasta lograr coherencia o agotar intentos.

## 7) Metodologia de validacion

### 7.1 Auditoria automatica

Script: `scripts/audit_dashboard_metrics.py`

Valida en bucle:

- Formula CPA diario (`spend / conversions`).
- Coherencia spend agregado conversion-timeseries vs insights.
- Embudo (`first_replies <= conversations_started`).
- Trafico (`outbound_clicks == 0` con `cost_per_outbound_click > 0`).
- Geo (resultados > 0 con spend 0).
- Fugas de rango en serie actual y serie previa.
- Coherencia basica CPM.

### 7.2 Auditoria manual guiada

- Verificar puntos del grafico con tooltip vs payload del dia.
- Verificar que comparacion actual/anterior use ventana correcta.
- Verificar que labels expliquen diferencias de definicion (embudo vs insights).

## 8) Criterios de aceptacion

- `critical = 0` y `high = 0` en el reporte automatizado final.
- Sin incoherencias de rango en periodo anterior.
- Sin desalineacion semantica entre KPIs y graficos.
- Reporte final firmado con evidencia.

## 9) Plan de ejecucion

1. Ejecutar auditoria automatica en entorno local sobre cuenta/pagina objetivo.
2. Corregir hallazgos severos.
3. Re-ejecutar en bucle hasta pasar criterios.
4. Emitir reporte final (`docs/metrics-audit/LATEST_AUDIT_REPORT.md`).

## 10) Comando operativo recomendado

```bash
python3 scripts/audit_dashboard_metrics.py \
  --base-url http://localhost:8000 \
  --account-id act_131112367482947 \
  --page-id 1506380769434870 \
  --presets last_7d,last_30d,last_90d \
  --max-loops 8 \
  --sleep-seconds 2
```

## 11) Riesgos y mitigaciones

- Meta puede devolver dias sin filas: mitigar con densificacion de calendario y badge de cobertura.
- Cambios de definiciones de Meta por fecha: mitigar con alerta contextual en UI.
- Filtros complejos pueden sesgar comparacion: mitigar con pruebas por combinacion critica.


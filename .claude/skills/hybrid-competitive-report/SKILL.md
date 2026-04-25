---
name: hybrid-competitive-report
description: |
  Construye un informe ejecutivo que combina datos internos exportados desde la
  plataforma del cliente con investigacion competitiva publica (web, reseñas,
  redes y señales de ads). Entrega comparativos accionables y plan de decisiones.
version: 1.0.0
author: oderbiz
tags:
  - competitor-research
  - executive-report
  - benchmark
  - marketing
  - ads
  - local-business
---

# Hybrid Competitive Report

## Rol y objetivo

Este skill produce un reporte unico de negocio que cruza:

1. **Datos propios** del cliente (export del dashboard/reporte interno).
2. **Datos competitivos** publicos (web, Google Maps, reseñas, redes, señales de ads).

El resultado es un informe de decision semanal: que esta bien, que esta peor que mercado, y que acciones priorizar.

---

## Cuando activar

Activa este skill cuando el usuario pida:

- "mezclar mis datos con la competencia"
- "hacer informe propio vs competidores"
- "benchmark competitivo con mi reporte"
- "auditoria competitiva con datos de mi cuenta"
- "resumen ejecutivo de performance vs mercado"

Si el usuario solo pide analizar competidores sin datos internos, usar `competitor-profiling`.
Si solo pide lectura de metricas propias sin competencia, usar analisis interno del dashboard.

---

## Entradas minimas necesarias

Pide solo lo faltante:

1. **Archivo de datos internos**: JSON/CSV/XLSX exportado de la plataforma.
2. **Ventana de tiempo**: fechas del reporte.
3. **Negocio y ciudad objetivo**: para delimitar competencia.
4. **Servicios/productos foco**: maximo 3.
5. **Objetivo de comparacion**: costos, conversion, reputacion, visibilidad, creatividad o todo.
6. **Competidores semilla (opcional)**: 2 a 5 nombres/URLs si el cliente ya los conoce.

---

## Reglas de calidad de datos

1. No mezclar periodos distintos sin marcarlo.
2. No comparar metricas incompatibles (ej. leads vs ventas cerradas) sin normalizacion.
3. Etiquetar cada dato como:
   - `observado` (dato directo)
   - `estimado` (aproximado desde evidencia publica)
   - `inferencia` (hipotesis razonada)
4. Si no hay evidencia publica suficiente, declarar brecha en vez de inventar.

---

## Flujo operativo

```text
1) Ingesta y perfilado de datos internos
2) Descubrimiento de competidores
3) Recoleccion de evidencia publica por competidor
4) Normalizacion y matriz comparativa
5) Diagnostico (fortalezas, brechas, riesgos)
6) Recomendaciones priorizadas (impacto x esfuerzo)
7) Entrega de informe markdown + anexos de evidencia
```

---

## Paso 1: Ingesta de datos internos

Extrae del reporte interno (si existe):

- Gasto, impresiones, clics, CTR, CPC, CPM.
- Resultados, CPA, ROAS.
- Tendencia por fecha (dia/semana/mes).
- Top y bottom anuncios/campañas/adsets.
- Cobertura de referencias creativas (si aplica).

Crear un bloque llamado `baseline_interno` con:

- Periodo
- Unidad de negocio/cuenta/pagina
- KPIs principales
- Alertas visibles (fatiga, concentracion, caida de conversion, etc.)

---

## Paso 2: Descubrir competencia

Usar busquedas web adaptadas a `{industria}` + `{ciudad}`:

- competidores generales
- competidores por servicio clave
- perfiles en Google Maps
- redes sociales del sector
- posibles anuncios activos

Seleccionar 3 a 7 competidores relevantes.

---

## Paso 3: Evidencia publica por competidor

Para cada competidor obtener, si hay acceso:

- Web: propuesta de valor, servicios, CTA, pruebas de confianza.
- Reseñas: volumen, rating aproximado, temas de opinion.
- Redes: frecuencia y tipo de contenido.
- Ads: indicios de anuncios pagados.

Guardar evidencia resumida por fuente: `web`, `maps/reviews`, `social`, `ads`.

---

## Paso 4: Normalizacion comparativa

Construir una tabla "interno vs competidores" con columnas:

- Oferta/servicios
- Mensaje/posicionamiento
- Presencia digital
- Reputacion
- Intensidad comercial (contenido + ads)

Y filas:

- Cliente (interno)
- Competidor A..N
- Promedio mercado local (estimado)

Marcar cada celda con evidencia y nivel de confianza (`alto`, `medio`, `bajo`).

---

## Paso 5: Diagnostico

Emitir hallazgos en 4 bloques:

1. **Ventajas propias sostenibles**
2. **Brechas frente al mercado**
3. **Riesgos competitivos proximos**
4. **Oportunidades de alto impacto**

Cada hallazgo debe incluir:

- Que se observo
- Contra quien se compara
- Evidencia
- Implicacion de negocio

---

## Paso 6: Recomendaciones priorizadas

Priorizar con matriz Impacto x Esfuerzo:

- `P1` alto impacto / bajo esfuerzo (ejecutar ya)
- `P2` alto impacto / mayor esfuerzo (planificar)
- `P3` experimental (piloto controlado)

En cada accion incluir:

- Responsable sugerido (media, contenido, ventas, direccion)
- KPI objetivo
- Ventana de validacion (7, 14 o 30 dias)
- Criterio de exito

---

## Formato de salida obligatorio

Entregar un markdown con esta estructura:

1. **Resumen ejecutivo (3-6 frases)**
2. **Contexto y periodo analizado**
3. **Baseline interno (KPIs y tendencia)**
4. **Tabla de competidores**
5. **Comparacion interna vs mercado**
6. **Diagnostico (fortalezas, brechas, riesgos, oportunidades)**
7. **Plan de accion priorizado**
8. **Anexo de evidencias y limitaciones**

---

## Plantilla corta recomendada

```markdown
# Informe Hibrido: [Negocio] vs Mercado

## 1) Resumen ejecutivo
- ...

## 2) Baseline interno
- Periodo:
- KPIs:
- Alertas:

## 3) Competidores analizados
| Competidor | Web | Redes | Reseñas | Ads | Nota |
|---|---|---|---|---|---|

## 4) Comparativa clave
| Dimension | Cliente | Mercado local | Gap |
|---|---|---|---|

## 5) Hallazgos
### Ventajas
- ...
### Brechas
- ...
### Riesgos
- ...
### Oportunidades
- ...

## 6) Plan de accion
| Prioridad | Accion | Responsable | KPI | Ventana |
|---|---|---|---|---|

## 7) Evidencia y limites
- Fuentes:
- Datos no disponibles:
```

---

## Buenas practicas y limites

- Parafrasear siempre; no copiar bloques largos de terceros.
- Declarar supuestos y huecos de datos.
- No afirmar inversion en ads sin indicios claros.
- Mantener tono neutral y profesional.
- Citar fuente de forma breve en cada bloque.

---

## Combinacion recomendada con otros skills

- `competitor-profiling`: para profundidad por competidor.
- `analytics-tracking`: para mejorar calidad de datos internos del siguiente ciclo.
- `paid-ads`: para traducir hallazgos en plan de pauta.
- `page-cro`: para convertir gaps de mensaje en mejoras de landing.

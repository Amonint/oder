---
name: local-competitor-research
description: |
  Investiga competencia local con busqueda web estructurada y genera un brief
  competitivo accionable. Version optimizada para integrarse con reportes
  internos mediante el skill hybrid-competitive-report.
version: 1.2.0
author: oderbiz
tags:
  - competitor-research
  - local-business
  - benchmark
  - marketing
---

# Local Competitor Research

## Objetivo

Analizar 3 a 7 competidores locales y entregar comparacion clara sobre:

- servicios y ofertas
- mensajes y posicionamiento
- reputacion (reseñas)
- presencia digital (web + redes)
- indicios de publicidad

---

## Cuando usar

Usar cuando el usuario pida benchmark o analisis competitivo local.
Si ademas aporta datos internos del negocio, escalar a `hybrid-competitive-report`.

---

## Datos minimos

1. Negocio del cliente
2. Industria/tipo de negocio
3. Ciudad y zona
4. Servicios foco (max 3)
5. Objetivo principal del analisis

---

## Flujo

1. Definir alcance con usuario
2. Ejecutar 5+ grupos de busqueda
3. Seleccionar competidores relevantes
4. Analizar web, reseñas, redes, ads por competidor
5. Entregar informe con recomendaciones

---

## Busquedas obligatorias

Adaptar con `{industria}`, `{ciudad}`, `{servicio}`:

1. Competencia general local
2. Reputacion del cliente
3. Competencia por servicio clave
4. Presencia social del sector
5. Listado en mapas

---

## Criterios de seleccion de competidores

Priorizar perfiles con:

- web propia
- Google Maps o reseñas visibles
- al menos una red activa

Excluir directorios sin data util o negocios fuera de alcance.

---

## Output obligatorio

1. Resumen ejecutivo
2. Tabla de competidores
3. Analisis por competidor
4. Comparacion con cliente
5. Recomendaciones accionables
6. Fuentes y limites

---

## Regla de evidencia

- Distinguir `observado`, `estimado` e `inferencia`.
- No asumir ads sin evidencia.
- No copiar reseñas o textos largos literal.
- Si una fuente falla, transparentar el limite.

---

## Integracion recomendada

Para informe completo con datos propios + mercado:

1. Ejecutar este skill para evidencia externa.
2. Ejecutar `hybrid-competitive-report` para fusionar con reporte interno.

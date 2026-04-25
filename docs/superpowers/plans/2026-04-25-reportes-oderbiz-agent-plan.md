# Plan de implementacion: agente `/reportes-oderbiz`

## Objetivo del plan

Implementar un agente basado en skill que:

- se active con `/reportes-oderbiz`,
- reciba JSON `llm_context_report.page.v1`,
- orqueste skills de analisis interno + investigacion competitiva,
- y genere un `.tex` nuevo en `docs/reports/` con fuentes y limitaciones.

---

## Entregables

1. Skill orquestador nuevo en `.claude/skills/reportes-oderbiz/SKILL.md`.
2. Plantilla/convencion de salida LaTeX adaptada a `Report Template/main.tex`.
3. Flujo de nombre y persistencia de reportes:
   - `docs/reports/reporte-<negocio-slug>-YYYY-MM-DD.tex`
   - sufijos `-v2`, `-v3` para colisiones.
4. Documento de validacion basica del JSON de entrada.
5. Checklist de pruebas manuales para QA del agente.

---

## Fase 1: Fundaciones del agente

### 1.1 Crear skill principal

- Crear carpeta: `.claude/skills/reportes-oderbiz/`
- Crear `SKILL.md` con:
  - trigger `/reportes-oderbiz`
  - saludo fijo
  - solicitud del JSON del negocio
  - contrato de entrada/salida

### 1.2 Definir contrato de datos

- Incluir validacion minima de campos obligatorios:
  - `schema_version`
  - `report_metadata`
  - `page_overview`
  - `timeseries_daily`
- Definir manejo de faltantes criticos (solicitud puntual).

### 1.3 Definir esquema de evidencia

- Regla global de etiquetado:
  - `observado`
  - `estimado`
  - `inferencia`
- Establecer bloque obligatorio `Fuentes y limitaciones` en la salida.

---

## Fase 2: Orquestacion de skills

### 2.1 Orden de ejecucion

Secuencia del pipeline:

1. Analisis interno del JSON (normalizacion).
2. `competitive-intelligence`.
3. `apify-market-research` (si hay token y creditos).
4. `local-competitor-research`.
5. `hybrid-competitive-report`.
6. `market-research-reports` para estructura narrativa y calidad editorial.

### 2.2 Reglas de fallback

- Si falla Apify:
  - no abortar
  - continuar con fuentes web + skills restantes
  - registrar motivo en limitaciones

### 2.3 Trazabilidad por modulo

- Cada modulo debe producir salida resumida:
  - insumos
  - hallazgos
  - fuentes usadas
  - confianza de evidencia

---

## Fase 3: Generacion LaTeX

### 3.1 Constructor de archivo de salida

- Crear logica de nombre:
  - slug de negocio (minusculas, sin tildes, guiones)
  - fecha actual `YYYY-MM-DD`
- Resolver colisiones con `-v2`, `-v3`, etc.

### 3.2 Estructura obligatoria del contenido

Secciones:

1. Resumen ejecutivo
2. Contexto y periodo
3. Baseline interno
4. Panorama competitivo
5. Diagnostico integrado
6. Plan de accion P1/P2/P3
7. Fuentes y limitaciones

### 3.3 Integracion con plantilla del repo

- Usar `Report Template/main.tex` como base de estilo.
- Mantener salida final en `docs/reports/`.
- No sobrescribir plantillas originales.

---

## Fase 4: QA y validacion

### 4.1 Pruebas funcionales minimas

1. Activacion por comando.
2. JSON completo.
3. JSON incompleto.
4. Sin Apify disponible.
5. Colision de nombres.
6. Negocio de otra industria.

### 4.2 Criterios de aceptacion

- Responde correctamente al comando.
- Solicita y valida JSON de forma clara.
- Genera `.tex` nuevo en ruta acordada.
- Incluye fuentes en cada seccion y limitaciones finales.
- No inventa datos.

---

## Backlog tecnico sugerido (post-MVP)

1. Compilacion opcional a PDF (`latexmk`) bajo bandera.
2. Indice de reportes historicos en `docs/reports/index.md`.
3. Tabla de calidad de evidencia por seccion.
4. Modo "low-cost" de scraping para presupuestos limitados.

---

## Secuencia de implementacion recomendada

1. Implementar skill base + contrato de entrada.
2. Implementar generador de nombre/ruta del `.tex`.
3. Implementar pipeline de skills con fallback.
4. Implementar secciones del reporte con fuentes.
5. Ejecutar checklist QA.

---

## Riesgos y mitigaciones

- **Cobertura local limitada**  
  Mitigar con fallback multifuente y transparencia.

- **Costos de scraping**  
  Mitigar con ejecucion por etapas y limites de resultados.

- **Entradas JSON heterogeneas**  
  Mitigar con validacion minima y mapeo controlado.

---

## Resultado esperado al cerrar el plan

Un agente operativo para produccion interna, reutilizable por comando, con salida LaTeX trazable en:

- `docs/reports/reporte-<negocio-slug>-YYYY-MM-DD.tex`

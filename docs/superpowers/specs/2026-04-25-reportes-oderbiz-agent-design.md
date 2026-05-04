# Diseno del agente `/reportes-oderbiz`

## Objetivo

Definir un agente reutilizable que:

1. Se active con el comando `/reportes-oderbiz`.
2. Solicite y valide el JSON del negocio (reporte interno).
3. Ejecute un flujo modular de analisis interno + investigacion competitiva usando skills instaladas.
4. Genere un reporte nuevo en LaTeX basado en la plantilla del proyecto.
5. Entregue siempre trazabilidad de fuentes y limitaciones.

---

## Alcance

Incluye:

- Contrato de entrada y salida del agente.
- Flujo modular de ejecucion.
- Reglas de contenido del reporte.
- Reglas de fuentes y transparencia.
- Convenciones de nombrado y almacenamiento del `.tex`.
- Plan de pruebas y criterios de aceptacion.

No incluye:

- Implementacion de compilacion PDF automatica.
- Integracion con CRM externo.
- Automatizacion de despliegue del reporte fuera del repositorio.

---

## Contrato del agente

### Activacion

- Comando de inicio: `/reportes-oderbiz`

### Mensaje inicial obligatorio

1. `Hola, ¿cómo estás? Bienvenido a reportes oderbiz.`
2. `Necesito que me des el JSON para empezar, el JSON de tu negocio.`

### Entrada principal

- JSON del reporte interno con base `dashboard_snapshot.page.v1` (historico `llm_context_report.page.v1`).

### Campos obligatorios minimos

- `schema_version`
- `report_metadata`
- `page_overview`
- `timeseries_daily`

### Campos opcionales de alto valor

- `funnel`
- `traffic_quality`
- `geo`
- `demographics`
- `campaigns_available`

### Salida principal

- Archivo LaTeX nuevo por ejecucion.
- Ruta: `docs/reports/`
- Nombre: `reporte-<negocio-slug>-YYYY-MM-DD.tex`

### Regla de colision de nombre

Si el archivo ya existe para esa fecha:

- crear `reporte-<negocio-slug>-YYYY-MM-DD-v2.tex`, luego `-v3`, etc.

---

## Arquitectura modular recomendada (Enfoque 2)

### Modulo A: Intake y validacion

- Recibe JSON.
- Verifica schema compatible.
- Detecta campos criticos faltantes.
- Solicita solo faltantes minimos cuando aplique.

### Modulo B: Normalizacion analitica

- Convierte JSON a modelo interno estable:
  - KPIs globales
  - tendencia temporal
  - rendimiento geo y demografico
  - calidad de trafico y embudo
- Etiqueta evidencia por tipo:
  - `observado`
  - `estimado`
  - `inferencia`

### Modulo C: Orquestacion de skills de research

Orden de orquestacion sugerido:

1. `competitive-intelligence`
2. `apify-market-research` (si hay token y creditos)
3. `local-competitor-research`
4. `hybrid-competitive-report`
5. `market-research-reports` (como base de estructura narrativa)

Regla:

- Si falla Apify, continuar con fallback y documentar limitacion.

### Modulo D: Sintesis ejecutiva integrada

- Fusiona datos internos + competencia.
- Estructura hallazgos en:
  - fortalezas
  - brechas
  - riesgos
  - oportunidades
- Prioriza acciones:
  - `P1` alto impacto / bajo esfuerzo
  - `P2` alto impacto / esfuerzo medio-alto
  - `P3` experimental

### Modulo E: Render LaTeX

- Usa como base `Report Template/main.tex`.
- Genera un `.tex` nuevo en `docs/reports/`.
- Mantiene estructura ejecutiva definida.

### Modulo F: Cierre y trazabilidad

- Devuelve:
  - path del archivo generado
  - resumen breve
  - fuentes usadas
  - limitaciones detectadas

---

## Estructura obligatoria del reporte LaTeX

1. Resumen ejecutivo (3 a 6 frases)
2. Contexto del negocio y periodo analizado
3. Baseline interno (KPIs y lectura temporal)
4. Panorama competitivo (tabla comparativa)
5. Diagnostico integrado:
   - fortalezas
   - brechas
   - riesgos
   - oportunidades
6. Plan de accion priorizado (P1/P2/P3)
7. Fuentes y limitaciones

---

## Politica de fuentes (obligatoria)

Cada bloque del reporte debe incluir fuentes trazables.

### Datos internos

- Referenciar secciones del JSON, por ejemplo:
  - `report_metadata`
  - `page_overview`
  - `timeseries_daily`
  - `geo`
  - `demographics`

### Datos competitivos

- URL de sitio web analizado.
- URL de perfil/listado en Maps o reseñas.
- URL de perfiles sociales o evidencia publica de anuncios.

### Inferencias

- Marcar explicitamente como `inferencia`.
- Vincular siempre a evidencia base.

### Transparencia obligatoria

- Si no hay evidencia publica suficiente, decirlo explicitamente.
- Si una fuente falla, declararlo en limitaciones.
- Nunca presentar inferencia como hecho.

---

## Reglas de fallback y robustez

### Fallback de Apify

Si `apify-market-research` no puede ejecutarse (token, creditos, error tecnico):

- no abortar ejecucion.
- continuar con `competitive-intelligence`, `local-competitor-research` y evidencia web.
- registrar la causa en `Fuentes y limitaciones`.

### JSON parcial

Si el JSON esta incompleto:

- pedir solo campos criticos.
- si no llegan, generar reporte parcial con advertencia de cobertura.

---

## Convenciones de salida

- Carpeta destino: `docs/reports/`
- Nombre: `reporte-<negocio-slug>-YYYY-MM-DD.tex`
- `negocio-slug`:
  - minusculas
  - sin tildes
  - espacios a guion medio
- Nunca sobrescribir salidas anteriores.

---

## Plan de pruebas funcionales

1. Arranque por comando:
   - entrada: `/reportes-oderbiz`
   - salida: saludo + solicitud de JSON

2. JSON valido completo:
   - salida: `.tex` generado + resumen + fuentes

3. JSON incompleto:
   - salida: solicitud de faltantes criticos

4. Apify no disponible:
   - salida: flujo continua con fallback + limitacion documentada

5. Colision de nombre:
   - salida: archivo con sufijo `-v2`, `-v3`, etc.

6. Dominio distinto (no psicologia):
   - salida: estructura igual, contenido adaptado al negocio

---

## Criterios de aceptacion (Definition of Done)

- El agente responde correctamente al comando `/reportes-oderbiz`.
- Solicita y valida JSON del negocio en el formato esperado.
- Ejecuta pipeline modular con manejo de fallbacks.
- Genera siempre un `.tex` nuevo en `docs/reports/`.
- Reporte incluye fuentes por seccion y seccion final de limitaciones.
- No inventa datos ni oculta huecos de evidencia.

---

## Riesgos y mitigaciones

1. Cobertura local limitada (mercados pequenos)
   - Mitigacion: fallback multifuente + transparencia de cobertura.

2. Creditos o costo de scraping
   - Mitigacion: ejecucion por etapas y modo minimo cuando aplique.

3. Ruido en nomenclatura de campanas
   - Mitigacion: normalizacion semantica previa en Modulo B.

4. Reportes excesivamente largos
   - Mitigacion: priorizar agregados y hallazgos accionables.

---

## Resultado esperado para usuario final

Un flujo repetible para cualquier negocio que transforme:

- JSON interno de performance
- + inteligencia competitiva con evidencia

en un reporte LaTeX ejecutivo, trazable y accionable, almacenado en:

- `docs/reports/reporte-<negocio-slug>-YYYY-MM-DD.tex`

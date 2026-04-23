# Plan de escritura: gráficos para decisiones (Ads cuenta + Página marca)

> **Para workers agentic:** ejecutar con **subagent-driven-development**: un subagente por ticket OB-* con revisión entre tareas; o implementación secuencial siguiendo el orden de la sección 5. Pasos de implementación pueden añadirse como `- [ ]` bajo cada ticket.

> **Spec fuente:** `docs/specs/2026-04-22-graficos-decision-ads-y-pagina.md` (v1.0, 2026-04-22).  
> **Objetivo de este documento:** desglosar qué redactar (copy, briefs, QA, tickets) y en qué orden, sin repetir la tabla completa de la spec.

**Meta API:** v25.0. Restricciones 2026: no usar `7d_view` ni `28d_view`; nota de discontinuidad si se comparan periodos que cruzan 2026-01-12.

---

## 1. Plan maestro (una narrativa)

| Entregable | Contenido mínimo | Fuente en spec |
|------------|------------------|----------------|
| Resumen ejecutivo (media página) | Alcance, fuera de alcance, cuatro convenciones globales en lenguaje de negocio | Alcance + Convenciones globales |
| Mapa rutas ↔ módulos | Tabla ruta / pestaña / IDs (A*, B*) | Resumen de ubicación por ruta |
| Riesgos Meta 2026 | Ventanas, retención en breakdowns, fecha de corte | Cabecera spec + A7 / B7 |

**Checklist de redacción**

- [ ] Resumen ejecutivo aprobado (producto).
- [ ] Mapa rutas ↔ IDs enlazado desde README interno o wiki del equipo.
- [ ] Párrafo único “Atribución post-2026” reutilizable en tooltips / ayuda contextual.

### Ejecución subagent-driven (2026-04-22)

**Ronda 1** — tres subagentes en paralelo + revisión en host:

| Ticket | Estado | Notas |
|--------|--------|--------|
| OB-ADS-A5 | Hecho | `PlacementEfficiencyBarChart.tsx` + integración en `DashboardPage` (tab Audiencia → Plataformas). |
| OB-ADS-A8A9 | Hecho | Barras gasto/CPA en `DemographicsPanel` (edad y género); mensaje en cruce. |
| OB-PAGE-B6 | Hecho | `GET .../pages/{page_id}/demographics` en `pages.py`, `fetchPageDemographics` en `client.ts`, sección en `PageDashboardPage.tsx`. Tests: `pytest tests/test_pages_routes.py` (24 passed, `PYTHONPATH=src`). |
| Auditoría `7d_view` / `28d_view` en código app | OK | Solo aparecen en documentación Markdown, no en backend/frontend de llamadas Meta. |

Corrección post-subagente (ronda 1): prop opcional `sectionTitle` en `DemographicsPanel` para alinear con `PageDashboardPage`.

**Ronda 2** — cuatro subagentes en paralelo + verificación host (`npx tsc --noEmit`, `pytest tests/test_pages_routes.py`):

| Ticket | Estado | Notas |
|--------|--------|--------|
| OB-ADS-A4 | Hecho | Métricas `results` / `cpa` / `roas`, umbral gasto mínimo, tabla + gráficos (incl. `AdCreatividadEfficiencyBarCharts.tsx`, `lib/adRankingDerived.ts`). |
| OB-ADS-A10 | Hecho | `GeoMap.tsx`: métricas `cpa`/`results`, umbral, orden compartido `compareGeoInsightRowsForMetric`; `DashboardPage` pasa `metric={geoMetric}`. |
| OB-PAGE-B5 | Hecho | `get_page_geo` con `GEO_FIELDS` + `_extract_results_and_cpa`; selector `pageGeoMetric` en `PageDashboardPage`; `PageGeoRow` ampliado. |
| OB-ADS-CTX | Hecho | `DashboardContextStrip.tsx` + `lib/formatDashboardContext.ts` bajo filtros en `DashboardPage`. |

**Ronda 3** — A7 / B7 / A6 + utilidades de periodo (`npx tsc --noEmit` OK):

| Ticket | Estado | Notas |
|--------|--------|--------|
| OB-ADS-A7 | Hecho | `lib/periodCompare.ts` (fecha corte Meta + `computePrevPeriod` compartido). `DashboardPage`: `Alert` si la comparación cruza 2026-01-12; tarjeta **Comparación de periodos** (tabla actual vs anterior, dos `/dashboard`). |
| OB-PAGE-B7 | Hecho | `PageDashboardPage`: segunda query `fetchPageConversionTimeseries` al periodo previo; `RetentionModule` con serie comparada (gasto/CPA actual vs anterior por día relativo) + mismo aviso de discontinuidad. |
| OB-ADS-A6 | Hecho | `CreativeSaturationScatter.tsx` (dispersión frecuencia vs CTR, tab Creatividades). |
| OB-QA-2026-04-22 | Parcial | Pendiente checklist manual en herramienta de QA; criterios automatizables ya cubiertos por build/tsc/pytest en cambios previos. |

---

## 2. Ads (`/accounts/:accountId/dashboard`, `DashboardPage.tsx`)

Plantilla fija por ID: **pregunta de negocio**, **tipo de gráfico**, **endpoint(s)**, **pestaña y bloque UI**, **criterios QA**, **edge cases** (umbrales, datos insuficientes).

| ID | Qué documentar / escribir | Prioridad |
|----|---------------------------|-----------|
| A1–A3 | Copy de contexto (periodo, moneda, ventana de atribución); KPI “protagonista”; relación Resumen ↔ serie temporal | Alta |
| A4 | Reglas de ranking: Top N, gasto mínimo, mensaje “datos insuficientes”; alineación con performance de anuncios | Alta |
| A5 | Placement: una visualización de barras bajo la tabla; geo: CPA vs cuenta y leyenda alineada a KPI | Alta (QA explícito) |
| A6 | Definición UI de “saturación” (dispersión vs líneas); ubicación Creatividades y/o Resumen | Media |
| A7 | Flujo “comparar periodos”, dos llamadas, texto de discontinuidad 2026-01-12 | Media |
| A8–A9 | Extensión demografía: barras género/edad; heatmap opcional y umbral de volumen | Alta (QA) |
| A10 | Geo: orden por CPA (peor primero), color por umbral, misma ventana que KPI | Alta |

**Checklist Ads**

- [ ] Briefs A1–A10 con plantilla unificada (archivo o tickets hijos).
- [ ] Lista de strings UI: “Datos insuficientes”, nota 2026-01-12, leyendas de atribución.
- [ ] Verificación: ningún flujo solicita `7d_view` / `28d_view`.

---

## 3. Página (`/accounts/:accountId/pages/:pageId/dashboard`, `PageDashboardPage.tsx`)

| ID | Qué documentar / escribir | Notas |
|----|---------------------------|--------|
| B1 | KPI existente + decisión go/no-go línea diaria bajo KPI | ADR corto si hay trade-off de carga |
| B2–B3 | Inventario: qué ya responde la pregunta; gaps solo de copy/leyenda | Bajo esfuerzo |
| B4 | Tabla + opcional Top 5; columnas CPA; fuentes `ad-diagnostics` / acciones | Especificar umbrales |
| B5 | Selector de métrica en geo alineado a Ads + KPI; texto de leyenda | Paridad con A10 |
| B6 | **Brief endpoint nuevo:** `GET .../pages/{pageId}/demographics`, contrato, `_page_filtering`, espejo de cuenta | **Crítico:** no está en repo; ticket bloqueante si se difiere |
| B7 | Misma narrativa que A7 en endpoints de página | Reutilizar copy A7 |

**Checklist Página**

- [ ] B5 brief + criterios de aceptación geo.
- [ ] B6: OpenAPI o ejemplo JSON + tarea backend + tarea frontend `client.ts`.
- [ ] B7: criterios de comparación honesta (dos rangos, mismos filtros).

---

## 4. Criterios de aceptación como escenarios (Given / When / Then)

1. **Leyenda contextual**  
   - **Given** un gráfico cuyo eje Y es conversión, CPA o ROAS, **when** se renderiza, **then** la leyenda o cabecera muestra periodo explícito y ventana de atribución acorde a la respuesta del backend.

2. **Umbral de volumen**  
   - **Given** una celda (región, sexo, edad, placement) bajo el mínimo configurado de gasto o conversiones, **when** el usuario ve el ranking o el gráfico, **then** no se ordena por CPA de forma engañosa y se muestra “Datos insuficientes” o barra atenuada según lo definido en el brief.

3. **Parámetros Meta**  
   - **Given** cualquier llamada a Meta para esta spec, **when** se audita código o configuración, **then** no aparecen `7d_view` ni `28d_view`.

4. **Ads: BarChart obligatorio**  
   - **Given** la pestaña Audiencia con datos suficientes, **when** el usuario abre Plataformas y Demografía, **then** existe al menos un BarChart para placement (A5), uno para género (A8) y uno para edad (A9).

5. **Página: geo y B6**  
   - **Given** el dashboard de página, **when** se usa la sección geográfica, **then** el selector de métrica está alineado al KPI. **And** B6 está implementado **o** existe ticket enlazado explícitamente como dependencia en el mismo epic.

**Checklist QA redactable**

- [ ] Escenarios 1–5 copiados al sistema de pruebas (o checklist manual de release).

---

## 5. Orden recomendado (redacción + implementación)

1. Convenciones globales + riesgo Meta 2026 (desbloquea copy en todos los gráficos).  
2. A5 + A8 + A9 (cumplen checklist QA de Ads).  
3. A4 + A10 (ranking creatividades y geo decisión).  
4. B5 + brief **B6** (paridad Página ↔ Ads).  
5. A7 y B7 (comparación de periodos).  
6. A6 (fatiga / saturación).

---

## 6. Fuera de alcance (no escribir en estos briefs)

- Clustering ML; MMM asíncrono (solo mención futura si aplica).  
- Competencia / radar (`CompetitorPanel`, `MarketRadarPanel`).  
- Métricas orgánicas salvo que se desvíe explícitamente la spec.

---

## 7. Tickets listos para pegar (Jira / Linear)

Copiar título + descripción. Ajustar prefijo de proyecto (`OB-`, `META-`, etc.) según convención del equipo.

### Epic sugerido

- **Título:** `[Spec 2026-04-22] Gráficos de decisión Ads + Página (Meta 2026)`  
- **Descripción:** Implementar y documentar visualizaciones alineadas a `docs/specs/2026-04-22-graficos-decision-ads-y-pagina.md`. Cumplir criterios de aceptación (leyendas, umbrales, sin ventanas deprecadas, BarCharts A5/A8/A9, geo página B5, B6 o ticket hijo bloqueante).

---

### OB-ADS-CTX — Contexto global en dashboards Ads

**Descripción:** Definir y aplicar copy único: periodo (`date_preset` o rango), moneda, ventana de atribución para conversiones/ROAS/CPA. Reutilizar en Resumen y módulos con series.  
**Criterios:** Coherencia con payload de `GET /api/v1/accounts/{id}/dashboard` y endpoints de insights usados en gráficos.  
**Dependencias:** Ninguna.  
**Spec:** Convenciones globales, A1–A3.

---

### OB-ADS-A5 — BarChart placement (Audiencia)

**Descripción:** Bajo la tabla de placements, añadir una sola visualización Recharts (barras): CPA o % gasto, con umbral de volumen y leyenda con atribución cuando aplique.  
**Criterios:** QA “al menos un BarChart para placement”; celdas bajo umbral no ordenan CPA engañoso.  
**Archivos orientativos:** `PlacementChart.tsx`, rutas `placement_insights.py`, `DashboardPage` tab Audiencia.  
**Spec:** A5.

---

### OB-ADS-A8A9 — BarCharts demografía género y edad

**Descripción:** Extender `DemographicsPanel.tsx` con BarChart Recharts por género y por edad (sin duplicar fuente de datos). Opcional: heatmap `age,gender` solo con volumen suficiente.  
**Criterios:** QA Ads demografía; umbrales configurables.  
**Spec:** A8, A9.

---

### OB-ADS-A4 — Ranking creatividades con barras de eficiencia

**Descripción:** Mejorar “Ranking de anuncios” con barras horizontales Top N por resultado o ROAS, filtro de gasto mínimo y tabla detallada.  
**Criterios:** Alineación con `GET .../ads/performance` y reglas de volumen.  
**Spec:** A4.

---

### OB-ADS-A10 — Geo Ads: CPA vs cuenta y orden decisión

**Descripción:** Barras ordenadas por CPA (peor primero), colores por umbral; tabla existente; leyenda “CPA (misma ventana que KPI)”.  
**Criterios:** Selector de métrica coherente con KPI de cuenta.  
**Archivos orientativos:** `GeoMap.tsx`, `geo_insights.py`.  
**Spec:** A10 (y cruce con A5 geo).

---

### OB-ADS-A7 — Comparar periodos (honestidad temporal)

**Descripción:** UI “Comparar periodos”: líneas dobles o barras agrupadas; dos llamadas a dashboard o `insights/time` con rangos distintos; nota tooltip si el rango cruza 2026-01-12.  
**Criterios:** Copy de discontinuidad; sin `7d_view`/`28d_view`.  
**Spec:** A7.

---

### OB-ADS-A6 — Saturación / fatiga creativa

**Descripción:** Documentar y acordar una métrica principal (dispersión frecuencia vs CTR o líneas CPM+CTR). Integrar en tab Creatividades y/o mini vista Resumen.  
**Criterios:** Consistencia con `GET .../insights/creative-fatigue` y `.../insights/time`.  
**Spec:** A6.

---

### OB-PAGE-B5 — Geo página: selector métrica alineado a KPI

**Descripción:** En “Distribución geográfica”, unificar selector CPA/gasto con leyenda y ventana de atribución del KPI de página (paridad mental con Ads).  
**Criterios:** QA página geo.  
**Archivos orientativos:** `PageDashboardPage.tsx`, `GeoMap` / coropleta si aplica, rutas `pages.py`.  
**Spec:** B5.

---

### OB-PAGE-B6 — Demografía de pauta por página (backend + front)

**Descripción:** Nuevo `GET .../accounts/{id}/pages/{pageId}/demographics` con mismo enfoque que cuenta pero con `_page_filtering`; cliente en `client.ts`; subsección UI “Audiencia de pauta (demografía)”.  
**Criterios:** Paridad A8/A9; ticket puede ser bloqueante del epic si no cabe en el mismo sprint.  
**Spec:** B6, notas de implementación Página.

---

### OB-PAGE-B7 — Comparación temporal en dashboard de página

**Descripción:** Misma lógica que A7: dos rangos, mismos filtros de página; líneas en `RetentionModule` o modal “Comparar”.  
**Criterios:** Copy discontinuidad; sin ventanas deprecadas.  
**Spec:** B7.

---

### OB-QA-2026-04-22 — Checklist de release (spec gráficos decisión)

**Descripción:** Ejecutar escenarios Given/When/Then de la sección 4; capturas o notas para BarCharts A5/A8/A9; verificación grep/config sin `7d_view`/`28d_view`.  
**Criterios:** Todos los ítems de la sección “Criterios de aceptación (QA)” de la spec marcados.  
**Spec:** Criterios de aceptación en spec fuente.

---

## Referencias rápidas en código (desde la spec)

- Cuenta: `DashboardPage.tsx`, `geo_insights.py`, `placement_insights.py`, `demographics.py`, `time_insights.py`, `dashboard.py`, `ads_ranking.py`.  
- Página: `PageDashboardPage.tsx`, `pages.py` (`.../pages/{page_id}/*`).

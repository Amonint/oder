# Especificación: gráficos para preguntas de decisión (Ads cuenta + Página marca)

**Versión:** 1.0 · **Fecha:** 2026-04-22 · **API Meta:** v25.0 (Marketing / Graph) · **Cambios 2026:** ventanas `7d_view` / `28d_view` no disponibles desde 2026-01-12; retención limitada en breakdowns (únicos / horarios ~13 meses; `frequency_value` ~6 meses). Ver [blog Meta](https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/).

## Alcance

Definir **qué gráfico o visualización** implementar o mejorar para cada **pregunta de negocio validada**, **dónde** ubicarla en la app (ruta + sección UI), **de dónde vienen los datos** (endpoint interno) y **criterios de aceptación**.

**Fuera de alcance:** clustering ML; MMM asíncrono (solo nota si se integra más adelante).

---

## Convenciones globales (todas las pantallas)

1. **Etiqueta de contexto** visible: periodo (`date_preset` o rango), **moneda**, y **ventana de atribución** usada para conversiones/ROAS/CPA (alineada a lo que devuelve Meta post–2026).
2. **Umbral de volumen:** si gasto o conversiones por celda (región, sexo, edad, placement) están por debajo de un mínimo configurable (p. ej. gasto &lt; X o conversiones &lt; N), mostrar **“Datos insuficientes”** o atenuar la barra (no ordenar por CPA en celdas vacías).
3. **Nota de discontinuidad:** tooltip o texto corto si el usuario compara periodos que cruzan **2026-01-12** y antes se usaban ventanas view largas eliminadas.
4. **Stack técnico UI:** Recharts (ya usado en el proyecto), componentes `Card` / `Table` de `components/ui`, coherencia con `dashboardColors` donde aplique.

---

## Sección A — Ads (cuenta publicitaria)

**Ruta:** `/accounts/:accountId/dashboard`  
**Componente:** `frontend/src/routes/DashboardPage.tsx`  
**Pestañas actuales:** `Resumen` · `Creatividades` · `Audiencia` · `Comercial` · `Avanzado` · `Decisiones` (si dashboard unificado activo).

| ID | Pregunta | Tipo de gráfico / UI | Fuente de datos (backend → Meta) | Ubicación en UI |
|----|----------|----------------------|-----------------------------------|-----------------|
| A1 | ¿Qué compramos con el presupuesto y hacia qué resultado? | **Tarjetas KPI** (gasto, impresiones, clics, resultados definidos) + **línea temporal** diaria (gasto + resultado principal) | `GET /api/v1/accounts/{id}/dashboard` · opcional `GET .../insights/time?time_increment=1` para serie | **Tab Resumen** — bloque superior (existente vía resumen ejecutivo / KPIs); serie en Resumen o enlace a vista temporal |
| A2 | ¿CPA / CPL / coste por conversión clave? | **Tarjeta grande** “CPA objetivo” + **tabla corta** (solo 1–3 `action_type` configurables o detectados por volumen) | `GET .../dashboard` (`cost_per_action_type`, `actions`) | **Tab Resumen** — bloque “Costos de adquisición” (ya orientado a esto; mantener una sola conversión protagonista) |
| A3 | ¿ROAS / valor? | **Tarjeta ROAS** + **línea** `action_values` vs `spend` agregado por día si hay serie | `GET .../dashboard` + `.../insights/time` con campos que incluyan `action_values` / compras según permisos | **Tab Resumen** (KPI) + **línea** en Resumen o **Creatividades** si la serie es por objeto |
| A4 | ¿Qué anuncios/conjuntos cortar o escalar? | **Barras horizontales** Top N por **resultado o ROAS** con **filtro de gasto mínimo** + **tabla** detallada | `GET .../ads/performance` | **Tab Creatividades** — “Ranking de anuncios” / tablas por campaña-adset-ad (mejorar con barra de eficiencia, no solo tabla) |
| A5 | ¿Dónde se pierde eficiencia (placement **y** región)? | **Placement:** **barras horizontales** (CPA o % gasto) derivadas de la tabla actual · **Región:** **barras** (ya `GeoMap` tipo barra) + **tabla** eficiencia (existente) | `GET .../insights/placements` · `GET .../insights/geo` | **Tab Audiencia** — subsección **Plataformas** (añadir chart bajo la tabla) · subsección **Geografía** (tabla + barras ya parcialmente cubiertas) |
| A6 | ¿Señal de saturación? | **Dispersión** (eje X: frecuencia, eje Y: CTR) o **líneas** CPM + CTR en el tiempo a nivel cuenta/campaña | `GET .../insights/creative-fatigue` · `GET .../insights/time` | **Tab Creatividades** (módulo fatiga existente) **y/o** **Resumen** mini-spark si se define métrica |
| A7 | ¿Comparaciones honestas en el tiempo? | **Líneas dobles** (periodo actual vs anterior misma duración) o **barras agrupadas** por semana | Dos llamadas a `.../dashboard` o `.../insights/time` con `time_range` distintos (calcular en front o endpoint dedicado futuro) | **Tab Resumen** o **Tab Avanzado** — bloque “Comparar periodos” con nota 2026-01-12 |
| A8 | ¿Eficiencia por **género**? | **Barras horizontales:** gasto y **CPA derivado** por `gender` (dos métricas o dos filas de charts) | `GET .../insights/demographics` con `breakdown=gender` | **Tab Audiencia** — subsección **Demografía** — **añadir** chart junto a `DemographicsPanel` (hoy es principalmente tabla) |
| A9 | ¿Eficiencia por **edad** (y cruce)? | **Barras** por bucket de edad; **heatmap** opcional para `age,gender` si hay datos suficientes | `GET .../insights/demographics` (`age` · `age,gender`) | Mismo bloque **Demografía** en **Tab Audiencia** |
| A10 | (Cubre A5 geo con énfasis decisión) ¿**Región** con CPA/ROAS vs cuenta? | **Barras** ordenadas por CPA (peor primero) con color por umbral; mantener **tabla** | `GET .../insights/geo` | **Tab Audiencia** — **Geografía** — alinear selector de métrica con leyenda “CPA (misma ventana que KPI)” |

### Notas de implementación — Ads

- `DemographicsPanel.tsx` hoy prioriza **tabla**; la spec pide **añadir** `BarChart` (Recharts) por fila agregada o por segmento sin duplicar la fuente.
- `PlacementChart` / tabla de placements: añadir **una** visualización de barras (CPA o % gasto) para responder A5 sin leer 30 filas.
- **Atribución:** si `DashboardPage` o rutas usan ventanas deprecadas, migrar a las soportadas en 2026 antes de etiquetar ROAS/CPA en gráficos nuevos.

---

## Sección B — Página (marca / fanpage)

**Ruta:** `/accounts/:accountId/pages/:pageId/dashboard`  
**Componente:** `frontend/src/routes/PageDashboardPage.tsx`  
**Contexto de datos:** pauta filtrada a ad sets cuyo `promoted_object.page_id` coincide con la página (`pages.py` + `filtering`).

| ID | Pregunta | Tipo de gráfico / UI | Fuente de datos | Ubicación en UI |
|----|----------|----------------------|-----------------|-----------------|
| B1 | ¿Presupuesto y resultado **solo de esta página**? | **KpiGrid** (existente) + opcional **línea** gasto diario | `GET .../accounts/{id}/pages/{pageId}/insights` + `.../timeseries` | **Cabecera del dashboard** — bloque KPI (ya existe) · **nueva** fila de línea bajo KPI si se confirma necesidad |
| B2 | ¿CPA / rentabilidad en el tiempo? | **Líneas** gasto vs CPA (existente en `RetentionModule`) | `GET .../pages/{pageId}/conversion-timeseries` | **Módulo “Rentabilidad y Adquisición”** (ya existe) |
| B3 | ¿Embudo y calidad de tráfico? | **Embudo** + **tarjetas** métricas | `.../funnel` · `.../traffic-quality` | **ConversionFunnelCard** · **TrafficQualityCard** (ya existentes) |
| B4 | ¿Anuncios a cortar/escalar **en esta página**? | **Tabla** + opcional **barras** Top por gasto/CPA | `.../ad-diagnostics` · acciones agregadas si se expone `.../actions` | **AdDiagnosticsTable** — enriquecer con columna CPA o chart Top 5 |
| B5 | ¿Eficiencia **geográfica** de la pauta de la página? | **Barras** (`GeoMap`) + **coropleta** (`ChoroplethMap`) — añadir **selector CPA/gasto** coherente con Ads | `GET .../pages/{pageId}/geo` | **Sección “Distribución geográfica”** (ya existe) — unificar leyenda con ventana de atribución del KPI |
| B6 | ¿**Género / edad** para esta página? | **Barras** por segmento + tabla | **Nuevo:** `GET .../accounts/{id}/pages/{pageId}/demographics` (paridad con cuenta: `fetch_insights` con mismo `filtering` que geo + `breakdowns=gender|age`) | **Nueva subsección** bajo geo o bajo rentabilidad: **“Audiencia de pauta (demografía)”** — *no existe en backend hoy; requerido para paridad con A8/A9* |
| B7 | Comparación temporal honesta | Misma lógica A7 con dos rangos | Dos llamadas a endpoints de página con mismos filtros | Texto + **líneas** duplicadas en `RetentionModule` o modal “Comparar” |

### Notas de implementación — Página

- **B6** es el único bloque que **no está en el repo** aún: hace falta ruta en `pages.py` y función en `client.ts` espejando `demographics.py` de cuenta pero con `_page_filtering`.
- Competencia / radar (`CompetitorPanel`, `MarketRadarPanel`) **no** forman parte de esta spec de decisiones de media pagada; no mezclar KPIs.

---

## Resumen de ubicación por ruta

| Ruta | Pestaña / módulo donde viven la mayoría de gráficos nuevos |
|------|------------------------------------------------------------|
| `/accounts/:accountId/dashboard` | **Audiencia** (placement + geo + demo con barras) · **Creatividades** (ranking con barras) · **Resumen** (KPI + comparación periodos) |
| `/accounts/:accountId/pages/:pageId/dashboard` | **KPI** + **RetentionModule** + **Geo** + **(nuevo) Demografía pauta página** |

---

## Criterios de aceptación (QA)

- [ ] Cada gráfico nuevo muestra **leyenda** con periodo y **ventana de atribución** cuando el eje Y sea conversión, CPA o ROAS.
- [ ] Celdas bajo umbral de volumen no disparan **ranking por CPA** engañoso.
- [ ] No se solicita a Meta `7d_view` ni `28d_view` en parámetros de API.
- [ ] **Audiencia / Ads:** al menos un **BarChart** para placement (A5), uno para género (A8) y uno para edad (A9).
- [ ] **Página:** geo con selector de métrica alineado al KPI; **B6** implementado o ticket enlazado explícitamente como dependencia.

---

## Referencias en código

- Cuenta: `DashboardPage.tsx` (tabs), `geo_insights.py`, `placement_insights.py`, `demographics.py`, `time_insights.py`, `dashboard.py`, `ads_ranking.py`.
- Página: `PageDashboardPage.tsx`, `pages.py` (`.../pages/{page_id}/*`), `organic.py` solo para métricas orgánicas (fuera de esta spec de pauta filtrada).

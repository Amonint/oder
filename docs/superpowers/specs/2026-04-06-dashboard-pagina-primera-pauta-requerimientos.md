# Requerimientos — Dashboard “página primero”, solo pauta

**Versión:** 1.0  
**Fecha:** 2026-04-06  
**Estado:** Cierre de brainstorming + consolidación de requerimientos  
**Relación:** Complementa y orienta el producto más allá de `2026-04-06-dashboard-ranking-geo-targeting-requirements.md` (enfoque en **página como eje** y **solo métricas de pauta**).

---

## 1. Visión del producto

Herramienta de analítica para quienes gestionan **anuncios en Meta**, con lectura alineada a la forma en que un operador piensa el trabajo: **primero “¿cómo va cada página que manejo?”** y **solo en términos de pauta** — **dinero (gasto)** y **alcance** (volumen), más **eficiencia** y **resultados agregados** que devuelve la plataforma.

La experiencia debe **parecerse a un tablero tipo Power BI**: **filtros claros** (entidades como dimensiones), **cada visual responde una pregunta de negocio** y **no se mezclan** indicadores de alcance orgánico con inversión en anuncios.

---

## 2. Principios de diseño (no negociables)

| Principio | Significado |
|-----------|-------------|
| **Página primero** | La unidad principal de análisis es la **Página de Facebook** (identidad desde la cual o hacia la cual corre la pauta asociada). La cuenta publicitaria es **contenedor de facturación y campañas**. |
| **Solo pauta** | Alcance, impresiones, gasto, CTR, CPM, acciones y costes asociados a **Ads Insights**; **no** métricas orgánicas de la página (posts sin inversión) en el mismo tablero sin un módulo explícito. |
| **Un gráfico = una pregunta** | Título del bloque = pregunta en lenguaje natural (ej. “¿En qué provincias hay más impresiones?”). |
| **Línea temporal solo con tiempo** | Gráficos de línea/área solo cuando el eje X sea **día o semana** y exista **serie temporal**; no usar “línea” para un solo total agregado. |
| **Coherencia de filtros** | Geografía, placements y resultados usan el **mismo alcance** (misma página + mismo periodo + mismos filtros de campaña/conjunto/anuncio cuando apliquen). |

---

## 3. Contexto en Meta (modelo mental)

- **Cuenta publicitaria (`act_…`)**: presupuesto y campañas de anuncios.
- **Páginas**: identidades que el usuario puede gestionar; una persona puede tener **muchas páginas** y una o varias cuentas publicitarias.
- **Campaña → conjunto → anuncio**: desglose de la pauta **dentro** de la cuenta; el producto debe permitir **filtrar** por estos niveles **después** de elegir página.

**Nota de alcance:** La vinculación “esta campaña / este anuncio pertenece a esta página” es la base para **filtrar el tablero por página**. La precisión técnica de cada API queda para implementación; este documento fija la **intención de producto**.

---

## 4. Personas y objetivos

| Persona | Objetivo principal |
|---------|-------------------|
| **Gestor de pauta** (ej. Juana) | Ver **rápido** en qué páginas se está invirtiendo y dónde conviene profundizar. |
| **Analista / agencia** | Comparar páginas en un periodo y **explicar** reparto de gasto, cobertura geográfica y rendimiento por tipo de resultado. |

**Objetivo de negocio:** reducir tiempo hasta responder **“¿cómo va cada página en pauta?”** y **“¿qué está pasando dentro de esta página?”** sin mezclar conceptos.

---

## 5. Alcance funcional

### 5.1 Incluido (must)

- Selección de **cuenta publicitaria** cuando el usuario tenga más de una.
- **Lista de páginas** gestionadas en el contexto de esa cuenta / token, con **comparación** de métricas de pauta en un **periodo** seleccionable.
- **Orden por defecto** de la lista: **mayor gasto** del periodo (prioridad a inversión).
- **Vista detalle por página**: KPIs de pauta, desglose por **plataforma y posición**, desglose de **resultados** (acciones agrupadas por categorías de negocio), **cobertura geográfica** (región/provincia según datos disponibles).
- **Filtros en cascada** en el detalle: periodo → opcional campaña → conjunto → anuncio (siempre acotados a la página seleccionada).
- **Evolución temporal** (opcional en detalle): solo si el periodo permite serie diaria (p. ej. ≥ 7 días) y con métricas acordadas (gasto, impresiones, etc.).

### 5.2 Excluido (won’t, en esta versión)

- Rendimiento **orgánico** de la página (seguidores, alcance de posts sin pauta) **en el mismo tablero** que pauta.
- Identificación de personas (PII) o listados de usuarios desde Insights.
- Promesas de datos geográficos más finos que los **buckets** que Meta expone (p. ej. “cada ciudad” si la API solo devuelve región).

### 5.3 Opcional / fase posterior (could)

- Vista de **negocios (Business Manager)** y cuentas asociadas como **navegación previa** a la cuenta publicitaria.
- **Orgánico** en un módulo o pestaña separada con nombre explícito.
- Exportación (CSV/PDF) y comparación de periodos.

---

## 6. Flujos de usuario

### 6.1 Flujo principal (happy path)

1. Usuario entra con token válido.
2. Elige **cuenta publicitaria** (si hay más de una).
3. Ve **lista de páginas** con métricas resumen del periodo y orden por **gasto**.
4. Selecciona una **página**.
5. Ve **tablero de resumen de pauta** para esa página con filtros de tiempo y, si aplica, campaña / conjunto / anuncio.
6. Revisa en el mismo alcance: **plataformas**, **resultados agrupados**, **mapa / tabla geográfica**.

### 6.2 Flujos secundarios

- **Sin datos en el periodo:** mensaje claro; sugerencia de ampliar periodo o verificar actividad.
- **Página sin campañas asociadas en el periodo:** lista vacía o KPIs en cero con explicación breve.

---

## 7. Requerimientos por pantalla

### 7.1 Pantalla A — Lista de páginas (“¿cómo va cada una?”)

**Pregunta:** *¿Qué páginas gestiono y cuál concentra más inversión / volumen en este periodo?*

**Contenido:**  
- Filtros globales: **periodo**; **cuenta publicitaria** (si aplica).  
- Tabla o tarjetas de páginas con columnas mínimas (máx. 4 cifras): **gasto**, **impresiones**, **CPM**, **CTR** (definición cerrada en §8).  
- Orden por defecto: **gasto descendente**.  
- Opcional: un único gráfico de comparación — **barras horizontales “Gasto por página”** para el periodo.

**No** incluir gráficos de línea temporal en esta pantalla salvo decisión explícita de producto (evitar ruido antes de elegir página).

### 7.2 Pantalla B — Detalle de página (“pauta de esta página”)

**Pregunta:** *¿Cómo va la pauta de esta página en este periodo y dónde se concentra?*

**Bloques (orden recomendado):**

1. **KPIs** — Gasto, impresiones, alcance, frecuencia, CTR, CPM (lista final ajustable según negocio; mínimo gasto + volumen + una eficiencia).
2. **Reparto del gasto** — Plataforma × posición (pregunta: “¿Dónde se gastó?”). Visual: barras o barras apiladas.
3. **Resultados de pauta** — Acciones agrupadas por **categorías** (mensajería, tráfico, engagement, conversiones, otros). Visual: barras por categoría; detalle opcional colapsable.
4. **Cobertura geográfica** — Mapa y/o tabla por región/provincia (pregunta: “¿Dónde se vio?”). Métrica principal sugerida: **impresiones** o **gasto**; coherente con filtros.

**Filtros:** periodo; **campaña** → **conjunto** → **anuncio** (cascada, solo dentro de la página).

**Evolución diaria (opcional):** bloque separado “Evolución en el tiempo” con líneas/áreas solo si el periodo permite puntos diarios (p. ej. ≥ 7 días).

---

## 8. Catálogo de métricas (pauta)

| Métrica | Uso típico |
|---------|------------|
| Gasto | Prioridad en lista y cabecera |
| Impresiones | Volumen de entregas |
| Alcance | Personas únicas alcanzadas (según definición Meta) |
| Frecuencia | Promedio de exposiciones por usuario alcanzado |
| CTR | Clics / impresiones |
| CPM | Coste por mil impresiones |
| CPP | Coste por mil personas alcanzadas (cuando aplique) |
| Acciones / coste por tipo de acción | Resultados agregados según objetivos de campaña |

**Regla:** no mezclar en el mismo eje **conteos** y **costes medios** sin doble eje o sin dos gráficos.

---

## 9. Reglas de visualización (resumen)

| Pregunta | Visual sugerido |
|-----------|-----------------|
| Comparar magnitudes entre páginas o categorías | Barras horizontales |
| Reparto del gasto en el tiempo | Línea o área (serie diaria/semanal) |
| Partes del total (plataformas, categorías de acción) | Barras apiladas o barras simples por categoría |
| Geografía | Mapa coroplético + tabla ordenada |
| Ranking de anuncios / campañas | Tabla o barras horizontales |

---

## 10. Requerimientos no funcionales

- **Claridad:** textos de ayuda breves donde se mezclen conceptos (p. ej. alcance vs impresiones).
- **Rendimiento percibido:** evitar duplicar llamadas innecesarias para el mismo alcance (criterio de implementación; el producto exige **coherencia** entre widgets).
- **Cumplimiento:** no tratar tokens ni URLs de paginación con token como datos no sensibles en logs o documentación de usuario.

---

## 11. Criterios de aceptación (validación de la idea)

- [ ] Un usuario puede **nombrar en una frase** qué muestra la pantalla A vs la B sin mencionar “API” técnica.
- [ ] En **lista de páginas**, el orden por defecto **prioriza gasto** y las columnas permiten comparar **sin más de 4 métricas** por fila.
- [ ] En **detalle de página**, no aparece contenido orgánico de la página **sin** etiqueta explícita de otro módulo.
- [ ] Cada bloque gráfico tiene **título en forma de pregunta** o equivalente claro.
- [ ] **Geografía** y **placements** respetan los mismos filtros que el resumen numérico.

---

## 12. Glosario corto

| Término | Definición en este documento |
|---------|----------------------------|
| **Pauta** | Inversión en anuncios medidos vía Ads Insights. |
| **Página** | Página de Facebook usada como identidad en la narrativa del producto; unidad principal de navegación. |
| **Cuenta publicitaria** | Contenedor `act_…` de facturación y campañas. |
| **Alcance (pauta)** | Alcance reportado en Insights para el alcance seleccionado; no “alcance orgánico” de posts. |

---

## 13. Decisiones pendientes (fuera de este cierre, si se reabre)

- Lista exacta de nombres de menús y rutas en la UI.
- Umbral mínimo de días para mostrar bloque “Evolución diaria”.
- Si se incluye **CPP** en lista de páginas o solo en detalle.

---

## 14. Cierre del brainstorming (visión)

El producto se define como **“tablero de pauta por página”**: primero comparar **páginas** con métricas mínimas y orden por **gasto**; después profundizar en **una página** con KPIs, reparto del gasto por superficie, resultados agrupados y cobertura geográfica, con filtros **tipo Power BI** y **sin mezclar** orgánico con pauta. Las decisiones de diseño de gráficos (tabla §9) y las exclusiones (§5.2) evitan ambigüedad entre **inversión** y **otros tipos de datos** y entre **preguntas de negocio** y **decoración visual**.

---

*Documento generado por cierre de brainstorming y consolidación de requerimientos; no sustituye especificaciones técnicas de implementación ni contratos de API.*

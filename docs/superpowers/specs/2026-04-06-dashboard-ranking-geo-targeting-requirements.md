# Requisitos — Ranking de anuncios, geografía y targeting (Meta Dashboard)

**Fecha:** 2026-04-06  
**Tipo:** especificación de **requisitos** (no incluye plan de implementación ni tareas).  
**Contexto relacionado:** `docs/superpowers/specs/2026-04-05-agency-insights-panel-design.md`, `docs/meta-permisos-v25-campos-y-breakdowns.md`.

---

> **Para agentes (superpowers):** este archivo define **solo requisitos**. El siguiente paso es usar la skill **writing-plans** (`superpowers:writing-plans`) para generar un plan ejecutable en `docs/superpowers/plans/YYYY-MM-DD-<nombre>.md`, o **subagent-driven-development** / **executing-plans** para implementarlo por tareas. **No** confundir este documento con un plan: aquí no hay checklist de commits ni pasos de código.

**Objetivo en una frase:** que el dashboard muestre **nombres de anuncio fiables**, **geografía accionable (incl. mapa / cobertura completa)** y **targeting legible para negocio**, alineado con Marketing API / Graph en la versión que use el proyecto (p. ej. v25).

---

## 1. Contexto técnico actual (referencia)


| Área      | Comportamiento actual aproximado                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Ranking   | `GET …/ads/performance` con `level=ad` y campos que incluyen `ad_name`; UI usa `ad_name` con fallback a `ad_id`.     |
| Geografía | `GET …/insights/geo` con `breakdowns=region`, alcance `account` o `ad`; visualización principal tipo tabla / barras. |
| Targeting | JSON crudo del objeto `targeting` en la pestaña correspondiente del dashboard.                                       |


**Problemas reportados:** nombres de anuncio **vacíos o como comillas sin texto**; geografía **sin “mapa completo”** ni visión unificada por provincia/territorio; targeting **ilegible** para usuarios de negocio.

---

## 2. Requisitos funcionales — Ranking de anuncios

### R-2.1 Etiqueta visible

En tablas, gráficos de ranking y cualquier selector que liste anuncios, el usuario debe ver **siempre un nombre legible** (texto no vacío), preferentemente el **nombre del anuncio** tal como lo define Meta / el anunciante.

### R-2.2 Cadena de respaldo

Si la API de Insights devuelve `ad_name` vacío, nulo o ausente, el sistema debe **obtener o derivar** una etiqueta mostrable mediante una **cadena de respaldo documentada** (por ejemplo: nombre desde el nodo del anuncio en Graph API, u otros campos oficiales permitidos en la versión de API en uso), sin mostrar cadenas vacías ni comillas vacías en la UI.

### R-2.3 Alineación con documentación oficial

La solución debe **alinearse con la documentación oficial** de Marketing API para la versión configurada en el proyecto: campos válidos en **Ad Insights** a nivel `ad`, compatibilidad de `ad_name`, y casos donde Meta no devuelve nombre (creativos dinámicos, formatos especiales, etc.).

### R-2.4 Trazabilidad y honestidad en UI

Si solo es posible mostrar un fallback (p. ej. ID interno), debe ser **claro para el usuario** qué representa (p. ej. mensaje del tipo “Anuncio sin nombre en Meta — ID …”) y no parecer un fallo silencioso de la aplicación.

### R-2.5 Pruebas automatizadas

Los tests deben cubrir al menos: respuesta de Insights **con** `ad_name`, **sin** `ad_name`, y **con** `ad_name` cadena vacía; verificar que la API propia y/o el frontend exponen una etiqueta no vacía cuando las reglas acordadas lo permitan.

---

## 3. Requisitos funcionales — Geografía / rendimiento territorial

### R-3.1 Dimensión geográfica

El usuario debe poder analizar el rendimiento **agregado a nivel cuenta** por dimensión geográfica relevante (p. ej. **región/provincia**) según lo que permita la API de Insights con `breakdowns` oficiales y las **reglas de combinación** documentadas.

### R-3.2 Cobertura completa de filas

Debe existir una forma de revisar el **mapa completo** de la distribución geográfica en el periodo elegido: **todas las filas geográficas** que devuelva Meta para ese alcance (sin recortes silenciosos en UI), incluyendo **paginación o carga completa** si Graph devuelve resultados paginados.

### R-3.3 Visualización tipo mapa (si el producto la incluye)

Si se implementa mapa (coroplético o equivalente): usar datos de breakdown **oficiales** (nombres/códigos según doc), **leyenda clara**, tratamiento explícito de valores **desconocidos o agregados**, y diseño **responsive** que no oculte territorios de forma arbitraria (salvo límites de viewport documentados).

### R-3.4 Claridad de alcance en UX

Debe quedar explícito si la vista aplica a **solo cuenta**, **solo un anuncio** o **ambas modalidades**, y qué **limitaciones** impone Meta (breakdowns no disponibles, umbrales de privacidad, regiones no desglosadas).

### R-3.5 Comparación multi-anuncio (opcional)

Comparación **varios anuncios** o **anuncio vs cuenta** en la misma vista geográfica: **solo si** documentación y permisos lo permiten sin violar políticas de agregación; si no es viable, **mensaje claro** al usuario.

### R-3.6 Versión de API

Cualquier cambio en `fields` o `breakdowns` debe contrastarse con la **referencia de Insights** de la versión en uso (incl. notas sobre métricas como `reach` con breakdowns geográficos).

---

## 4. Requisitos funcionales — Targeting

### R-4.1 Vista estructurada

Sustituir la presentación como **JSON crudo** por una **vista estructurada** (idioma del producto: español) que interprete el objeto de targeting estándar de Meta: edades, género, `geo_locations`, `flexible_spec` (intereses, comportamientos, educación, familia, empleo, etc.) según el payload real del endpoint usado.

### R-4.2 Ubicaciones (`geo_locations`)

Para países, regiones, ciudades, radios, `places`, etc.: mostrar **nombre legible**, radio y unidad cuando aplique, y tipo de ubicación, de forma coherente con el payload (p. ej. ciudad + radio en km).

### R-4.3 Audiencias flexibles (`flexible_spec`)

Agrupar por **categoría** (intereses, comportamientos, educación, familia, empleo, …) y listar **nombres** legibles, usando `{ id, name }` cuando existan en la respuesta.

### R-4.4 Detalle técnico opcional

Mantener acceso a **JSON u otro detalle técnico** solo bajo acción explícita (p. ej. sección colapsable “Ver JSON”) para depuración; **no** como vista por defecto.

### R-4.5 Fuente y versión

La fuente de datos debe coincidir con la **documentación oficial** del objeto Ad / targeting para la versión de Graph/Marketing API del proyecto.

---

## 5. Requisitos no funcionales

### R-5.1 Rendimiento

Evitar **N+1** innecesario al resolver nombres de anuncios (batch, caché por sesión, agregación en backend, etc., según decida el plan derivado).

### R-5.2 Errores y vacíos

Ante error parcial o datos vacíos de Meta: mensajes **claros** (permisos, token, cuenta sin datos, breakdown no soportado).

### R-5.3 Consistencia

Mismas reglas de **etiquetado de anuncios** en ranking, gráficos, geografía (cuando liste anuncios) y cualquier otra superficie que muestre `ad_id` / nombre.

---

## 6. Criterios de aceptación (alto nivel)

1. En ranking y gráfico de anuncios, **no** se muestran etiquetas vacías ni `""` como nombre principal cuando exista en Meta un nombre o un fallback acordado en requisitos.
2. En geografía, el usuario puede revisar la **distribución territorial completa** disponible para el alcance y periodo seleccionados, con mapa/tablas según lo acordado en R-3.
3. En targeting, un usuario de negocio **entiende** audiencia y ubicaciones **sin leer JSON**; el JSON queda como opción secundaria (R-4.4).

---

## 7. Fuera de alcance (explícito en este documento)

- Definición de tareas, archivos a tocar, orden de commits o estimaciones: corresponde al **plan** generado aparte.
- Cambios de stack (nuevo framework, otro mapa que no se justifique en el plan) sin nueva decisión de producto.

---

*Fin del documento de requisitos.*
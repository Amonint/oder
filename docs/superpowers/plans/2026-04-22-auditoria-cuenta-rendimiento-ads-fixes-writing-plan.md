# Writing plan: auditoria y correccion de "Rendimiento de Ads (Cuenta)"

> Fuente: reporte de auditoria funcional de `/accounts/:accountId/dashboard` (cuenta: Dra Marizol Jimenez Luzon, periodo maximo 2023-03-22 -> 2026-04-22).
> Objetivo: convertir hallazgos en un plan de correccion ejecutable, con prioridad, criterios de aceptacion y pruebas.

---

## 1) Diagnostico consolidado

### Funcionalidades saludables (mantener sin regresion)
- Filtros de periodo y jerarquia campana/conjunto/anuncio.
- Toggle "Rendimiento anuncios" (agregado/diario).
- KPIs base (impresiones, clics, gasto, alcance, CTR, CPM).
- Audiencia (plataformas + demografia), alertas automaticas y fatiga creativa.

### Hallazgos a corregir (10)
- Criticos: `#1`, `#2`, `#3`.
- Altos: `#4`, `#5`, `#6`, `#7`.
- Medios: `#8`, `#9`.
- Bajo: `#10`.

---

## 2) Hipotesis tecnica por hallazgo y correccion propuesta

| ID | Problema | Hipotesis tecnica | Correccion propuesta |
|---|---|---|---|
| #1 | Error en Atribucion (tab Avanzado) | Error en llamada Meta para `action_attribution_windows` o parseo de respuesta vacia/no estandar | Endurecer fallback backend, normalizar errores y degradar con estado "sin datos" en vez de error bloqueante cuando Meta responde sin conversiones |
| #2 | Atribucion siempre en `—` | Falta propagar ventana real de atribucion desde backend al `context strip`/UI | Exponer `attribution_window_used` en payload principal y pintarlo siempre (incluyendo "no disponible") |
| #3 | Targeting vacio sin guia previa | UX sin pista en Creatividades antes de ir a Avanzado | Agregar CTA y estado persistente de "anuncio seleccionado" visible en Creatividades y Avanzado |
| #4 | Embudo comercial vacio desde paso 2 | No hay feed CRM/manual suficiente para etapas post-mensaje | Activar modo "CRM no conectado" con onboarding de carga manual y fallback de metricas comerciales explicitas |
| #5 | A3 ROAS implicito sin serie | Cuenta sin `purchase_value`/ROAS diario util en Meta | Fallback a ROAS estimado (si existe data manual) o mensaje accionable con checklist Pixel/CAPI/eventos |
| #6 | Ranking ROAS en Creatividades vacio | Misma raiz de #5 + umbral/validacion estricta | Mostrar ranking alternativo por eficiencia (CPA/resultados) cuando ROAS no calculable |
| #7 | Nombres vacios en campanas/anuncios | `name` vacio desde Meta sin fallback visual | Fallback de etiqueta: `Publicacion sin nombre (ID: ...)` en selects y tablas |
| #8 | "Coste por resultado (Meta)" no estandar | Meta devuelve cero y sistema recalcula costo efectivo sin etiquetado fuerte | Renombrar a "Costo por resultado estimado" cuando aplique + tooltip obligatorio |
| #9 | CPA geografico anomalo (Loja) | Denominador de resultados extremadamente bajo o atribucion no comparable por region | Aplicar umbral minimo por conversiones y advertencia de baja robustez estadistica |
| #10 | Columnas ocultas en Ranking (responsive) | Overflow/anchos no optimizados en viewport medio | Tabla responsive con columnas fijadas + scroll horizontal guiado + version compacta |

---

## 3) Plan de ejecucion por fases

### Fase 0 - Hotfixes criticos (P0, 24-48h)
1. Reparar flujo de Atribucion en Avanzado (`#1`).
2. Mostrar siempre contexto de ventana de atribucion (`#2`).
3. Agregar indicador/CTA de seleccion de anuncio para Targeting (`#3`).

**Criterio de salida P0**
- No hay error bloqueante en Atribucion con datos faltantes de Meta.
- El usuario ve explicitamente la ventana de atribucion activa o "no disponible".
- El camino para ver Targeting es visible sin ambiguedad.

### Fase 1 - Integridad de decision comercial/ROAS (P1, 2-4 dias)
1. Manejo robusto de "sin ROAS nativo" en A3 y ranking (`#5`, `#6`).
2. Fallback de nombres vacios por ID en toda la UI (`#7`).
3. Etiquetado correcto de KPI estimado (`#8`).

**Criterio de salida P1**
- Nunca aparece una tarjeta "rota"; siempre hay estado alterno util.
- No existen filas/optiones de seleccion con nombre vacio.
- El KPI estimado no se confunde con dato oficial Meta.

### Fase 2 - Calidad analitica y UX responsive (P2, 3-5 dias)
1. Gobernanza de calidad en CPA geo con umbrales y warnings (`#9`).
2. Rediseno responsive de tabla de ranking (`#10`).
3. Comercial: estado de "pipeline incompleto" con onboarding de datos (`#4`).

**Criterio de salida P2**
- Geo no induce decisiones con datos debiles sin advertencia.
- Ranking usable en viewport estandar.
- Comercial comunica claramente cobertura real de datos.

---

## 4) Tickets sugeridos (listos para backlog)

### OB-ACC-ATTR-01 - Robustecer endpoint de atribucion (P0)
**Alcance:** backend atribucion + normalizacion de errores Meta + fallback "sin datos".  
**Aceptacion:** sin error rojo cuando Meta devuelve payload vacio/no compatible; logging con causa tecnica.

### OB-ACC-CTX-02 - Mostrar ventana de atribucion efectiva (P0)
**Alcance:** exponer `attribution_window_used` en API y renderizar en barra contextual.  
**Aceptacion:** el texto de atribucion nunca queda en `—` silencioso.

### OB-ACC-UX-03 - UX de targeting guiado (P0)
**Alcance:** badge/CTA en Creatividades + persistencia de anuncio seleccionado.  
**Aceptacion:** usuario descubre en 1 clic como habilitar Targeting.

### OB-ACC-ROAS-04 - Fallback ROAS y mensajes accionables (P1)
**Alcance:** A3 + ranking ROAS con estados alternos.  
**Aceptacion:** si no hay ROAS nativo, mostrar alternativa y checklist de configuracion.

### OB-ACC-NAMES-05 - Fallback de nombres vacios por ID (P1)
**Alcance:** selects, chips, tablas de ranking.  
**Aceptacion:** cero etiquetas vacias en UI.

### OB-ACC-KPI-06 - Etiquetado de KPI estimado (P1)
**Alcance:** renombre y tooltip de "Costo por resultado estimado".  
**Aceptacion:** usuario distingue claramente dato estimado vs oficial.

### OB-ACC-GEO-07 - Robustez estadistica en CPA por region (P2)
**Alcance:** umbrales minimos, atenuacion visual y advertencias.  
**Aceptacion:** regiones con muestra baja no dominan ranking por CPA.

### OB-ACC-RESP-08 - Tabla de ranking responsive (P2)
**Alcance:** layout adaptable + columnas prioritarias visibles + scroll claro.  
**Aceptacion:** en viewport estandar se ven metricas clave sin confusion.

### OB-ACC-COM-09 - Comercial sin CRM: modo cobertura parcial (P2)
**Alcance:** estado vacio avanzado + onboarding de carga manual/CRM futuro.  
**Aceptacion:** usuario entiende por que el embudo queda en cero y como completarlo.

---

## 5) Plan de QA (Given/When/Then)

1. **Atribucion resiliente**  
   Given una cuenta sin conversiones atribuibles, When cargo tab Avanzado, Then no veo error critico y recibo estado explicativo.

2. **Contexto de atribucion visible**  
   Given cualquier periodo/filtro, When veo la barra de contexto, Then aparece ventana de atribucion efectiva u "no disponible".

3. **Targeting guiado**  
   Given no hay anuncio seleccionado, When abro Creatividades/Avanzado, Then veo CTA claro para seleccionar anuncio.

4. **ROAS no disponible**  
   Given Meta no retorna valor de compra, When abro A3 y ranking ROAS, Then veo fallback util (alternativa + accion recomendada).

5. **Nombres vacios**  
   Given items con `name=""`, When renderiza UI, Then se muestra etiqueta fallback con ID.

6. **KPI estimado**  
   Given `cost_per_result` de Meta = 0 y sistema calcula proxy, When renderiza KPI, Then etiqueta dice "estimado" con tooltip.

7. **Geo robusto**  
   Given una region con pocas conversiones, When ordeno por CPA, Then aparece marcada como baja muestra y no induce sesgo visual.

8. **Responsive ranking**  
   Given viewport laptop estandar, When abro tabla ranking, Then metricas clave quedan visibles y navegables.

---

## 6) Orden recomendado de implementacion tecnica

1. `OB-ACC-ATTR-01` + `OB-ACC-CTX-02`  
2. `OB-ACC-UX-03`  
3. `OB-ACC-ROAS-04` + `OB-ACC-NAMES-05` + `OB-ACC-KPI-06`  
4. `OB-ACC-GEO-07` + `OB-ACC-RESP-08`  
5. `OB-ACC-COM-09`

---

## 7) Riesgos y decisiones

- Sin CRM conectado, parte comercial seguira parcial: resolver con UX de cobertura, no ocultando el vacio.
- En cuentas de mensajes (no compras web), ROAS puede ser estructuralmente ausente: se requiere fallback de negocio, no solo tecnico.
- Las anomalias de CPA geografia pueden ser reales; el sistema debe diferenciar "dato real pero debil" de "dato incorrecto".

---

## 8) Entregables esperados de este plan

- Cambios backend para atribucion resiliente y metadata de contexto.
- Cambios frontend para estados vacios utiles, fallback labels, KPI estimado claro y tabla responsive.
- Checklist QA reusable en release.
- Backlog priorizado P0/P1/P2 para ejecucion por sprint.


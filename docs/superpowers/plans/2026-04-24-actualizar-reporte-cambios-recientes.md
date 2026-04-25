# Actualizacion de Reporte de Cambios Recientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actualizar el reporte funcional/documental para reflejar con precision todos los cambios recientes de backend/frontend (enlaces "Ver referencia", textos no tecnicos, paleta de colores, ajustes de layout y estado actual de modulos).

**Architecture:** Se aplica una actualizacion documental en tres capas: (1) reporte de cambios principal, (2) README operativo, (3) documento funcional de capacidades actuales. El enfoque evita duplicidad entre archivos: el reporte concentra el detalle de cambios recientes y los otros documentos solo exponen resumen operativo y estado funcional vigente.

**Tech Stack:** Markdown, ripgrep (`rg`), git, frontend/backend contracts existentes.

---

## File Structure (antes de tareas)

- Modify: `docs/cambios-dashboard-meta-2026-04.md`  
Documento principal de cambios acumulados. Aqui se consolidan los cambios recientes de abril 2026.
- Modify: `README.md`  
Documento de entrada para uso del repo; debe quedar alineado con capacidades actuales y endpoints vigentes.
- Modify: `COMPETITIVE_INTELLIGENCE.md`  
Documento funcional de "que hace hoy" (sin roadmap); debe reflejar estado real del frontend y modulos.
- Verify only: `frontend/src/lib/adReference.ts`, `frontend/src/components/AdReferenceLink.tsx`, `frontend/src/routes/DashboardPage.tsx`, `frontend/src/routes/PageDashboardPage.tsx`, `frontend/src/components/LeadsPanel.tsx`, `frontend/src/components/AdDiagnosticsTable.tsx`  
Se usan como fuente de verdad para validar que la documentacion describe lo implementado.

---

### Task 1: Auditoria de cambios recientes y matriz de cobertura documental

**Files:**

- Modify: `docs/cambios-dashboard-meta-2026-04.md`
- Test: `docs/cambios-dashboard-meta-2026-04.md` (validacion de cobertura por secciones)
- **Step 1: Escribir prueba de cobertura documental (fallida inicialmente)**

Agregar al final de `docs/cambios-dashboard-meta-2026-04.md` una seccion temporal de checklist para forzar cobertura explicita de cambios recientes (se elimina o convierte en checklist final al cerrar).

```markdown
## Checklist de cobertura (temporal)

- [ ] Ver referencia documentado en Cuenta, Pagina, Catalogo, Mensajeria y Diagnostico.
- [ ] Prioridad de resolucion de URL documentada (permalink oficial -> link creativo -> story fallback -> Ads Manager).
- [ ] Ajustes UX de lenguaje no tecnico documentados.
- [ ] Estandarizacion de paleta de colores documentada.
- [ ] Cambio de layout anti-desborde en tabla de Diagnostico documentado.
- [ ] Estado de modulo Comercial (CRM removido) documentado.
```

- **Step 2: Ejecutar validacion y confirmar que falta contenido**

Run:

```bash
rg -n "Ver referencia documentado|paleta de colores documentada|anti-desborde|CRM removido" docs/cambios-dashboard-meta-2026-04.md
```

Expected: aparecen lineas del checklist temporal, pero aun no existe desarrollo detallado en secciones del documento.

- **Step 3: Implementar contenido minimo para pasar la cobertura**

Crear nueva seccion (antes del cierre del documento) con resumen estructurado de cambios recientes:

```markdown
## Extensiones recientes (abril 2026, bloque 2)

### Enlaces "Ver referencia" (cobertura ampliada)

- Se estandarizo el enlace `Ver referencia` sobre nombres de anuncio/publicacion en vistas de Cuenta y Pagina.
- Se amplio cobertura a modulos de competidores y tablas de diagnostico/mensajeria donde existe `ad_id`, `campaign_id` o `ad_snapshot_url`.
- En Catalogo:
  - Campanas -> enlace a Ads Manager de campana.
  - Conjuntos -> enlace a Ads Manager de ad set.
- En Mensajeria por campana:
  - Campana -> enlace a Ads Manager de campana.

### Prioridad de resolucion de referencias

1. `effective_object_story_permalink` (oficial Meta),
2. links de `object_story_spec` (CTA/link_data/template/photo),
3. fallback por `effective_object_story_id`,
4. fallback a Ads Manager (anuncio/campana/ad set segun contexto).

### Claridad UX para usuarios no tecnicos

- Se reescribieron titulos, leyendas y descripciones de graficos para lenguaje de negocio.
- Se evitaron etiquetas tecnicas ambiguas y se explico "que significa" cada bloque.

### Consistencia visual

- Se alinearon graficos a la paleta comun (`DASHBOARD_COLORS`) para mantener coherencia de color entre modulos.

### Correcciones de layout

- Tabla "Diagnostico de Creatividades": celda de anuncio ajustada para truncado robusto y evitar desborde.
- Se agrego contenedor `overflow-x-auto` para pantallas estrechas.

### Nota funcional Comercial

- El modulo conserva metricas derivadas de Meta; los bloques dependientes de CRM/carga manual quedaron removidos de la vista.
```

- **Step 4: Re-ejecutar validacion de cobertura**

Run:

```bash
rg -n "Extensiones recientes|Ver referencia|Prioridad de resolucion|Consistencia visual|anti-desborde|CRM" docs/cambios-dashboard-meta-2026-04.md
```

Expected: PASS con coincidencias en seccion de contenido real (no solo checklist temporal).

- **Step 5: Commit**

```bash
git add docs/cambios-dashboard-meta-2026-04.md
git commit -m "docs: actualizar reporte de cambios recientes del dashboard"
```

---

### Task 2: Sincronizar README operativo con estado real del producto

**Files:**

- Modify: `README.md`
- Test: `README.md`
- **Step 1: Escribir prueba de consistencia (fallida inicialmente)**

Crear una mini-seccion temporal en `README.md` (cerca de "Referencias de anuncios (UI)") con items pendientes de verificacion:

```markdown
<!-- CHECKLIST_TEMP_REPORT_SYNC
- [ ] Cobertura de "Ver referencia" mas alla de listas de anuncios (catalogo y mensajeria)
- [ ] Nota de Ads Manager para campanas/ad sets
- [ ] Nota de ajuste visual anti-desborde en diagnostico
CHECKLIST_TEMP_REPORT_SYNC -->
```

- **Step 2: Ejecutar validacion inicial**

Run:

```bash
rg -n "CHECKLIST_TEMP_REPORT_SYNC|Ads Manager para campanas|anti-desborde" README.md
```

Expected: existe checklist temporal, pero aun falta texto definitivo integrado en secciones de README.

- **Step 3: Implementar actualizacion minima en README**

Actualizar la seccion `## Referencias de anuncios (UI)` con texto definitivo:

```markdown
## Referencias de anuncios (UI)

- En vistas de **Cuenta** y **Pagina**, las tablas/listados por anuncio muestran un enlace `Ver referencia` encima del nombre.
- Cobertura adicional:
  - **Catalogo**: campanas y conjuntos incluyen `Ver referencia` hacia Ads Manager del objeto.
  - **Mensajeria por campana**: cada campana incluye `Ver referencia` hacia Ads Manager.
  - **Diagnostico de Creatividades** y modulos relacionados: `Ver referencia` encima del anuncio con layout estable en mobile/desktop.
- Prioridad de resolucion del enlace:
  1. `effective_object_story_permalink` (permalink oficial de Meta si existe),
  2. link de destino en `creative.object_story_spec` (CTA/link_data/template/photo),
  3. fallback por `effective_object_story_id`,
  4. fallback a Ads Manager (anuncio/campana/ad set segun disponibilidad de ID).
- Endpoints que entregan permalink oficial:
  - `GET /accounts/{account_id}/ads`
  - `GET /accounts/{ad_account_id}/ads/performance`
```

Eliminar el bloque `CHECKLIST_TEMP_REPORT_SYNC`.

- **Step 4: Validar consistencia final README**

Run:

```bash
rg -n "Catalogo|Mensajeria por campana|Ads Manager|effective_object_story_permalink" README.md
```

Expected: PASS, con referencias explicitas en la seccion de enlaces.

- **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: sincronizar README con cobertura actual de ver referencia"
```

---

### Task 3: Actualizar documento funcional de capacidades vigentes

**Files:**

- Modify: `COMPETITIVE_INTELLIGENCE.md`
- Test: `COMPETITIVE_INTELLIGENCE.md`
- **Step 1: Escribir prueba de desalineacion funcional (fallida inicialmente)**

Validar dos puntos que suelen quedar desactualizados: stack y cobertura funcional por modulos.

Run:

```bash
rg -n "React 18|Descargar reporte|Mensajeria / WhatsApp|Diagnostico de anuncios" COMPETITIVE_INTELLIGENCE.md
```

Expected: aparecen entradas existentes; se requiere ajustar para reflejar estado reciente y cobertura de referencias.

- **Step 2: Implementar actualizacion funcional minima**

Aplicar cambios puntuales:

```markdown
| **Stack** | React 19, TypeScript, Vite, React Router v6, TanStack Query, Tailwind, componentes tipo shadcn/ui, Recharts |
```

Y ampliar el bloque de `DashboardPage` para incluir:

```markdown
- Cobertura transversal de `Ver referencia` en listados/tablas de anuncios, catalogo y modulos de mensajeria/diagnostico cuando existe identificador util.
- Catalogo con enlaces de referencia a Ads Manager para campanas y ad sets.
- Mensajeria por campana con enlace de referencia por fila.
```

Y en `PageDashboardPage`:

```markdown
- Diagnostico de anuncios con layout robusto (sin desborde) y enlace `Ver referencia` sobre nombre del anuncio.
```

- **Step 3: Validar que el documento quedo alineado**

Run:

```bash
rg -n "React 19|Ver referencia|Catalogo|Mensajeria por campana|sin desborde" COMPETITIVE_INTELLIGENCE.md
```

Expected: PASS con coincidencias en secciones funcionales principales.

- **Step 4: Verificacion cruzada con codigo fuente**

Run:

```bash
rg -n "AdReferenceLink|adsManagerUrlFromCampaign|adsManagerUrlFromAdset" frontend/src/routes/DashboardPage.tsx frontend/src/components/LeadsPanel.tsx frontend/src/components/AdDiagnosticsTable.tsx frontend/src/lib/adReference.ts
```

Expected: PASS, confirmando que la documentacion describe funciones realmente implementadas.

- **Step 5: Commit**

```bash
git add COMPETITIVE_INTELLIGENCE.md
git commit -m "docs: alinear documento funcional con cambios recientes de dashboard"
```

---

### Task 4: QA documental final y consolidacion

**Files:**

- Modify: `docs/cambios-dashboard-meta-2026-04.md` (solo limpieza final si aplica)
- Modify: `README.md` (solo limpieza final si aplica)
- Modify: `COMPETITIVE_INTELLIGENCE.md` (solo limpieza final si aplica)
- Test: repositorio documental
- **Step 1: Ejecutar chequeo global de terminos clave**

Run:

```bash
rg -n "Ver referencia|effective_object_story_permalink|Ads Manager|Mensajeria por campana|Diagnostico de Creatividades" README.md COMPETITIVE_INTELLIGENCE.md docs/cambios-dashboard-meta-2026-04.md
```

Expected: PASS, cobertura en los tres documentos.

- **Step 2: Verificar que no quedaron checklists temporales**

Run:

```bash
rg -n "CHECKLIST_TEMP|Checklist de cobertura \\(temporal\\)" README.md docs/cambios-dashboard-meta-2026-04.md COMPETITIVE_INTELLIGENCE.md
```

Expected: sin resultados.

- **Step 3: Verificar build frontend como smoke check**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS (sin errores TypeScript por cambios documentales indirectos o arrastre de working tree).

- **Step 4: Verificar estado git para handoff**

Run:

```bash
git status --short
```

Expected: solo archivos documentales de esta tarea (mas cambios preexistentes que ya estaban en el arbol).

- **Step 5: Commit final de consolidacion**

```bash
git add README.md COMPETITIVE_INTELLIGENCE.md docs/cambios-dashboard-meta-2026-04.md
git commit -m "docs: consolidar reporte actualizado de cambios recientes"
```

---

## Self-Review (aplicado)

- Cobertura de spec: el plan cubre actualizacion de reporte principal + README + documento funcional.
- Placeholder scan: no se usan TODO/TBD; cada paso incluye comandos o contenido concreto.
- Consistencia de tipos/nombres: se mantiene terminologia real (`AdReferenceLink`, `effective_object_story_permalink`, `adsManagerUrlFromCampaign`, `adsManagerUrlFromAdset`).


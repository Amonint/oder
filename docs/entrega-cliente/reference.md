# Reference

## 1) Inventario técnico de la entrega
- Frontend analítico (React/Vite).
- Backend API (FastAPI).
- Persistencia analítica (DuckDB).
- Orquestación local con Docker Compose (`web`, `api`, `ingest`).
- Scripts operativos de desarrollo y rebuild.
- Paquete documental ejecutivo/técnico.

## 2) Arquitectura cloud/infra (overview)
Aunque el entorno actual está preparado para operación local/servidor, el diseño es cloud-ready:
- **Capa de presentación**: servicio `web` expuesto en `:5173`.
- **Capa de aplicación**: servicio `api` expuesto en `:8000`.
- **Capa de datos**: volumen persistente para analítica (`analytics_data`).
- **Ingesta programable**: servicio `ingest` para actualización de datos.

### Qué habilita esta arquitectura
- Separación limpia entre UI, lógica y datos.
- Escalado por componente (web/api) según demanda.
- Portabilidad a nube (contenedores).

## 3) Skills de marketing entregadas (overview para cliente)
Estas skills funcionan como aceleradores de ejecución, estandarizando buenas prácticas y entregables.

### Bloque estrategia y diagnóstico
- `product-marketing-context`: define contexto base del producto/ICP/posicionamiento.
- `content-strategy`: plan de contenidos por pilares y roadmap editorial.
- `seo-audit`: auditoría SEO técnica/on-page con prioridades.
- `ai-seo`: optimización para visibilidad en buscadores y asistentes de IA.
- `programmatic-seo`: diseño de páginas SEO a escala con plantillas.
- `site-architecture`: estructura de sitio, jerarquía y navegación.

### Bloque adquisición y performance
- `paid-ads`: estrategia de campañas pagadas, segmentación y optimización.
- `ad-creative`: generación iterativa de copys y variantes de anuncios.
- `analytics-tracking`: plan de medición (eventos, conversiones, atribución).
- `ab-test-setup`: diseño y priorización de experimentos A/B.
- `pricing-strategy`: estructura de precios, paquetes y monetización.
- `revops`: procesos de ciclo de vida de leads y handoff comercial.

### Bloque CRO y monetización
- `page-cro`: optimización de páginas de conversión.
- `signup-flow-cro`: mejora de registro/alta.
- `onboarding-cro`: activación post-signup y time-to-value.
- `popup-cro`: optimización de overlays, banners y modales.
- `form-cro`: mejora de formularios (no signup).
- `paywall-upgrade-cro`: optimización de upgrades y conversión free->paid.
- `churn-prevention`: estrategias de retención y reducción de cancelación.

### Bloque contenido y comunicación
- `copywriting`: escritura de mensajes y páginas de alto impacto.
- `copy-editing`: edición/refresco de copy existente.
- `social-content`: planificación y producción de contenido social.
- `email-sequence`: secuencias automatizadas de email lifecycle.
- `cold-email`: prospección outbound y follow-ups.
- `lead-magnets`: diseño de activos para captura de demanda.
- `marketing-ideas`: backlog táctico de crecimiento por canal.
- `marketing-psychology`: aplicación de principios conductuales.

### Bloque competencia y canales complementarios
- `competitor-profiling`: perfilamiento de competidores por URL.
- `competitor-alternatives`: páginas comparativas y alternativas.
- `sales-enablement`: assets para ventas (deck, one-pager, guiones).
- `directory-submissions`: estrategia de listados/directorios.
- `launch-strategy`: plan de lanzamiento y activación inicial.
- `referral-program`: diseño de programa de referidos/afiliados.
- `community-marketing`: crecimiento por comunidad y embajadores.
- `free-tool-strategy`: estrategia de herramientas gratuitas como adquisición.
- `schema-markup`: implementación de datos estructurados.
- `aso-audit`: auditoría de app stores (cuando aplica).
- `customer-research`: investigación y síntesis de voz del cliente.

## 4) Qué se puede generar con estas skills
- Planes estratégicos accionables.
- Briefs de campañas y creatividad.
- Backlogs de experimentación.
- Entregables SEO/CRO/revops listos para ejecución.
- Documentos comerciales y de enablement.
- Playbooks operativos por canal.

## 5) Límites y gobierno de uso
- Las skills aceleran ejecución; no sustituyen validación del negocio.
- Toda recomendación debe pasar por criterio de marca y contexto comercial.
- Se recomienda un flujo de aprobación antes de publicar cambios de alto impacto.

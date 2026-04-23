> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# Plan: Auditoria de filtros y jerarquia (fixes)

## Objetivo
Aplicar correcciones puntuales de jerarquia y consistencia de filtros detectadas en la auditoria:
- Jerarquia de entidad (campana -> adset -> ad) en Comercial (Lead Ads) y Geo.
- Correccion de filtro backend en leads.
- Validacion consistente de rango de fechas personalizado (`date_start` + `date_stop`) en rutas clave.

## Alcance (solo lo acordado)
- Frontend: `client.ts`, `DashboardPage.tsx`
- Backend: `leads.py`, `geo_insights.py`, `dashboard.py`, `pages.py`
- Sin nuevos modulos UI y sin panel nuevo de captacion de leads.

## Checklist de ejecucion
- [x] Paso 1: Extender contrato de Leads para soportar jerarquia completa (`campaign_id`, `adset_id`, `ad_id`) en frontend y backend.
- [x] Paso 2: Corregir campo de filtering en leads (`campaign.id`) y precedencia `ad > adset > campaign`.
- [x] Paso 3: Extender endpoint de Geo para aceptar filtros jerarquicos y aplicarlos en Insights.
- [x] Paso 4: Conectar `DashboardPage` para que Geo y Leads envien filtros jerarquicos reales.
- [x] Paso 5: Unificar validacion de rango personalizado en `dashboard.py` y `pages.py`.
- [x] Paso 6: Verificacion rapida de tipos/lint de archivos tocados.
- [x] Paso 7: Marcar plan como ejecutado con resumen final.

## Criterios de exito
- Si hay `ad_id`, domina sobre `adset_id` y `campaign_id`.
- Si hay `adset_id` (sin `ad_id`), domina sobre `campaign_id`.
- Si hay rango personalizado incompleto, API responde 422 de forma consistente.
- Leads y Geo reflejan filtros activos del dashboard.

## Resultado de ejecucion
- Backend verificado con `PYTHONPATH=backend/src python3 -m pytest backend/tests/test_pages_routes.py -q` -> **24 passed**.
- Lint frontend ejecutado; existen errores preexistentes en el repo no relacionados a estos cambios (hooks/order y reglas de compiler/lint en otros archivos).

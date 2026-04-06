# Frontend — Oderbiz Meta Ads

Este documento complementa el **[README principal del repositorio](../README.md)** (visión, alcance, público y estado al 5 de abril de 2026). Aquí: flujo de pantallas y desarrollo local.

---

## Flujo de la aplicación

1. **`/`** — Pegar token de Marketing API y pulsar **Conectar**. El token se guarda en `sessionStorage` (`meta_access_token`) y se envía al backend como `Authorization: Bearer …`.
2. **`/accounts`** — Lista de cuentas desde `GET /api/v1/accounts`. Clic en una fila abre el dashboard de esa cuenta.
3. **`/accounts/:accountId/dashboard`** — Métricas agregadas vía `GET /api/v1/accounts/{id}/dashboard?date_preset=…`.

**Próximamente (plan aprobado):** mismas rutas base, con pestañas adicionales en el dashboard (ranking de anuncios, geografía agregada, targeting), gráficos con patrones **shadcn/ui** y consulta previa al **MCP `user-shadcn`** para componentes de chart. Ver `docs/superpowers/plans/2026-04-05-agency-panel-tabs-ranking-geo-targeting.md`.

---

## Desarrollo

En **desarrollo**, las rutas `/api/...` se reenvían al backend en el puerto **8000** (`vite.config.ts`). No hace falta `VITE_API_BASE_URL` salvo otro origen; plantilla en `.env.example`.

**Todo en uno:** desde la raíz del repo, `./scripts/dev-local.sh` — uvicorn `:8000` y `npm run dev` `:5173`.

`VITE_API_BASE_URL` — solo el **origen** (p. ej. `http://127.0.0.1:8000`), **sin** `/api/v1`.

---

## Stack

React, TypeScript, Vite, React Router, TanStack Query, Tailwind, componentes estilo shadcn (`src/components/ui`), Recharts vía `chart.tsx`.

---

## React + Vite (plantilla)

El proyecto partió de la plantilla Vite + React. Para ampliar ESLint o React Compiler, ver la [documentación oficial de Vite](https://vite.dev) y [React](https://react.dev).

---

## Charts y componentes UI

Los gráficos estadísticos del panel de agencia usan el bloque **Chart** oficial de shadcn/ui
(`frontend/src/components/ui/chart.tsx`) basado en Recharts.

### Regla: consultar MCP `user-shadcn` antes de modificar charts

Antes de crear o modificar cualquier gráfico estadístico (barras, líneas, áreas, radial):

1. `get_project_registries` — confirmar registries disponibles en `components.json`
2. `search_items_in_registries` — buscar `chart`, `card`, `tabs`, etc. según necesidad
3. `get_item_examples_from_registries` — obtener el demo (ej: `chart-bar`, `chart-bar-horizontal`)
4. `get_add_command_for_items` — instalar primitivos faltantes con `npx shadcn@latest add ...`

No editar `chart.tsx` a mano sin haber consultado primero los ejemplos del registry.

### Vistas del panel (DashboardPage)

| Tab        | Fuente de datos                          | Chart                      |
|------------|------------------------------------------|----------------------------|
| Resumen    | `/accounts/{id}/dashboard`               | BarChart vertical (actions)|
| Ranking    | `/accounts/{id}/ads/performance`         | BarChart vertical top-N    |
| Geografía  | `/accounts/{id}/insights/geo`            | BarChart horizontal region |
| Targeting  | `/accounts/{id}/ads/{ad_id}/targeting`   | Sin chart (JSON + Card)    |

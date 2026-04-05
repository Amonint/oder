# Oderbiz — Meta Ads (frontend)

## Flujo

1. **`/`** — Pegar token de Marketing API y pulsar **Conectar**. El token se guarda solo en `sessionStorage` (`meta_access_token`) y se envía al backend como `Authorization: Bearer …`.
2. **`/accounts`** — Lista de cuentas desde `GET /api/v1/accounts`. Clic en una fila abre el dashboard de esa cuenta.
3. **`/accounts/:accountId/dashboard`** — Métricas agregadas vía `GET /api/v1/accounts/{id}/dashboard?date_preset=…`.

Variable opcional: `VITE_API_BASE_URL` (por defecto `http://127.0.0.1:8000`).

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

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

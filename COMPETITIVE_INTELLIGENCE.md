# Oderbiz Analytics — Funcionalidades (frontend e inteligencia competitiva)

Documento orientado **solo a lo que el sistema hace hoy**: pantallas, rutas, módulos y API de radar/scoring. Sin roadmap ni mejoras futuras.

**Última actualización:** 2026-04-24

---

## 1. Frontend — visión general

| Aspecto | Funcionalidad |
|--------|----------------|
| **Stack** | React 18, TypeScript, Vite, React Router v6, TanStack Query, Tailwind, componentes tipo shadcn/ui, Recharts |
| **Arranque** | `frontend/src/main.tsx`: router, `QueryClientProvider`, `BrowserRouter` |
| **Llamadas API** | Prefijo `/api/v1/...`; en desarrollo el proxy de Vite reenvía al backend |
| **Token Meta** | Guardado en `sessionStorage` (`meta_access_token`). Las peticiones llevan `Authorization: Bearer`. El servidor puede usar `META_ACCESS_TOKEN` si el navegador no envía token |
| **Login de app** | Si el backend define `SITE_AUTH_*`, `RequireSiteAuth` exige sesión y redirige a `/login`. `SiteAuthMenu` permite cerrar sesión de app |

---

## 2. Frontend — rutas

| Ruta | Componente | Funcionalidad |
|------|------------|----------------|
| `/login` | `LoginPage` | Login usuario/contraseña de la app (cuando está activo en servidor) |
| `/` | `TokenPage` | Pegar token Meta; conectar y guardar en `sessionStorage`; redirección a cuentas si ya hay token |
| `/accounts` | `AccountsPage` | Listar cuentas publicitarias y portafolio por negocio BM; elegir cuenta → flujo páginas; cambiar token Meta |
| `/accounts/:accountId/dashboard` | `DashboardPage` | Dashboard de **toda la cuenta** Ads: KPIs, filtros, rankings, geo, demografía, placements, etc. |
| `/accounts/:accountId/pages` | `PagesPage` | Páginas con pauta en la cuenta según periodo (7/30/90 días o máximo) |
| `/accounts/:accountId/pages/:pageId/dashboard` | `PageDashboardPage` | Dashboard **por página/marca** (conjuntos con esa `page_id` en `promoted_object`) |
| `*` | redirección | Cualquier otra URL → `/` |

**Layout:** `AppLayout` (cabecera + logo) + `Outlet`. Rutas internas protegidas por `RequireSiteAuth` cuando aplica.

---

## 3. Frontend — pantallas (detalle)

### 3.1 Login (`LoginPage`)

- Consulta estado de auth de app.
- Formulario usuario/contraseña → login → invalidación de queries → navegación a `/`.
- Si auth está desactivada o ya hay sesión válida, redirige al inicio.

### 3.2 Conectar Meta (`TokenPage`)

- Input de token (oculto), validación no vacío.
- Guarda token y navega a `/accounts`.
- Si ya existe token, redirige a `/accounts`.

### 3.3 Cuentas (`AccountsPage`)

- Tabla `/me/adaccounts`: nombre, ID, moneda; clic → `/accounts/{id}/pages`.
- Sección portafolio por **Business Manager** (`/businesses/portfolio`): negocios y cuentas anidadas; clic en cuenta → mismas páginas.
- Botón **Cambiar token:** limpia `sessionStorage` y vuelve a `/`.
- Si hay 0 cuentas: mensaje de diagnóstico (permisos, tipo de token); opcional `GET /me` para validar token.

### 3.4 Listado de páginas (`PagesPage`)

- Selector de periodo: 7, 30, 90 días o máximo.
- Lista páginas con métricas resumidas; entrada al dashboard de cada `page_id`.
- Breadcrumb Cuentas → Páginas.

### 3.5 Dashboard de cuenta (`DashboardPage`)

**Controles**

- Periodo: hoy, 7/30/90 días, personalizado (modal fechas), máximo.
- Vista anuncios: **periodo agregado** o **diario** (suma por anuncio).
- Enlace a vista **Página** (listado de páginas de esa cuenta).
- **Descargar reporte:** JSON snapshot `dashboard_snapshot.account.v1` (paridad con todas las cargas del dashboard).

**Filtros en cascada**

- Campaña → conjunto → anuncio; recalcula bloques dependientes.

**Módulos de datos (cuenta)**

1. Resumen / KPIs (`fetchAccountDashboard`, `ExecutiveSummary`, comparación de periodo, contexto).
2. Ranking de campañas.
3. Diagnóstico de conjuntos.
4. Rendimiento creativo, fatiga creativa (tablas, scatter, barras de eficiencia).
5. Panel de insights / decisiones.
6. Serie temporal de cuenta (incl. atribución cuando aplica).
7. Gasto diario (sparkline).
8. Costos de adquisición / CPA.
9. Acciones Meta: por categoría, por volumen, coste medio por tipo.
10. Ranking de anuncios (métricas: impresiones, clics, gasto, CTR, resultados, CPA, ROAS).
11. Mensajería / WhatsApp (acciones).
12. Pestañas estructura: campañas, conjuntos, anuncios/creativos.
13. Placements (gasto/impresiones por plataforma y posición).
14. Geografía: mapa y tabla (alcance cuenta o anuncio, varias métricas).
15. Demografía (edad, género, combinaciones).
16. Rendimiento de audiencias.
17. Ventanas de atribución.
18. Leads (formularios / panel de leads).
19. Embudo Meta por nivel.
20. Targeting del anuncio seleccionado.

### 3.6 Dashboard por página (`PageDashboardPage`)

**Controles**

- Periodos iguales que en cuenta + rango personalizado.
- Filtro opcional por **campaña** (solo pauta de esa página).
- **Inteligencia competitiva:** buscar página competidora, elegir sugerencia, abrir panel (§4).
- **Descargar reporte:** JSON snapshot `dashboard_snapshot.page.v1` (paridad columnas página + datos competidor si hay uno seleccionado).

**Módulos de datos (página)**

1. KPIs (`KpiGrid`: gasto, alcance, impresiones, CPM, CTR, frecuencia).
2. Gasto diario (serie + sparkline).
3. Rentabilidad / conversión en el tiempo (y comparación periodo anterior si hay datos).
4. Embudo de conversión.
5. Calidad de tráfico.
6. Diagnóstico de anuncios (top por gasto, etc.).
7. Geo (mapa coroplético / métricas).
8. Demografía pauta (edad / género).
9. Alertas de error de carga.

**Navegación**

- Breadcrumb y enlaces a cuenta Ads y listado de páginas.

---

## 4. Frontend — panel competidor (`CompetitorPanel`)

Solo en dashboard de **página**, cuando hay competidor seleccionado.

- Carga `GET /api/v1/competitor/{page_id}/ads`.
- **RadarTable:** tabla de anuncios del competidor.
- **IntensityIndex:** índice de intensidad.
- **CreativeLibrary:** creativos.
- **MarketMap:** mapa de mercado.
- Manejo de error (p. ej. falta `ads_read` / 403).
- Estado vacío si no hay anuncios en países monitoreados.

---

## 5. Frontend — utilidades compartidas

| Área | Uso |
|------|-----|
| `DateRangePickerModal` | Rango personalizado en dashboards |
| `periodCompare.ts` | Periodo previo y reglas de discontinuidad Meta |
| `accountDashboardExportCollect.ts` / `pageDashboardExportCollect.ts` + `dashboardExportAccount.ts` / `dashboardExportPage.ts` | Recolección y armado JSON de exportación dashboard |
| `GeoMap`, `ChoroplethMap` | Visualización geográfica |
| `api/client.ts` | Cliente HTTP y funciones por endpoint |

---

## 6. API — Market Radar Temporal (backend)

### 6.1 Qué hace

- Busca y analiza anuncios de competencia en torno a un término/categoría/país.
- **Clasifica** candidatos con score (bonus positivo, penalidad negativa, bonus categoría).
- Devuelve agregados temporales (meses, días de semana) por competidor.
- Puede **persistir** clasificaciones en DuckDB (`competitor_classifications`).

### 6.2 Endpoint

```
GET /api/v1/competitor/market-radar-temporal
```

### 6.3 Parámetros de consulta

| Parámetro | Tipo | Requerido | Función |
|-----------|------|-----------|---------|
| `page_id` | string | Sí | Página de referencia del anunciante |
| `search_term` | string | No | Búsqueda; si falta puede usarse categoría de la página |
| `country` | string | No | Código país (p. ej. EC); valor por defecto del backend |
| `custom_keywords` | string | No | Lista separada por comas |
| `min_relevance_score` | int | No | Corte mínimo de score (p. ej. 25 por defecto) |

### 6.4 Ejemplos de llamada

```bash
curl -G "http://localhost:8000/api/v1/competitor/market-radar-temporal" \
  --data-urlencode "page_id=123" \
  --data-urlencode "search_term=psicólogo" \
  --data-urlencode "country=EC" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```bash
curl -G "http://localhost:8000/api/v1/competitor/market-radar-temporal" \
  --data-urlencode "page_id=123" \
  --data-urlencode "search_term=psicólogo" \
  --data-urlencode "custom_keywords=psicología,terapia,salud mental" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```bash
curl -G "http://localhost:8000/api/v1/competitor/market-radar-temporal" \
  --data-urlencode "page_id=123" \
  --data-urlencode "search_term=psicólogo" \
  --data-urlencode "min_relevance_score=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

```bash
curl -G "http://localhost:8000/api/v1/competitor/market-radar-temporal" \
  --data-urlencode "page_id=123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 6.5 Forma típica de la respuesta

Incluye: término de búsqueda, país, keywords usadas, totales de anuncios analizados y competidores, umbral aplicado, lista `top_competitors` con `page_id`, nombre, conteos por mes/día de semana, `relevance_score`, `relevance_reason`, `ml_factors`, y un `summary` textual.

### 6.6 Cómo se calcula el score

- **Fórmula:** score = bonus positivo − penalidad negativa + bonus categoría, acotado a 0–100.
- **Bonus positivo (hasta ~45):** coincidencia con keywords del usuario e indicadores de servicio/profesión.
- **Penalidad negativa (hasta ~80):** términos de ruido (entretenimiento, gaming, ecommerce, etc.).
- **Bonus categoría (hasta ~10):** si la página tiene categoría útil en Meta.

| Rango score | Interpretación |
|-------------|----------------|
| 0–10 | Ruido |
| 10–25 | Bajo interés |
| 25–50 | Posible competidor |
| 50–75 | Probable competidor |
| 75–100 | Muy relevante |

### 6.7 Persistencia

- Tabla **competitor_classifications** en DuckDB: guarda resultados de clasificación (ids, score, razón, factores, término de búsqueda, país, etc.).

### 6.8 Uso programático (Python)

**Clasificar un candidato:**

```python
from oderbiz_analytics.services.competitor_classifier import CompetitorClassifier

classifier = CompetitorClassifier(
    user_category="Psicólogo",
    user_keywords=["psicoterapia", "counseling", "salud mental"],
)
result = classifier.classify(
    page_name="Hermano Elías Torres",
    ad_bodies=["Consulta psicológica en línea..."],
)
# result.score, result.is_relevant, result.reason
```

**Guardar clasificación:**

```python
from oderbiz_analytics.services.competitor_scoring_service import CompetitorScoringService

scoring_service = CompetitorScoringService(db_path="analytics.duckdb")
scoring_service.save_classification(
    page_id="827576157111385",
    page_name="Tyler Foster",
    user_page_id="123",
    relevance_score=25.0,
    is_relevant=True,
    classification_reason="Posible competidor",
    factors={},
    search_term="psicólogo",
    country="EC",
)
```

### 6.9 Límites y requisitos del endpoint

- Volumen típico de anuncios analizados acotado por implementación (p. ej. hasta ~100 por búsqueda).
- Token con permisos compatibles con **Ad Library** / Graph según lo que implemente la ruta.
- Ventana temporal de anuncios definida por el backend.
- Mismas entradas → mismo score (comportamiento determinista del clasificador).

---

## 7. Relación frontend ↔ APIs de competencia

- **`CompetitorPanel`** (UI de página) consume **`GET /api/v1/competitor/{page_id}/ads`** para anuncios/creativos del competidor elegido.
- **`GET /api/v1/competitor/market-radar-temporal`** es la ruta batch de radar + scoring; se consume típicamente por integración externa o scripts, no por el mismo panel anterior.

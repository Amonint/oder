# Spec: Buscador de Competidores con Resolución de URL

**Fecha:** 2026-04-09  
**Estado:** Aprobado

---

## Problema

El buscador actual usa `/pages/search` de Meta, que requiere la feature "Page Public Content Access" (revisión de app por Meta). Sin ella, devuelve resultados vacíos de forma silenciosa. El fallback con `ads_archive` + `search_terms` busca en el texto de los anuncios, no en nombres de página, resultando en ~30-50% de precisión.

## Solución

Buscador inteligente con detección automática de input:

1. **URL de Facebook/Instagram** → resolución directa a page_id/username → 100% preciso
2. **Texto libre** → `ads_archive` + `search_terms` como fallback con advertencia explícita

---

## Arquitectura

### Backend

#### Nuevo endpoint: `POST /api/v1/competitor/resolve`

**Request:**
```json
{
  "input": "https://www.facebook.com/FarmaciasAmericanas",
  "page_id": "123456789"
}
```

El campo `page_id` es la página Facebook del usuario autenticado (ya disponible en el contexto de la ruta). Se usa exclusivamente para obtener el IG User ID vinculado cuando el input es una URL de Instagram.


**Lógica de detección:**

| Patrón de input | Estrategia |
|----------------|------------|
| `facebook.com/{alias}` | `GET /{alias}?fields=id,name,fan_count,category` en Graph API |
| `facebook.com/profile.php?id={id}` | `GET /{id}?fields=id,name,fan_count,category` |
| `facebook.com/pages/{name}/{id}` | Extrae ID numérico → mismo lookup |
| `instagram.com/{username}` | 1) `GET /{page_id}?fields=instagram_business_account` → obtiene `ig_user_id` propio. 2) `GET /{ig_user_id}?fields=business_discovery.fields(username,name,followers_count,media_count)&username={competitor_username}` |
| Texto libre | `GET /ads_archive?search_terms={input}` → extrae page_id + page_name de resultados |

**Response (éxito):**
```json
{
  "platform": "facebook",
  "page_id": "123456789",
  "name": "Farmacias Americanas Ecuador",
  "fan_count": 45000,
  "category": "Pharmacy / Drugstore",
  "is_approximate": false
}
```

**Response (texto libre — fallback):**
```json
{
  "platform": "facebook",
  "results": [
    { "page_id": "...", "name": "...", "is_approximate": true }
  ]
}
```

**Errores manejados:**
- Alias no encontrado → 404 con mensaje claro
- Instagram account no es business/creator → 422 con explicación ("Esta cuenta de Instagram no es una cuenta de negocio/creador. Business Discovery solo funciona con esas cuentas.")
- Página del usuario no tiene IG vinculado → 422 con explicación
- URL malformada → 400

#### Endpoint existente sin cambios
`GET /api/v1/competitor/{page_id}/ads` — no se modifica.

### Backend: parser de URLs

Módulo `url_parser.py` con función `parse_competitor_input(input: str) -> ResolveStrategy`:
- Regex para los 4 patrones de URL de Facebook
- Regex para URL de Instagram
- Fallback: texto libre

### Frontend

#### Campo único en `PageDashboardPage.tsx`

Reemplaza la lógica actual de `showCompetitorSearch` + `competitorQuery` + `useCompetitorSearch`.

**Comportamiento:**

- Al pegar URL: detecta inmediatamente → llama `/competitor/resolve` → sin debounce, sin sugerencias
- Al escribir texto: debounce 300ms → llama `/competitor/resolve` → muestra dropdown de sugerencias con badge `⚠ resultado aproximado`
- Al seleccionar resultado: igual que hoy → setSelectedCompetitor → abre CompetitorPanel

**Estado local nuevo:**
```typescript
type ResolveState = 
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved"; result: CompetitorResolved }
  | { status: "suggestions"; items: CompetitorSuggestion[] }
  | { status: "error"; message: string }
```

#### Nuevo hook: `useCompetitorResolve`

Reemplaza `useCompetitorSearch`. Encapsula:
- Detección de URL vs texto
- Llamada a `/competitor/resolve`
- Manejo de los dos tipos de respuesta (directo vs sugerencias)

#### Cambio en `client.ts`

Nueva función `resolveCompetitor(input: string)` que llama `POST /competitor/resolve`.  
Se mantiene `fetchCompetitorAds` sin cambios.

---

## Permisos requeridos (ya disponibles)

| Permiso | Uso |
|---------|-----|
| `ads_read` | Fallback con ads_archive |
| `pages_read_engagement` | Lookup de página Facebook pública |
| `business_management` | Instagram Business Discovery |
| `ads_management` | Instagram Business Discovery (alternativo) |

No se requieren permisos nuevos.

---

## Lo que NO cambia

- `CompetitorPanel.tsx` — sin cambios
- Componentes `competitor/RadarTable`, `CreativeLibrary`, `IntensityIndex`, `MarketMap` — sin cambios
- `GET /competitor/{page_id}/ads` — sin cambios

---

## Fuera de scope

- Búsqueda de perfiles de Instagram que no sean business/creator
- Aplicar para Page Public Content Access (mejora futura independiente)
- Caché persistente de resoluciones

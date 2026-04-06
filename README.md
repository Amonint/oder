# Oderbiz Analytics — Meta Ads

Documento de proyecto actualizado al **5 de abril de 2026**.

---

## En pocas palabras

Es una aplicación para **ver el rendimiento de la publicidad en Meta** (Facebook / Instagram Ads) usando **solo los datos que Meta permite por su API**. Sirve sobre todo a **agencias o equipos** que gestionan **una o varias cuentas publicitarias** y quieren tableros claros, sin depender de un CRM propio para empezar.

---

## Propósito de la aplicación

- **Centralizar la lectura** de cuentas publicitarias y métricas básicas (gasto, impresiones, alcance, acciones, etc.) en un solo lugar.
- **Reducir fricción** frente a la interfaz nativa de Meta cuando se necesita un flujo propio (por ejemplo, clientes de agencia que solo deben ver ciertas vistas).
- **Apoyar decisiones humanas**: la herramienta muestra **números y desgloses que ya vienen de Meta**; las conclusiones de negocio las saca la persona que usa el panel (no el sistema calculando indicadores complejos por defecto).
- **Evolución prevista** (diseño acordado, en implementación progresiva): pestañas para **ranking de anuncios**, **vista geográfica agregada** y **configuración de targeting** leída desde Meta, siempre respetando límites de privacidad y agregación de la plataforma.

---

## Alcance

### Lo que sí entra (visión y límites reales)

| Área | Incluido |
|------|----------|
| Fuente de datos | **Únicamente Meta** (Marketing / Graph API). Sin sincronizar CRM, llamadas ni otras fuentes en la visión actual. |
| Autenticación hoy | Token de acceso que el usuario **pega o guarda en el navegador** (sesión); no hay login Meta OAuth embebido en esta versión del código. |
| Lectura | Cuentas publicitarias accesibles con ese token, insights agregados, listados de campañas/anuncios según lo implementado y documentado. |
| Agencia | Modelo mental: **varias cuentas** por cliente; el detalle de “quién ve qué” a nivel producto multi-tenant puede ampliarse después. |

### Lo que no promete la API de Meta (importante)

- **No** se obtiene una lista de “Juan Pérez, 34 años, compró ayer” desde Ads Insights: los informes son **agregados** (por anuncio, región, rango de edad, etc.).
- **No** sustituye a un CRM ni a la atribución avanzada configurada dentro de Ads Manager sin alinear parámetros y ventanas en la API.

### Documentación de apoyo en el repo

- `docs/meta-permisos-v25-campos-y-breakdowns.md` — permisos, campos y breakdowns (referencia técnica).
- `docs/meta-ads-api-inventario-prueba.md` — pruebas reales y comportamiento observado en cuentas concretas.
- `docs/superpowers/specs/2026-04-05-agency-insights-panel-design.md` — especificación del panel tipo agencia (tabs, caché, mapa simple).
- `docs/superpowers/plans/2026-04-05-agency-panel-tabs-ranking-geo-targeting.md` — plan de implementación (backend + frontend, gráficos vía shadcn/MCP).

---

## Estado actual (5 de abril de 2026)

| Componente | Estado |
|--------------|--------|
| **Backend (FastAPI)** | Operativo en Docker (`docker-compose`): salud, listado de cuentas (`/api/v1/accounts`), dashboard de cuenta con insights agregados (`/api/v1/accounts/{id}/dashboard`), resumen DuckDB según rutas existentes. Manejo de errores de Graph en cuentas (p. ej. mensajes de Meta en listados). |
| **Ingesta** | Job opcional (`ingest` profile) hacia DuckDB para datos crudos / agregados diarios. |
| **Frontend (Vite + React)** | Flujo: token → lista de cuentas → dashboard con KPIs, tabla de acciones y gráficos; proxy de `/api` al backend en desarrollo. |
| **Panel agencia (tabs Ranking / Geografía / Targeting)** | **Especificado y planificado**; **pendiente de implementación completa** según el plan enlazado arriba. |
| **Caché servidor** para reducir llamadas repetidas a Meta | Diseñada en spec; **no** como requisito cerrado en código al corte de esta fecha. |
| **Mapa geográfico fino** | No es objetivo inmediato; la primera entrega prevista es **tabla + gráficos** a partir de breakdowns que devuelva Meta. |

En resumen: **hay una base usable hoy** (cuentas + dashboard por cuenta); la **siguiente ola de trabajo** es el panel ampliado con pestañas, más endpoints y UI alineada a shadcn/MCP para gráficos.

---

## Por qué está pensado así

1. **Solo Meta** — Evita depender de integraciones que la agencia aún no tiene (CRM, telefonía) y acota el problema a un contrato claro: lo que la API expone.
2. **Backend intermedio** — El navegador no llama directo a `graph.facebook.com`; pasa por la API propia para **centralizar token, errores, límites y futura caché**.
3. **Sin “magia” de métricas al inicio** — Mostrar datos crudos y dejar la interpretación al usuario respeta el enfoque de negocio pedido y reduce discusiones sobre fórmulas internas.
4. **Incremental** — Se extiende el código existente (FastAPI, DuckDB, React) en lugar de reemplazar el stack; los documentos de spec/plan fijan el rumbo sin tirar lo ya hecho.
5. **Gráficos con shadcn** — Los informes visuales deben seguir patrones del ecosistema shadcn (y, en implementación, el MCP de shadcn) para mantener consistencia y mantenibilidad.

---

## Público objetivo

| Perfil | Uso típico |
|--------|------------|
| **Dueño o account en una agencia de marketing** | Ofrecer a clientes una vista clara de sus cuentas Meta sin montar un data warehouse desde cero. |
| **Cliente final de la agencia (no técnico)** | Ver gasto, anuncios y desgloses en lenguaje de tablero; no necesita saber qué es una API. |
| **Persona técnica (dev / data)** | Desplegar el stack, revisar permisos de Meta, ampliar endpoints, conectar caché o nuevas vistas usando los docs del repo. |

---

## Parte técnica (resumen)

### Estructura del repositorio

```
backend/          # Python, FastAPI, cliente httpx a Meta, DuckDB
frontend/         # React, TypeScript, Vite, UI shadcn, TanStack Query
docker-compose.yml
docs/             # Meta API, specs, planes
scripts/          # p. ej. arranque local backend + frontend
```

### Requisitos típicos

- Docker (para API en contenedor) **o** Python 3.12+ para correr el backend local.
- Node.js para el frontend.
- **Token de Meta:** en el flujo web se pega en la pantalla inicial y se envía como **`Authorization: Bearer …`**; **no hace falta** `META_ACCESS_TOKEN` en `.env` para arrancar el backend. Opcional en servidor para Docker, ingesta programada o llamadas sin cabecera Bearer (ver `backend/.env.example`).

### Arranque rápido

- **Todo en uno (recomendado):** desde la raíz, `./scripts/dev-local.sh` (si existe en tu clon) — backend `:8000`, frontend `:5173` con proxy.
- **Docker:** `docker compose up` para la API; en otra terminal `cd frontend && npm install && npm run dev`.

Detalle de rutas del frontend: ver `frontend/README.md`.

### Tests (backend)

```bash
cd backend && python3 -m pytest -q
```

(En entornos sin dependencias instaladas, usar el contenedor o un venv con `pyproject.toml`.)

### Seguridad

- No commitear tokens ni `.env` con secretos.
- Rotar tokens que hayan aparecido en logs o chats.

### Consola del navegador: avisos que **no** son de esta app

Si ves mensajes como:

- `Unchecked runtime.lastError: The message port closed before a response was received`
- `The page keeping the extension port is moved into back/forward cache...`

proceden casi siempre de **extensiones de Chrome** (Cursor, React DevTools, bloqueadores, etc.) al hablar con la página; **no** indican un fallo del token ni del código Oderbiz. Para comprobar la app, usá la pestaña **Red (Network)** y filtrá por `accounts`, o una ventana de incógnito **sin extensiones**.

### Si “Conectar” no muestra cuentas

1. **Network:** la petición a `/api/v1/accounts` debe ser **200** (origen `localhost:5173` en dev; el proxy reenvía a `:8000`).  
2. Si es **200** con cuerpo `{"data":[]}`, **Meta no devolvió cuentas para ese token** (permisos, tipo de token o usuario sin cuentas). La UI muestra un aviso con causas habituales y, si el token es válido, quién es el usuario según `GET /api/v1/me`.  
3. **Terminal:** `curl -s http://127.0.0.1:8000/health` → `{"status":"ok"}`.  
4. **Token:** en **Aplicación → Almacenamiento de sesión** debe existir `meta_access_token` tras pulsar Conectar.

### Si Graph API Explorer funciona pero esta app “no conecta” o ves código viejo

1. **Misma URL siempre:** `http://localhost:5173` y `http://127.0.0.1:5173` son **orígenes distintos**. El token vive en `sessionStorage` por origen; si abrís la app en uno y antes usaste el otro, parece que “no hay token” o que falla el flujo. Elegí uno y quedate ahí.
2. **Variables `VITE_*`:** si tenés `VITE_API_BASE_URL` en `.env` / `.env.local`, los cambios **solo aplican después de reiniciar** `npm run dev` (Vite las inyecta al arrancar). Si apunta a un backend viejo (otro puerto o contenedor sin rebuild), verás rutas 404 o respuestas antiguas.
3. **Consola en desarrollo:** al cargar la app debería aparecer una línea `[oderbiz api]` indicando si usás **proxy** (vacío = mismo origen → `:8000`) o **origen directo**. Si no coincide con dónde corre tu uvicorn, ajustá env o el proxy.
4. **Un solo backend en :8000:** si Docker y uvicorn local compiten por el puerto, solo uno sirve; el otro falla o queda un proceso viejo. Comprobá con `curl -s http://127.0.0.1:8000/health` y, si usás Docker, **`docker compose build api && docker compose up -d api`** tras cambios en Python.
5. **Pestaña Red:** la petición a `/api/v1/accounts` debe ir al mismo host que la página (p. ej. `localhost:5173/api/...` en dev con proxy), no directo a Meta.

---

## Licencia y contacto

Ajustar según política del equipo Oderbiz (si aplica).

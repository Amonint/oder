# Meta Graph API v25.0 — Permisos declarados, transporte HTTP y superficie Insights

**Versión API de referencia:** `v25.0`  
**Fuentes oficiales:** [Permissions Reference](https://developers.facebook.com/docs/permissions/reference), [Adgroup Insights](https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights), [Ads Action Stats](https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats), [Insights — Breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns), [Insights — Action breakdowns](https://developers.facebook.com/docs/marketing-api/insights/action-breakdowns).

---

## 1. Permisos: ¿la app los “manda todos” en cada llamada?


| Hecho                                  | Detalle                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transporte HTTP                        | Las llamadas a Graph API llevan `access_token` (query) o `Authorization: Bearer` (header). **No se envía un parámetro `scope` ni la lista de permisos en cada request.**                                        |
| Dónde viven los permisos               | Se concedieron al usuario en el flujo de autorización (Facebook Login / token de sistema, etc.). El token **ya incluye** los alcances aceptados; Meta valida en servidor si el endpoint requiere esos permisos. |
| Este repositorio (`oderbiz analitics`) | **No implementa OAuth de Meta.** Solo reenvía el token que el usuario pega o guarda en el cliente. Por tanto **no “elige” permisos por petición**: depende 100 % del token generado fuera de esta app.          |


---

## 2. Permisos solicitados: definición oficial (resumen literal)


| Permiso                 | Dependencias (oficial)                     | Qué permite (oficial, resumido)                                                                                                                                                                 |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ads_read`              | Ninguna                                    | Acceso a **Ads Insights API** para informes de cuentas publicitarias propias o a las que te dieron acceso; también acceso al **Server-Side API** (eventos web desde servidor).                  |
| `ads_management`        | `pages_read_engagement`, `pages_show_list` | **Leer y gestionar** la cuenta publicitaria (propia o compartida): campañas, anuncios, métricas; construir herramientas de gestión.                                                             |
| `business_management`   | `pages_read_engagement`, `pages_show_list` | **Leer y escribir** con **Business Manager API**: activos de negocio (p. ej. cuenta publicitaria), reclamar cuentas, etc.                                                                       |
| `pages_show_list`       | —                                          | Lista de **Páginas** que la persona administra; verificación de que administra una Página.                                                                                                      |
| `pages_read_engagement` | `pages_show_list`                          | Leer **contenido** de la Página (posts, fotos, videos, eventos), datos de seguidores **incl. nombre y PSID**, foto de perfil, **metadatos e insights de la Página** (administración de Página). |


**Nota:** La lista **completa y versionada** de permisos y dependencias está en la [Permissions Reference](https://developers.facebook.com/docs/permissions/reference); Meta puede actualizar textos o dependencias.

---

## 3. Qué superficies de datos cubren esos permisos (por familia de API)


| Familia                                                          | Permisos típicos implicados                | Datos (alto nivel)                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing API — cuenta/campaña/ad set/ad/creatives + `/insights` | `ads_read` y/o `ads_management`            | Estructura de anuncios, presupuestos, estados, **métricas agregadas** (`insights`).                                                                |
| Business Manager API                                             | `business_management`                      | Portafolios, asignación de cuentas publicitarias, usuarios del negocio, etc. (no sustituye a `insights`).                                          |
| Graph — Page                                                     | `pages_show_list`, `pages_read_engagement` | Lista de páginas; contenido e **insights a nivel Página** (distinto del objeto “Ads Insights” de campañas, aunque puede relacionarse en producto). |


**Importante:** No existe en la documentación pública una tabla “si tienes exactamente estos 5 permisos → estos N campos de Insights están permitidos y estos no”. La regla práctica es: **token válido + acceso a la cuenta publicitaria + campo soportado en el edge**; algunos campos o breakdowns tienen restricciones por métrica, nivel (`account`/`campaign`/`adset`/`ad`) o políticas de la cuenta.

---

## 4. Edge `GET /v25.0/{object_id}/insights` — parámetros que shapean la respuesta


| Parámetro                    | Rol técnico                                                                                                                  | Tipo / notas                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `fields`                     | Lista separada por comas de **nombres de campos** del objeto de insights a devolver.                                         | string; cada nombre es un campo documentado en la referencia del objeto Insights. |
| `level`                      | Cuando el `object_id` es `act_`*, define agregación: `account`, `campaign`, `adset`, `ad`.                                   | enum string                                                                       |
| `date_preset`                | Rango temporal predefinido (`last_7d`, `last_30d`, `maximum`, …).                                                            | string; valores inválidos → error API.                                            |
| `time_range`                 | Rango explícito `since` / `until` (alternativa o complemento según doc).                                                     | JSON en query                                                                     |
| `breakdowns`                 | **Dimensiones de segmentación** en cada fila (edad, país, placement, etc.). Cada breakdown añade columnas string en la fila. | lista enum, p. ej. `age,gender`                                                   |
| `action_breakdowns`          | Desglose de campos tipo **acción** (p. ej. por `action_type`, `action_device`, … según doc).                                 | lista enum                                                                        |
| `action_attribution_windows` | Ventanas de atribución para métricas de conversión/acción.                                                                   | enum list                                                                         |
| `action_report_time`         | Marco temporal de reporte para stats de acciones (según enum en referencia de campaña/ad insights).                          | enum                                                                              |
| `filtering`                  | Filtros sobre dimensiones/métricas (sintaxis en doc de Insights).                                                            | JSON array                                                                        |
| `time_increment`             | Granularidad temporal (p. ej. diaria) para series.                                                                           | string/int según doc                                                              |


**Referencias:** [Campaign insights parameters](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/insights), [Adgroup insights](https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights).

---

## 5. Estructuras compuestas frecuentes (tipos lógicos)


| Nombre en doc           | Aparece como                                                                             | Miembros típicos                                                               | Significado                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Ads Action Stats**    | Lista en campos como `actions`, `cost_per_action_type`, `mobile_app_purchase_roas`, etc. | `action_type` (string), `value` (string numérico en JSON de Graph)             | **Acción** contada o **coste medio** asociado a ese `action_type` en el periodo y nivel solicitados.     |
| **Ads Insights (fila)** | Un elemento de `data[]`                                                                  | Mezcla de strings numéricos, strings, listas y objetos anidados según `fields` | Una fila de reporte; si hay `breakdowns`, la fila incluye esas dimensiones como propiedades adicionales. |


`**cost_per_action_type` (oficial):** lista de **Ads Action Stats**; el `value` es el **coste promedio** por la acción indicada en `action_type` (no el recuento de acciones).

`**actions` (oficial):** lista de **Ads Action Stats**; el `value` es el **número** (o magnitud reportada) para ese `action_type`.

---

## 6. Breakdowns (`breakdowns=…`) — categorías (valores citados en documentación)

Los valores exactos y combinaciones permitidas están en [Breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns) y [Combining breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns#combiningbreakdowns). Ejemplos documentados:


| Categoría                | Valores / temática (doc)                                                                                                                    | Tipo en fila                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Demográficos             | `age`, `gender`                                                                                                                             | string (ej. `18-24`, `male` / `female`)                            |
| Geografía                | `country`, `region`, `dma`                                                                                                                  | string; `dma` con matices de muestreo para métricas únicas (reach) |
| Publicación / superficie | `publisher_platform`, `platform_position`, `impression_device` (no solo; requiere combinación según doc)                                    | string                                                             |
| Producto / catálogo      | `product_id` (ej. con Advantage+ catálogo)                                                                                                  | string                                                             |
| Creativo dinámico        | `image_asset`, `video_asset`, `title_asset`, `body_asset`, `description_asset`, `call_to_action_asset`, `link_url_asset`, `ad_format_asset` | string / IDs según doc; métricas limitadas para estos breakdowns   |
| iOS / SKAN               | `skan_campaign_id`, `skan_conversion_id`, `hsid`, `fidelity_type`                                                                           | string; acotados a campos específicos (postbacks)                  |
| Otros                    | `user_segment_key` (ASC), `device_platform`, etc.                                                                                           | string                                                             |


**Geografía / edad:** Insights devuelve **buckets agregados** (país, región, DMA, rango de edad), **no** direcciones ni coordenadas por persona.

---

## 7. Action breakdowns (`action_breakdowns=…`)

Eje distinto de `breakdowns`: segmenta **métricas basadas en acciones** (p. ej. desglose de `actions` por `action_type`, o —con elegibilidad de cuenta— por `action_video_type` para video). Ver [Action breakdowns](https://developers.facebook.com/docs/marketing-api/insights/action-breakdowns).

---

## 8. Campos de Insights — inventario por categoría (muestra oficial + tipo)

La **lista canónica y exhaustiva** de campos y tipos está en la referencia del objeto **Adgroup Insights** (misma familia para cuenta/campaña con el parámetro `level`):  
[https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights](https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights)  

Abajo: **subconjunto representativo** con descripciones tomadas de fragmentos oficiales (Context7 / Marketing API). Muchos campos adicionales son `numeric string`, `string`, `list<AdsActionStats>` u objetos anidados según la tabla de la referencia.

### 8.1 Tiempo y periodo


| Campo                                             | Tipo (Graph JSON) | Qué representa (oficial)              |
| ------------------------------------------------- | ----------------- | ------------------------------------- |
| `date_start`                                      | string            | Inicio del periodo del reporte.       |
| `date_stop`                                       | string            | Fin del periodo del reporte.          |
| `hourly_stats_aggregated_by_advertiser_time_zone` | string            | Agregación horaria (huso anunciante). |
| `hourly_stats_aggregated_by_audience_time_zone`   | string            | Agregación horaria (huso audiencia).  |


### 8.2 Volumen y frecuencia


| Campo             | Tipo           | Qué representa (oficial)                                                              |
| ----------------- | -------------- | ------------------------------------------------------------------------------------- |
| `impressions`     | numeric string | Veces que los anuncios estuvieron en pantalla.                                        |
| `reach`           | numeric string | Personas únicas estimadas alcanzadas (sujeto a restricciones con ciertos breakdowns). |
| `frequency`       | numeric string | Promedio de veces que cada persona vio el anuncio (estimado).                         |
| `frequency_value` | string         | Uso documentado junto con `reach` en escenarios de breakdown.                         |


### 8.3 Clics y CTR


| Campo                    | Tipo           | Qué representa (oficial)                                             |
| ------------------------ | -------------- | -------------------------------------------------------------------- |
| `clicks`                 | numeric string | Clics en enlace (definición estándar en insights).                   |
| `ctr`                    | numeric string | % de impresiones con clic (all).                                     |
| `inline_link_clicks`     | numeric string | Clics en enlaces inline; ventana fija 1d click (doc).                |
| `inline_link_click_ctr`  | numeric string | CTR de inline link clicks.                                           |
| `inline_post_engagement` | numeric string | Total de acciones asociadas al post/anuncio; ventana 1d click (doc). |


### 8.4 Coste y puja


| Campo   | Tipo           | Qué representa (oficial)                                               |
| ------- | -------------- | ---------------------------------------------------------------------- |
| `spend` | numeric string | Gasto en la moneda de la cuenta.                                       |
| `cpm`   | numeric string | Coste por mil impresiones.                                             |
| `cpp`   | numeric string | Coste por mil personas alcanzadas (definición en referencia completa). |


### 8.5 Acciones y coste por tipo


| Campo                  | Tipo                            | Qué representa (oficial)                                       |
| ---------------------- | ------------------------------- | -------------------------------------------------------------- |
| `actions`              | list                            | Recuentos por `action_type`.                                   |
| `cost_per_action_type` | list                            | Coste medio por `action_type`.                                 |
| `action_values`        | list (estructura en referencia) | Valores monetarios u otros por tipo de acción (cuando aplica). |


### 8.6 Video


| Campo                                                      | Tipo                               | Qué representa (oficial)                                                         |
| ---------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `video_avg_time_watched_actions`                           | list (AdsActionStats u objeto doc) | Métricas de tiempo de visualización (según campo exacto en referencia).          |
| `video_p25_watched_actions` … `video_p100_watched_actions` | list                               | Progreso de visualización; **sin** breakdown `region` según notas de breakdowns. |


### 8.7 Mensajes / marketing messages (subconjunto doc)


| Campo                                    | Tipo           | Qué representa (oficial)                                      |
| ---------------------------------------- | -------------- | ------------------------------------------------------------- |
| `marketing_messages_delivered`           | numeric string | Mensajes entregados (exclusiones geo documentadas).           |
| `marketing_messages_delivery_rate`       | numeric string | Entregados / enviados.                                        |
| `marketing_messages_read_rate_benchmark` | string         | Benchmark de lectura (percentil 75 entre negocios similares). |


### 8.8 Objetivo y metadatos de creativo / activo


| Campo                                          | Tipo            | Qué representa                                                                                       |
| ---------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `objective`                                    | string          | Objetivo de marketing reflejado en el reporte (puede diferir del objetivo de campaña en casos edge). |
| `image_asset`, `video_asset`, `title_asset`, … | objeto / string | Metadatos de asset cuando se piden y el nivel/formato aplica.                                        |


### 8.9 SKAN / iOS (acotado)


| Campo           | Tipo   | Qué representa (oficial)                                                            |
| --------------- | ------ | ----------------------------------------------------------------------------------- |
| `fidelity_type` | string | SKAdNetwork fidelity type; solo con breakdowns/campos de postback indicados en doc. |
| `hsid`          | string | Identificador de impresión SKAN 4+; acotado a campos específicos.                   |


---

## 9. Este repositorio: qué pide hoy a Insights (no es “todo”)

Definido en código:

```text
impressions,clicks,spend,reach,frequency,cpm,cpp,ctr,actions,cost_per_action_type
```

Nivel: `account`. **No** pide `breakdowns` ni `action_breakdowns` en el dashboard actual → **una fila agregada** sin país/edad/placement en la misma respuesta.

---

## 10. Límites de privacidad (Insights vs personas)


| Dato                                                | ¿Insights lo entrega?                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Buckets `age`, `gender`, `country`, `region`, `dma` | Sí, como **agregados**.                                                                    |
| Lista de usuarios con nombre/email/teléfono         | **No** vía Ads Insights agregado.                                                          |
| PSID / nombre de seguidores                         | vía `**pages_read_engagement`** en contexto de **Página**, no sustituye a insights de ads. |


---

## 11. Enlaces oficiales consolidados

- Permisos: [https://developers.facebook.com/docs/permissions/reference](https://developers.facebook.com/docs/permissions/reference)  
- Insights overview: [https://developers.facebook.com/docs/marketing-api/insights](https://developers.facebook.com/docs/marketing-api/insights)  
- Campos del objeto (lista maestra): [https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights](https://developers.facebook.com/docs/marketing-api/reference/adgroup/insights)  
- Ads Action Stats: [https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats](https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats)  
- Breakdowns: [https://developers.facebook.com/docs/marketing-api/insights/breakdowns](https://developers.facebook.com/docs/marketing-api/insights/breakdowns)  
- Action breakdowns: [https://developers.facebook.com/docs/marketing-api/insights/action-breakdowns](https://developers.facebook.com/docs/marketing-api/insights/action-breakdowns)  
- Marketing API access: [https://developers.facebook.com/docs/marketing-api/access](https://developers.facebook.com/docs/marketing-api/access)


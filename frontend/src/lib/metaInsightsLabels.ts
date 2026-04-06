/**
 * Etiquetas legibles en español para campos de Meta Ads Insights.
 * Los códigos técnicos siguen siendo las claves de la API; esto es solo presentación.
 */

/** Tarjetas de resumen (nivel cuenta) */
export const DASHBOARD_KPI_LABELS: Record<string, string> = {
  impressions: "Impresiones",
  clicks: "Clics en el anuncio",
  spend: "Gasto publicitario",
  reach: "Personas alcanzadas",
  frequency: "Frecuencia media",
  cpm: "Coste por 1.000 impresiones",
  cpp: "Coste por 1.000 personas alcanzadas",
  ctr: "Tasa de clics (CTR)",
};

/** Selector y leyendas del ranking por anuncio */
export const RANKING_METRIC_LABELS: Record<string, string> = {
  impressions: "Impresiones",
  clicks: "Clics",
  spend: "Gasto",
  ctr: "Tasa de clics (CTR)",
};

/**
 * Tipos de acción (`action_type`) que devuelve Meta en `actions` y `cost_per_action_type`.
 * Lista ampliable; tipos desconocidos pasan por humanizeMetaActionType.
 */
const ACTION_TYPE_LABELS: Record<string, string> = {
  link_click: "Clics en enlace",
  outbound_click: "Clics salientes",
  page_engagement: "Interacciones con la página",
  post_engagement: "Interacciones con la publicación",
  post_interaction_gross: "Interacciones con publicación (total)",
  post_interaction_net: "Interacciones con publicación (netas)",
  post_reaction: "Reacciones a la publicación",
  post: "Publicaciones",
  comment: "Comentarios",
  like: "Me gusta",
  video_view: "Reproducciones de video",
  photo_view: "Vistas de foto",
  link_url_click: "Clics en URL",
  mobile_app_install: "Instalaciones de app",
  app_custom_event: "Evento personalizado de app",
  lead: "Leads",
  complete_registration: "Registros completados",
  purchase: "Compras",
  add_to_cart: "Añadir al carrito",
  initiate_checkout: "Inicios de pago",
  "onsite_conversion.lead": "Conversiones: lead",
  "onsite_conversion.purchase": "Conversiones: compra",
  "onsite_conversion.messaging_first_reply": "Primeras respuestas en el chat",
  "onsite_conversion.messaging_welcome_message_view": "Vistas del mensaje de bienvenida",
  "onsite_conversion.messaging_conversation_started_7d": "Conversaciones iniciadas (7 días)",
  "onsite_conversion.messaging_conversation_replied_7d": "Conversaciones con respuesta (7 días)",
  "onsite_conversion.total_messaging_connection": "Conexiones por mensajería",
  "onsite_conversion.messaging_block": "Bloqueos en mensajería",
  "onsite_conversion.messaging_user_depth_2_message_send": "Mensajes enviados (nivel 2)",
  "onsite_conversion.messaging_user_depth_3_message_send": "Mensajes enviados (nivel 3)",
  "onsite_conversion.messaging_user_depth_5_message_send": "Mensajes enviados (nivel 5)",
  "onsite_conversion.post_save": "Guardados de publicación",
  "onsite_conversion.post_net_save": "Guardados netos (publicación)",
  "onsite_conversion.post_net_comment": "Comentarios netos (publicación)",
  "onsite_conversion.post_net_like": "Me gusta netos (publicación)",
  "offsite_conversion.fb_pixel_purchase": "Compras (píxel)",
  "offsite_conversion.fb_pixel_lead": "Leads (píxel)",
  "offsite_conversion.fb_pixel_complete_registration": "Registros (píxel)",
  landing_page_view: "Vistas de página de destino",
  omni_landing_page_view: "Vistas de landing (omni)",
  onsite_web_lead: "Leads web en el sitio",
  onsite_web_purchase: "Compras web en el sitio",
  onsite_web_view_content: "Vistas de contenido web",
  web_in_store_purchase: "Compras tienda (web)",
  click_to_call_call_confirm: "Llamadas confirmadas",
  click_to_call_native_call_placed: "Llamadas iniciadas",
  ad_click_mobile_app_install: "Instalaciones por clic en anuncio",
  app_install: "Instalaciones de app",
  "games.plays": "Partidas / jugadas",
  "games.purchases": "Compras en juego",
  "games.custom": "Eventos personalizados (juego)",
};

function humanizeMetaActionType(type: string): string {
  const trimmed = type.trim();
  if (!trimmed) return "—";
  const withoutPrefix = trimmed.replace(/^onsite_conversion\./, "");
  const words = withoutPrefix.split("_").filter(Boolean);
  if (words.length === 0) return trimmed;
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Etiqueta corta para ejes de gráficos (evita solapamientos). */
export function shortActionTypeLabel(type: string, maxLen = 32): string {
  const full = labelForMetaActionType(type);
  if (full.length <= maxLen) return full;
  return `${full.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function labelForMetaActionType(type: string): string {
  const key = type.trim();
  if (ACTION_TYPE_LABELS[key]) return ACTION_TYPE_LABELS[key];
  return humanizeMetaActionType(key);
}

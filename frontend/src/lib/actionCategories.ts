import { labelForMetaActionType } from "./metaInsightsLabels";

interface ActionRow {
  action_type: string;
  value: number;
}

interface CategoryRow {
  label: string;
  value: number;
}

const CATEGORY_MAP: Record<string, string> = {
  link_click: "Clics",
  outbound_click: "Clics",
  landing_page_view: "Clics",
  omni_landing_page_view: "Clics",
  page_engagement: "Interacciones",
  post_engagement: "Interacciones",
  post_reaction: "Interacciones",
  comment: "Interacciones",
  like: "Interacciones",
  post: "Interacciones",
  video_view: "Video",
  photo_view: "Video",
  lead: "Conversiones",
  complete_registration: "Conversiones",
  purchase: "Conversiones",
  add_to_cart: "Conversiones",
  initiate_checkout: "Conversiones",
  onsite_web_lead: "Conversiones",
  onsite_web_purchase: "Conversiones",
  mobile_app_install: "App",
  app_install: "App",
  app_custom_event: "App",
  click_to_call_call_confirm: "Llamadas",
  click_to_call_native_call_placed: "Llamadas",
};

function categoryFor(actionType: string): string {
  const key = actionType.trim();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  if (key.startsWith("onsite_conversion.messaging")) return "Mensajería";
  if (key.startsWith("onsite_conversion")) return "Conversiones";
  if (key.startsWith("offsite_conversion")) return "Conversiones";
  if (key.startsWith("games.")) return "Juegos";
  return labelForMetaActionType(key);
}

export function groupActionsByCategory(actions: ActionRow[]): CategoryRow[] {
  const totals = new Map<string, number>();
  for (const { action_type, value } of actions) {
    const cat = categoryFor(action_type);
    totals.set(cat, (totals.get(cat) ?? 0) + value);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}

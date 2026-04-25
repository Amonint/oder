import type { AdCreative } from "../api/client";

export type AdReferenceSource =
  | "official_permalink"
  | "creative_link"
  | "story_fallback"
  | "ads_manager";

export interface ResolveAdReferenceInput {
  adId?: string | null;
  adAccountId?: string | null;
  creative?: AdCreative | null;
  storyId?: string | null;
  storyPermalink?: string | null;
}

export interface AdReferenceResolution {
  url: string | null;
  source: AdReferenceSource | null;
}

function asHttpUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return null;
}

function firstHttpUrl(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const url = asHttpUrl(candidate);
    if (url) return url;
  }
  return null;
}

export function adsManagerUrlFromAd(adId: string | null | undefined, adAccountId: string | null | undefined): string | null {
  const aid = String(adId ?? "").trim();
  const account = String(adAccountId ?? "").trim();
  if (!aid || !account) return null;
  const normalizedAct = account.startsWith("act_") ? account : `act_${account}`;
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(normalizedAct)}&selected_ad_ids=${encodeURIComponent(aid)}`;
}

export function adsManagerUrlFromCampaign(
  campaignId: string | null | undefined,
  adAccountId: string | null | undefined,
): string | null {
  const cid = String(campaignId ?? "").trim();
  const account = String(adAccountId ?? "").trim();
  if (!cid || !account) return null;
  const normalizedAct = account.startsWith("act_") ? account : `act_${account}`;
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(normalizedAct)}&selected_campaign_ids=${encodeURIComponent(cid)}`;
}

export function adsManagerUrlFromAdset(
  adsetId: string | null | undefined,
  adAccountId: string | null | undefined,
): string | null {
  const sid = String(adsetId ?? "").trim();
  const account = String(adAccountId ?? "").trim();
  if (!sid || !account) return null;
  const normalizedAct = account.startsWith("act_") ? account : `act_${account}`;
  return `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${encodeURIComponent(normalizedAct)}&selected_adset_ids=${encodeURIComponent(sid)}`;
}

export function facebookPostUrlFromStoryId(storyId: string | null | undefined): string | null {
  const sid = String(storyId ?? "").trim();
  if (!sid) return null;
  return `https://www.facebook.com/${sid}`;
}

export function resolveAdReference(input: ResolveAdReferenceInput): AdReferenceResolution {
  const officialPermalink = asHttpUrl(input.storyPermalink);
  if (officialPermalink) {
    return { url: officialPermalink, source: "official_permalink" };
  }

  const spec = input.creative?.object_story_spec;
  const linkData = spec?.link_data;
  const videoData = spec?.video_data;
  const templateData = spec?.template_data;
  const photoData = spec?.photo_data;

  const creativeLink = firstHttpUrl([
    linkData?.link,
    linkData?.call_to_action?.value?.link,
    videoData?.call_to_action?.value?.link,
    templateData?.link,
    photoData?.link,
  ]);
  if (creativeLink) {
    return { url: creativeLink, source: "creative_link" };
  }

  const storyFallback = facebookPostUrlFromStoryId(input.storyId ?? input.creative?.effective_object_story_id ?? null);
  if (storyFallback) {
    return { url: storyFallback, source: "story_fallback" };
  }

  const adsManager = adsManagerUrlFromAd(input.adId, input.adAccountId);
  if (adsManager) {
    return { url: adsManager, source: "ads_manager" };
  }

  return { url: null, source: null };
}

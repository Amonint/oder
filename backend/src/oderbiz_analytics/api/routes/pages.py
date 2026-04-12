# backend/src/oderbiz_analytics/api/routes/pages.py
"""Routes for page-level analytics endpoints."""
from __future__ import annotations

import asyncio
import hashlib

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.duckdb.client import get_cache, set_cache
from oderbiz_analytics.adapters.meta.graph_edges import fetch_graph_edge_all_pages
from oderbiz_analytics.adapters.meta.insights import fetch_insights, fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.geo_formatter import enrich_geo_row

router = APIRouter(prefix="/accounts", tags=["pages"])


def _make_cache_key(
    account_id: str,
    endpoint: str,
    page_id: str = "",
    date_preset: str = "",
    campaign_id: str = "",
    adset_id: str = "",
    ad_id: str = "",
) -> str:
    raw = f"{account_id}|{page_id}|{endpoint}|{date_preset}|{campaign_id}|{adset_id}|{ad_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


@router.get("/{account_id}/pages")
async def get_pages_list(
    account_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Returns a list of Facebook Pages associated with an ad account, ranked by spend.

    Steps:
    1. Scan adsets for the account via /{account_id}/adsets?fields=promoted_object
    2. Extract unique page_ids from promoted_object.page_id
    3. Fetch page info + insights for each page in parallel
    4. Sort by spend DESC
    5. Cache result in DuckDB
    """
    normalized_id = normalize_ad_account_id(account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    # Build cache key
    cache_key = _make_cache_key(
        account_id=normalized_id,
        endpoint="pages_list",
        date_preset=effective_preset,
    )

    # Check cache first
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    # 1. Fetch all adsets with promoted_object field
    try:
        adsets = await fetch_graph_edge_all_pages(
            base_url=base,
            access_token=access_token,
            path=f"{normalized_id}/adsets",
            fields="promoted_object",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="La API de Meta devolvió un error al obtener adsets.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    # 2. Extract unique page_ids and build page→adset_ids mapping
    page_ids: list[str] = []
    seen: set[str] = set()
    page_adset_map: dict[str, list[str]] = {}
    for adset in adsets:
        promoted = adset.get("promoted_object", {})
        pid = promoted.get("page_id") if promoted else None
        aid = adset.get("id")
        if pid and aid:
            if pid not in seen:
                seen.add(pid)
                page_ids.append(pid)
                page_adset_map[pid] = []
            page_adset_map[pid].append(aid)

    if not page_ids:
        result = {"data": [], "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    # 3. Fetch page info + insights for each page in parallel
    async def _fetch_page_data(page_id: str, client: httpx.AsyncClient) -> dict:
        try:
            info_r = await client.get(
                f"{base}/{page_id}",
                params={"fields": "name,category", "access_token": access_token},
            )
            page_info = info_r.json() if info_r.is_success else {}
        except httpx.RequestError:
            page_info = {}

        adset_ids = page_adset_map.get(page_id, [])
        try:
            rows = await fetch_insights(
                base_url=base,
                access_token=access_token,
                ad_account_id=normalized_id,
                fields="spend,impressions",
                date_preset=effective_preset if not effective_time_range else None,
                time_range=effective_time_range,
                level="account",
                filtering=[{"field": "adset.id", "operator": "IN", "value": adset_ids}] if adset_ids else None,
                client=client,
            )
            row = rows[0] if rows else {}
        except (httpx.HTTPStatusError, httpx.RequestError):
            row = {}

        return {
            "page_id": page_id,
            "name": page_info.get("name", page_id),
            "category": page_info.get("category", ""),
            "spend": float(row.get("spend", 0) or 0),
            "impressions": int(row.get("impressions", 0) or 0),
            "date_preset": effective_preset,
        }

    async with httpx.AsyncClient(timeout=30.0) as shared_client:
        pages_data = list(await asyncio.gather(*[_fetch_page_data(pid, shared_client) for pid in page_ids]))

    # 4. Sort by spend DESC
    sorted_pages = sorted(pages_data, key=lambda p: p["spend"], reverse=True)

    result = {"data": sorted_pages, "date_preset": effective_preset}

    # 5. Store in cache
    set_cache(settings.duckdb_path, cache_key, result)

    return result


# ---------------------------------------------------------------------------
# Helpers for sub-endpoints
# ---------------------------------------------------------------------------

async def _get_adset_ids_for_page(
    base: str,
    access_token: str,
    account_id: str,
    page_id: str,
    settings: Settings,
) -> list[str]:
    """Fetch (and cache) the adset IDs that promote a given page_id."""
    cache_key = _make_cache_key(account_id, "adset_ids_for_page", page_id=page_id)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached.get("ids", [])
    adsets = await fetch_graph_edge_all_pages(
        base_url=base,
        access_token=access_token,
        path=f"{account_id}/adsets",
        fields="id,promoted_object",
    )
    ids = [
        a["id"]
        for a in adsets
        if a.get("id") and (a.get("promoted_object") or {}).get("page_id") == page_id
    ]
    set_cache(settings.duckdb_path, cache_key, {"ids": ids})
    return ids


def _page_filtering(
    adset_ids: list[str],
    campaign_id: str = "",
    adset_id: str = "",
    ad_id: str = "",
) -> list[dict]:
    """Build insights filtering from resolved adset IDs + optional cascade filter."""
    if ad_id.strip():
        return [{"field": "ad.id", "operator": "IN", "value": [ad_id.strip()]}]
    if adset_id.strip():
        return [{"field": "adset.id", "operator": "IN", "value": [adset_id.strip()]}]
    if campaign_id.strip():
        return [{"field": "campaign.id", "operator": "IN", "value": [campaign_id.strip()]}]
    if not adset_ids:
        return []
    return [{"field": "adset.id", "operator": "IN", "value": adset_ids}]


ACTION_GROUPS: dict[str, set[str]] = {
    "mensajeria": {
        "onsite_conversion.total_messaging_connection",
        "messaging_conversation_started_7d",
        "messaging_first_reply",
        "messaging_user_depth_2_message_send",
        "messaging_user_depth_3_message_send",
    },
    "engagement": {
        "post_engagement", "page_engagement", "post_reaction",
        "like", "post_interaction_net", "post_interaction_gross",
    },
    "trafico": {"link_click"},
    "video": {"video_view"},
    "guardados": {"onsite_conversion.post_save", "onsite_conversion.post_net_save"},
}


def _group_actions(rows: list[dict]) -> list[dict]:
    totals: dict[str, float] = {cat: 0.0 for cat in ACTION_GROUPS}
    for row in rows:
        for action in row.get("actions") or []:
            atype = action.get("action_type", "")
            value = float(action.get("value", 0) or 0)
            for cat, types in ACTION_GROUPS.items():
                if atype in types:
                    totals[cat] += value
    return [{"category": cat, "value": totals[cat]} for cat in ACTION_GROUPS]


def _extract_cpa(rows: list[dict]) -> list[dict]:
    """
    Para cada fila (un día), calcula:
      - spend: float
      - cpa: float (cost_per_action_type filtrado por lead/purchase/messaging, primer match)
      - conversions: float (suma de actions relevantes)
      - revenue: float (suma de action_values por purchase)
      - replied: float (messaging_conversation_replied_7d)
      - depth2: float (onsite_conversion.messaging_user_depth_2_message_send)
    """
    result = []
    CONVERSION_TYPES = {
        "lead", "purchase",
        "onsite_conversion.messaging_conversation_started_7d",
        "offsite_conversion.fb_pixel_lead",
        "offsite_conversion.fb_pixel_purchase",
    }
    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        date = row.get("date_start", "")

        # conversiones
        conversions = 0.0
        replied = 0.0
        depth2 = 0.0
        for a in (row.get("actions") or []):
            at = a.get("action_type", "")
            val = float(a.get("value", 0) or 0)
            if at in CONVERSION_TYPES:
                conversions += val
            if at == "onsite_conversion.messaging_conversation_replied_7d":
                replied += val
            if at == "onsite_conversion.messaging_user_depth_2_message_send":
                depth2 += val

        # CPA
        cpa = 0.0
        for a in (row.get("cost_per_action_type") or []):
            if a.get("action_type") in CONVERSION_TYPES:
                cpa = float(a.get("value", 0) or 0)
                break
        if cpa == 0.0 and conversions > 0:
            cpa = round(spend / conversions, 2)

        # revenue
        revenue = 0.0
        for a in (row.get("action_values") or []):
            if a.get("action_type") == "purchase":
                revenue += float(a.get("value", 0) or 0)

        result.append({
            "date": date,
            "spend": round(spend, 2),
            "cpa": round(cpa, 2),
            "conversions": round(conversions, 0),
            "revenue": round(revenue, 2),
            "replied": round(replied, 0),
            "depth2": round(depth2, 0),
        })
    return result


RANKING_ORDER = {
    "ABOVE_AVERAGE": 0,
    "AVERAGE": 1,
    "BELOW_AVERAGE_20": 2,
    "BELOW_AVERAGE_10": 3,
    "BELOW_AVERAGE_5": 4,
    "UNKNOWN": 5,
}

def _ranking_label(value: str | None) -> str:
    """Normaliza los valores de ranking de Meta a etiquetas legibles."""
    if not value:
        return "UNKNOWN"
    upper = value.upper()
    return upper if upper in RANKING_ORDER else "UNKNOWN"


# ---------------------------------------------------------------------------
# Task 3: GET /accounts/{id}/pages/{page_id}/insights
# ---------------------------------------------------------------------------

@router.get("/{ad_account_id}/pages/{page_id}/insights")
async def get_page_insights(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid, sid, aid = (campaign_id or "").strip(), (adset_id or "").strip(), (ad_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_insights", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid, adset_id=sid, ad_id=aid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset,
                  "campaign_id": cid or None, "adset_id": sid or None, "ad_id": aid or None}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach,frequency,cpm,ctr",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener KPIs de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {"data": rows, "page_id": page_id, "date_preset": effective_preset,
              "campaign_id": cid or None, "adset_id": sid or None, "ad_id": aid or None}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Task 4: GET /accounts/{id}/pages/{page_id}/placements
# ---------------------------------------------------------------------------

@router.get("/{ad_account_id}/pages/{page_id}/placements")
async def get_page_placements(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid, sid, aid = (campaign_id or "").strip(), (adset_id or "").strip(), (ad_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_placements", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid, adset_id=sid, ad_id=aid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset,
                  "breakdowns": ["publisher_platform", "platform_position"]}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering,
            breakdowns=["publisher_platform", "platform_position"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener placements de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {"data": rows, "page_id": page_id, "date_preset": effective_preset,
              "breakdowns": ["publisher_platform", "platform_position"]}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Task 5: GET /accounts/{id}/pages/{page_id}/geo
# ---------------------------------------------------------------------------

@router.get("/{ad_account_id}/pages/{page_id}/geo")
async def get_page_geo(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid, sid, aid = (campaign_id or "").strip(), (adset_id or "").strip(), (ad_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_geo", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid, adset_id=sid, ad_id=aid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset, "breakdowns": ["region"]}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering, breakdowns=["region"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener geo de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    enriched_rows = [enrich_geo_row(row) for row in rows]
    result = {"data": enriched_rows, "page_id": page_id, "date_preset": effective_preset, "breakdowns": ["region"]}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Task 6: GET /accounts/{id}/pages/{page_id}/actions
# ---------------------------------------------------------------------------

@router.get("/{ad_account_id}/pages/{page_id}/actions")
async def get_page_actions(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid, sid, aid = (campaign_id or "").strip(), (adset_id or "").strip(), (ad_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_actions", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid, adset_id=sid, ad_id=aid)
    if not filtering:
        result = {"data": [], "spend": "0", "page_id": page_id, "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,actions",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="ad",
            filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener acciones de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    spend_total = sum(float(r.get("spend", 0) or 0) for r in rows)
    grouped = _group_actions(rows)

    result = {"data": grouped, "spend": str(round(spend_total, 2)),
              "page_id": page_id, "date_preset": effective_preset}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Task 7: GET /accounts/{id}/pages/{page_id}/timeseries
# ---------------------------------------------------------------------------

@router.get("/{ad_account_id}/pages/{page_id}/timeseries")
async def get_page_timeseries(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid, sid, aid = (campaign_id or "").strip(), (adset_id or "").strip(), (ad_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_timeseries", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid, adset_id=sid, ad_id=aid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset, "time_increment": 1}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach,cpm,ctr,cpc",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering, time_increment=1,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener timeseries de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {"data": rows, "page_id": page_id, "date_preset": effective_preset, "time_increment": 1}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


@router.get("/{ad_account_id}/pages/{page_id}/conversion-timeseries")
async def get_page_conversion_timeseries(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Gasto diario + CPA calculado para el gráfico de Rentabilidad."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_conv_ts", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,actions,cost_per_action_type,action_values",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering, time_increment=1,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener datos de conversión.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    processed = _extract_cpa(rows)
    result = {"data": processed, "page_id": page_id, "date_preset": effective_preset}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


@router.get("/{ad_account_id}/pages/{page_id}/traffic-quality")
async def get_page_traffic_quality(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Clics salientes, costo por clic saliente y tasa de conversión clic → landing page."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_traffic_quality", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        result = {
            "outbound_clicks": 0, "cost_per_outbound_click": 0.0,
            "unique_clicks": 0, "unique_ctr": 0.0, "cost_per_unique_click": 0.0,
            "spend": 0.0, "page_id": page_id, "date_preset": effective_preset,
        }
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,outbound_clicks,unique_clicks,unique_ctr,cost_per_unique_click",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener calidad de tráfico.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    total_spend = 0.0
    total_outbound = 0
    total_unique_clicks = 0
    total_impressions = 0

    for row in rows:
        total_spend += float(row.get("spend", 0) or 0)
        total_impressions += int(float(row.get("impressions", 0) or 0))
        total_unique_clicks += int(float(row.get("unique_clicks", 0) or 0))
        for oc in (row.get("outbound_clicks") or []):
            if oc.get("action_type") == "outbound_click":
                total_outbound += int(float(oc.get("value", 0) or 0))

    cost_per_outbound = round(total_spend / total_outbound, 2) if total_outbound > 0 else 0.0
    unique_ctr = round((total_unique_clicks / total_impressions) * 100, 2) if total_impressions > 0 else 0.0
    cost_per_unique_click = round(total_spend / total_unique_clicks, 2) if total_unique_clicks > 0 else 0.0

    result = {
        "outbound_clicks": total_outbound,
        "cost_per_outbound_click": cost_per_outbound,
        "unique_clicks": total_unique_clicks,
        "unique_ctr": unique_ctr,
        "cost_per_unique_click": cost_per_unique_click,
        "spend": round(total_spend, 2),
        "page_id": page_id,
        "date_preset": effective_preset,
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result


@router.get("/{ad_account_id}/pages/{page_id}/ad-diagnostics")
async def get_page_ad_diagnostics(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Top 5 anuncios con diagnósticos de relevancia: quality, engagement y conversion rate ranking."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_ad_diag", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        result = {"data": [], "page_id": page_id, "date_preset": effective_preset}
        set_cache(settings.duckdb_path, cache_key, result)
        return result

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="ad_id,ad_name,impressions,spend,ctr,cpm,actions",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="ad", filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener diagnósticos de anuncios.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    # Ordenar por gasto desc, tomar top 5
    sorted_rows = sorted(rows, key=lambda r: float(r.get("spend", 0) or 0), reverse=True)
    top5 = sorted_rows[:5]

    enriched = []
    for r in top5:
        impressions = int(float(r.get("impressions", 0) or 0))
        post_engagement = sum(
            int(float(a.get("value", 0) or 0))
            for a in (r.get("actions") or [])
            if a.get("action_type") == "post_engagement"
        )
        engagement_rate = round((post_engagement / impressions) * 100, 2) if impressions > 0 else 0.0
        enriched.append({
            "ad_id": r.get("ad_id", ""),
            "ad_name": r.get("ad_name", r.get("ad_id", "")),
            "impressions": impressions,
            "spend": round(float(r.get("spend", 0) or 0), 2),
            "ctr": round(float(r.get("ctr", 0) or 0), 2),
            "cpm": round(float(r.get("cpm", 0) or 0), 2),
            "engagement_rate": engagement_rate,
        })

    result = {"data": enriched, "page_id": page_id, "date_preset": effective_preset}
    set_cache(settings.duckdb_path, cache_key, result)
    return result


@router.get("/{ad_account_id}/pages/{page_id}/funnel")
async def get_page_funnel(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """Embudo de conversión: impresiones → alcance → clics únicos → conversaciones → primeras respuestas."""
    normalized_id = normalize_ad_account_id(ad_account_id)
    effective_preset = date_preset if date_preset else "last_30d"
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    if ds and de:
        effective_time_range = {"since": ds, "until": de}

    cache_key = _make_cache_key(normalized_id, "page_funnel", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    empty = {
        "impressions": 0, "reach": 0, "unique_clicks": 0,
        "outbound_clicks": 0, "conversations_started": 0, "first_replies": 0,
        "page_id": page_id, "date_preset": effective_preset,
    }

    adset_ids = await _get_adset_ids_for_page(base, access_token, normalized_id, page_id, settings)
    filtering = _page_filtering(adset_ids, campaign_id=cid)
    if not filtering:
        set_cache(settings.duckdb_path, cache_key, empty)
        return empty

    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="impressions,reach,unique_clicks,outbound_clicks,actions",
            date_preset=effective_preset if not effective_time_range else None,
            time_range=effective_time_range,
            level="account", filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener datos del embudo.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    total_impressions = 0
    total_reach = 0
    total_unique_clicks = 0
    total_outbound = 0
    total_conversations = 0
    total_first_replies = 0

    for row in rows:
        total_impressions += int(float(row.get("impressions", 0) or 0))
        total_reach += int(float(row.get("reach", 0) or 0))
        total_unique_clicks += int(float(row.get("unique_clicks", 0) or 0))
        for oc in (row.get("outbound_clicks") or []):
            if oc.get("action_type") == "outbound_click":
                total_outbound += int(float(oc.get("value", 0) or 0))
        for a in (row.get("actions") or []):
            at = a.get("action_type", "")
            val = int(float(a.get("value", 0) or 0))
            if at == "onsite_conversion.messaging_conversation_started_7d":
                total_conversations += val
            elif at == "onsite_conversion.messaging_first_reply":
                total_first_replies += val

    result = {
        "impressions": total_impressions,
        "reach": total_reach,
        "unique_clicks": total_unique_clicks,
        "outbound_clicks": total_outbound,
        "conversations_started": total_conversations,
        "first_replies": total_first_replies,
        "page_id": page_id,
        "date_preset": effective_preset,
    }
    set_cache(settings.duckdb_path, cache_key, result)
    return result

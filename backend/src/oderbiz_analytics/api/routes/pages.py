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

    # 2. Extract unique page_ids (skip adsets without page_id)
    page_ids: list[str] = []
    seen: set[str] = set()
    for adset in adsets:
        promoted = adset.get("promoted_object", {})
        pid = promoted.get("page_id") if promoted else None
        if pid and pid not in seen:
            seen.add(pid)
            page_ids.append(pid)

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

        try:
            rows = await fetch_insights(
                base_url=base,
                access_token=access_token,
                ad_account_id=normalized_id,
                fields="spend,impressions",
                date_preset=effective_preset,
                level="account",
                filtering=[
                    {
                        "field": "adset.promoted_object_page_id",
                        "operator": "EQUAL",
                        "value": page_id,
                    }
                ],
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

def _page_filtering(
    page_id: str,
    campaign_id: str = "",
    adset_id: str = "",
    ad_id: str = "",
) -> list[dict]:
    """Filtering list: always by page_id + optional cascade filter."""
    filters: list[dict] = [
        {"field": "adset.promoted_object_page_id", "operator": "EQUAL", "value": page_id}
    ]
    if ad_id.strip():
        filters.append({"field": "ad.id", "operator": "IN", "value": [ad_id.strip()]})
    elif adset_id.strip():
        filters.append({"field": "adset.id", "operator": "IN", "value": [adset_id.strip()]})
    elif campaign_id.strip():
        filters.append({"field": "campaign.id", "operator": "IN", "value": [campaign_id.strip()]})
    return filters


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


# ---------------------------------------------------------------------------
# Task 3: GET /accounts/{id}/pages/{page_id}/insights
# ---------------------------------------------------------------------------

@router.get("/{ad_account_id}/pages/{page_id}/insights")
async def get_page_insights(
    ad_account_id: str,
    page_id: str,
    date_preset: str | None = Query(None),
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

    cache_key = _make_cache_key(normalized_id, "page_insights", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)
    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach,frequency,cpm,ctr",
            date_preset=effective_preset, level="account", filtering=filtering,
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

    cache_key = _make_cache_key(normalized_id, "page_placements", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)
    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach", date_preset=effective_preset,
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

    cache_key = _make_cache_key(normalized_id, "page_geo", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)
    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach", date_preset=effective_preset,
            level="account", filtering=filtering, breakdowns=["region"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener geo de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {"data": rows, "page_id": page_id, "date_preset": effective_preset, "breakdowns": ["region"]}
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

    cache_key = _make_cache_key(normalized_id, "page_actions", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)
    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,actions", date_preset=effective_preset,
            level="ad",  # ad-level to get per-ad actions; adset filter applied via filtering param
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

    cache_key = _make_cache_key(normalized_id, "page_timeseries", page_id=page_id,
        date_preset=effective_preset, campaign_id=cid, adset_id=sid, ad_id=aid)
    cached = get_cache(settings.duckdb_path, cache_key)
    if cached is not None:
        return cached

    filtering = _page_filtering(page_id, campaign_id=cid, adset_id=sid, ad_id=aid)
    try:
        rows = await fetch_insights_all_pages(
            base_url=base, access_token=access_token, ad_account_id=normalized_id,
            fields="spend,impressions,reach", date_preset=effective_preset,
            level="account", filtering=filtering, time_increment=1,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener timeseries de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    result = {"data": rows, "page_id": page_id, "date_preset": effective_preset, "time_increment": 1}
    set_cache(settings.duckdb_path, cache_key, result)
    return result

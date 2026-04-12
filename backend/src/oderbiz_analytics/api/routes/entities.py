"""Routes for campaigns and adsets under an ad account."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["entities"])

CAMPAIGN_FIELDS = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time"
ADSET_FIELDS = "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time"
AD_FIELDS = "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time"


async def _fetch_all_pages(base: str, path: str, params: dict) -> list[dict]:
    items: list[dict] = []
    url = f"{base}/{path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        while url:
            r = await client.get(url, params=params)
            if r.is_error:
                raise httpx.HTTPStatusError(response=r, request=r.request, message=r.text)
            body = r.json()
            items.extend(body.get("data", []))
            url = body.get("paging", {}).get("next")
            params = {}
    return items


@router.get("/{account_id}/campaigns")
async def list_campaigns(
    account_id: str,
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized = normalize_ad_account_id(account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    try:
        data = await _fetch_all_pages(
            base,
            f"{normalized}/campaigns",
            {"fields": CAMPAIGN_FIELDS, "access_token": access_token, "limit": 200},
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener campañas de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None
    return {"data": data}


@router.get("/{account_id}/adsets")
async def list_adsets(
    account_id: str,
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized = normalize_ad_account_id(account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    params: dict = {"fields": ADSET_FIELDS, "access_token": access_token, "limit": 200}
    if campaign_id:
        params["campaign_id"] = campaign_id
    try:
        data = await _fetch_all_pages(base, f"{normalized}/adsets", params)
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener conjuntos de anuncios de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None
    return {"data": data}


@router.get("/{account_id}/ads")
async def list_ads(
    account_id: str,
    adset_id: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    normalized = normalize_ad_account_id(account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    params: dict = {"fields": AD_FIELDS, "access_token": access_token, "limit": 200}
    if adset_id:
        params["adset_id"] = adset_id
    if campaign_id:
        params["campaign_id"] = campaign_id
    try:
        data = await _fetch_all_pages(base, f"{normalized}/ads", params)
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener anuncios de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None
    return {"data": data}

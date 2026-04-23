"""Routes for campaigns/adsets/ads under an ad account."""
from __future__ import annotations

import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.ad_label import (
    format_ad_label,
    format_entity_name,
    infer_ad_label_source,
)

router = APIRouter(prefix="/accounts", tags=["entities"])

CAMPAIGN_FIELDS = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time"
ADSET_FIELDS = "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time"
AD_FIELDS = (
    "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,"
    "creative{id,name,title,body,call_to_action_type,object_story_spec,asset_feed_spec,effective_object_story_id}"
)


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
    for row in data:
        row["name"] = format_entity_name(
            kind="Campaña",
            entity_id=row.get("id"),
            name=row.get("name"),
        )
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
        # Graph v25 filtra por entidad usando `filtering` en edges de cuenta.
        params["filtering"] = json.dumps(
            [{"field": "campaign.id", "operator": "IN", "value": [campaign_id]}]
        )
    try:
        data = await _fetch_all_pages(base, f"{normalized}/adsets", params)
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener conjuntos de anuncios de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None
    for row in data:
        row["name"] = format_entity_name(
            kind="Conjunto",
            entity_id=row.get("id"),
            name=row.get("name"),
        )
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
    filtering: list[dict] = []
    if adset_id:
        filtering.append({"field": "adset.id", "operator": "IN", "value": [adset_id]})
    if campaign_id:
        filtering.append({"field": "campaign.id", "operator": "IN", "value": [campaign_id]})
    if filtering:
        params["filtering"] = json.dumps(filtering)
    try:
        data = await _fetch_all_pages(base, f"{normalized}/ads", params)
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener anuncios de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None
    for row in data:
        creative = row.get("creative") if isinstance(row, dict) else {}
        creative_name = creative.get("name") if isinstance(creative, dict) else None
        story_id = (
            creative.get("effective_object_story_id")
            if isinstance(creative, dict)
            else None
        )
        raw_name = row.get("name")
        row["name_source"] = infer_ad_label_source(
            ad_name=raw_name,
            creative_name=creative_name,
            story_id=story_id,
        )
        row["name"] = format_ad_label(
            ad_id=row.get("id"),
            ad_name=raw_name,
            creative_name=creative_name,
            story_id=story_id,
        )
    return {"data": data}

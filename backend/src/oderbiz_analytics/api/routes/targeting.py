from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException

from oderbiz_analytics.adapters.meta.ads_entities import fetch_ad_json, fetch_adset_json
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["targeting"])


@router.get("/{ad_account_id}/ads/{ad_id}/targeting")
async def get_ad_targeting(
    ad_account_id: str,
    ad_id: str,
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Returns the targeting configuration for the given ad.

    Resolves ad → adset → targeting via two Meta Graph API calls.
    """
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    try:
        ad_data = await fetch_ad_json(
            base_url=base,
            access_token=access_token,
            ad_id=ad_id,
            fields="adset_id",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener el anuncio.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    adset_id = ad_data.get("adset_id")
    if not adset_id:
        raise HTTPException(
            status_code=404,
            detail=f"El anuncio {ad_id} no tiene adset_id asociado.",
        )

    try:
        adset_data = await fetch_adset_json(
            base_url=base,
            access_token=access_token,
            adset_id=adset_id,
            fields="targeting",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener el adset.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    return {"targeting": adset_data.get("targeting", {})}

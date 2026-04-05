# backend/src/oderbiz_analytics/api/routes/ads_ranking.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["ads_ranking"])

RANKING_FIELDS = "ad_id,ad_name,campaign_name,impressions,clicks,spend,reach,frequency,cpm,cpp,ctr"


def _normalize_ad_account_id(ad_account_id: str) -> str:
    aid = ad_account_id.strip()
    if aid.startswith("act_"):
        return aid
    if aid.isdigit():
        return f"act_{aid}"
    return aid


@router.get("/{ad_account_id}/ads/performance")
async def get_ads_performance(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Ad-level insights for ranking/performance analysis.

    - If both `date_start` and `date_stop` are provided, uses `time_range`.
    - Otherwise uses `date_preset` (defaults to "last_30d" if none provided).
    """
    normalized_id = _normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=RANKING_FIELDS,
            level="ad",
            date_preset=effective_preset,
            time_range=use_time_range,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener insights.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    return {
        "data": rows,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }

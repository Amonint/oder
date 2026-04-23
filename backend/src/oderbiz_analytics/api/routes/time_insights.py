from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights, fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["time_insights"])

TIME_FIELDS = (
    "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,"
    "action_values,purchase_roas,website_purchase_roas,mobile_app_purchase_roas"
)

# Códigos UI (p. ej. panel de atribución) → valores que espera `action_attribution_windows` en Graph v25.
_ATTRIB_UI_TO_META: dict[str, str] = {
    "click_1d": "1d_click",
    "click_7d": "7d_click",
    "click_28d": "28d_click",
    "view_1d": "1d_view",
    "view_7d": "7d_view",
}


def _insights_attribution_windows(attribution_window: str | None) -> list[str] | None:
    if not attribution_window:
        return None
    w = attribution_window.strip()
    if w in _ATTRIB_UI_TO_META:
        return [_ATTRIB_UI_TO_META[w]]
    if w in _ATTRIB_UI_TO_META.values():
        return [w]
    return None


@router.get("/{ad_account_id}/insights/time")
async def get_time_insights(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    time_increment: str = Query("1"),
    attribution_window: str | None = Query(
        None,
        description="Ventana de atribución para acciones/valores (p. ej. click_7d → 7d_click en Graph API v25).",
    ),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    if ad_id:
        object_id = ad_id
        level = "ad"
    elif adset_id:
        object_id = adset_id
        level = "adset"
    elif campaign_id:
        object_id = campaign_id
        level = "campaign"
    else:
        object_id = normalize_ad_account_id(ad_account_id)
        level = "account"

    breakdowns: list[str] | None = None
    increment_num: int | str | None = None
    if time_increment == "hourly":
        breakdowns = ["hourly_stats_aggregated_by_advertiser_time_zone"]
    elif time_increment == "monthly":
        increment_num = "monthly"
    else:
        try:
            increment_num = int(time_increment)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail="time_increment debe ser uno de: 1, 7, monthly, hourly.",
            ) from None

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None
    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    attrib = _insights_attribution_windows(attribution_window)
    try:
        if time_increment == "hourly":
            rows = await fetch_insights(
                base_url=base,
                access_token=access_token,
                ad_account_id=object_id,
                fields=TIME_FIELDS,
                level=level,
                date_preset=effective_preset,
                time_range=use_time_range,
                breakdowns=breakdowns,
                time_increment=None,
                action_attribution_windows=attrib,
                limit=500,
            )
        else:
            rows = await fetch_insights_all_pages(
                base_url=base,
                access_token=access_token,
                ad_account_id=object_id,
                fields=TIME_FIELDS,
                level=level,
                date_preset=effective_preset,
                time_range=use_time_range,
                breakdowns=breakdowns,
                time_increment=increment_num,
                action_attribution_windows=attrib,
                limit=500,
                max_pages=100,
            )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener insights de tiempo.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    return {
        "data": rows,
        "time_increment": time_increment,
        "breakdowns": breakdowns or [],
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "attribution_window_requested": attribution_window,
        "attribution_windows_sent": attrib,
    }


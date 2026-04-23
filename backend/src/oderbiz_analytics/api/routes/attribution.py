# backend/src/oderbiz_analytics/api/routes/attribution.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["attribution"])

ATTRIBUTION_FIELDS = "spend,actions,cost_per_action_type,impressions,clicks,reach"

VALID_WINDOWS: dict[str, str] = {
    "click_1d": "1 día tras clic",
    "click_7d": "7 días tras clic",
    "click_28d": "28 días tras clic",
    "view_1d": "1 día tras impresión",
    "view_7d": "7 días tras impresión",
}

WINDOW_TO_META: dict[str, str] = {
    "click_1d": "1d_click",
    "click_7d": "7d_click",
    "click_28d": "28d_click",
    "view_1d": "1d_view",
    "view_7d": "7d_view",
}


@router.get("/{ad_account_id}/insights/attribution")
async def get_attribution_insights(
    ad_account_id: str,
    window: str = Query("click_7d"),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Insights filtrados por ventana de atribución.

    Para comparar ventanas, llama este endpoint múltiples veces con diferentes window params.
    Meta soporta action_attribution_windows via parámetro en la request de Insights.
    """
    if window not in VALID_WINDOWS:
        raise HTTPException(
            status_code=422,
            detail=f"window debe ser uno de: {', '.join(VALID_WINDOWS.keys())}",
        )

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

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    meta_window = WINDOW_TO_META.get(window, window)
    degraded = False
    warning: str | None = None
    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=ATTRIBUTION_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            action_attribution_windows=[meta_window],
        )
    except httpx.HTTPStatusError:
        # Fallback resiliente: si Meta rechaza la ventana explícita, usamos su default
        # para no bloquear toda la pestaña de Atribución.
        try:
            rows = await fetch_insights(
                base_url=base,
                access_token=access_token,
                ad_account_id=object_id,
                fields=ATTRIBUTION_FIELDS,
                level=level,
                date_preset=effective_preset,
                time_range=use_time_range,
                action_attribution_windows=None,
            )
            degraded = True
            warning = (
                "Meta no aceptó la ventana solicitada; se muestran datos con la ventana "
                "predeterminada de Meta."
            )
        except httpx.HTTPStatusError:
            raise HTTPException(
                status_code=502, detail="Error al obtener datos de atribución de Meta."
            ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502, detail="No se pudo contactar a la API de Meta."
        ) from None

    return {
        "data": rows,
        "window": window,
        "window_label": VALID_WINDOWS[window],
        "window_sent_to_meta": meta_window,
        "available_windows": VALID_WINDOWS,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "degraded": degraded,
        "warning": warning,
        "note": "Para comparar ventanas, llama este endpoint múltiples veces con diferentes window params.",
    }

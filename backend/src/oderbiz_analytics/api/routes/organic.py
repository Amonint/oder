# backend/src/oderbiz_analytics/api/routes/organic.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/pages", tags=["organic"])

PAGE_INSIGHT_METRICS = [
    "page_impressions",
    "page_impressions_unique",
    "page_fan_adds",
    "page_fan_removes",
    "page_post_engagements",
    "page_views_total",
    "page_actions_post_reactions_total",
]


@router.get("/{page_id}/organic-insights")
async def get_organic_insights(
    page_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Organic page metrics from Facebook Page Insights API.
    Requires pages_read_engagement permission.
    """
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    metrics_str = ",".join(PAGE_INSIGHT_METRICS)

    params: dict = {
        "metric": metrics_str,
        "period": "day",
        "access_token": access_token,
    }

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    if ds and de:
        params["since"] = ds
        params["until"] = de
    else:
        params["date_preset"] = date_preset

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{base}/{page_id}/insights", params=params)
            r.raise_for_status()
            data = r.json().get("data", [])
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener Page Insights de Meta.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a Meta.") from None

    metrics: dict[str, dict] = {}
    for metric_obj in data:
        name = metric_obj.get("name", "")
        values = metric_obj.get("values", [])
        total = sum(
            v.get("value", 0) if isinstance(v.get("value"), (int, float)) else 0
            for v in values
        )
        daily = [
            {"date": v.get("end_time", "")[:10], "value": v.get("value", 0)}
            for v in values
        ]
        metrics[name] = {"total": total, "daily": daily}

    return {
        "page_id": page_id,
        "date_preset": date_preset,
        "metrics": metrics,
    }

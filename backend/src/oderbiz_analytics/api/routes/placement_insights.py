"""Route for placement (publisher_platform + impression_device) insights."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["placement_insights"])

PLACEMENT_FIELDS = "impressions,clicks,spend,reach,cpm,ctr,cpc,frequency,actions,cost_per_action_type"


@router.get("/{ad_account_id}/insights/placements")
async def get_placement_insights(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    time_increment: int | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos.",
        )

    # Determine object and level
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

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=PLACEMENT_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=["publisher_platform", "platform_position"],
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener insights de plataforma.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    # Calcular % de gasto y CPA derivado por fila
    total_spend = sum(float(r.get("spend", 0) or 0) for r in rows)
    enriched = []
    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        pct_spend = round((spend / total_spend * 100), 1) if total_spend > 0 else 0.0
        cost_per = row.get("cost_per_action_type") or []
        cpa_derived: float | None = None
        if cost_per:
            try:
                cpa_derived = float(cost_per[0].get("value", 0) or 0)
            except (TypeError, ValueError):
                pass
        enriched.append({**row, "pct_spend": pct_spend, "cpa_derived": cpa_derived})

    return {
        "data": enriched,
        "breakdowns": ["publisher_platform", "platform_position"],
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }

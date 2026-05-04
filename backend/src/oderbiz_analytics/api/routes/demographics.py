# backend/src/oderbiz_analytics/api/routes/demographics.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.routes.geo_insights import _extract_results_and_cpa
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["demographics"])

DEMO_FIELDS = "impressions,clicks,spend,reach,cpm,ctr,cpc,actions,cost_per_action_type"

VALID_BREAKDOWNS = {"age", "gender", "age,gender"}


@router.get("/{ad_account_id}/insights/demographics")
async def get_demographics_insights(
    ad_account_id: str,
    breakdown: str = Query("age"),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    objective_metric: str = Query(
        "messaging_conversation_started",
        description="Métrica objetivo para alinear resultados y CPA derivados.",
    ),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Insights segmentados por edad y/o género.

    breakdown="age" — tabla por grupo etario
    breakdown="gender" — tabla por género
    breakdown="age,gender" — cruce edad + género (solo si Meta lo permite sin reach)

    NOTA: reach NO está en DEMO_FIELDS para respetar limitaciones históricas de Meta
    con breakdowns demográficos.
    """
    if breakdown not in VALID_BREAKDOWNS:
        raise HTTPException(
            status_code=422,
            detail=f"breakdown debe ser uno de: {', '.join(sorted(VALID_BREAKDOWNS))}",
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

    breakdowns_list = [b.strip() for b in breakdown.split(",")]

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=DEMO_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=breakdowns_list,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502, detail="Error al obtener insights demográficos de Meta."
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502, detail="No se pudo contactar a la API de Meta."
        ) from None

    enriched_rows = []
    for row in rows:
        enriched = dict(row)
        enriched.update(_extract_results_and_cpa(row, objective_metric=objective_metric))
        enriched_rows.append(enriched)

    return {
        "data": enriched_rows,
        "breakdown": breakdown,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "objective_metric": objective_metric.strip().lower(),
        "note": "reach excluido de este breakdown para respetar limitaciones históricas de Meta.",
    }

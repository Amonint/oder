# backend/src/oderbiz_analytics/api/routes/geo_insights.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.geo_formatter import (
    enrich_geo_row,
    get_geo_metadata,
)

router = APIRouter(prefix="/accounts", tags=["geo_insights"])

GEO_FIELDS = "impressions,clicks,spend,reach"


@router.get("/{ad_account_id}/insights/geo")
async def get_geo_insights(
    ad_account_id: str,
    scope: Literal["account", "ad"] = Query("account"),
    ad_id: str | None = Query(None),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Geographic insights broken down by region.

    Enriquece respuesta con nombres de región legibles (R-3.1) y metadata de cobertura (R-3.2, R-3.4).

    - scope="account": aggregates at account level, object = ad_account_id
    - scope="ad": fetches for a specific ad, requires `ad_id`
    - Supports date_preset or date_start+date_stop (both required together)
    - Returns enriched data with region_name and complete_coverage metadata
    """
    if scope == "ad" and not ad_id:
        raise HTTPException(
            status_code=422,
            detail="ad_id es requerido cuando scope='ad'.",
        )

    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos para usar rango de fechas personalizado.",
        )

    if scope == "account":
        object_id = normalize_ad_account_id(ad_account_id)
        level = "account"
    else:
        object_id = ad_id  # type: ignore[assignment]
        level = "ad"

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
            fields=GEO_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=["region"],
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

    # Enriquecer cada row con nombre de región
    enriched_rows = [enrich_geo_row(row) for row in rows]

    # Metadata de cobertura completa y alcance
    metadata = get_geo_metadata(
        scope=scope,
        ad_id=ad_id if scope == "ad" else None,
        total_rows=len(enriched_rows),
    )

    return {
        "data": enriched_rows,
        "metadata": metadata,
        "scope": scope,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }

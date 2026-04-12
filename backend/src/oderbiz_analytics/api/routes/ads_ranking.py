# backend/src/oderbiz_analytics/api/routes/ads_ranking.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.ad_label import get_ad_label
from oderbiz_analytics.services.insights_aggregate import (
    aggregate_ad_rows,
    summarize_messaging_actions,
)

router = APIRouter(prefix="/accounts", tags=["ads_ranking"])

PERF_FIELDS = (
    "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,"
    "impressions,clicks,spend,reach,frequency,cpm,cpp,ctr,"
    "actions,cost_per_action_type,date_start,date_stop"
)


@router.get("/{ad_account_id}/ads/performance")
async def get_ads_performance(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(
        None, description="Filtra insights por ID de campaña (nivel ad)."
    ),
    adset_id: str | None = Query(
        None, description="Filtra insights por ID de conjunto (nivel ad)."
    ),
    ad_id: str | None = Query(
        None, description="Filtra insights por ID de anuncio (nivel ad)."
    ),
    time_increment: int | None = Query(
        None,
        description="1 = una fila por día y anuncio; omitir = periodo agregado por anuncio.",
    ),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Rendimiento a nivel anuncio: métricas base, `actions`, `cost_per_action_type`, fechas.

    - Paginación completa de Meta (`paging.next`).
    - Si `time_increment=1`, devuelve `aggregated_by_ad` (suma por anuncio) para ranking.
    - `messaging_actions_summary`: suma de action_types de mensajería en todas las filas.
    """
    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos para usar rango de fechas personalizado.",
        )

    normalized_id = normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    filtering: list[dict] | None = None
    aid = (ad_id or "").strip()
    sid = (adset_id or "").strip()
    cid = (campaign_id or "").strip()
    if aid:
        filtering = [{"field": "ad.id", "operator": "IN", "value": [aid]}]
    elif sid:
        filtering = [{"field": "adset.id", "operator": "IN", "value": [sid]}]
    elif cid:
        filtering = [{"field": "campaign.id", "operator": "IN", "value": [cid]}]

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=PERF_FIELDS,
            level="ad",
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=filtering,
            time_increment=time_increment,
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

    messaging_actions_summary = summarize_messaging_actions(rows)

    aggregated_by_ad: list[dict] | None = None
    if time_increment == 1:
        aggregated_by_ad = aggregate_ad_rows(rows)
    else:
        aggregated_by_ad = None

    source_for_labels = aggregated_by_ad if aggregated_by_ad is not None else rows

    enriched_rows = []
    for row in source_for_labels:
        enriched = {**row, "ad_label": get_ad_label(row)}
        enriched_rows.append(enriched)

    return {
        "data": enriched_rows,
        "raw_rows": rows if time_increment == 1 else None,
        "aggregated_by_ad": aggregated_by_ad,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "time_increment": time_increment,
        "messaging_actions_summary": messaging_actions_summary,
    }

# backend/src/oderbiz_analytics/api/routes/ads_ranking.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.graph_edges import fetch_graph_edge_all_pages
from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.ad_label import (
    format_ad_label,
    get_ad_label,
    infer_ad_label_source,
    is_missing_meta_name,
)
from oderbiz_analytics.services.attribution_windows import VALID_UI_WINDOWS, meta_window_list
from oderbiz_analytics.services.insights_aggregate import (
    aggregate_ad_rows,
    summarize_messaging_actions,
)

router = APIRouter(prefix="/accounts", tags=["ads_ranking"])

PERF_FIELDS = (
    "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,"
    "impressions,clicks,unique_clicks,spend,reach,frequency,cpm,cpp,ctr,"
    "cost_per_result,purchase_roas,inline_link_clicks,"
    "actions,action_values,cost_per_action_type,date_start,date_stop"
)

OBJECTIVE_METRIC_TO_ACTION_TYPES = {
    "messaging_conversation_started": [
        "onsite_conversion.messaging_conversation_started_7d"
    ],
    "messaging_first_reply": ["messaging_first_reply"],
    "lead": ["lead", "onsite_conversion.lead_grouped", "leadgen_other"],
}


def _to_float(value: object) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return 0.0


def _sum_purchase_values(action_values: object) -> float:
    total = 0.0
    if not isinstance(action_values, list):
        return total
    for item in action_values:
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("action_type") or "")
        if "purchase" in action_type:
            total += _to_float(item.get("value"))
    return total


def _sum_actions_by_types(actions: object, action_types: list[str]) -> float:
    if not isinstance(actions, list):
        return 0.0
    accepted = set(action_types)
    total = 0.0
    for item in actions:
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("action_type") or "")
        if action_type in accepted:
            total += _to_float(item.get("value"))
    return total


async def _fetch_post_permalinks(
    base: str, access_token: str, story_ids: set[str]
) -> dict[str, str]:
    """Resuelve `permalink_url` de posts para `effective_object_story_id`."""
    if not story_ids:
        return {}
    out: dict[str, str] = {}
    ids = sorted(story_ids)
    chunk_size = 50
    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(0, len(ids), chunk_size):
            chunk = ids[i : i + chunk_size]
            r = await client.get(
                f"{base}/",
                params={
                    "ids": ",".join(chunk),
                    "fields": "permalink_url",
                    "access_token": access_token,
                },
            )
            if r.is_error:
                continue
            body = r.json() if r.content else {}
            if not isinstance(body, dict):
                continue
            for sid in chunk:
                node = body.get(sid)
                if not isinstance(node, dict):
                    continue
                permalink = str(node.get("permalink_url") or "").strip()
                if permalink:
                    out[sid] = permalink
    return out


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
    objective_metric: str = Query(
        "messaging_conversation_started",
        description="Metrica objetivo homogenea para resultados/CPA derivado.",
    ),
    attribution_window: str | None = Query(
        None,
        description=(
            "Ventana de atribución para conteos en actions/cost_per_result; "
            "misma semántica que GET .../insights/attribution?window="
        ),
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

    attrib_param = (attribution_window or "").strip()
    action_windows: list[str] | None = None
    if attrib_param:
        if attrib_param not in VALID_UI_WINDOWS:
            raise HTTPException(
                status_code=422,
                detail=(
                    "attribution_window debe ser uno de: "
                    + ", ".join(sorted(VALID_UI_WINDOWS.keys()))
                ),
            )
        action_windows = meta_window_list(attrib_param)

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
            action_attribution_windows=action_windows,
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

    ad_meta_by_id: dict[str, dict] = {}
    try:
        ads_meta = await fetch_graph_edge_all_pages(
            base_url=base,
            access_token=access_token,
            path=f"{normalized_id}/ads",
            fields="id,name,creative{name,effective_object_story_id}",
        )
        for item in ads_meta:
            ad_meta_by_id[str(item.get("id", ""))] = item
    except Exception:
        # No bloqueamos ranking si este enriquecimiento opcional falla.
        ad_meta_by_id = {}

    story_ids: set[str] = set()
    for item in ad_meta_by_id.values():
        if not isinstance(item, dict):
            continue
        creative = item.get("creative")
        if not isinstance(creative, dict):
            continue
        sid = str(creative.get("effective_object_story_id") or "").strip()
        if sid:
            story_ids.add(sid)
    try:
        story_permalink_by_id = await _fetch_post_permalinks(
            base, access_token, story_ids
        )
    except Exception:
        # No bloqueamos el endpoint si falla el lookup opcional de permalinks.
        story_permalink_by_id = {}

    messaging_actions_summary = summarize_messaging_actions(rows)

    aggregated_by_ad: list[dict] | None = None
    if time_increment == 1:
        aggregated_by_ad = aggregate_ad_rows(rows)
    else:
        aggregated_by_ad = None

    source_for_labels = aggregated_by_ad if aggregated_by_ad is not None else rows

    objective_key = objective_metric.strip().lower()
    if objective_key not in OBJECTIVE_METRIC_TO_ACTION_TYPES:
        objective_key = "messaging_conversation_started"
    objective_action_types = OBJECTIVE_METRIC_TO_ACTION_TYPES[objective_key]

    enriched_rows = []
    for row in source_for_labels:
        ad_id = str(row.get("ad_id", ""))
        ad_meta = ad_meta_by_id.get(ad_id, {})
        ad_name = row.get("ad_name")
        if is_missing_meta_name(ad_name):
            ad_name = ad_meta.get("name") or ad_name
        creative = ad_meta.get("creative") if isinstance(ad_meta, dict) else {}
        creative_name = creative.get("name") if isinstance(creative, dict) else None
        story_id = (
            creative.get("effective_object_story_id")
            if isinstance(creative, dict)
            else None
        )
        story_permalink = (
            story_permalink_by_id.get(str(story_id))
            if story_id is not None
            else None
        )

        spend = _to_float(row.get("spend"))
        results = _sum_actions_by_types(row.get("actions"), objective_action_types)
        cost_per_result = _to_float(row.get("cost_per_result"))
        cpa = cost_per_result if cost_per_result > 0 else (spend / results if results > 0 else None)
        purchase_roas = _to_float(row.get("purchase_roas"))
        roas_derived = (_sum_purchase_values(row.get("action_values")) / spend) if spend > 0 else 0.0
        roas: float | None = None
        if purchase_roas > 0:
            roas = purchase_roas
        elif roas_derived > 0:
            roas = roas_derived
        ad_label_source = infer_ad_label_source(
            ad_name=ad_name,
            creative_name=creative_name,
            story_id=story_id,
        )

        enriched = {
            **row,
            "ad_name": ad_name,
            "creative_name": creative_name,
            "effective_object_story_id": story_id,
            "effective_object_story_permalink": story_permalink,
            "ad_label": format_ad_label(
                ad_id=ad_id,
                ad_name=ad_name,
                creative_name=creative_name,
                story_id=story_id,
            ) if is_missing_meta_name(row.get("ad_name")) else get_ad_label(row),
            "ad_label_source": ad_label_source,
            "results": results,
            "cpa": round(cpa, 4) if cpa is not None else None,
            "roas": round(roas, 4) if roas is not None else None,
        }
        enriched_rows.append(enriched)

    return {
        "data": enriched_rows,
        "raw_rows": rows if time_increment == 1 else None,
        "aggregated_by_ad": aggregated_by_ad,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "time_increment": time_increment,
        "messaging_actions_summary": messaging_actions_summary,
        "objective_metric": objective_key,
        "objective_action_types": objective_action_types,
        "attribution_window": attrib_param or None,
        "attribution_windows_sent": action_windows,
    }

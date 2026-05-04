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

_TRIVIAL_ACTIONS = {"post_engagement", "page_engagement", "photo_view"}
OBJECTIVE_METRIC_TO_ACTION_TYPES = {
    "messaging_conversation_started": [
        "onsite_conversion.messaging_conversation_started_7d",
    ],
    "messaging_first_reply": [
        "messaging_first_reply",
        "onsite_conversion.messaging_first_reply",
    ],
    "lead": ["lead", "onsite_conversion.lead_grouped", "leadgen_other"],
}


def _normalize_objective_metric(objective_metric: str | None) -> str | None:
    if objective_metric is None:
        return None
    key = objective_metric.strip().lower()
    if key in OBJECTIVE_METRIC_TO_ACTION_TYPES:
        return key
    return "messaging_conversation_started"


def _sum_actions_by_types(actions: object, action_types: list[str]) -> float:
    if not isinstance(actions, list):
        return 0.0
    accepted = set(action_types)
    total = 0.0
    for item in actions:
        if not isinstance(item, dict):
            continue
        if str(item.get("action_type") or "") not in accepted:
            continue
        try:
            total += float(item.get("value", 0) or 0)
        except (TypeError, ValueError):
            pass
    return total


def _matching_cost_per_action(cost_per_action_type: object, action_types: list[str]) -> float | None:
    if not isinstance(cost_per_action_type, list):
        return None
    accepted = set(action_types)
    for item in cost_per_action_type:
        if not isinstance(item, dict):
            continue
        if str(item.get("action_type") or "") not in accepted:
            continue
        try:
            value = float(item.get("value", 0) or 0)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return None


def _extract_results_and_cpa(row: dict, objective_metric: str | None = None) -> dict:
    """Extrae resultados y CPA, alineados al objetivo cuando se informa."""
    actions = row.get("actions") or []
    cost_per = row.get("cost_per_action_type") or []
    spend = float(row.get("spend", 0) or 0)
    objective_key = _normalize_objective_metric(objective_metric)

    if objective_key is not None:
        objective_action_types = OBJECTIVE_METRIC_TO_ACTION_TYPES[objective_key]
        results = _sum_actions_by_types(actions, objective_action_types)
        cpa = _matching_cost_per_action(cost_per, objective_action_types)
        if cpa is None and results > 0:
            cpa = spend / results
        return {
            "results": round(results, 2),
            "cpa": round(cpa, 2) if cpa is not None else None,
            "objective_metric": objective_key,
            "objective_action_types": objective_action_types,
        }

    results = 0
    for a in actions:
        action_type = str(a.get("action_type", ""))
        if action_type not in _TRIVIAL_ACTIONS:
            try:
                results = int(float(a.get("value", 0)))
                break
            except (TypeError, ValueError):
                pass

    cpa: float | None = None
    if cost_per:
        try:
            cpa = float(cost_per[0].get("value", 0) or 0)
        except (TypeError, ValueError):
            pass
    if cpa is None and results > 0:
        cpa = spend / results

    return {"results": results, "cpa": round(cpa, 2) if cpa is not None else None}


def _objective_breakdown_status(
    rows: list[dict],
    aggregate_row: dict,
    objective_metric: str | None,
) -> dict[str, object] | None:
    objective_key = _normalize_objective_metric(objective_metric)
    if objective_key is None:
        return None

    aggregate = _extract_results_and_cpa(aggregate_row, objective_metric=objective_key)
    aggregate_results = float(aggregate.get("results") or 0)
    breakdown_results = round(
        sum(float(row.get("results") or 0) for row in rows if row.get("results") is not None),
        2,
    )
    complete = aggregate_results <= 0 or abs(breakdown_results - aggregate_results) <= 0.01
    warning = None
    if not complete:
        warning = (
            "Meta no devolvió resultados del objetivo completos en este breakdown geográfico. "
            "Se ocultan resultados y CPA por región para evitar interpretar ceros como reales."
        )
    return {
        "objective_metric": objective_key,
        "objective_results_total": round(aggregate_results, 2),
        "objective_results_breakdown_total": breakdown_results,
        "objective_breakdown_complete": complete,
        "warning": warning,
    }


def _mask_unavailable_objective_breakdown(rows: list[dict]) -> list[dict]:
    masked: list[dict] = []
    for row in rows:
        item = dict(row)
        item["results"] = None
        item["cpa"] = None
        masked.append(item)
    return masked

GEO_FIELDS = "impressions,clicks,spend,reach,actions,cost_per_action_type"


@router.get("/{ad_account_id}/insights/geo")
async def get_geo_insights(
    ad_account_id: str,
    scope: Literal["account", "ad"] = Query("account"),
    ad_id: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    geo_breakdown: Literal["region", "country"] = Query("region"),
    objective_metric: str | None = Query(
        None,
        description="Métrica objetivo para alinear resultados y CPA derivados.",
    ),
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

    object_id = normalize_ad_account_id(ad_account_id)
    level = "account"
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
            breakdowns=[geo_breakdown],
            filtering=filtering,
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

    # Enriquecer cada row con nombre de región y métricas de eficiencia
    enriched_rows = []
    for row in rows:
        enriched = enrich_geo_row(row) if geo_breakdown == "region" else row
        enriched.update(_extract_results_and_cpa(row, objective_metric=objective_metric))
        enriched_rows.append(enriched)

    objective_status = None
    if objective_metric is not None:
        aggregate_rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=GEO_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=filtering,
        )
        aggregate_row = aggregate_rows[0] if aggregate_rows else {}
        objective_status = _objective_breakdown_status(
            enriched_rows,
            aggregate_row,
            objective_metric=objective_metric,
        )
        if objective_status and not bool(objective_status["objective_breakdown_complete"]):
            enriched_rows = _mask_unavailable_objective_breakdown(enriched_rows)

    # Metadata de cobertura completa y alcance
    metadata = get_geo_metadata(
        scope="ad" if aid else "account",
        ad_id=aid if aid else None,
        total_rows=len(enriched_rows),
        complete_coverage=bool(
            objective_status["objective_breakdown_complete"]
            if objective_status is not None
            else True
        ),
        objective_metric=(
            str(objective_status["objective_metric"]) if objective_status is not None else None
        ),
        objective_results_total=(
            float(objective_status["objective_results_total"])
            if objective_status is not None
            else None
        ),
        objective_results_breakdown_total=(
            float(objective_status["objective_results_breakdown_total"])
            if objective_status is not None
            else None
        ),
        objective_breakdown_complete=(
            bool(objective_status["objective_breakdown_complete"])
            if objective_status is not None
            else None
        ),
        warning=str(objective_status["warning"]) if objective_status and objective_status["warning"] else None,
    )

    return {
        "data": enriched_rows,
        "metadata": metadata,
        "scope": "ad" if aid else "account",
        "geo_breakdown": geo_breakdown,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }

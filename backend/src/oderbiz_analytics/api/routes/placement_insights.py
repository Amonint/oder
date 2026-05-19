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
        action_type = str(item.get("action_type") or "")
        if action_type in accepted:
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
        action_type = str(item.get("action_type") or "")
        if action_type not in accepted:
            continue
        try:
            value = float(item.get("value", 0) or 0)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return None


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
    include_device_breakdowns: bool = Query(False),
    objective_metric: str | None = Query(
        None,
        description="Métrica objetivo para alinear resultados y CPA derivados.",
    ),
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

    breakdowns = ["publisher_platform", "platform_position"]
    if include_device_breakdowns:
        breakdowns.extend(["device_platform", "impression_device"])

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=PLACEMENT_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            breakdowns=breakdowns,
            time_increment=time_increment,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Error al obtener insights de plataforma.") from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

    objective_key = _normalize_objective_metric(objective_metric)
    objective_action_types = (
        OBJECTIVE_METRIC_TO_ACTION_TYPES[objective_key] if objective_key is not None else None
    )

    # Calcular % de gasto y CPA derivado por fila
    total_spend = sum(float(r.get("spend", 0) or 0) for r in rows)
    enriched = []
    for row in rows:
        spend = float(row.get("spend", 0) or 0)
        pct_spend = round((spend / total_spend * 100), 1) if total_spend > 0 else 0.0
        actions = row.get("actions") or []
        cost_per = row.get("cost_per_action_type") or []
        cpa_derived: float | None = None
        results = 0.0
        if objective_action_types is not None:
            results = _sum_actions_by_types(actions, objective_action_types)
            cpa_derived = _matching_cost_per_action(cost_per, objective_action_types)
        else:
            if cost_per:
                try:
                    cpa_derived = float(cost_per[0].get("value", 0) or 0)
                except (TypeError, ValueError):
                    pass
        if cpa_derived is None and results > 0:
            cpa_derived = spend / results
        enriched.append(
            {
                **row,
                "pct_spend": pct_spend,
                "cpa_derived": cpa_derived,
                "results": round(results, 2) if objective_action_types is not None else row.get("results"),
            }
        )

    return {
        "data": enriched,
        "breakdowns": breakdowns,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "time_increment": time_increment,
        "objective_metric": objective_key,
    }

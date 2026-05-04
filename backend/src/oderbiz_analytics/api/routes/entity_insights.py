"""Agregados de insights por campaña o conjunto para decisiones de presupuesto."""
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.attribution_windows import VALID_UI_WINDOWS, meta_window_list

router = APIRouter(prefix="/accounts", tags=["entity_insights"])

ENTITY_FIELDS = (
    "campaign_id,campaign_name,adset_id,adset_name,"
    "impressions,clicks,spend,actions,cost_per_action_type,purchase_roas,action_values"
)

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


@router.get("/{ad_account_id}/insights/entity-summary")
async def get_entity_summary(
    ad_account_id: str,
    level: Literal["campaign", "adset"] = Query(
        "campaign", description="Nivel de agregación en Meta Insights."
    ),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(
        None, description="Filtra por campaña (válido para level=campaign o adset)."
    ),
    adset_id: str | None = Query(None, description="Filtra por conjunto (solo level=adset útil)."),
    objective_metric: str = Query(
        "messaging_conversation_started",
        description="Misma semántica que ads/performance.",
    ),
    attribution_window: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos.",
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
    sid = (adset_id or "").strip()
    cid = (campaign_id or "").strip()
    if sid:
        filtering = [{"field": "adset.id", "operator": "IN", "value": [sid]}]
    elif cid:
        filtering = [{"field": "campaign.id", "operator": "IN", "value": [cid]}]

    objective_key = objective_metric.strip().lower()
    if objective_key not in OBJECTIVE_METRIC_TO_ACTION_TYPES:
        objective_key = "messaging_conversation_started"
    objective_action_types = OBJECTIVE_METRIC_TO_ACTION_TYPES[objective_key]

    attrib_param = (attribution_window or "").strip()
    action_windows: list[str] | None = None
    if attrib_param:
        if attrib_param not in VALID_UI_WINDOWS:
            raise HTTPException(
                status_code=422,
                detail="attribution_window debe ser uno de: "
                + ", ".join(sorted(VALID_UI_WINDOWS.keys())),
            )
        action_windows = meta_window_list(attrib_param)

    try:
        use_local_maximum_filter = effective_preset == "maximum" and use_time_range is None and filtering is not None
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=ENTITY_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=None if use_local_maximum_filter else filtering,
            action_attribution_windows=action_windows,
        )
        if use_local_maximum_filter:
            if sid:
                rows = [row for row in rows if str(row.get("adset_id") or "").strip() == sid]
            elif cid:
                rows = [row for row in rows if str(row.get("campaign_id") or "").strip() == cid]
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

    merged: dict[str, dict] = {}

    def _key(row: dict) -> str:
        if level == "campaign":
            return str(row.get("campaign_id") or row.get("id") or "")
        return str(row.get("adset_id") or row.get("id") or "")

    for row in rows:
        k = _key(row)
        if not k:
            continue
        spend = _to_float(row.get("spend"))
        impressions = int(float(row.get("impressions") or 0))
        clicks = int(float(row.get("clicks") or 0))
        if k not in merged:
            merged[k] = {
                "entity_id": k,
                "name": "",
                "campaign_id": str(row.get("campaign_id") or ""),
                "campaign_name": str(row.get("campaign_name") or ""),
                "adset_id": str(row.get("adset_id") or "") if level == "adset" else "",
                "adset_name": str(row.get("adset_name") or "") if level == "adset" else "",
                "spend": 0.0,
                "impressions": 0,
                "clicks": 0,
                "actions": [],
                "action_values": [],
            }
        m = merged[k]
        m["spend"] += spend
        m["impressions"] += impressions
        m["clicks"] += clicks
        if level == "campaign":
            m["name"] = str(row.get("campaign_name") or m["name"] or k)
        else:
            m["name"] = str(row.get("adset_name") or m["name"] or k)
        # merge actions / action_values naively by summing same types
        for a in row.get("actions") or []:
            if isinstance(a, dict):
                m["actions"].append(dict(a))
        for av in row.get("action_values") or []:
            if isinstance(av, dict):
                m["action_values"].append(dict(av))

    # Re-sum actions per entity from lists (same type keys)
    from collections import defaultdict

    data: list[dict] = []
    for m in merged.values():
        by_t: dict[str, float] = defaultdict(float)
        for a in m["actions"]:
            by_t[str(a.get("action_type"))] += _to_float(a.get("value"))
        merged_actions = [{"action_type": t, "value": str(v)} for t, v in by_t.items()]

        by_v: dict[str, float] = defaultdict(float)
        for av in m["action_values"]:
            by_v[str(av.get("action_type"))] += _to_float(av.get("value"))
        merged_av = [{"action_type": t, "value": str(v)} for t, v in by_v.items()]

        spend = m["spend"]
        results = _sum_actions_by_types(merged_actions, objective_action_types)
        cpa = spend / results if results > 0 else None
        purchase_roas = 0.0  # not aggregated from row list easily; use purchase values
        roas_derived = _sum_purchase_values(merged_av) / spend if spend > 0 else 0.0
        data.append(
            {
                "entity_id": m["entity_id"],
                "name": m["name"],
                "level": level,
                "campaign_id": m["campaign_id"],
                "campaign_name": m["campaign_name"],
                "adset_id": m["adset_id"],
                "adset_name": m["adset_name"],
                "spend": round(spend, 2),
                "impressions": m["impressions"],
                "clicks": m["clicks"],
                "results": results,
                "cpa": round(cpa, 4) if cpa is not None else None,
                "roas": round(roas_derived, 4) if roas_derived > 0 else None,
                "purchase_value": round(_sum_purchase_values(merged_av), 2),
            }
        )

    data.sort(key=lambda r: r["spend"], reverse=True)

    return {
        "data": data,
        "level": level,
        "objective_metric": objective_key,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "attribution_window": attrib_param or None,
        "attribution_windows_sent": action_windows,
    }

# backend/src/oderbiz_analytics/api/routes/leads.py
from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["leads"])

LEADS_FIELDS = "impressions,spend,actions,cost_per_action_type,campaign_id,campaign_name,ad_id,ad_name"

LEAD_ACTION_TYPES = {
    "lead",
    "onsite_conversion.lead_grouped",
    "leadgen_other",
}


def _extract_leads(actions: list[dict]) -> int:
    for a in actions:
        if a.get("action_type") in LEAD_ACTION_TYPES:
            try:
                return int(float(a.get("value", 0)))
            except (TypeError, ValueError):
                pass
    return 0


def _extract_cpa_lead(cost_per_action: list[dict]) -> float | None:
    for a in cost_per_action:
        if a.get("action_type") in LEAD_ACTION_TYPES:
            try:
                return float(a.get("value", 0))
            except (TypeError, ValueError):
                pass
    return None


@router.get("/{ad_account_id}/insights/leads")
async def get_leads_insights(
    ad_account_id: str,
    level: Literal["account", "campaign", "ad"] = Query("campaign"),
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Leads desde Insights (actions con tipo lead/onsite_conversion.lead_grouped).

    Nota: reporta leads desde el píxel/conversiones. Para leads de formularios nativos
    (Lead Ads) se requiere leads_retrieval y un flujo diferente.
    """
    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    object_id = normalize_ad_account_id(ad_account_id)

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    use_time_range: dict[str, str] | None = None
    effective_preset: str | None = None

    if date_start and date_stop:
        use_time_range = {"since": date_start, "until": date_stop}
    else:
        effective_preset = date_preset if date_preset else "last_30d"

    filtering = None
    if campaign_id:
        filtering = [{"field": "campaign_id", "operator": "EQUAL", "value": campaign_id}]

    try:
        rows = await fetch_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=object_id,
            fields=LEADS_FIELDS,
            level=level,
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502, detail="Error al obtener datos de leads de Meta."
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502, detail="No se pudo contactar a la API de Meta."
        ) from None

    enriched = []
    total_leads = 0
    total_spend = 0.0

    for row in rows:
        actions = row.get("actions") or []
        cost_per_action = row.get("cost_per_action_type") or []
        leads = _extract_leads(actions)
        cpa = _extract_cpa_lead(cost_per_action)
        spend = float(row.get("spend", 0) or 0)
        total_leads += leads
        total_spend += spend
        enriched.append({
            **row,
            "leads_insights": leads,
            "cpa_lead": cpa if cpa is not None else (round(spend / leads, 2) if leads > 0 else None),
        })

    return {
        "data": enriched,
        "summary": {
            "total_leads_insights": total_leads,
            "total_spend": round(total_spend, 2),
            "avg_cpa_lead": round(total_spend / total_leads, 2) if total_leads > 0 else None,
        },
        "level": level,
        "date_preset": effective_preset,
        "time_range": use_time_range,
        "note": "leads_insights = leads reportados en Insights. Para formularios nativos se requiere leads_retrieval.",
    }

from __future__ import annotations

from collections import defaultdict
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.graph_edges import fetch_graph_edge_all_pages
from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["audience_insights"])

PERF_FIELDS = (
    "ad_id,adset_id,campaign_id,campaign_name,impressions,clicks,spend,ctr,"
    "actions,cost_per_action_type,date_start,date_stop"
)
VALID_CATEGORIES = {
    "all",
    "interests",
    "behaviors",
    "education_majors",
    "family_statuses",
    "life_events",
    "work_positions",
}
LEAD_ACTION_TYPES = {"lead", "onsite_conversion.lead_grouped", "leadgen_other"}
MESSAGING_ACTION_TYPES = {
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_first_reply",
    "messaging_first_reply",
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


def _sum_actions(actions: object, accepted_types: set[str]) -> float:
    if not isinstance(actions, list):
        return 0.0
    total = 0.0
    for item in actions:
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("action_type") or "").strip()
        if action_type in accepted_types:
            total += _to_float(item.get("value"))
    return total


def _normalize_audience_item(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    audience_id = str(item.get("id") or "").strip()
    audience_name = str(item.get("name") or "").strip()
    if not audience_id and not audience_name:
        return None
    if not audience_name:
        audience_name = audience_id or "Sin nombre"
    return {"id": audience_id, "name": audience_name}


def _extract_audiences_by_category(targeting: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    out: dict[str, list[dict[str, str]]] = defaultdict(list)
    flexible_spec = targeting.get("flexible_spec")
    if not isinstance(flexible_spec, list):
        return out

    for node in flexible_spec:
        if not isinstance(node, dict):
            continue
        for category, values in node.items():
            if not isinstance(values, list):
                continue
            for item in values:
                normalized = _normalize_audience_item(item)
                if normalized is None:
                    continue
                out[str(category)].append(normalized)

    deduped: dict[str, list[dict[str, str]]] = {}
    for category, items in out.items():
        seen: set[tuple[str, str]] = set()
        unique: list[dict[str, str]] = []
        for item in items:
            key = (item["id"], item["name"])
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)
        deduped[category] = unique
    return deduped


@router.get("/{ad_account_id}/insights/audiences")
async def get_audiences_performance(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    ad_id: str | None = Query(None),
    category: str = Query("all"),
    min_spend: float = Query(0.0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos para usar rango de fechas personalizado.",
        )

    category_key = category.strip().lower()
    if category_key not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail=f"category debe ser uno de: {', '.join(sorted(VALID_CATEGORIES))}",
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
    if ad_id:
        filtering = [{"field": "ad.id", "operator": "IN", "value": [ad_id]}]
    elif adset_id:
        filtering = [{"field": "adset.id", "operator": "IN", "value": [adset_id]}]
    elif campaign_id:
        filtering = [{"field": "campaign.id", "operator": "IN", "value": [campaign_id]}]

    try:
        perf_rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=PERF_FIELDS,
            level="ad",
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=filtering,
        )
        adsets = await fetch_graph_edge_all_pages(
            base_url=base,
            access_token=access_token,
            path=f"{normalized_id}/adsets",
            fields="id,targeting",
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener audiencias.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    targeting_by_adset: dict[str, dict[str, Any]] = {}
    for adset in adsets:
        adset_id_value = str(adset.get("id") or "").strip()
        if not adset_id_value:
            continue
        targeting_by_adset[adset_id_value] = (
            adset.get("targeting") if isinstance(adset.get("targeting"), dict) else {}
        )

    audience_acc: dict[tuple[str, str], dict[str, Any]] = {}
    matched_rows = 0

    for row in perf_rows:
        row_adset_id = str(row.get("adset_id") or "").strip()
        targeting = targeting_by_adset.get(row_adset_id, {})
        by_category = _extract_audiences_by_category(targeting)
        selected_categories = (
            [category_key] if category_key != "all" else list(by_category.keys())
        )

        tags: list[tuple[str, str, str]] = []
        for selected in selected_categories:
            for item in by_category.get(selected, []):
                tags.append((selected, item["id"], item["name"]))
        if not tags:
            continue

        matched_rows += 1
        split_factor = float(len(tags))
        impressions = _to_float(row.get("impressions"))
        clicks = _to_float(row.get("clicks"))
        spend = _to_float(row.get("spend"))
        leads = _sum_actions(row.get("actions"), LEAD_ACTION_TYPES)
        conversations = _sum_actions(row.get("actions"), MESSAGING_ACTION_TYPES)
        results = leads if leads > 0 else conversations
        ad_identifier = str(row.get("ad_id") or "").strip()
        campaign_name = str(row.get("campaign_name") or "").strip()

        for aud_category, aud_id, aud_name in tags:
            key = (aud_category, aud_id or aud_name)
            if key not in audience_acc:
                audience_acc[key] = {
                    "category": aud_category,
                    "audience_id": aud_id or None,
                    "audience_name": aud_name,
                    "spend": 0.0,
                    "impressions": 0.0,
                    "clicks": 0.0,
                    "results": 0.0,
                    "leads_insights": 0.0,
                    "conversations_started": 0.0,
                    "ads": set(),
                    "campaigns": set(),
                }
            bucket = audience_acc[key]
            bucket["spend"] += spend / split_factor
            bucket["impressions"] += impressions / split_factor
            bucket["clicks"] += clicks / split_factor
            bucket["results"] += results / split_factor
            bucket["leads_insights"] += leads / split_factor
            bucket["conversations_started"] += conversations / split_factor
            if ad_identifier:
                bucket["ads"].add(ad_identifier)
            if campaign_name:
                bucket["campaigns"].add(campaign_name)

    rows: list[dict[str, Any]] = []
    for bucket in audience_acc.values():
        spend = float(bucket["spend"])
        if spend < min_spend:
            continue
        clicks = float(bucket["clicks"])
        impressions = float(bucket["impressions"])
        results = float(bucket["results"])
        rows.append(
            {
                "category": bucket["category"],
                "audience_id": bucket["audience_id"],
                "audience_name": bucket["audience_name"],
                "spend": round(spend, 2),
                "impressions": int(round(impressions)),
                "clicks": int(round(clicks)),
                "ctr": round((clicks / impressions) * 100, 4) if impressions > 0 else None,
                "results": round(results, 2),
                "leads_insights": round(float(bucket["leads_insights"]), 2),
                "conversations_started": round(float(bucket["conversations_started"]), 2),
                "cpa_like": round(spend / results, 4) if results > 0 else None,
                "ads_count": len(bucket["ads"]),
                "campaigns_count": len(bucket["campaigns"]),
            }
        )

    rows.sort(key=lambda r: (r["results"], r["spend"]), reverse=True)
    top_rows = rows[:limit]

    return {
        "data": top_rows,
        "summary": {
            "rows_considered": len(perf_rows),
            "rows_with_targeting": matched_rows,
            "distinct_audiences": len(rows),
            "total_spend": round(sum(float(r["spend"]) for r in rows), 2),
        },
        "filters": {
            "category": category_key,
            "min_spend": min_spend,
            "limit": limit,
            "date_preset": effective_preset,
            "time_range": use_time_range,
            "campaign_id": campaign_id,
            "adset_id": adset_id,
            "ad_id": ad_id,
        },
        "note": (
            "Distribucion inferida: el rendimiento de cada anuncio se reparte entre sus etiquetas de audiencia "
            "seleccionadas. No representa atribucion causal exacta por interes en Meta."
        ),
    }

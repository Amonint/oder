# backend/src/oderbiz_analytics/api/routes/ad_labels.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.graph_edges import fetch_graph_edge_all_pages
from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["ad-labels"])

AD_INSIGHT_FIELDS = "ad_id,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type"


def _to_float(v: object) -> float:
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return 0.0


def _first_cpa(rows: list[dict]) -> float | None:
    for row in rows:
        for cpa in row.get("cost_per_action_type") or []:
            v = _to_float(cpa.get("value"))
            if v > 0:
                return v
    return None


@router.get("/{ad_account_id}/ads/labels/performance")
async def get_ad_labels_performance(
    ad_account_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Aggregates ad insights by ad label.
    1. Fetches all ads with their adlabels
    2. Fetches insights at ad level for the given period
    3. Groups by label and sums metrics
    """
    normalized_id = normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = {"since": ds, "until": de} if ds and de else None
    effective_preset: str | None = date_preset if not effective_time_range else None

    filtering: list[dict] = []
    cid = (campaign_id or "").strip()
    sid = (adset_id or "").strip()
    if sid:
        filtering = [{"field": "adset.id", "operator": "IN", "value": [sid]}]
    elif cid:
        filtering = [{"field": "campaign.id", "operator": "IN", "value": [cid]}]

    try:
        ads = await fetch_graph_edge_all_pages(
            base_url=base,
            access_token=access_token,
            path=f"{normalized_id}/ads",
            fields="id,name,adlabels",
        )
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=502, detail="Error al obtener ads de Meta.") from exc

    # Build ad → labels map
    ad_labels: dict[str, list[str]] = {}
    for ad in ads:
        labels = [lbl["name"] for lbl in (ad.get("adlabels") or []) if lbl.get("name")]
        ad_labels[ad["id"]] = labels if labels else ["(sin etiqueta)"]

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=AD_INSIGHT_FIELDS,
            date_preset=effective_preset,
            time_range=effective_time_range,
            level="ad",
            filtering=filtering or None,
        )
    except (httpx.HTTPStatusError, httpx.RequestError) as exc:
        raise HTTPException(status_code=502, detail="Error al obtener insights de Meta.") from exc

    # Aggregate by label
    label_totals: dict[str, dict] = {}

    def _get_bucket(label: str) -> dict:
        if label not in label_totals:
            label_totals[label] = {
                "label": label,
                "spend": 0.0,
                "impressions": 0,
                "clicks": 0,
                "_cpa_samples": [],
            }
        return label_totals[label]

    for row in rows:
        ad_id = str(row.get("ad_id", ""))
        labels = ad_labels.get(ad_id, ["(sin etiqueta)"])
        spend = _to_float(row.get("spend"))
        impr = int(_to_float(row.get("impressions")))
        clicks = int(_to_float(row.get("clicks")))
        for label in labels:
            b = _get_bucket(label)
            b["spend"] += spend
            b["impressions"] += impr
            b["clicks"] += clicks
            cpa = _first_cpa([row])
            if cpa is not None:
                b["_cpa_samples"].append(cpa)

    result_rows = []
    for b in sorted(label_totals.values(), key=lambda x: -x["spend"]):
        cpa_samples = b.pop("_cpa_samples")
        b["ctr"] = round(b["clicks"] / b["impressions"] * 100, 2) if b["impressions"] else 0.0
        b["cpm"] = round(b["spend"] / b["impressions"] * 1000, 2) if b["impressions"] else 0.0
        b["cpc"] = round(b["spend"] / b["clicks"], 2) if b["clicks"] else 0.0
        b["cpa"] = round(sum(cpa_samples) / len(cpa_samples), 2) if cpa_samples else None
        result_rows.append(b)

    return {
        "data": result_rows,
        "date_preset": date_preset,
        "time_range": effective_time_range,
        "ad_account_id": normalized_id,
    }

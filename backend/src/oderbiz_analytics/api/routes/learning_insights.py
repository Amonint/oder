"""Gasto por conjunto agrupado por fase de aprendizaje (Meta learning_stage_info)."""
from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["learning_insights"])

ADSET_SPEND_FIELDS = "adset_id,adset_name,campaign_id,campaign_name,spend"

BATCH_CHUNK = 50


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


def _learning_bucket(info: object) -> str:
    if not isinstance(info, dict):
        return "unknown"
    raw = info.get("status") or info.get("learning_stage") or ""
    s = str(raw).strip().upper()
    if not s:
        return "unknown"
    if "LEARNING" in s:
        return "LEARNING"
    if "SUCCESS" in s:
        return "SUCCESS"
    if "FAIL" in s:
        return "FAIL"
    return s


async def _graph_batch_relative(
    client: httpx.AsyncClient,
    base: str,
    access_token: str,
    relative_urls: list[str],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i in range(0, len(relative_urls), BATCH_CHUNK):
        chunk = relative_urls[i : i + BATCH_CHUNK]
        batch_payload = json.dumps([{"method": "GET", "relative_url": url} for url in chunk])
        r = await client.post(
            f"{base.rstrip('/')}/",
            data={"batch": batch_payload, "access_token": access_token},
            timeout=120.0,
        )
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, list):
            continue
        for item in body:
            if isinstance(item, dict):
                out.append(item)
    return out


@router.get("/{ad_account_id}/insights/adsets/learning-summary")
async def get_adsets_learning_summary(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
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

    try:
        rows = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields=ADSET_SPEND_FIELDS,
            level="adset",
            date_preset=effective_preset,
            time_range=use_time_range,
            filtering=filtering,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvió un error al obtener insights de conjuntos.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    merged: dict[str, dict[str, Any]] = {}
    for row in rows:
        aid = str(row.get("adset_id") or row.get("id") or "").strip()
        if not aid:
            continue
        spend = _to_float(row.get("spend"))
        if aid not in merged:
            merged[aid] = {
                "adset_id": aid,
                "adset_name": str(row.get("adset_name") or ""),
                "campaign_id": str(row.get("campaign_id") or ""),
                "campaign_name": str(row.get("campaign_name") or ""),
                "spend": 0.0,
            }
        merged[aid]["spend"] += spend
        if not merged[aid]["adset_name"]:
            merged[aid]["adset_name"] = str(row.get("adset_name") or "")
        if not merged[aid]["campaign_name"]:
            merged[aid]["campaign_name"] = str(row.get("campaign_name") or "")

    adset_ids = sorted(merged.keys())
    learning_by_id: dict[str, str] = {}
    if adset_ids:
        rel_urls = [f"{aid}?fields=learning_stage_info" for aid in adset_ids]
        async with httpx.AsyncClient() as client:
            batch_results = await _graph_batch_relative(client, base, access_token, rel_urls)

        for idx, res in enumerate(batch_results):
            if idx >= len(adset_ids):
                break
            aid = adset_ids[idx]
            code = int(res.get("code") or 0)
            if code != 200:
                learning_by_id[aid] = "unknown"
                continue
            body_raw = res.get("body")
            try:
                parsed = json.loads(body_raw) if isinstance(body_raw, str) else body_raw
            except json.JSONDecodeError:
                learning_by_id[aid] = "unknown"
                continue
            if not isinstance(parsed, dict):
                learning_by_id[aid] = "unknown"
                continue
            learning_by_id[aid] = _learning_bucket(parsed.get("learning_stage_info"))

    by_stage: dict[str, float] = {}
    detail: list[dict[str, Any]] = []
    for aid, m in merged.items():
        stage = learning_by_id.get(aid, "unknown")
        spend = round(float(m["spend"]), 2)
        by_stage[stage] = by_stage.get(stage, 0.0) + spend
        detail.append(
            {
                "adset_id": aid,
                "adset_name": m["adset_name"] or aid,
                "campaign_id": m["campaign_id"],
                "campaign_name": m["campaign_name"],
                "spend": spend,
                "learning_stage": stage,
            }
        )

    detail.sort(key=lambda r: r["spend"], reverse=True)
    chart = [{"stage": k, "spend": round(v, 2)} for k, v in sorted(by_stage.items(), key=lambda x: -x[1])]

    return {
        "by_stage": chart,
        "adsets": detail,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }

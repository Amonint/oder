# backend/src/oderbiz_analytics/api/routes/dashboard.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import (
    fetch_account_insights,
    fetch_insights_all_pages,
)
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.jobs.ingest_daily import FIELDS

router = APIRouter(prefix="/accounts", tags=["dashboard"])

SUMMARY_KEYS = (
    "impressions",
    "clicks",
    "spend",
    "reach",
    "frequency",
    "cpm",
    "cpp",
    "ctr",
)


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


def _action_entries(raw: object) -> list[dict[str, object]]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[dict[str, object]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        at = item.get("action_type")
        v = item.get("value")
        out.append({"action_type": at, "value": _to_float(v)})
    return out


def _build_summary_row(row: dict) -> dict[str, float]:
    return {k: _to_float(row.get(k)) for k in SUMMARY_KEYS}


@router.get("/{ad_account_id}/dashboard")
async def get_account_dashboard(
    ad_account_id: str,
    date_preset: str = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(
        None,
        description="Si se indica, el resumen es solo de esa campaña (Meta level=campaign).",
    ),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Insights para KPIs del resumen: nivel cuenta o una campaña concreta.

    Sin `campaign_id`: agregado de cuenta (`act_*` nivel account).
    Con `campaign_id`: agregado de esa campaña (`level=campaign` + filtering).

    When Graph returns no insight rows, `insights_empty` is true, numeric KPIs in
    `summary` are zero, `actions` / `cost_per_action_type` are empty lists, and
    `date_start` / `date_stop` are null.
    """
    normalized_id = normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    cid = (campaign_id or "").strip()

    ds = (date_start or "").strip()
    de = (date_stop or "").strip()
    effective_time_range: dict[str, str] | None = None
    effective_date_preset: str | None = date_preset
    if ds and de:
        effective_time_range = {"since": ds, "until": de}
        effective_date_preset = None

    try:
        if cid:
            rows = await fetch_insights_all_pages(
                base_url=base,
                access_token=access_token,
                ad_account_id=normalized_id,
                fields=FIELDS,
                level="campaign",
                date_preset=effective_date_preset,
                time_range=effective_time_range,
                filtering=[
                    {"field": "campaign.id", "operator": "IN", "value": [cid]}
                ],
                max_pages=10,
            )
        else:
            rows = await fetch_account_insights(
                base_url=base,
                access_token=access_token,
                ad_account_id=normalized_id,
                date_preset=effective_date_preset,
                time_range=effective_time_range,
                fields=FIELDS,
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

    empty_summary = {k: 0.0 for k in SUMMARY_KEYS}

    if not rows:
        return {
            "ad_account_id": normalized_id,
            "date_preset": date_preset,
            "campaign_id": cid or None,
            "scope": "campaign" if cid else "account",
            "insights_empty": True,
            "summary": empty_summary,
            "actions": [],
            "cost_per_action_type": [],
            "date_start": None,
            "date_stop": None,
        }

    row = rows[0]
    return {
        "ad_account_id": normalized_id,
        "date_preset": date_preset,
        "campaign_id": cid or None,
        "scope": "campaign" if cid else "account",
        "insights_empty": False,
        "summary": _build_summary_row(row),
        "actions": _action_entries(row.get("actions")),
        "cost_per_action_type": _action_entries(row.get("cost_per_action_type")),
        "date_start": row.get("date_start"),
        "date_stop": row.get("date_stop"),
    }

# backend/src/oderbiz_analytics/api/routes/dashboard.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_account_insights
from oderbiz_analytics.api.deps import get_meta_access_token
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


def _normalize_ad_account_id(ad_account_id: str) -> str:
    aid = ad_account_id.strip()
    if aid.startswith("act_"):
        return aid
    if aid.isdigit():
        return f"act_{aid}"
    return aid


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
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Account-level insights for the given `date_preset`.

    When Graph returns no insight rows, `insights_empty` is true, numeric KPIs in
    `summary` are zero, `actions` / `cost_per_action_type` are empty lists, and
    `date_start` / `date_stop` are null.
    """
    normalized_id = _normalize_ad_account_id(ad_account_id)
    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")

    try:
        rows = await fetch_account_insights(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            date_preset=date_preset,
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
        "insights_empty": False,
        "summary": _build_summary_row(row),
        "actions": _action_entries(row.get("actions")),
        "cost_per_action_type": _action_entries(row.get("cost_per_action_type")),
        "date_start": row.get("date_start"),
        "date_stop": row.get("date_stop"),
    }

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.duckdb.manual_data_repo import get_manual_data, init_manual_data_table
from oderbiz_analytics.adapters.meta.insights import fetch_insights_all_pages
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["business_questions"])


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: object) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _to_iso_date(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    s = str(value).strip()
    if not s:
        return None
    if "T" in s:
        return s.split("T", 1)[0]
    if " " in s:
        return s.split(" ", 1)[0]
    return s


@router.get("/{ad_account_id}/business-questions/close-speed")
async def get_close_speed(
    ad_account_id: str,
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(settings.duckdb_path, ad_account_id, campaign_id=campaign_id)
    by_campaign: dict[str, dict[str, object]] = {}
    for row in rows:
        cid = str(row.get("campaign_id") or "unknown")
        entry = by_campaign.setdefault(
            cid,
            {
                "campaign_id": cid,
                "campaign_name": cid,
                "sales_closed": 0,
                "weighted_days": 0.0,
                "days_samples": [],
            },
        )
        sales_closed = _to_int(row.get("sales_closed"))
        days = _to_float(row.get("avg_days_to_close"))
        entry["sales_closed"] = _to_int(entry["sales_closed"]) + sales_closed
        entry["weighted_days"] = _to_float(entry["weighted_days"]) + (sales_closed * days)
        if days > 0:
            samples = entry["days_samples"]
            if isinstance(samples, list):
                samples.append(days)

    data: list[dict[str, object]] = []
    for entry in by_campaign.values():
        sales = _to_int(entry["sales_closed"])
        weighted_days = _to_float(entry["weighted_days"])
        samples = sorted(entry["days_samples"]) if isinstance(entry["days_samples"], list) else []
        median = samples[len(samples) // 2] if samples else 0.0
        p25 = samples[int((len(samples) - 1) * 0.25)] if samples else 0.0
        p75 = samples[int((len(samples) - 1) * 0.75)] if samples else 0.0
        avg_days = (weighted_days / sales) if sales > 0 else 0.0
        data.append(
            {
                "campaign_id": entry["campaign_id"],
                "campaign_name": entry["campaign_name"],
                "sales_closed": sales,
                "avg_days_to_close": round(avg_days, 2),
                "close_days_p25": round(p25, 2),
                "close_days_p50": round(median, 2),
                "close_days_p75": round(p75, 2),
            }
        )
    data.sort(key=lambda r: (r["avg_days_to_close"], -_to_int(r["sales_closed"])))
    return {"data": data}


@router.get("/{ad_account_id}/business-questions/bottleneck")
async def get_bottleneck(
    ad_account_id: str,
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(settings.duckdb_path, ad_account_id, campaign_id=campaign_id)
    totals = defaultdict(float)
    for row in rows:
        totals["useful_messages"] += _to_float(row.get("useful_messages"))
        totals["accepted_leads"] += _to_float(row.get("accepted_leads"))
        totals["quotes_sent"] += _to_float(row.get("quotes_sent"))
        totals["sales_closed"] += _to_float(row.get("sales_closed"))

    steps = [
        ("respuesta", "useful_messages", "accepted_leads"),
        ("calificacion", "accepted_leads", "quotes_sent"),
        ("cierre", "quotes_sent", "sales_closed"),
    ]
    data = []
    for name, src, dst in steps:
        src_v = totals[src]
        dst_v = totals[dst]
        drop_abs = max(src_v - dst_v, 0.0)
        drop_pct = (drop_abs / src_v * 100.0) if src_v > 0 else 0.0
        rate = (dst_v / src_v) if src_v > 0 else 0.0
        data.append(
            {
                "stage": name,
                "from_volume": round(src_v, 2),
                "to_volume": round(dst_v, 2),
                "drop_abs": round(drop_abs, 2),
                "drop_pct": round(drop_pct, 2),
                "conversion_rate": round(rate, 4),
            }
        )
    worst = max(data, key=lambda r: r["drop_pct"]) if data else None
    return {"data": data, "primary_bottleneck": worst["stage"] if worst else None}


@router.get("/{ad_account_id}/business-questions/segment-no-quote")
async def get_segment_no_quote(
    ad_account_id: str,
    threshold: float = Query(0.2, ge=0.0, le=1.0),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(settings.duckdb_path, ad_account_id, campaign_id=campaign_id)
    agg: dict[str, dict[str, float | str]] = {}
    for row in rows:
        segment = str(row.get("segment_key") or "general")
        item = agg.setdefault(
            segment,
            {"segment_key": segment, "accepted_leads": 0.0, "quotes_sent": 0.0},
        )
        item["accepted_leads"] = _to_float(item["accepted_leads"]) + _to_float(row.get("accepted_leads"))
        item["quotes_sent"] = _to_float(item["quotes_sent"]) + _to_float(row.get("quotes_sent"))

    data: list[dict[str, object]] = []
    for item in agg.values():
        accepted = _to_float(item["accepted_leads"])
        quotes = _to_float(item["quotes_sent"])
        quote_rate = (quotes / accepted) if accepted > 0 else 0.0
        no_quote_rate = 1.0 - quote_rate if accepted > 0 else 0.0
        data.append(
            {
                "segment_key": item["segment_key"],
                "accepted_leads": int(accepted),
                "quotes_sent": int(quotes),
                "quote_rate": round(quote_rate, 4),
                "no_quote_rate": round(no_quote_rate, 4),
                "is_misaligned": accepted > 0 and quote_rate < threshold,
            }
        )
    data.sort(key=lambda r: (float(r["quote_rate"]), -int(r["accepted_leads"])))
    return {"data": data, "threshold": threshold}


@router.get("/{ad_account_id}/business-questions/cac-out-of-target")
async def get_cac_out_of_target(
    ad_account_id: str,
    date_preset: str | None = Query("last_30d"),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    if bool(date_start) != bool(date_stop):
        raise HTTPException(
            status_code=422,
            detail="Se requieren date_start y date_stop juntos para usar rango de fechas personalizado.",
        )

    normalized_id = normalize_ad_account_id(ad_account_id)
    init_manual_data_table(settings.duckdb_path)
    manual_rows = get_manual_data(settings.duckdb_path, normalized_id, campaign_id=campaign_id)
    sales_by_campaign: dict[str, float] = defaultdict(float)
    cac_target_by_campaign: dict[str, float] = defaultdict(float)
    for row in manual_rows:
        cid = str(row.get("campaign_id") or "unknown")
        sales_by_campaign[cid] += _to_float(row.get("sales_closed"))
        target = _to_float(row.get("cac_target"))
        if target > 0:
            cac_target_by_campaign[cid] = target

    base = f"https://graph.facebook.com/{settings.meta_graph_version}".rstrip("/")
    filtering = [{"field": "campaign.id", "operator": "IN", "value": [campaign_id]}] if campaign_id else None
    time_range = {"since": date_start, "until": date_stop} if date_start and date_stop else None
    effective_preset = None if time_range else date_preset
    try:
        insights = await fetch_insights_all_pages(
            base_url=base,
            access_token=access_token,
            ad_account_id=normalized_id,
            fields="campaign_id,campaign_name,spend",
            level="campaign",
            date_preset=effective_preset,
            time_range=time_range,
            filtering=filtering,
            max_pages=20,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="La API de Meta devolvio un error al calcular CAC fuera de objetivo.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="No se pudo contactar a la API de Meta.",
        ) from None

    rows = []
    total_spend = 0.0
    outside_spend = 0.0
    for row in insights:
        cid = str(row.get("campaign_id") or "unknown")
        cname = str(row.get("campaign_name") or cid)
        spend = _to_float(row.get("spend"))
        sales = sales_by_campaign.get(cid, 0.0)
        cac_target = cac_target_by_campaign.get(cid, 0.0)
        cac_actual = (spend / sales) if sales > 0 else None
        outside = bool(cac_actual is not None and cac_target > 0 and cac_actual > cac_target)
        total_spend += spend
        if outside:
            outside_spend += spend
        rows.append(
            {
                "campaign_id": cid,
                "campaign_name": cname,
                "spend": round(spend, 2),
                "sales_closed": int(sales),
                "cac_actual": round(cac_actual, 2) if cac_actual is not None else None,
                "cac_target": round(cac_target, 2) if cac_target > 0 else None,
                "is_outside_target": outside,
                "outside_spend": round(spend if outside else 0.0, 2),
            }
        )
    rows.sort(key=lambda r: r["outside_spend"], reverse=True)
    outside_pct = (outside_spend / total_spend * 100.0) if total_spend > 0 else 0.0
    return {
        "data": rows,
        "summary": {
            "total_spend": round(total_spend, 2),
            "outside_spend": round(outside_spend, 2),
            "outside_spend_pct": round(outside_pct, 2),
        },
    }


@router.get("/{ad_account_id}/business-questions/sla-lost-revenue")
async def get_sla_lost_revenue(
    ad_account_id: str,
    alpha: float = Query(0.5, ge=0.0, le=2.0),
    campaign_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(settings.duckdb_path, ad_account_id, campaign_id=campaign_id)
    agg: dict[str, dict[str, float | str]] = {}
    for row in rows:
        cid = str(row.get("campaign_id") or "unknown")
        item = agg.setdefault(
            cid,
            {
                "campaign_id": cid,
                "campaign_name": cid,
                "estimated_revenue": 0.0,
                "avg_first_response_hours_weighted": 0.0,
                "sla_target_hours_weighted": 0.0,
                "weight": 0.0,
            },
        )
        revenue = _to_float(row.get("estimated_revenue"))
        sales = max(_to_float(row.get("sales_closed")), 1.0)
        response_h = _to_float(row.get("avg_first_response_hours"))
        target_h = _to_float(row.get("sla_target_hours"))
        item["estimated_revenue"] = _to_float(item["estimated_revenue"]) + revenue
        item["avg_first_response_hours_weighted"] = _to_float(item["avg_first_response_hours_weighted"]) + (response_h * sales)
        item["sla_target_hours_weighted"] = _to_float(item["sla_target_hours_weighted"]) + (target_h * sales)
        item["weight"] = _to_float(item["weight"]) + sales

    data = []
    total_lost = 0.0
    for item in agg.values():
        weight = _to_float(item["weight"])
        revenue = _to_float(item["estimated_revenue"])
        avg_resp = (_to_float(item["avg_first_response_hours_weighted"]) / weight) if weight > 0 else 0.0
        sla_target = (_to_float(item["sla_target_hours_weighted"]) / weight) if weight > 0 else 0.0
        delay_hours = max(avg_resp - sla_target, 0.0)
        delay_ratio = (delay_hours / sla_target) if sla_target > 0 else 0.0
        lost_ratio = min(delay_ratio * alpha, 1.0)
        lost_rev = revenue * lost_ratio
        total_lost += lost_rev
        data.append(
            {
                "campaign_id": item["campaign_id"],
                "campaign_name": item["campaign_name"],
                "estimated_revenue": round(revenue, 2),
                "avg_first_response_hours": round(avg_resp, 2),
                "sla_target_hours": round(sla_target, 2),
                "delay_hours": round(delay_hours, 2),
                "lost_revenue_est": round(lost_rev, 2),
                "lost_ratio": round(lost_ratio, 4),
            }
        )
    data.sort(key=lambda r: r["lost_revenue_est"], reverse=True)
    return {
        "data": data,
        "summary": {"total_lost_revenue_est": round(total_lost, 2), "alpha": alpha},
    }


def _build_stability_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    by_day: dict[str, dict[str, float]] = {}
    for row in rows:
        d = _to_iso_date(row.get("snapshot_date")) or _to_iso_date(row.get("created_at"))
        if not d:
            continue
        day = by_day.setdefault(
            d,
            {"spend": 0.0, "sales": 0.0, "accepted": 0.0, "quotes": 0.0, "revenue": 0.0},
        )
        day["sales"] += _to_float(row.get("sales_closed"))
        day["accepted"] += _to_float(row.get("accepted_leads"))
        day["quotes"] += _to_float(row.get("quotes_sent"))
        day["revenue"] += _to_float(row.get("estimated_revenue"))
        cac_target = _to_float(row.get("cac_target"))
        if cac_target > 0:
            day["spend"] += cac_target * _to_float(row.get("sales_closed"))

    points: list[dict[str, object]] = []
    for d, vals in sorted(by_day.items()):
        sales = vals["sales"]
        accepted = vals["accepted"]
        spend_proxy = vals["spend"]
        cpa = (spend_proxy / sales) if sales > 0 else 0.0
        close_rate = (sales / accepted) if accepted > 0 else 0.0
        roas = (vals["revenue"] / spend_proxy) if spend_proxy > 0 else 0.0
        points.append(
            {
                "date": d,
                "cac": round(cpa, 4),
                "close_rate": round(close_rate, 4),
                "roas": round(roas, 4),
            }
        )
    return points


def _mean_std(values: list[float]) -> tuple[float, float]:
    if not values:
        return (0.0, 0.0)
    m = sum(values) / len(values)
    if len(values) < 2:
        return (m, 0.0)
    var = sum((v - m) ** 2 for v in values) / len(values)
    return (m, var**0.5)


@router.get("/{ad_account_id}/business-questions/stability")
async def get_account_stability(
    ad_account_id: str,
    campaign_id: str | None = Query(None),
    metric: str = Query("cac", pattern="^(cac|close_rate|roas)$"),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(settings.duckdb_path, ad_account_id, campaign_id=campaign_id)
    points = _build_stability_rows(rows)
    values = [float(p.get(metric, 0.0) or 0.0) for p in points]
    mean, std = _mean_std(values)
    ucl = mean + (2 * std)
    lcl = max(mean - (2 * std), 0.0)
    for p in points:
        v = float(p.get(metric, 0.0) or 0.0)
        p["metric_value"] = round(v, 4)
        p["mean"] = round(mean, 4)
        p["ucl"] = round(ucl, 4)
        p["lcl"] = round(lcl, 4)
        p["is_outlier"] = v > ucl or v < lcl
    cv = (std / mean) if mean > 0 else 0.0
    stability_score = max(0.0, min(100.0, 100.0 - (cv * 100.0)))
    return {
        "metric": metric,
        "data": points,
        "summary": {
            "mean": round(mean, 4),
            "std": round(std, 4),
            "cv": round(cv, 4),
            "stability_score": round(stability_score, 2),
        },
    }


@router.get("/{ad_account_id}/pages/{page_id}/business-questions/stability")
async def get_page_stability(
    ad_account_id: str,
    page_id: str,
    campaign_id: str | None = Query(None),
    metric: str = Query("cac", pattern="^(cac|close_rate|roas)$"),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(
        settings.duckdb_path,
        ad_account_id,
        campaign_id=campaign_id,
        page_id=page_id,
    )
    points = _build_stability_rows(rows)
    values = [float(p.get(metric, 0.0) or 0.0) for p in points]
    mean, std = _mean_std(values)
    ucl = mean + (2 * std)
    lcl = max(mean - (2 * std), 0.0)
    for p in points:
        v = float(p.get(metric, 0.0) or 0.0)
        p["metric_value"] = round(v, 4)
        p["mean"] = round(mean, 4)
        p["ucl"] = round(ucl, 4)
        p["lcl"] = round(lcl, 4)
        p["is_outlier"] = v > ucl or v < lcl
    cv = (std / mean) if mean > 0 else 0.0
    stability_score = max(0.0, min(100.0, 100.0 - (cv * 100.0)))
    return {
        "metric": metric,
        "page_id": page_id,
        "data": points,
        "summary": {
            "mean": round(mean, 4),
            "std": round(std, 4),
            "cv": round(cv, 4),
            "stability_score": round(stability_score, 2),
        },
    }


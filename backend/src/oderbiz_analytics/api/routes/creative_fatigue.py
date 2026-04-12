# backend/src/oderbiz_analytics/api/routes/creative_fatigue.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.insights import fetch_insights
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.api.utils import normalize_ad_account_id
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["creative_fatigue"])

FATIGUE_FIELDS = "ad_id,ad_name,impressions,frequency,spend,ctr,actions,cost_per_action_type,reach"


def _compute_fatigue_score(frequency: float, ctr: float) -> tuple[int, str]:
    """
    Score de fatiga 0-100. Mayor score = más fatigado.

    - Frecuencia: normalizada sobre umbral 7.0
    - CTR: invertido — CTR bajo penaliza
    - Score >= 70: fatigado
    - Score 40-69: vigilar
    - Score < 40: saludable
    """
    freq_score = min(frequency / 7.0, 1.0) * 60
    ctr_norm = min(ctr / 2.0, 1.0)
    ctr_penalty = (1.0 - ctr_norm) * 40
    score = int(freq_score + ctr_penalty)
    score = max(0, min(100, score))

    if score >= 70:
        status = "fatigued"
    elif score >= 40:
        status = "watch"
    else:
        status = "healthy"

    return score, status


def _extract_first_action_value(actions: list[dict]) -> float:
    if not actions:
        return 0.0
    try:
        return float(actions[0].get("value", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _extract_cpa(cost_per_action: list[dict]) -> float | None:
    if not cost_per_action:
        return None
    try:
        return float(cost_per_action[0].get("value", 0) or 0)
    except (TypeError, ValueError):
        return None


@router.get("/{ad_account_id}/insights/creative-fatigue")
async def get_creative_fatigue(
    ad_account_id: str,
    date_preset: str | None = Query(None),
    date_start: str | None = Query(None),
    date_stop: str | None = Query(None),
    campaign_id: str | None = Query(None),
    adset_id: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Diagnóstico de fatiga creativa por anuncio.

    Calcula fatigue_score (0-100) y fatigue_status (healthy/watch/fatigued)
    basado en frecuencia y CTR. Genera alertas cuando frecuencia > 5 y CTR < 1%.
    """
    if bool(date_start) != bool(date_stop):
        raise HTTPException(status_code=422, detail="Se requieren date_start y date_stop juntos.")

    if adset_id:
        object_id = adset_id
    elif campaign_id:
        object_id = campaign_id
    else:
        object_id = normalize_ad_account_id(ad_account_id)

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
            fields=FATIGUE_FIELDS,
            level="ad",
            date_preset=effective_preset,
            time_range=use_time_range,
        )
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502, detail="Error al obtener datos de fatiga de Meta."
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=502, detail="No se pudo contactar a la API de Meta."
        ) from None

    enriched = []
    alerts = []

    for row in rows:
        frequency = float(row.get("frequency", 0) or 0)
        ctr = float(row.get("ctr", 0) or 0)
        spend = float(row.get("spend", 0) or 0)
        impressions = int(float(row.get("impressions", 0) or 0))
        actions = row.get("actions") or []
        cost_per_action = row.get("cost_per_action_type") or []
        results = _extract_first_action_value(actions)
        cpa = _extract_cpa(cost_per_action)
        score, status = _compute_fatigue_score(frequency, ctr)
        ad_id = row.get("ad_id", "")
        ad_name = row.get("ad_name", "")

        if frequency > 5 and ctr < 1.0:
            alerts.append({
                "ad_id": ad_id,
                "ad_name": ad_name,
                "type": "high_frequency_low_ctr",
                "message": f"Frecuencia {frequency:.1f} con CTR {ctr:.2f}% — posible saturación",
            })

        enriched.append({
            "ad_id": ad_id,
            "ad_name": ad_name,
            "impressions": impressions,
            "frequency": frequency,
            "spend": spend,
            "ctr": ctr,
            "results": results,
            "cpa": cpa,
            "fatigue_score": score,
            "fatigue_status": status,
        })

    enriched.sort(key=lambda r: r["fatigue_score"], reverse=True)

    return {
        "data": enriched,
        "alerts": alerts,
        "date_preset": effective_preset,
        "time_range": use_time_range,
    }

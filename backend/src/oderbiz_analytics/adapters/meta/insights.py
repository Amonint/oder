# backend/src/oderbiz_analytics/adapters/meta/insights.py
from __future__ import annotations

import json
import httpx


async def fetch_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    fields: str,
    date_preset: str | None = None,
    time_range: dict[str, str] | None = None,
    level: str = "account",
    breakdowns: list[str] | None = None,
    filtering: list[dict] | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    own = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=120.0)
    try:
        params: dict = {
            "fields": fields,
            "access_token": access_token,
            "level": level,
        }
        if time_range is not None:
            params["time_range"] = json.dumps(time_range)
        else:
            if date_preset is not None:
                params["date_preset"] = date_preset
        if breakdowns is not None:
            params["breakdowns"] = ",".join(breakdowns)
        if filtering is not None:
            params["filtering"] = json.dumps(filtering)
        r = await client.get(
            f"{base_url.rstrip('/')}/{ad_account_id}/insights",
            params=params,
        )
        r.raise_for_status()
        return r.json().get("data", [])
    finally:
        if own:
            await client.aclose()


async def fetch_account_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    date_preset: str,
    fields: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    return await fetch_insights(
        base_url=base_url,
        access_token=access_token,
        ad_account_id=ad_account_id,
        fields=fields,
        date_preset=date_preset,
        level="account",
        client=client,
    )

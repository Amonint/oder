# backend/src/oderbiz_analytics/adapters/meta/insights.py
from __future__ import annotations

import httpx


async def fetch_account_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    date_preset: str,
    fields: str,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    own = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=120.0)
    try:
        r = await client.get(
            f"{base_url.rstrip('/')}/{ad_account_id}/insights",
            params={
                "date_preset": date_preset,
                "level": "account",
                "fields": fields,
                "access_token": access_token,
            },
        )
        r.raise_for_status()
        return r.json().get("data", [])
    finally:
        if own:
            await client.aclose()

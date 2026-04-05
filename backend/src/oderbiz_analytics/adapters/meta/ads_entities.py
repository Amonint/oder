from __future__ import annotations
import httpx


async def fetch_ad_json(
    base_url: str,
    access_token: str,
    ad_id: str,
    fields: str,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """GET {base_url}/{ad_id}?fields={fields}&access_token={access_token}"""
    own = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=60.0)
    try:
        r = await client.get(
            f"{base_url.rstrip('/')}/{ad_id}",
            params={"fields": fields, "access_token": access_token},
        )
        r.raise_for_status()
        return r.json()
    finally:
        if own:
            await client.aclose()


async def fetch_adset_json(
    base_url: str,
    access_token: str,
    adset_id: str,
    fields: str,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """GET {base_url}/{adset_id}?fields={fields}&access_token={access_token}"""
    own = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=60.0)
    try:
        r = await client.get(
            f"{base_url.rstrip('/')}/{adset_id}",
            params={"fields": fields, "access_token": access_token},
        )
        r.raise_for_status()
        return r.json()
    finally:
        if own:
            await client.aclose()

# backend/src/oderbiz_analytics/adapters/meta/graph_edges.py
"""Helpers for paginating Meta Graph API edges."""
from __future__ import annotations

import httpx


async def fetch_graph_edge_all_pages(
    base_url: str,
    access_token: str,
    path: str,
    fields: str,
) -> list[dict]:
    """
    Fetches all pages of a Graph API edge, following pagination cursors.

    Args:
        base_url: Base URL like "https://graph.facebook.com/v25.0"
        access_token: Meta access token
        path: Edge path, e.g. "act_123/adsets"
        fields: Comma-separated fields to request

    Returns:
        Flat list of all items across all pages.
    """
    url = f"{base_url.rstrip('/')}/{path}"
    params: dict = {
        "fields": fields,
        "access_token": access_token,
        "limit": "500",
    }
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        while url:
            r = await client.get(url, params=params)
            r.raise_for_status()
            body = r.json()
            results.extend(body.get("data", []))
            # Follow cursor-based pagination
            paging = body.get("paging", {})
            next_url = paging.get("next")
            if next_url:
                # Use the next URL directly (it already includes all params)
                url = next_url
                params = {}  # params are embedded in next_url
            else:
                break

    return results

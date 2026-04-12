"""Route for fetching business portfolio (businesses + ad accounts)."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException

from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/businesses", tags=["businesses"])


@router.get("/portfolio")
async def get_business_portfolio(
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
):
    """
    Returns businesses accessible by the token plus their associated ad accounts.
    Falls back gracefully: if /me/businesses returns empty or errors, returns warning.
    """
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            r = await client.get(
                f"{base}/me/businesses",
                params={
                    "fields": "id,name,ad_accounts{id,name,currency}",
                    "access_token": access_token,
                    "limit": 50,
                },
            )
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="No se pudo contactar a la API de Meta.") from None

        if r.is_error:
            # Token sin acceso a businesses — devolver vacío con warning
            return {
                "data": [],
                "warning": "El token no tiene acceso a cuentas de Business Manager.",
            }

        body = r.json()
        businesses = body.get("data", [])

    result = []
    for biz in businesses:
        accounts_data = biz.get("ad_accounts", {}).get("data", [])
        result.append({
            "business_id": biz.get("id"),
            "business_name": biz.get("name"),
            "ad_accounts": accounts_data,
        })

    return {"data": result, "warning": None}

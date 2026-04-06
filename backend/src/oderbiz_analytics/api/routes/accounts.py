# backend/src/oderbiz_analytics/api/routes/accounts.py
from fastapi import APIRouter, Depends, HTTPException

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["accounts"])


def meta_client(
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
) -> MetaGraphClient:
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    return MetaGraphClient(base_url=base, access_token=access_token)


@router.get("")
async def list_accounts(client: MetaGraphClient = Depends(meta_client)):
    try:
        accounts = await client.list_ad_accounts(fields="id,name,account_id,currency")
    except MetaGraphApiError as e:
        out = e.status_code if 400 <= e.status_code < 500 else 502
        raise HTTPException(status_code=out, detail=e.message) from e
    return {"data": [a.model_dump() for a in accounts]}

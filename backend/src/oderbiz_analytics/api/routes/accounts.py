# backend/src/oderbiz_analytics/api/routes/accounts.py
from fastapi import APIRouter, Depends

from oderbiz_analytics.adapters.meta.client import MetaGraphClient
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["accounts"])


def meta_client(settings: Settings = Depends(get_settings)) -> MetaGraphClient:
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    return MetaGraphClient(base_url=base, access_token=settings.meta_access_token)


@router.get("")
async def list_accounts(client: MetaGraphClient = Depends(meta_client)):
    accounts = await client.list_ad_accounts(fields="id,name,account_id,currency")
    return {"data": [a.model_dump() for a in accounts]}

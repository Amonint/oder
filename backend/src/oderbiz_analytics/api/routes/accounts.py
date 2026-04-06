# backend/src/oderbiz_analytics/api/routes/accounts.py
from fastapi import APIRouter, Depends, HTTPException

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
async def list_accounts(client: MetaGraphClient = Depends(get_meta_graph_client)):
    try:
        accounts = await client.list_ad_accounts(fields="id,name,account_id,currency")
    except MetaGraphApiError as e:
        out = e.status_code if 400 <= e.status_code < 500 else 502
        raise HTTPException(status_code=out, detail=e.message) from e
    return {"data": [a.model_dump() for a in accounts]}

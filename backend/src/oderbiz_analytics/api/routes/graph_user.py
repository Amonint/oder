# backend/src/oderbiz_analytics/api/routes/graph_user.py
"""Identidad del token en Graph (/me) — diagnóstico cuando /me/adaccounts viene vacío."""
from fastapi import APIRouter, Depends, HTTPException

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client

router = APIRouter(tags=["meta"])


@router.get("/me")
async def graph_me(client: MetaGraphClient = Depends(get_meta_graph_client)):
    try:
        payload = await client.get_me(fields="id,name")
    except MetaGraphApiError as e:
        out = e.status_code if 400 <= e.status_code < 500 else 502
        raise HTTPException(status_code=out, detail=e.message) from e
    return {"id": payload.get("id"), "name": payload.get("name")}

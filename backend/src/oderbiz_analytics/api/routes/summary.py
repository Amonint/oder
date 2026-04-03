# backend/src/oderbiz_analytics/api/routes/summary.py
from fastapi import APIRouter, Depends

from oderbiz_analytics.adapters.duckdb.client import query_latest_raw
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["summary"])


@router.get("/{ad_account_id}/summary")
def account_summary(ad_account_id: str, settings: Settings = Depends(get_settings)):
    payload_json = query_latest_raw(settings.duckdb_path, ad_account_id)
    return {"data": payload_json}

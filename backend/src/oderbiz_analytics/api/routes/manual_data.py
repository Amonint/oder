from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from oderbiz_analytics.adapters.duckdb.manual_data_repo import (
    get_manual_data,
    init_manual_data_table,
    insert_manual_data,
)
from oderbiz_analytics.api.deps import get_meta_access_token
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["manual_data"])


class ManualDataIn(BaseModel):
    account_id: str
    campaign_id: Optional[str] = None
    ad_id: Optional[str] = None
    useful_messages: int = 0
    accepted_leads: int = 0
    quotes_sent: int = 0
    sales_closed: int = 0
    avg_ticket: float = 0.0
    estimated_revenue: float = 0.0
    snapshot_date: str | None = None
    page_id: Optional[str] = None
    segment_key: str = "general"
    avg_days_to_close: float = 0.0
    sla_target_hours: float = 0.0
    avg_first_response_hours: float = 0.0
    cac_target: float = 0.0
    notes: str = ""


@router.post("/{ad_account_id}/manual-data", status_code=201)
async def save_manual_data(
    ad_account_id: str,
    body: ManualDataIn,
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    if body.account_id != ad_account_id:
        raise HTTPException(
            status_code=422,
            detail="account_id en el body debe coincidir con el URL.",
        )
    init_manual_data_table(settings.duckdb_path)
    saved = insert_manual_data(settings.duckdb_path, body.model_dump())
    return saved


@router.get("/{ad_account_id}/manual-data")
async def get_manual_data_route(
    ad_account_id: str,
    campaign_id: str | None = Query(None),
    page_id: str | None = Query(None),
    segment_key: str | None = Query(None),
    snapshot_date_from: str | None = Query(None),
    snapshot_date_to: str | None = Query(None),
    settings: Settings = Depends(get_settings),
    _token: str = Depends(get_meta_access_token),
):
    init_manual_data_table(settings.duckdb_path)
    rows = get_manual_data(
        settings.duckdb_path,
        ad_account_id,
        campaign_id=campaign_id,
        page_id=page_id,
        segment_key=segment_key,
        snapshot_date_from=snapshot_date_from,
        snapshot_date_to=snapshot_date_to,
    )
    return {"data": rows, "account_id": ad_account_id}

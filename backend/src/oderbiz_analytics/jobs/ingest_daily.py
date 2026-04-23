# backend/src/oderbiz_analytics/jobs/ingest_daily.py
from __future__ import annotations

import asyncio

from oderbiz_analytics.adapters.duckdb.client import init_db, insert_raw_insights_row
from oderbiz_analytics.adapters.meta.client import MetaGraphClient
from oderbiz_analytics.adapters.meta.insights import fetch_account_insights
from oderbiz_analytics.config import get_settings

FIELDS = (
    "impressions,clicks,spend,reach,frequency,cpm,cpp,ctr,"
    "cost_per_result,inline_link_clicks,purchase_roas,"
    "actions,action_values,cost_per_action_type"
)
DATE_PRESET = "last_30d"


async def run_daily_ingest() -> None:
    s = get_settings()
    init_db(s.duckdb_path)
    base = f"https://graph.facebook.com/{s.meta_graph_version}"
    meta = MetaGraphClient(base_url=base, access_token=s.meta_access_token)
    try:
        accounts = await meta.list_ad_accounts(fields="id,name,account_id,currency")
        for acct in accounts:
            rows = await fetch_account_insights(
                base_url=base,
                access_token=s.meta_access_token,
                ad_account_id=acct.id,
                date_preset=DATE_PRESET,
                fields=FIELDS,
            )
            insert_raw_insights_row(
                db_path=s.duckdb_path,
                ad_account_id=acct.id,
                object_id=acct.id,
                level="account",
                date_preset=DATE_PRESET,
                fields=FIELDS,
                payload={"data": rows},
            )
    finally:
        await meta.aclose()


def main() -> None:
    asyncio.run(run_daily_ingest())

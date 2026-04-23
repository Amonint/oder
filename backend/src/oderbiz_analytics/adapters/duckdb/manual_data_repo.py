from __future__ import annotations

import uuid
from datetime import datetime, timezone

import duckdb

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS manual_data (
    id VARCHAR PRIMARY KEY,
    account_id VARCHAR NOT NULL,
    campaign_id VARCHAR,
    ad_id VARCHAR,
    useful_messages INTEGER DEFAULT 0,
    accepted_leads INTEGER DEFAULT 0,
    quotes_sent INTEGER DEFAULT 0,
    sales_closed INTEGER DEFAULT 0,
    avg_ticket DOUBLE DEFAULT 0.0,
    estimated_revenue DOUBLE DEFAULT 0.0,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    page_id VARCHAR,
    segment_key VARCHAR DEFAULT 'general',
    avg_days_to_close DOUBLE DEFAULT 0.0,
    sla_target_hours DOUBLE DEFAULT 0.0,
    avg_first_response_hours DOUBLE DEFAULT 0.0,
    cac_target DOUBLE DEFAULT 0.0,
    notes VARCHAR DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def init_manual_data_table(db_path: str) -> None:
    con = duckdb.connect(db_path)
    try:
        con.execute(SCHEMA_SQL)
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS snapshot_date DATE DEFAULT CURRENT_DATE")
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS page_id VARCHAR")
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS segment_key VARCHAR DEFAULT 'general'")
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS avg_days_to_close DOUBLE DEFAULT 0.0")
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS sla_target_hours DOUBLE DEFAULT 0.0")
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS avg_first_response_hours DOUBLE DEFAULT 0.0")
        con.execute("ALTER TABLE manual_data ADD COLUMN IF NOT EXISTS cac_target DOUBLE DEFAULT 0.0")
    finally:
        con.close()


def insert_manual_data(db_path: str, record: dict) -> dict:
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO manual_data (
                id, account_id, campaign_id, ad_id,
                useful_messages, accepted_leads, quotes_sent, sales_closed,
                avg_ticket, estimated_revenue, snapshot_date, page_id, segment_key,
                avg_days_to_close, sla_target_hours, avg_first_response_hours, cac_target,
                notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                record_id,
                record.get("account_id"),
                record.get("campaign_id"),
                record.get("ad_id"),
                record.get("useful_messages", 0),
                record.get("accepted_leads", 0),
                record.get("quotes_sent", 0),
                record.get("sales_closed", 0),
                record.get("avg_ticket", 0.0),
                record.get("estimated_revenue", 0.0),
                record.get("snapshot_date"),
                record.get("page_id"),
                record.get("segment_key", "general"),
                record.get("avg_days_to_close", 0.0),
                record.get("sla_target_hours", 0.0),
                record.get("avg_first_response_hours", 0.0),
                record.get("cac_target", 0.0),
                record.get("notes", ""),
                now,
                now,
            ],
        )
    finally:
        con.close()
    return {"id": record_id, **record, "created_at": now, "updated_at": now}


def get_manual_data(
    db_path: str,
    account_id: str,
    campaign_id: str | None = None,
    page_id: str | None = None,
    segment_key: str | None = None,
    snapshot_date_from: str | None = None,
    snapshot_date_to: str | None = None,
) -> list[dict]:
    con = duckdb.connect(db_path)
    try:
        query = "SELECT * FROM manual_data WHERE account_id = ?"
        params: list[object] = [account_id]
        if campaign_id:
            query += " AND campaign_id = ?"
            params.append(campaign_id)
        if page_id:
            query += " AND page_id = ?"
            params.append(page_id)
        if segment_key:
            query += " AND segment_key = ?"
            params.append(segment_key)
        if snapshot_date_from:
            query += " AND snapshot_date >= ?"
            params.append(snapshot_date_from)
        if snapshot_date_to:
            query += " AND snapshot_date <= ?"
            params.append(snapshot_date_to)
        query += " ORDER BY snapshot_date DESC, created_at DESC"
        rows = con.execute(query, params).fetchall()
        cols = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    return [dict(zip(cols, row)) for row in rows]

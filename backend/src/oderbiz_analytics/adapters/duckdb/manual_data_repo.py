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
    notes VARCHAR DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def init_manual_data_table(db_path: str) -> None:
    con = duckdb.connect(db_path)
    try:
        con.execute(SCHEMA_SQL)
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
                avg_ticket, estimated_revenue, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                record.get("notes", ""),
                now,
                now,
            ],
        )
    finally:
        con.close()
    return {"id": record_id, **record, "created_at": now, "updated_at": now}


def get_manual_data(db_path: str, account_id: str, campaign_id: str | None = None) -> list[dict]:
    con = duckdb.connect(db_path)
    try:
        if campaign_id:
            rows = con.execute(
                "SELECT * FROM manual_data WHERE account_id = ? AND campaign_id = ? ORDER BY created_at DESC",
                [account_id, campaign_id],
            ).fetchall()
            cols = [d[0] for d in con.description]  # type: ignore[index]
        else:
            rows = con.execute(
                "SELECT * FROM manual_data WHERE account_id = ? ORDER BY created_at DESC",
                [account_id],
            ).fetchall()
            cols = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    return [dict(zip(cols, row)) for row in rows]

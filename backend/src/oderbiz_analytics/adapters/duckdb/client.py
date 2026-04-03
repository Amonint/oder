# backend/src/oderbiz_analytics/adapters/duckdb/client.py
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import duckdb

_SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_meta_insights (
    ingest_id    VARCHAR NOT NULL,
    ad_account_id VARCHAR NOT NULL,
    object_id    VARCHAR NOT NULL,
    level        VARCHAR NOT NULL,
    date_preset  VARCHAR,
    time_range_json VARCHAR,
    fields       VARCHAR,
    payload_json VARCHAR NOT NULL,
    ingested_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS fact_ads_insights_daily (
    ad_account_id VARCHAR NOT NULL,
    ad_id         VARCHAR NOT NULL,
    date_start    DATE NOT NULL,
    date_stop     DATE NOT NULL,
    impressions   BIGINT,
    clicks        BIGINT,
    spend         DECIMAL(12, 2),
    reach         BIGINT,
    actions_json  VARCHAR,
    cost_per_action_json VARCHAR,
    extracted_at  TIMESTAMPTZ NOT NULL
);
"""


def init_db(db_path: str) -> None:
    """Crea las tablas si no existen. Llamar al iniciar la app y el job."""
    con = duckdb.connect(db_path)
    try:
        con.execute(_SCHEMA)
    finally:
        con.close()


def insert_raw_insights_row(
    *,
    db_path: str,
    ad_account_id: str,
    object_id: str,
    level: str,
    date_preset: str | None,
    fields: str,
    payload: dict,
) -> None:
    row = (
        str(uuid.uuid4()),
        ad_account_id,
        object_id,
        level,
        date_preset,
        None,  # time_range_json — reservado para backfill futuro
        fields,
        json.dumps(payload),
        datetime.now(UTC),
    )
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO raw_meta_insights
                (ingest_id, ad_account_id, object_id, level, date_preset,
                 time_range_json, fields, payload_json, ingested_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            row,
        )
    finally:
        con.close()


def query_latest_raw(db_path: str, ad_account_id: str) -> str | None:
    """Retorna el payload_json más reciente para la cuenta o None si no hay datos."""
    con = duckdb.connect(db_path, read_only=True)
    try:
        result = con.execute(
            """
            SELECT payload_json
            FROM raw_meta_insights
            WHERE ad_account_id = ?
            ORDER BY ingested_at DESC
            LIMIT 1
            """,
            [ad_account_id],
        ).fetchone()
    finally:
        con.close()
    return result[0] if result else None

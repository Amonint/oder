# backend/src/oderbiz_analytics/adapters/bq/client.py
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from google.cloud import bigquery


def insert_raw_insights_row(
    *,
    project_id: str,
    dataset: str,
    ad_account_id: str,
    object_id: str,
    level: str,
    date_preset: str | None,
    fields: str,
    payload: dict,
) -> None:
    client = bigquery.Client(project=project_id)
    table = f"{project_id}.{dataset}.raw_meta_insights"
    row = {
        "ingest_id": str(uuid.uuid4()),
        "ad_account_id": ad_account_id,
        "object_id": object_id,
        "level": level,
        "date_preset": date_preset,
        "time_range_json": None,
        "fields": fields,
        "payload_json": json.dumps(payload),
        "ingested_at": datetime.now(UTC).isoformat(),
    }
    errors = client.insert_rows_json(table, [row])
    if errors:
        raise RuntimeError(errors)

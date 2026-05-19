from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import duckdb

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ad_validation_study (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    campaign_id VARCHAR,
    ad_id VARCHAR,
    image_url VARCHAR NOT NULL,
    image_width INTEGER,
    image_height INTEGER,
    aois_json VARCHAR NOT NULL DEFAULT '[]',
    public_token VARCHAR UNIQUE NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'draft',
    heatmap_url VARCHAR,
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS ad_validation_session (
    id VARCHAR PRIMARY KEY,
    study_id VARCHAR NOT NULL,
    participant_id VARCHAR NOT NULL,
    device_type VARCHAR,
    browser VARCHAR,
    calibration_score DOUBLE,
    duration_ms BIGINT,
    session_status VARCHAR NOT NULL DEFAULT 'started',
    gaze_points_json VARCHAR NOT NULL DEFAULT '[]',
    fixations_json VARCHAR NOT NULL DEFAULT '[]',
    blink_events_json VARCHAR NOT NULL DEFAULT '[]',
    face_signals_json VARCHAR NOT NULL DEFAULT '[]',
    created_at VARCHAR NOT NULL,
    updated_at VARCHAR NOT NULL
);
"""


def _json_dumps(value: Any) -> str:
    return json.dumps(value or [], ensure_ascii=True)


def _json_loads(value: str | None) -> Any:
    if value is None or value == "":
        return []
    return json.loads(value)


def _row_to_dict(columns: list[str], row: tuple[Any, ...]) -> dict[str, Any]:
    return dict(zip(columns, row))


def _hydrate_study(row: dict[str, Any]) -> dict[str, Any]:
    row["aois"] = _json_loads(row.pop("aois_json", "[]"))
    return row


def _hydrate_session(row: dict[str, Any]) -> dict[str, Any]:
    row["gaze_points"] = _json_loads(row.pop("gaze_points_json", "[]"))
    row["fixations"] = _json_loads(row.pop("fixations_json", "[]"))
    row["blink_events"] = _json_loads(row.pop("blink_events_json", "[]"))
    row["face_signals"] = _json_loads(row.pop("face_signals_json", "[]"))
    return row


def init_ad_validation_tables(db_path: str) -> None:
    con = duckdb.connect(db_path)
    try:
        con.execute(_SCHEMA)
        con.execute(
            "ALTER TABLE ad_validation_study ADD COLUMN IF NOT EXISTS aois_json VARCHAR"
        )
        con.execute(
            "ALTER TABLE ad_validation_session ADD COLUMN IF NOT EXISTS duration_ms BIGINT"
        )
    finally:
        con.close()


def create_study(db_path: str, payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "name": payload["name"],
        "campaign_id": payload.get("campaign_id"),
        "ad_id": payload.get("ad_id"),
        "image_url": payload["image_url"],
        "image_width": payload.get("image_width"),
        "image_height": payload.get("image_height"),
        "aois_json": _json_dumps(payload.get("aois")),
        "public_token": uuid.uuid4().hex,
        "status": payload.get("status", "draft"),
        "heatmap_url": payload.get("heatmap_url"),
        "created_at": now,
        "updated_at": now,
    }
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO ad_validation_study
            (id,name,campaign_id,ad_id,image_url,image_width,image_height,aois_json,public_token,status,heatmap_url,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
                row["id"],
                row["name"],
                row["campaign_id"],
                row["ad_id"],
                row["image_url"],
                row["image_width"],
                row["image_height"],
                row["aois_json"],
                row["public_token"],
                row["status"],
                row["heatmap_url"],
                row["created_at"],
                row["updated_at"],
            ],
        )
    finally:
        con.close()
    out = dict(row)
    out["aois"] = _json_loads(out.pop("aois_json", "[]"))
    return out


def list_studies(db_path: str) -> list[dict[str, Any]]:
    con = duckdb.connect(db_path)
    try:
        rows = con.execute(
            "SELECT * FROM ad_validation_study ORDER BY created_at DESC"
        ).fetchall()
        columns = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    return [_hydrate_study(_row_to_dict(columns, row)) for row in rows]


def get_study_by_public_token(db_path: str, public_token: str) -> dict[str, Any] | None:
    con = duckdb.connect(db_path)
    try:
        row = con.execute(
            "SELECT * FROM ad_validation_study WHERE public_token = ? LIMIT 1",
            [public_token],
        ).fetchone()
        columns = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    if row is None:
        return None
    return _hydrate_study(_row_to_dict(columns, row))


def get_study_by_id(db_path: str, study_id: str) -> dict[str, Any] | None:
    con = duckdb.connect(db_path)
    try:
        row = con.execute(
            "SELECT * FROM ad_validation_study WHERE id = ? LIMIT 1",
            [study_id],
        ).fetchone()
        columns = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    if row is None:
        return None
    return _hydrate_study(_row_to_dict(columns, row))


def start_session(db_path: str, payload: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "study_id": payload["study_id"],
        "participant_id": payload["participant_id"],
        "device_type": payload.get("device_type"),
        "browser": payload.get("browser"),
        "calibration_score": float(payload.get("calibration_score", 0.0)),
        "duration_ms": payload.get("duration_ms"),
        "session_status": "started",
        "gaze_points_json": "[]",
        "fixations_json": "[]",
        "blink_events_json": "[]",
        "face_signals_json": "[]",
        "created_at": now,
        "updated_at": now,
    }
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO ad_validation_session
            (id,study_id,participant_id,device_type,browser,calibration_score,duration_ms,session_status,gaze_points_json,fixations_json,blink_events_json,face_signals_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
                row["id"],
                row["study_id"],
                row["participant_id"],
                row["device_type"],
                row["browser"],
                row["calibration_score"],
                row["duration_ms"],
                row["session_status"],
                row["gaze_points_json"],
                row["fixations_json"],
                row["blink_events_json"],
                row["face_signals_json"],
                row["created_at"],
                row["updated_at"],
            ],
        )
    finally:
        con.close()
    return _hydrate_session(dict(row))


def get_session_by_id(db_path: str, session_id: str) -> dict[str, Any] | None:
    con = duckdb.connect(db_path)
    try:
        row = con.execute(
            "SELECT * FROM ad_validation_session WHERE id = ? LIMIT 1",
            [session_id],
        ).fetchone()
        columns = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    if row is None:
        return None
    return _hydrate_session(_row_to_dict(columns, row))


def append_session_events(
    db_path: str,
    session_id: str,
    *,
    gaze_points: list[dict[str, Any]] | None = None,
    fixations: list[dict[str, Any]] | None = None,
    blink_events: list[dict[str, Any]] | None = None,
    face_signals: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    current = get_session_by_id(db_path, session_id)
    if current is None:
        return None

    merged_gaze = [*current["gaze_points"], *(gaze_points or [])]
    merged_fixations = [*current["fixations"], *(fixations or [])]
    merged_blinks = [*current["blink_events"], *(blink_events or [])]
    merged_face = [*current["face_signals"], *(face_signals or [])]
    now = datetime.now(UTC).isoformat()

    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            UPDATE ad_validation_session
            SET gaze_points_json = ?, fixations_json = ?, blink_events_json = ?, face_signals_json = ?, updated_at = ?
            WHERE id = ?
            """,
            [
                _json_dumps(merged_gaze),
                _json_dumps(merged_fixations),
                _json_dumps(merged_blinks),
                _json_dumps(merged_face),
                now,
                session_id,
            ],
        )
    finally:
        con.close()
    return get_session_by_id(db_path, session_id)


def complete_session(
    db_path: str, session_id: str, session_status: str, duration_ms: int | None = None
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            UPDATE ad_validation_session
            SET session_status = ?, duration_ms = COALESCE(?, duration_ms), updated_at = ?
            WHERE id = ?
            """,
            [session_status, duration_ms, now, session_id],
        )
    finally:
        con.close()
    return get_session_by_id(db_path, session_id)


def list_sessions_by_study(db_path: str, study_id: str) -> list[dict[str, Any]]:
    con = duckdb.connect(db_path)
    try:
        rows = con.execute(
            "SELECT * FROM ad_validation_session WHERE study_id = ? ORDER BY created_at ASC",
            [study_id],
        ).fetchall()
        columns = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    return [_hydrate_session(_row_to_dict(columns, row)) for row in rows]


def list_valid_sessions_by_study(db_path: str, study_id: str) -> list[dict[str, Any]]:
    con = duckdb.connect(db_path)
    try:
        rows = con.execute(
            """
            SELECT * FROM ad_validation_session
            WHERE study_id = ? AND session_status = 'completed'
            ORDER BY created_at ASC
            """,
            [study_id],
        ).fetchall()
        columns = [d[0] for d in con.description]  # type: ignore[index]
    finally:
        con.close()
    return [_hydrate_session(_row_to_dict(columns, row)) for row in rows]

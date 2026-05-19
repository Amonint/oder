from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    append_session_events,
    complete_session,
    get_session_by_id,
    get_study_by_public_token,
    start_session,
)
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.eye_tracking_quality import evaluate_session_quality

router = APIRouter(prefix="/ad-validation/public", tags=["ad_validation_public"])


class StartSessionIn(BaseModel):
    participant_id: str = Field(min_length=3)
    device_type: str | None = None
    browser: str | None = None
    calibration_score: float = 0.0


class SessionEventsIn(BaseModel):
    gaze_points: list[dict[str, Any]] = Field(default_factory=list)
    fixations: list[dict[str, Any]] = Field(default_factory=list)
    blink_events: list[dict[str, Any]] = Field(default_factory=list)
    face_signals: list[dict[str, Any]] = Field(default_factory=list)


class CompleteSessionIn(BaseModel):
    duration_ms: int = Field(ge=0)


@router.get("/{public_token}/study")
async def get_study_for_participant(
    public_token: str, settings: Settings = Depends(get_settings)
):
    study = get_study_by_public_token(settings.duckdb_path, public_token)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return {
        "id": study["id"],
        "name": study["name"],
        "image_url": study["image_url"],
        "image_width": study.get("image_width"),
        "image_height": study.get("image_height"),
        "aois": study.get("aois", []),
    }


@router.post("/{public_token}/sessions/start", status_code=201)
async def start_participant_session(
    public_token: str,
    body: StartSessionIn,
    settings: Settings = Depends(get_settings),
):
    study = get_study_by_public_token(settings.duckdb_path, public_token)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    session = start_session(
        settings.duckdb_path,
        {
            "study_id": study["id"],
            **body.model_dump(),
        },
    )
    return {"session_id": session["id"], "study_id": study["id"]}


@router.post("/sessions/{session_id}/events", status_code=202)
async def append_participant_events(
    session_id: str, body: SessionEventsIn, settings: Settings = Depends(get_settings)
):
    row = append_session_events(
        settings.duckdb_path,
        session_id,
        gaze_points=body.gaze_points,
        fixations=body.fixations,
        blink_events=body.blink_events,
        face_signals=body.face_signals,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"accepted": True}


@router.post("/sessions/{session_id}/complete")
async def complete_participant_session(
    session_id: str, body: CompleteSessionIn, settings: Settings = Depends(get_settings)
):
    row = get_session_by_id(settings.duckdb_path, session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    quality = evaluate_session_quality(
        calibration_score=float(row.get("calibration_score") or 0.0),
        gaze_points_count=len(row.get("gaze_points") or []),
        duration_ms=body.duration_ms,
        min_calibration=settings.ad_validation_min_calibration,
        min_points=settings.ad_validation_min_points,
        min_duration_ms=settings.ad_validation_min_duration_ms,
    )
    status = "completed" if quality["is_valid"] else "low_confidence"
    closed = complete_session(
        settings.duckdb_path, session_id, status, duration_ms=body.duration_ms
    )
    if closed is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": closed["id"],
        "session_status": closed["session_status"],
        "quality": quality,
    }

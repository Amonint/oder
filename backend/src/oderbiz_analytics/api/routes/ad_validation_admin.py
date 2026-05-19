from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    create_study,
    get_study_by_id,
    list_sessions_by_study,
    list_studies,
    list_valid_sessions_by_study,
)
from oderbiz_analytics.config import Settings, get_settings
from oderbiz_analytics.services.heatmap_aggregate import build_density_heatmap

router = APIRouter(prefix="/ad-validation", tags=["ad_validation_admin"])


class StudyCreateIn(BaseModel):
    name: str = Field(min_length=3)
    campaign_id: str | None = None
    ad_id: str | None = None
    image_url: str
    image_width: int
    image_height: int
    aois: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/studies", status_code=201)
async def create_study_route(body: StudyCreateIn, settings: Settings = Depends(get_settings)):
    return create_study(settings.duckdb_path, body.model_dump())


@router.get("/studies")
async def list_studies_route(settings: Settings = Depends(get_settings)):
    return {"data": list_studies(settings.duckdb_path)}


@router.get("/studies/{study_id}/dashboard")
async def study_dashboard(study_id: str, settings: Settings = Depends(get_settings)):
    study = get_study_by_id(settings.duckdb_path, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    sessions = list_valid_sessions_by_study(settings.duckdb_path, study_id)
    valid_count = len(sessions)
    if valid_count == 0:
        return {
            "study": study,
            "metrics": {
                "valid_sessions": 0,
                "show_heatmap": False,
                "low_confidence": True,
                "confidence_note": "Sin sesiones válidas",
            },
            "heatmap": None,
        }

    flat_gaze: list[dict[str, Any]] = []
    for row in sessions:
        flat_gaze.extend(row.get("gaze_points", []))

    heatmap = build_density_heatmap(
        flat_gaze,
        aois=study.get("aois", []),
        grid_size=settings.ad_validation_heatmap_grid_size,
        sessions_count=valid_count,
    )
    low_confidence = valid_count < settings.ad_validation_min_valid_sessions
    return {
        "study": study,
        "metrics": {
            "valid_sessions": valid_count,
            "show_heatmap": True,
            "low_confidence": low_confidence,
            "confidence_note": "Muestra pequeña" if low_confidence else "Muestra suficiente",
        },
        "heatmap": heatmap,
    }


@router.get("/studies/{study_id}/export.csv")
async def study_export_csv(study_id: str, settings: Settings = Depends(get_settings)):
    study = get_study_by_id(settings.duckdb_path, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    sessions = list_sessions_by_study(settings.duckdb_path, study_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "session_id",
            "participant_id",
            "session_status",
            "calibration_score",
            "gaze_points_count",
            "fixations_count",
            "blink_events_count",
            "face_signals_count",
            "duration_ms",
            "created_at",
        ]
    )
    for row in sessions:
        writer.writerow(
            [
                row["id"],
                row["participant_id"],
                row["session_status"],
                row.get("calibration_score"),
                len(row.get("gaze_points") or []),
                len(row.get("fixations") or []),
                len(row.get("blink_events") or []),
                len(row.get("face_signals") or []),
                row.get("duration_ms"),
                row.get("created_at"),
            ]
        )
    response = Response(content=output.getvalue(), media_type="text/csv")
    response.headers["Content-Disposition"] = (
        f'attachment; filename="ad-validation-{study_id}.csv"'
    )
    return response

from __future__ import annotations


def evaluate_session_quality(
    *,
    calibration_score: float,
    gaze_points_count: int,
    duration_ms: int,
    min_calibration: float = 0.75,
    min_points: int = 120,
    min_duration_ms: int = 5000,
) -> dict:
    reasons: list[str] = []
    if calibration_score < min_calibration:
        reasons.append("calibration below threshold")
    if gaze_points_count < min_points:
        reasons.append("not enough gaze points")
    if duration_ms < min_duration_ms:
        reasons.append("session duration too short")

    is_valid = len(reasons) == 0
    return {
        "is_valid": is_valid,
        "confidence_label": "sufficient" if is_valid else "low",
        "reasons": reasons,
    }

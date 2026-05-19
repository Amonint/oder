from oderbiz_analytics.services.eye_tracking_quality import evaluate_session_quality


def test_quality_requires_calibration_points_and_duration():
    quality = evaluate_session_quality(
        calibration_score=0.55,
        gaze_points_count=42,
        duration_ms=3500,
    )
    assert quality["is_valid"] is False
    assert "calibration" in quality["reasons"][0]


def test_quality_marks_valid_when_thresholds_met():
    quality = evaluate_session_quality(
        calibration_score=0.86,
        gaze_points_count=220,
        duration_ms=9000,
    )
    assert quality["is_valid"] is True
    assert quality["confidence_label"] == "sufficient"

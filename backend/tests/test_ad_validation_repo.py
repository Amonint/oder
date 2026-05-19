from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    append_session_events,
    complete_session,
    create_study,
    init_ad_validation_tables,
    list_studies,
    start_session,
)


def test_repo_creates_study_and_persists_session_payload(tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    init_ad_validation_tables(db_path)

    study = create_study(
        db_path,
        {
            "name": "Hero creativo mayo",
            "campaign_id": "cmp_01",
            "ad_id": "ad_01",
            "image_url": "https://cdn.example/ad-01.png",
            "image_width": 1080,
            "image_height": 1080,
        },
    )

    assert study["id"]
    assert study["public_token"]

    rows = list_studies(db_path)
    assert len(rows) == 1

    session = start_session(
        db_path,
        {
            "study_id": study["id"],
            "participant_id": "anon-01",
            "device_type": "desktop",
            "browser": "Chrome",
            "calibration_score": 0.82,
        },
    )

    append_session_events(
        db_path,
        session["id"],
        gaze_points=[{"t": 10, "x": 0.51, "y": 0.22, "confidence": 0.9}],
        fixations=[{"t_start": 10, "t_end": 60, "x": 0.5, "y": 0.2}],
        blink_events=[{"t": 35}],
        face_signals=[{"t": 20, "label": "neutral", "score": 0.61}],
    )

    closed = complete_session(db_path, session["id"], "completed")
    assert closed is not None
    assert closed["session_status"] == "completed"

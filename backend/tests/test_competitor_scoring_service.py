from pathlib import Path

from oderbiz_analytics.services.competitor_scoring_service import CompetitorScoringService


def test_save_classification_replaces_same_tuple(tmp_path: Path):
    db = tmp_path / "t.duckdb"
    svc = CompetitorScoringService(db_path=str(db))
    svc.save_classification(
        page_id="p1",
        page_name="N",
        user_page_id="u1",
        relevance_score=10.0,
        is_relevant=False,
        classification_reason="a",
        factors={},
        search_term="q",
        country="EC",
    )
    svc.save_classification(
        page_id="p1",
        page_name="N2",
        user_page_id="u1",
        relevance_score=80.0,
        is_relevant=True,
        classification_reason="b",
        factors={"x": 1},
        search_term="q",
        country="EC",
    )
    import duckdb

    conn = duckdb.connect(str(db))
    try:
        n = conn.execute(
            "SELECT COUNT(*) FROM competitor_classifications WHERE page_id = 'p1'"
        ).fetchone()[0]
        row = conn.execute(
            "SELECT relevance_score, page_name FROM competitor_classifications WHERE page_id = 'p1'"
        ).fetchone()
    finally:
        conn.close()
    assert n == 1
    assert row[0] == 80.0
    assert row[1] == "N2"

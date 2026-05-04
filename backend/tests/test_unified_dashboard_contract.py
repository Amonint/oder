from oderbiz_analytics.api.routes.dashboard import _build_summary_row


def test_summary_contains_new_required_fields() -> None:
    row = {
        "impressions": "100",
        "clicks": "10",
        "spend": "25.4",
        "reach": "70",
        "frequency": "1.4",
        "cpm": "5.2",
        "cpp": "2.3",
        "ctr": "10.0",
        "cost_per_result": "4.1",
    }
    summary = _build_summary_row(row)
    assert "cost_per_result" in summary
    assert summary["cost_per_result"] == 4.1


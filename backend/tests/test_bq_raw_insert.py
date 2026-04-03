# backend/tests/test_bq_raw_insert.py
import json
from unittest.mock import MagicMock, patch

from oderbiz_analytics.adapters.bq.client import insert_raw_insights_row


@patch("oderbiz_analytics.adapters.bq.client.bigquery.Client")
def test_insert_raw_insights_row(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.insert_rows_json.return_value = []  # sin errores
    insert_raw_insights_row(
        project_id="p",
        dataset="d",
        ad_account_id="act_1",
        object_id="act_1",
        level="account",
        date_preset="last_30d",
        fields="spend",
        payload={"data": [{"spend": "1"}]},
    )
    mock_client.insert_rows_json.assert_called_once()
    args, _ = mock_client.insert_rows_json.call_args
    row = args[1][0]
    assert row["ad_account_id"] == "act_1"
    assert json.loads(row["payload_json"])["data"][0]["spend"] == "1"
    assert "ingest_id" in row
    assert "ingested_at" in row


@patch("oderbiz_analytics.adapters.bq.client.bigquery.Client")
def test_insert_raw_raises_on_bq_errors(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.insert_rows_json.return_value = [{"errors": ["some error"]}]
    import pytest
    with pytest.raises(RuntimeError):
        insert_raw_insights_row(
            project_id="p",
            dataset="d",
            ad_account_id="act_1",
            object_id="act_1",
            level="account",
            date_preset=None,
            fields="spend",
            payload={},
        )

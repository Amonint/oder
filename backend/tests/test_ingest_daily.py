# backend/tests/test_ingest_daily.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from oderbiz_analytics.jobs import ingest_daily


@pytest.mark.asyncio
async def test_run_daily_ingest_calls_insert_and_list(monkeypatch):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")

    mock_account = MagicMock()
    mock_account.id = "act_1"
    mock_account.name = "n"
    mock_account.account_id = "1"
    mock_account.currency = "USD"

    with (
        patch("oderbiz_analytics.jobs.ingest_daily.MetaGraphClient") as mc,
        patch(
            "oderbiz_analytics.jobs.ingest_daily.fetch_account_insights",
            new_callable=AsyncMock,
        ) as fi,
        patch("oderbiz_analytics.jobs.ingest_daily.insert_raw_insights_row") as ins,
        patch("oderbiz_analytics.jobs.ingest_daily.init_db") as idb,
    ):
        instance = mc.return_value
        instance.list_ad_accounts = AsyncMock(return_value=[mock_account])
        instance.aclose = AsyncMock()
        fi.return_value = [{"spend": "1"}]

        await ingest_daily.run_daily_ingest()

        idb.assert_called_once()
        ins.assert_called_once()
        call_kwargs = ins.call_args.kwargs
        assert call_kwargs["ad_account_id"] == "act_1"
        assert call_kwargs["level"] == "account"
        assert call_kwargs["date_preset"] == "last_30d"
        assert "db_path" in call_kwargs

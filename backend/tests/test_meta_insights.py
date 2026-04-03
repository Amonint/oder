# backend/tests/test_meta_insights.py
import httpx
import pytest
import respx

from oderbiz_analytics.adapters.meta.insights import fetch_account_insights


@respx.mock
async def test_fetch_account_insights_returns_rows():
    respx.get(
        "https://graph.facebook.com/v25.0/act_111/insights",
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "impressions": "100",
                        "clicks": "5",
                        "spend": "1.23",
                        "date_start": "2026-03-01",
                        "date_stop": "2026-03-31",
                    }
                ]
            },
        )
    )
    rows = await fetch_account_insights(
        base_url="https://graph.facebook.com/v25.0",
        access_token="fake",
        ad_account_id="act_111",
        date_preset="last_30d",
        fields="impressions,clicks,spend",
    )
    assert rows[0]["spend"] == "1.23"
    assert rows[0]["impressions"] == "100"


@respx.mock
async def test_fetch_account_insights_empty():
    respx.get(
        "https://graph.facebook.com/v25.0/act_222/insights",
    ).mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    rows = await fetch_account_insights(
        base_url="https://graph.facebook.com/v25.0",
        access_token="fake",
        ad_account_id="act_222",
        date_preset="last_30d",
        fields="spend",
    )
    assert rows == []

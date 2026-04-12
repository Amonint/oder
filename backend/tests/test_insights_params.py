import respx
import httpx
import pytest
from oderbiz_analytics.adapters.meta.insights import fetch_insights


@pytest.mark.asyncio
@respx.mock
async def test_fetch_insights_passes_level_and_breakdowns():
    route = respx.get("https://graph.facebook.com/v25.0/act_111/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    await fetch_insights(
        base_url="https://graph.facebook.com/v25.0",
        access_token="tok",
        ad_account_id="act_111",
        fields="impressions",
        date_preset="last_7d",
        level="ad",
        breakdowns=["region"],
    )
    assert route.called
    req = route.calls[0].request
    assert "level=ad" in str(req.url)
    assert "breakdowns=region" in str(req.url)


@pytest.mark.asyncio
@respx.mock
async def test_fetch_insights_passes_filtering_json():
    route = respx.get("https://graph.facebook.com/v25.0/act_111/insights").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    await fetch_insights(
        base_url="https://graph.facebook.com/v25.0",
        access_token="tok",
        ad_account_id="act_111",
        fields="impressions",
        date_preset="last_7d",
        level="ad",
        filtering=[{"field": "campaign.id", "operator": "IN", "value": ["999"]}],
    )
    assert route.called
    req = route.calls[0].request
    assert "filtering=" in str(req.url)

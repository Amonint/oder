import httpx
import pytest
import respx

from oderbiz_analytics.adapters.meta.client import MetaGraphClient


@respx.mock
async def test_list_ad_accounts_parses_data():
    respx.get("https://graph.facebook.com/v25.0/me/adaccounts").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "act_111",
                        "name": "Test",
                        "account_id": "111",
                        "currency": "USD",
                    }
                ]
            },
        )
    )
    client = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="fake",
    )
    accounts = await client.list_ad_accounts(
        fields="id,name,account_id,currency",
    )
    assert len(accounts) == 1
    assert accounts[0].id == "act_111"
    assert accounts[0].currency == "USD"


@respx.mock
async def test_list_ad_accounts_handles_empty():
    respx.get("https://graph.facebook.com/v25.0/me/adaccounts").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    client = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="fake",
    )
    accounts = await client.list_ad_accounts(fields="id,name,account_id,currency")
    assert accounts == []

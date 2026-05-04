import httpx
import pytest
import respx

from oderbiz_analytics.adapters.meta.client import MetaGraphClient, MetaGraphApiError


@respx.mock
async def test_get_page_location_returns_location():
    respx.get("https://graph.facebook.com/v25.0/123456").mock(
        return_value=httpx.Response(
            200,
            json={"location": {"city": "Loja", "state": "Loja", "country": "EC"}}
        )
    )
    client = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="test_token",
    )
    result = await client.get_page_location("123456")
    assert result["city"] == "Loja"
    assert result["state"] == "Loja"
    assert result["country"] == "EC"


@respx.mock
async def test_get_page_location_handles_missing_location():
    respx.get("https://graph.facebook.com/v25.0/789").mock(
        return_value=httpx.Response(200, json={"id": "789"})
    )
    client = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="test_token",
    )
    result = await client.get_page_location("789")
    assert result == {}


@respx.mock
async def test_get_page_location_raises_on_error():
    respx.get("https://graph.facebook.com/v25.0/invalid").mock(
        return_value=httpx.Response(
            404,
            json={"error": {"message": "Page not found"}},
        )
    )
    client = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="test_token",
    )
    with pytest.raises(MetaGraphApiError) as ei:
        await client.get_page_location("invalid")
    assert ei.value.status_code == 404

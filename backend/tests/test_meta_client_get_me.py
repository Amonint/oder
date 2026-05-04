import httpx
import pytest
import respx

from oderbiz_analytics.adapters.meta.client import MetaGraphClient, MetaGraphApiError


@respx.mock
async def test_get_me_returns_payload():
    respx.get("https://graph.facebook.com/v25.0/me").mock(
        return_value=httpx.Response(200, json={"id": "99", "name": "A"})
    )
    c = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="x",
    )
    j = await c.get_me(fields="id,name")
    assert j == {"id": "99", "name": "A"}


@respx.mock
async def test_get_me_raises_on_graph_error():
    respx.get("https://graph.facebook.com/v25.0/me").mock(
        return_value=httpx.Response(
            400,
            json={"error": {"message": "Invalid OAuth access token."}},
        )
    )
    c = MetaGraphClient(
        base_url="https://graph.facebook.com/v25.0",
        access_token="bad",
    )
    with pytest.raises(MetaGraphApiError) as ei:
        await c.get_me()
    assert "Invalid OAuth" in ei.value.message

from __future__ import annotations

import httpx

from oderbiz_analytics.domain.models import AdAccount


class MetaGraphClient:
    def __init__(self, base_url: str, access_token: str, timeout_s: float = 60.0) -> None:
        self._base = base_url.rstrip("/")
        self._token = access_token
        self._client = httpx.AsyncClient(timeout=timeout_s)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list_ad_accounts(self, fields: str) -> list[AdAccount]:
        r = await self._client.get(
            f"{self._base}/me/adaccounts",
            params={"fields": fields, "access_token": self._token},
        )
        r.raise_for_status()
        payload = r.json()
        return [AdAccount.model_validate(x) for x in payload.get("data", [])]

from __future__ import annotations

import httpx

from oderbiz_analytics.domain.models import AdAccount


class MetaGraphApiError(Exception):
    """Error devuelto por la Graph API (cuerpo JSON `error` o respuesta no JSON)."""

    def __init__(self, *, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def _meta_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
        err = payload.get("error")
        if isinstance(err, dict):
            msg = err.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
    except Exception:
        pass
    text = (response.text or "").strip()
    if text and len(text) < 500:
        return text
    return response.reason_phrase or "Error de la Graph API"


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
        if r.is_error:
            raise MetaGraphApiError(
                status_code=r.status_code,
                message=_meta_error_message(r),
            )
        payload = r.json()
        return [AdAccount.model_validate(x) for x in payload.get("data", [])]

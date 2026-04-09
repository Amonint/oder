from __future__ import annotations

import json

import httpx
from pydantic import ValidationError

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

    async def get_me(self, *, fields: str = "id,name") -> dict:
        """Identidad del token en Graph (`/me`). Útil para diagnosticar listas vacías."""
        r = await self._client.get(
            f"{self._base}/me",
            params={"fields": fields, "access_token": self._token},
        )
        if r.is_error:
            raise MetaGraphApiError(
                status_code=r.status_code,
                message=_meta_error_message(r),
            )
        data = r.json()
        if not isinstance(data, dict):
            raise MetaGraphApiError(
                status_code=502,
                message="Respuesta inesperada de /me",
            )
        return data

    async def list_ad_accounts(self, fields: str) -> list[AdAccount]:
        """Lista cuentas publicitarias accesibles; sigue `paging.next` si existe."""
        out: list[AdAccount] = []
        url: str | None = f"{self._base}/me/adaccounts"
        first = True
        while url:
            if first:
                r = await self._client.get(
                    url,
                    params={
                        "fields": fields,
                        "access_token": self._token,
                        "limit": 250,
                    },
                )
                first = False
            else:
                r = await self._client.get(url)
            if r.is_error:
                raise MetaGraphApiError(
                    status_code=r.status_code,
                    message=_meta_error_message(r),
                )
            payload = r.json()
            rows = payload.get("data", [])
            if not isinstance(rows, list):
                raise MetaGraphApiError(
                    status_code=502,
                    message="Respuesta de /me/adaccounts sin lista `data`",
                )
            for i, x in enumerate(rows):
                if not isinstance(x, dict):
                    raise MetaGraphApiError(
                        status_code=502,
                        message=f"Elemento #{i} en adaccounts no es un objeto",
                    )
                try:
                    out.append(AdAccount.model_validate(x))
                except ValidationError as e:
                    err = e.errors()[0] if e.errors() else {}
                    loc = err.get("loc", ())
                    msg = err.get("msg", str(e))
                    raise MetaGraphApiError(
                        status_code=502,
                        message=f"Cuenta #{i} con campos inesperados ({loc}): {msg}",
                    ) from e
            url = (payload.get("paging") or {}).get("next")
        return out

    async def search_pages(self, *, query: str, fields: str = "id,name,category,fan_count") -> list[dict]:
        """Busca páginas de Facebook por nombre usando /pages/search."""
        r = await self._client.get(
            f"{self._base}/pages/search",
            params={"q": query, "fields": fields, "access_token": self._token},
        )
        if r.is_error:
            raise MetaGraphApiError(
                status_code=r.status_code,
                message=_meta_error_message(r),
            )
        payload = r.json()
        data = payload.get("data", [])
        if not isinstance(data, list):
            raise MetaGraphApiError(status_code=502, message="Respuesta de /pages/search sin lista `data`")
        return data

    async def get_ads_archive(
        self,
        *,
        page_id: str,
        countries: list[str],
        fields: str,
        ad_active_status: str = "ALL",
        limit: int = 50,
    ) -> list[dict]:
        """Consulta la Meta Ad Library API (ads_archive) para una página competidora."""
        r = await self._client.get(
            f"{self._base}/ads_archive",
            params={
                "search_page_ids": page_id,
                "ad_reached_countries": json.dumps(countries),
                "ad_active_status": ad_active_status,
                "fields": fields,
                "limit": limit,
                "access_token": self._token,
            },
        )
        if r.is_error:
            raise MetaGraphApiError(
                status_code=r.status_code,
                message=_meta_error_message(r),
            )
        payload = r.json()
        data = payload.get("data", [])
        if not isinstance(data, list):
            raise MetaGraphApiError(status_code=502, message="Respuesta de /ads_archive sin lista `data`")
        return data

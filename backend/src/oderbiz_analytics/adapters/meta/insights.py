# backend/src/oderbiz_analytics/adapters/meta/insights.py
from __future__ import annotations

import json
import logging
import httpx

logger = logging.getLogger(__name__)


def _insights_params(
    *,
    fields: str,
    access_token: str,
    level: str,
    date_preset: str | None,
    time_range: dict[str, str] | None,
    breakdowns: list[str] | None,
    filtering: list[dict] | None,
    time_increment: int | str | None,
    action_attribution_windows: list[str] | None,
    action_report_time: str | None,
    limit: int | None = None,
) -> dict:
    params: dict = {
        "fields": fields,
        "access_token": access_token,
        "level": level,
    }
    if time_range is not None:
        params["time_range"] = json.dumps(time_range)
    else:
        if date_preset is not None:
            params["date_preset"] = date_preset
    if breakdowns is not None:
        params["breakdowns"] = ",".join(breakdowns)
    if filtering is not None:
        params["filtering"] = json.dumps(filtering)
    if time_increment is not None:
        params["time_increment"] = str(time_increment)
    if action_attribution_windows:
        params["action_attribution_windows"] = json.dumps(action_attribution_windows)
    if action_report_time:
        params["action_report_time"] = action_report_time
    if limit is not None:
        params["limit"] = str(limit)
    return params


async def fetch_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    fields: str,
    date_preset: str | None = None,
    time_range: dict[str, str] | None = None,
    level: str = "account",
    breakdowns: list[str] | None = None,
    filtering: list[dict] | None = None,
    time_increment: int | str | None = None,
    action_attribution_windows: list[str] | None = None,
    action_report_time: str | None = None,
    limit: int | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    own = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=120.0)
    try:
        params = _insights_params(
            fields=fields,
            access_token=access_token,
            level=level,
            date_preset=date_preset,
            time_range=time_range,
            breakdowns=breakdowns,
            filtering=filtering,
            time_increment=time_increment,
            action_attribution_windows=action_attribution_windows,
            action_report_time=action_report_time,
            limit=limit,
        )
        r = await client.get(
            f"{base_url.rstrip('/')}/{ad_account_id}/insights",
            params=params,
        )
        if not r.is_success:
            logger.error("META API ERROR [fetch_insights] status=%s body=%s", r.status_code, r.text)
        r.raise_for_status()
        return r.json().get("data", [])
    finally:
        if own:
            await client.aclose()


async def fetch_insights_all_pages(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    fields: str,
    date_preset: str | None = None,
    time_range: dict[str, str] | None = None,
    level: str = "account",
    breakdowns: list[str] | None = None,
    filtering: list[dict] | None = None,
    time_increment: int | str | None = None,
    action_attribution_windows: list[str] | None = None,
    action_report_time: str | None = None,
    limit: int | None = None,
    max_pages: int = 200,
) -> list[dict]:
    """Sigue `paging.next` hasta `max_pages` (URLs `next` pueden incluir token)."""
    out: list[dict] = []
    url: str | None = f"{base_url.rstrip('/')}/{ad_account_id}/insights"
    first = True
    page = 0
    own = True
    client = httpx.AsyncClient(timeout=120.0)
    try:
        while url and page < max_pages:
            if first:
                params = _insights_params(
                    fields=fields,
                    access_token=access_token,
                    level=level,
                    date_preset=date_preset,
                    time_range=time_range,
                    breakdowns=breakdowns,
                    filtering=filtering,
                    time_increment=time_increment,
                    action_attribution_windows=action_attribution_windows,
                    action_report_time=action_report_time,
                    limit=limit,
                )
                r = await client.get(url, params=params)
                first = False
            else:
                r = await client.get(url)
            if not r.is_success:
                logger.error("META API ERROR [fetch_insights_all_pages] status=%s body=%s", r.status_code, r.text)
            r.raise_for_status()
            payload = r.json()
            rows = payload.get("data", [])
            if isinstance(rows, list):
                for x in rows:
                    if isinstance(x, dict):
                        out.append(x)
            url = (payload.get("paging") or {}).get("next")
            page += 1
    finally:
        if own:
            await client.aclose()
    return out


async def fetch_account_insights(
    *,
    base_url: str,
    access_token: str,
    ad_account_id: str,
    date_preset: str | None,
    fields: str,
    time_range: dict[str, str] | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    return await fetch_insights(
        base_url=base_url,
        access_token=access_token,
        ad_account_id=ad_account_id,
        fields=fields,
        date_preset=date_preset,
        time_range=time_range,
        level="account",
        time_increment=None,
        client=client,
    )

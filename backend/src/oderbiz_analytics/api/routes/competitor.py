# backend/src/oderbiz_analytics/api/routes/competitor.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client
from oderbiz_analytics.api.routes.url_parser import ResolveStrategy, parse_competitor_input

router = APIRouter(prefix="/competitor", tags=["competitor"])

_ADS_ARCHIVE_FIELDS = (
    "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,"
    "ad_creative_link_descriptions,ad_creative_link_captions,"
    "ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,"
    "publisher_platforms,languages,page_name,page_id"
)

_DEFAULT_COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "US", "ES"]


class ResolveRequest(BaseModel):
    input: str
    page_id: str | None = None


@router.post("/resolve")
async def resolve_competitor(
    body: ResolveRequest,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Resuelve URL de Facebook/Instagram o texto libre a un perfil competidor."""
    parsed = parse_competitor_input(body.input)

    if parsed.strategy in (ResolveStrategy.FACEBOOK_ALIAS, ResolveStrategy.FACEBOOK_ID):
        try:
            page = await client.lookup_page(alias_or_id=parsed.value)
        except MetaGraphApiError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        return {
            "platform": "facebook",
            "page_id": page["id"],
            "name": page.get("name", ""),
            "fan_count": page.get("fan_count"),
            "category": page.get("category"),
            "is_approximate": False,
        }

    if parsed.strategy == ResolveStrategy.INSTAGRAM_USERNAME:
        if not body.page_id:
            raise HTTPException(
                status_code=400,
                detail="Se requiere page_id para resolver cuentas de Instagram.",
            )
        try:
            ig_user_id = await client.get_ig_user_id(page_id=body.page_id)
            ig_data = await client.instagram_business_discovery(
                ig_user_id=ig_user_id,
                username=parsed.value,
            )
        except MetaGraphApiError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        bd = ig_data.get("business_discovery", {})
        return {
            "platform": "instagram",
            "page_id": bd.get("id", parsed.value),
            "name": bd.get("name") or bd.get("username") or parsed.value,
            "fan_count": bd.get("followers_count"),
            "category": None,
            "is_approximate": False,
        }

    # FREE_TEXT — fallback con ads_archive
    try:
        pages = await client.search_ads_by_terms(
            search_terms=parsed.value,
            countries=_DEFAULT_COUNTRIES,
        )
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {
        "platform": "facebook",
        "results": [
            {"page_id": p["page_id"], "name": p["name"], "is_approximate": True}
            for p in pages
        ],
    }


@router.get("/{page_id}/ads")
async def get_competitor_ads(
    page_id: str,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Devuelve los anuncios de Ad Library de una página competidora."""
    try:
        data = await client.get_ads_archive(
            page_id=page_id,
            countries=_DEFAULT_COUNTRIES,
            fields=_ADS_ARCHIVE_FIELDS,
        )
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    page_name = data[0].get("page_name", "") if data else ""
    return {"data": data, "page_name": page_name, "page_id": page_id}

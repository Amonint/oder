# backend/src/oderbiz_analytics/api/routes/competitor.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client

router = APIRouter(prefix="/competitor", tags=["competitor"])

_ADS_ARCHIVE_FIELDS = (
    "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,"
    "ad_creative_link_descriptions,ad_creative_link_captions,"
    "ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,"
    "publisher_platforms,languages,page_name,page_id"
)

_DEFAULT_COUNTRIES = ["CO", "MX", "AR", "CL", "PE", "US", "ES"]


@router.get("/search")
async def search_competitor_pages(
    q: str = Query(..., min_length=2, description="Nombre de la página a buscar"),
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Busca páginas de Facebook por nombre para autocompletar el buscador de competidores."""
    try:
        data = await client.search_pages(query=q)
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return {"data": data}


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

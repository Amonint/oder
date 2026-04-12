# backend/src/oderbiz_analytics/api/routes/competitor.py
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone

import duckdb
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from oderbiz_analytics.adapters.meta.client import MetaGraphApiError, MetaGraphClient
from oderbiz_analytics.api.deps import get_meta_graph_client
from oderbiz_analytics.api.routes.url_parser import ResolveStrategy, parse_competitor_input
from oderbiz_analytics.services.inference_service import ProvinceInferenceService

router = APIRouter(prefix="/competitor", tags=["competitor"])
logger = logging.getLogger(__name__)

_MONITOR_COUNTRIES = ["EC", "CO", "MX", "AR", "CL", "PE", "VE", "HN", "GT", "BO", "US", "ES"]

_RADAR_AD_FIELDS = (
    "id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,"
    "ad_delivery_start_time,ad_delivery_stop_time,"
    "publisher_platforms,languages,page_name,page_id,media_type"
)

_STOPWORDS = {
    "de", "la", "el", "en", "y", "a", "los", "las", "un", "una", "que", "con",
    "su", "por", "para", "es", "del", "se", "the", "and", "of", "to", "in",
    "for", "que", "no", "al", "más", "por", "con", "una", "sus", "pero",
}

def _keywords_for_category(category: str, page_name: str) -> list[str]:
    """Use Meta's category directly. Fallback to page name if no category."""
    if category and category.strip():
        return [category]
    return [page_name]


def _is_active(ad: dict) -> bool:
    stop = ad.get("ad_delivery_stop_time")
    if stop is None:
        return True
    try:
        stop_dt = datetime.fromisoformat(stop.replace("+0000", "+00:00"))
        return stop_dt > datetime.now(timezone.utc)
    except Exception:
        return False


def _monthly_activity(ads: list[dict]) -> dict[str, int]:
    months: Counter = Counter()
    for ad in ads:
        t = ad.get("ad_creation_time") or ""
        if len(t) >= 7:
            months[t[:7]] += 1
    return dict(sorted(months.items()))


def _top_words(all_ads: list[list[dict]], top_n: int = 10) -> list[dict]:
    words: Counter = Counter()
    for ads in all_ads:
        for ad in ads:
            texts: list[str] = []
            texts.extend(ad.get("ad_creative_bodies") or [])
            texts.extend(ad.get("ad_creative_link_titles") or [])
            for text in texts:
                tokens = re.findall(r"\b[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{4,}\b", text.lower())
                for tok in tokens:
                    if tok not in _STOPWORDS:
                        words[tok] += 1
    return [{"word": w, "count": c} for w, c in words.most_common(top_n)]


def _build_competitor_entry(page: dict, ads: list[dict]) -> dict:
    active = sum(1 for ad in ads if _is_active(ad))
    platforms: set[str] = set()
    languages: set[str] = set()
    media_types: set[str] = set()
    for ad in ads:
        platforms.update(ad.get("publisher_platforms") or [])
        languages.update(ad.get("languages") or [])
        if ad.get("media_type"):
            media_types.add(ad["media_type"])
    dates = [ad["ad_creation_time"] for ad in ads if ad.get("ad_creation_time")]
    return {
        "page_id": page["page_id"],
        "name": page["name"],
        "active_ads": active,
        "total_ads": len(ads),
        "platforms": sorted(platforms),
        "languages": sorted(languages),
        "media_types": sorted(media_types),
        "latest_ad_date": max(dates) if dates else None,
        "monthly_activity": _monthly_activity(ads),
    }


def _build_market_summary(
    competitors: list[dict],
    country_results: list[list[dict] | Exception],
) -> dict:
    # top_countries: cuántos anunciantes únicos encontrados por país
    top_countries = []
    for i, country in enumerate(_MONITOR_COUNTRIES):
        result = country_results[i]
        if isinstance(result, list):
            top_countries.append({"country": country, "advertiser_count": len(result)})

    # top_platforms: conteo de ads por plataforma agregado de todos los competidores
    platform_count: Counter = Counter()
    for comp in competitors:
        for platform in comp["platforms"]:
            platform_count[platform] += comp["total_ads"]

    return {
        "top_countries": sorted(top_countries, key=lambda x: x["advertiser_count"], reverse=True),
        "top_platforms": [
            {"platform": p, "ad_count": c} for p, c in platform_count.most_common()
        ],
    }

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

    if parsed.strategy == ResolveStrategy.FACEBOOK_ID:
        # Ya tenemos el ID — buscamos el nombre en ads_archive
        page = await client.search_ads_by_page_id(page_id=parsed.value)
        name = page["name"] if page else parsed.value
        return {
            "platform": "facebook",
            "page_id": parsed.value,
            "name": name,
            "is_approximate": False,
        }

    if parsed.strategy == ResolveStrategy.FACEBOOK_ALIAS:
        # GET /{alias} requiere app review — usamos ads_archive
        try:
            pages = await client.search_ads_by_terms(
                search_terms=parsed.value,
                countries=_DEFAULT_COUNTRIES,
                limit=5,
            )
        except MetaGraphApiError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        if not pages:
            raise HTTPException(
                status_code=404,
                detail="No se encontraron anuncios para esa página. Verifica que tenga pauta activa o pasada en Ad Library.",
            )
        if len(pages) == 1:
            return {
                "platform": "facebook",
                "page_id": pages[0]["page_id"],
                "name": pages[0]["name"],
                "is_approximate": False,
            }
        return {
            "platform": "facebook",
            "results": [
                {"page_id": p["page_id"], "name": p["name"], "is_approximate": True}
                for p in pages
            ],
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


@router.get("/market-radar")
async def get_market_radar(
    page_id: str,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Auto-descubre competidores en el mismo segmento de la página dada."""
    # 1. Detectar categoría de la página del cliente
    try:
        page_data = await client.get_page_public_profile(page_id=page_id)
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    category = page_data.get("category", "")
    page_name = page_data.get("name", page_id)
    keywords = _keywords_for_category(category, page_name)
    primary_keyword = keywords[0]

    # 2. Buscar competidores con todos los países monitoreados
    try:
        competitor_pages = await client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=_MONITOR_COUNTRIES,
            limit=20,
        )
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Excluir la propia página del cliente
    competitor_pages = [p for p in competitor_pages if p["page_id"] != page_id]

    # 3. En paralelo: ads por competidor + búsqueda por país
    ads_tasks = [
        client.get_ads_archive(
            page_id=p["page_id"],
            countries=_MONITOR_COUNTRIES,
            fields=_RADAR_AD_FIELDS,
            limit=50,
        )
        for p in competitor_pages
    ]
    country_tasks = [
        client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=[country],
            limit=10,
        )
        for country in _MONITOR_COUNTRIES
    ]

    all_results = await asyncio.gather(
        *ads_tasks, *country_tasks, return_exceptions=True
    )

    n_comp = len(competitor_pages)
    ads_results = all_results[:n_comp]
    country_results = all_results[n_comp:]

    # 4. Construir respuesta
    competitors = []
    for page, ads_result in zip(competitor_pages, ads_results):
        ads = ads_result if isinstance(ads_result, list) else []
        competitors.append(_build_competitor_entry(page, ads))

    # Ordenar por active_ads descendente
    competitors.sort(key=lambda c: c["active_ads"], reverse=True)

    all_ads_nested = [
        ads_results[i] for i in range(n_comp) if isinstance(ads_results[i], list)
    ]
    market_summary = _build_market_summary(competitors, list(country_results))
    market_summary["top_words"] = _top_words(all_ads_nested)  # type: ignore[assignment]

    return {
        "client_page": {
            "page_id": page_id,
            "name": page_name,
            "category": category,
            "keywords_used": keywords,
        },
        "competitors": competitors,
        "market_summary": market_summary,
    }


@router.get("/market-radar-extended")
async def get_market_radar_extended(
    page_id: str,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Extended market radar with top 5 Ecuador + province, full ad details, and persistence."""
    start_time = time.time()

    try:
        # 1. Get client page info + location
        page_data = await client.get_page_public_profile(page_id=page_id)
        page_location = await client.get_page_location(page_id=page_id)

        category = page_data.get("category", "")
        page_name = page_data.get("name", page_id)
        keywords = _keywords_for_category(category, page_name)
        primary_keyword = keywords[0]

        # 2. Infer client province
        client_province, client_confidence, client_source = ProvinceInferenceService.infer_province(
            page_id=page_id,
            page_name=page_name,
            page_location=page_location,
            ads=[],  # No ads for client yet
        )

        # 3. Search competitors across all countries
        competitor_pages = await client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=_MONITOR_COUNTRIES,
            limit=20,
        )
        competitor_pages = [p for p in competitor_pages if p["page_id"] != page_id]

        # 4. Get ads for each competitor in parallel
        ads_tasks = [
            client.get_ads_archive(
                page_id=p["page_id"],
                countries=_MONITOR_COUNTRIES,
                fields=_ADS_ARCHIVE_FIELDS,
                limit=50,
            )
            for p in competitor_pages
        ]
        ads_results = await asyncio.gather(*ads_tasks, return_exceptions=True)

        # 5. Build competitors with province inference
        competitors_data = []
        for page, ads_result in zip(competitor_pages, ads_results):
            ads = ads_result if isinstance(ads_result, list) else []

            # Get page location
            try:
                page_loc = await client.get_page_location(page_id=page["page_id"])
            except Exception:
                page_loc = None

            # Infer province
            province, confidence, source = ProvinceInferenceService.infer_province(
                page_id=page["page_id"],
                page_name=page["name"],
                page_location=page_loc,
                ads=ads,
            )

            # Build competitor entry
            active_ads = sum(1 for ad in ads if _is_active(ad))

            comp_data = {
                "page_id": page["page_id"],
                "name": page["name"],
                "province": province,
                "province_confidence": confidence,
                "province_source": source,
                "active_ads": active_ads,
                "total_ads": len(ads),
                "platforms": list(set(p for ad in ads for p in (ad.get("publisher_platforms") or []))),
                "languages": list(set(l for ad in ads for l in (ad.get("languages") or []))),
                "ads": [
                    {
                        "id": ad.get("id", ""),
                        "ad_creative_bodies": ad.get("ad_creative_bodies") or [],
                        "ad_creative_link_titles": ad.get("ad_creative_link_titles") or [],
                        "ad_creative_link_descriptions": ad.get("ad_creative_link_descriptions") or [],
                        "ad_creative_link_captions": ad.get("ad_creative_link_captions") or [],
                        "ad_snapshot_url": ad.get("ad_snapshot_url"),
                        "publisher_platforms": ad.get("publisher_platforms") or [],
                        "languages": ad.get("languages") or [],
                        "media_type": ad.get("media_type"),
                        "ad_creation_time": ad.get("ad_creation_time"),
                        "ad_delivery_start_time": ad.get("ad_delivery_start_time"),
                        "ad_delivery_stop_time": ad.get("ad_delivery_stop_time"),
                        "is_active": _is_active(ad),
                    }
                    for ad in ads[:10]  # Only last 10 ads in response
                ],
                "last_detected": datetime.now(timezone.utc).date().isoformat(),
            }

            competitors_data.append(comp_data)

            # Persist to DuckDB
            try:
                db_path = os.getenv("DUCKDB_PATH", "analytics.duckdb")
                conn = duckdb.connect(db_path)
                try:
                    conn.execute(
                        """
                        INSERT INTO competitors (page_id, name, category, province_ec, province_confidence,
                                               province_source, last_detected, active_ads_count, total_ads_count,
                                               platforms, languages, metadata)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (page_id) DO UPDATE SET
                            last_detected = EXCLUDED.last_detected,
                            active_ads_count = EXCLUDED.active_ads_count,
                            total_ads_count = EXCLUDED.total_ads_count,
                            province_ec = EXCLUDED.province_ec,
                            province_confidence = EXCLUDED.province_confidence,
                            province_source = EXCLUDED.province_source
                        """,
                        [
                            page["page_id"],
                            page["name"],
                            category,
                            province,
                            confidence,
                            source,
                            comp_data["last_detected"],
                            active_ads,
                            len(ads),
                            json.dumps(comp_data["platforms"]),
                            json.dumps(comp_data["languages"]),
                            json.dumps({"inferred_at": datetime.now(timezone.utc).isoformat()}),
                        ],
                    )

                    # Insert ads
                    for ad in ads[:10]:
                        conn.execute(
                            """
                            INSERT INTO competitor_ads (ad_id, page_id, ad_creative_bodies, ad_creative_link_titles,
                                                       ad_creative_link_descriptions, ad_creative_link_captions,
                                                       ad_snapshot_url, publisher_platforms, languages, media_type,
                                                       ad_creation_time, ad_delivery_start_time, ad_delivery_stop_time, is_active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            [
                                ad["id"],
                                page["page_id"],
                                json.dumps(ad.get("ad_creative_bodies") or []),
                                json.dumps(ad.get("ad_creative_link_titles") or []),
                                json.dumps(ad.get("ad_creative_link_descriptions") or []),
                                json.dumps(ad.get("ad_creative_link_captions") or []),
                                ad.get("ad_snapshot_url"),
                                json.dumps(ad.get("publisher_platforms") or []),
                                json.dumps(ad.get("languages") or []),
                                ad.get("media_type"),
                                ad.get("ad_creation_time"),
                                ad.get("ad_delivery_start_time"),
                                ad.get("ad_delivery_stop_time"),
                                _is_active(ad),
                            ],
                        )

                    conn.commit()
                finally:
                    conn.close()
            except Exception as e:
                logger.error(f"DuckDB persist error: {e}")

        # 6. Rank by activity
        competitors_data.sort(key=lambda c: c["active_ads"], reverse=True)

        # 7. Split Ecuador vs Province
        ecuador_top5 = [
            {**c, "rank": i + 1}
            for i, c in enumerate(competitors_data[:5])
        ]

        province_top5 = [
            {**c, "rank": i + 1}
            for i, c in enumerate(
                [c for c in competitors_data if c["province"] == client_province and client_province is not None][:5]
            )
        ]

        sync_duration = time.time() - start_time

        return {
            "client_page": {
                "page_id": page_id,
                "name": page_name,
                "category": category,
                "province": client_province,
                "province_confidence": client_confidence,
                "province_source": client_source,
            },
            "ecuador_top5": ecuador_top5,
            "province_top5": province_top5,
            "metadata": {
                "total_competitors_detected": len(competitors_data),
                "ecuador_competitors": len(competitors_data),
                "province_competitors": len(
                    [c for c in competitors_data if c["province"] == client_province]
                ),
                "last_sync": datetime.now(timezone.utc).isoformat(),
                "sync_duration_seconds": sync_duration,
            },
        }

    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

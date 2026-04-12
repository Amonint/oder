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
from oderbiz_analytics.services.competitor_classifier import CompetitorClassifier
from oderbiz_analytics.services.competitor_scoring_service import CompetitorScoringService

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
    """
    Get keywords for a category.
    - If category exists in CATEGORY_KEYWORDS, use those keywords
    - If category is a single-word "macro" category (like Education, Business), use [category]
    - If category is multi-word (like "Arts and crafts"), use [page_name] as fallback
    - If no category, use page_name
    """
    if not category or not category.strip():
        return [page_name]

    # Check if category exists in CATEGORY_KEYWORDS
    classifier = CompetitorClassifier()
    keywords = classifier.get_keywords_for_category(category)

    # If we found keywords in the dictionary, use them
    if keywords != classifier.GENERIC_KEYWORDS:
        return keywords

    # If not in dictionary, heuristic:
    # Single-word categories are likely "macro" categories from Meta (Education, Business, etc)
    # Multi-word categories are likely specific/custom (Arts and crafts), so use page_name
    if len(category.split()) == 1:
        return [category]
    else:
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

# Mapa de provincias de Ecuador a su ciudad principal (para búsquedas localizadas)
_PROVINCE_MAIN_CITY = {
    "Loja": "Loja",
    "Pichincha": "Quito",
    "Guayas": "Guayaquil",
    "Tungurahua": "Ambato",
    "Chimborazo": "Riobamba",
    "Imbabura": "Ibarra",
    "Carchi": "Tulcán",
    "Azuay": "Cuenca",
    "Cotopaxi": "Latacunga",
    "Manabí": "Manta",
    "El Oro": "Machala",
    "Esmeraldas": "Esmeraldas",
    "Los Ríos": "Babahoyo",
    "Sucumbíos": "Nueva Loja",
    "Orellana": "Francisco de Orellana",
    "Pastaza": "Puyo",
    "Morona Santiago": "Macas",
    "Zamora Chinchipe": "Zamora",
    "Santa Elena": "Santa Elena",
    "Santo Domingo de los Tsáchilas": "Santo Domingo",
    "Napo": "Tena",
    "Bolívar": "Guaranda",
    "Cañar": "Azogues",
    "Galápagos": "Puerto Baquerizo Moreno",
}


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
    country: str = "EC",
    province: str | None = None,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Auto-descubre competidores en el mismo segmento de la página dada, con filtrado opcional por provincia."""
    # 1. Detectar categoría de la página del cliente
    try:
        page_data = await client.get_page_public_profile(page_id=page_id)
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    category = page_data.get("category", "")
    page_name = page_data.get("name", page_id)
    keywords = _keywords_for_category(category, page_name)
    primary_keyword = keywords[0]

    # 2. Buscar competidores solo en país especificado
    # Si se filtra por provincia, también buscar con ciudad para resultados más locales
    search_tasks = [
        client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=[country],
            limit=20,
        )
    ]
    if province:
        city = _PROVINCE_MAIN_CITY.get(province, province)
        search_tasks.append(
            client.search_ads_by_terms(
                search_terms=f"{primary_keyword} en {city}",
                countries=[country],
                limit=10,
            )
        )

    try:
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    # Merge deduplicando por page_id
    seen_page_ids: set[str] = set()
    competitor_pages: list[dict] = []
    for result in search_results:
        if isinstance(result, list):
            for p in result:
                if p["page_id"] not in seen_page_ids:
                    seen_page_ids.add(p["page_id"])
                    competitor_pages.append(p)
        elif isinstance(result, Exception):
            logger.warning(f"Search task failed: {result}")

    # Excluir la propia página del cliente
    competitor_pages = [p for p in competitor_pages if p["page_id"] != page_id]

    # 3. En paralelo: ads + ubicación por competidor en el país especificado
    ads_tasks = [
        client.get_ads_archive(
            page_id=p["page_id"],
            countries=[country],
            fields=_RADAR_AD_FIELDS,
            limit=50,
        )
        for p in competitor_pages
    ]
    location_tasks = [
        client.get_page_location(page_id=p["page_id"])
        for p in competitor_pages
    ]

    all_results = await asyncio.gather(
        *ads_tasks, *location_tasks, return_exceptions=True
    )

    n_comp = len(competitor_pages)
    ads_results = all_results[:n_comp]
    location_results = all_results[n_comp:]

    # 4. Construir entrada de competidores CON provincia (sin ML filtrado aún)
    competitors_before_filter = []
    competitor_ads_map = {}  # Para usar en clasificación
    competitor_provinces = {}  # Para filtrado por provincia

    for page, ads_result, location_result in zip(competitor_pages, ads_results, location_results):
        ads = ads_result if isinstance(ads_result, list) else []
        location = location_result if isinstance(location_result, dict) else None

        # Inferir provincia del competidor
        inferred_province, province_confidence, province_source = ProvinceInferenceService.infer_province(
            page_id=page["page_id"],
            page_name=page["name"],
            page_location=location,
            ads=ads,
        )

        competitor_provinces[page["page_id"]] = {
            "province": inferred_province,
            "confidence": province_confidence,
            "source": province_source,
        }

        entry = _build_competitor_entry(page, ads)
        entry["province"] = inferred_province
        entry["province_confidence"] = province_confidence
        entry["province_source"] = province_source

        competitors_before_filter.append(entry)
        competitor_ads_map[page["page_id"]] = ads

    # 5. PIPELINE SECTION 4.2: Inicializar clasificador ML
    classifier = CompetitorClassifier(
        user_category=category,
        user_keywords=keywords,
    )

    # 6. Clasificar cada competidor y filtrar por score >= 25 + provincia opcional
    ml_threshold = 25
    competitors_filtered = []

    for page, ads_result in zip(competitor_pages, ads_results):
        ads = ads_result if isinstance(ads_result, list) else []

        if not ads:
            # Si no hay ads, no clasificar
            continue

        # Extraer buerpos de anuncios para clasificación
        ad_creative_bodies = []
        for ad in ads:
            ad_creative_bodies.extend(ad.get("ad_creative_bodies", []))

        # Clasificar con ML
        classification = classifier.classify(
            page_name=page["name"],
            ad_bodies=ad_creative_bodies,
        )

        # Solo incluir si cumple threshold
        if classification.score >= ml_threshold:
            competitor_entry = _build_competitor_entry(page, ads)
            # Agregar metadata de ML
            competitor_entry["relevance_score"] = classification.score
            competitor_entry["classification_reason"] = classification.reason
            competitor_entry["ml_factors"] = {
                "positive_bonus": classification.factors["positive_bonus"],
                "negative_penalty": classification.factors["negative_penalty"],
                "category_bonus": classification.factors["category_bonus"],
            }
            # Agregar provincia
            prov_data = competitor_provinces[page["page_id"]]
            competitor_entry["province"] = prov_data["province"]
            competitor_entry["province_confidence"] = prov_data["confidence"]
            competitor_entry["province_source"] = prov_data["source"]

            # Filtrar por provincia si se especifica
            if province and prov_data["province"] != province:
                continue

            competitors_filtered.append(competitor_entry)

    # 7. Ordenar por relevance_score DESC, luego por active_ads DESC
    # Using negative values for explicit descending order (spec requirement)
    competitors_filtered.sort(
        key=lambda c: (-c.get("relevance_score", 0), -c["active_ads"])
    )

    # 8. Top 5 competidores
    top_competitors = competitors_filtered[:5]

    province_city = _PROVINCE_MAIN_CITY.get(province, province) if province else None
    return {
        "competitors": top_competitors,  # Top 5 filtered
        "metadata": {
            "total_ads_analyzed": sum(len(ads_results[i]) for i in range(len(competitor_pages)) if isinstance(ads_results[i], list)),
            "total_competitors_found": len(competitors_before_filter),
            "competitors_after_ml_filter": len(competitors_filtered),
            "ml_threshold": ml_threshold,
            "category": category,
            "country": country,
            "province_filter": province,
            "province_city": province_city,
            "keywords_used": keywords,
        },
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


@router.get("/market-radar-temporal")
async def get_market_radar_temporal(
    page_id: str,
    search_term: str | None = None,
    country: str = "EC",
    custom_keywords: str = "",
    min_relevance_score: int = 25,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """
    Análisis temporal de competencia con CLASIFICACIÓN ML.
    
    Usa Machine Learning para identificar competidores relevantes:
    - Scoring inteligente basado en contenido
    - Palabras clave custom (opcional)
    - Histórico de clasificaciones
    
    Args:
        page_id: ID de tu página (para referencia)
        search_term: Término de búsqueda. Si no está, usa categoría de página
        country: País (EC, CO, etc)
        custom_keywords: Palabras clave separadas por coma (ej: "terapia,psicoterapia")
        min_relevance_score: Score mínimo para incluir (0-100, default 25)
    
    Devuelve:
        - Competidores clasificados por ML
        - Score de relevancia (0-100)
        - Patrones temporales
        - Histórico de análisis
    """
    try:
        # 1. Si no hay search_term, intentar obtener categoría de la página del usuario
        if not search_term:
            try:
                page_data = await client.get_page_public_profile(page_id=page_id)
                category = page_data.get("category", "")
                if category:
                    search_term = category
                    logger.info(f"Usando categoría de página: {category}")
            except Exception as e:
                logger.warning(f"No se pudo obtener categoría de página: {e}")
                raise HTTPException(
                    status_code=400,
                    detail="Proporcione search_term o asegúrese de que la página tiene categoría configurada",
                )
        
        # 2. Buscar anuncios por término
        ads = await client.search_ads_with_history(
            search_terms=search_term,
            countries=[country],
            limit=100,
        )
        
        if not ads:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontraron anuncios para '{search_term}' en {country}",
            )
        
        # 3. Inicializar clasificador ML
        user_keywords = [kw.strip() for kw in custom_keywords.split(",") if kw.strip()]
        classifier = CompetitorClassifier(
            user_category=search_term,
            user_keywords=user_keywords or [search_term],
        )
        
        # 4. Agrupar por competidor
        competitors_data = {}
        
        for ad in ads:
            page_id_comp = ad.get("page_id", "")
            page_name = ad.get("page_name", "Sin nombre")
            start_date = ad.get("ad_delivery_start_time", "")
            ad_bodies = ad.get("ad_creative_bodies", [])
            
            if not page_id_comp or not start_date:
                continue
            
            if page_id_comp not in competitors_data:
                competitors_data[page_id_comp] = {
                    "page_id": page_id_comp,
                    "page_name": page_name,
                    "ad_creative_bodies": ad_bodies,
                    "total_ads": 0,
                    "months": {},
                    "days_of_week": {},
                }
            
            competitors_data[page_id_comp]["total_ads"] += 1
            
            # Análisis temporal
            if len(start_date) >= 7:
                month_key = start_date[:7]
                competitors_data[page_id_comp]["months"][month_key] = \
                    competitors_data[page_id_comp]["months"].get(month_key, 0) + 1
            
            try:
                from datetime import datetime as dt
                date_obj = dt.strptime(start_date, "%Y-%m-%d")
                day_name = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][date_obj.weekday()]
                competitors_data[page_id_comp]["days_of_week"][day_name] = \
                    competitors_data[page_id_comp]["days_of_week"].get(day_name, 0) + 1
            except Exception:
                pass
        
        # 5. Clasificar con ML
        scored_competitors = []
        
        for page_id_comp, comp_data in competitors_data.items():
            classification = classifier.classify(
                page_name=comp_data["page_name"],
                ad_bodies=comp_data["ad_creative_bodies"],
            )
            
            # Solo incluir si cumple score mínimo
            if classification.score >= min_relevance_score:
                scored_competitors.append({
                    "page_id": page_id_comp,
                    "page_name": comp_data["page_name"],
                    "total_ads": comp_data["total_ads"],
                    "months": dict(sorted(comp_data["months"].items())),
                    "days_of_week": dict(sorted(comp_data["days_of_week"].items())),
                    "relevance_score": round(classification.score, 1),
                    "relevance_reason": classification.reason,
                    "ml_factors": {
                        "positive_bonus": round(classification.factors["positive_bonus"], 1),
                        "negative_penalty": round(classification.factors["negative_penalty"], 1),
                        "category_bonus": round(classification.factors["category_bonus"], 1),
                    },
                })
        
        if not scored_competitors:
            raise HTTPException(
                status_code=404,
                detail=f"No se encontraron competidores relevantes. Min score requerido: {min_relevance_score}",
            )
        
        # 6. Ordenar por score
        scored_competitors.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        return {
            "search_term": search_term,
            "country": country,
            "custom_keywords": user_keywords or [],
            "total_ads_analyzed": len(ads),
            "total_competitors_found": len(competitors_data),
            "competitors_after_ml_filter": len(scored_competitors),
            "ml_threshold": min_relevance_score,
            "top_competitors": scored_competitors[:5],
            "summary": {
                "analysis_period": f"Basado en {len(ads)} anuncios",
                "ml_classifier": "Reglas inteligentes + Scoring multi-factor",
                "scoring_factors": "Palabras clave positivas + Penalty negativas + Bonus categoría",
            },
        }
        
    except HTTPException:
        raise
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


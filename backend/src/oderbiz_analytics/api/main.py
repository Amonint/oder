# backend/src/oderbiz_analytics/api/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from oderbiz_analytics.api.middleware_site_auth import SiteAuthMiddleware
from oderbiz_analytics.adapters.duckdb.client import init_db
from oderbiz_analytics.utils.db import init_competitors_tables
from oderbiz_analytics.api.routes.accounts import router as accounts_router
from oderbiz_analytics.api.routes.business_portfolio import router as business_portfolio_router
from oderbiz_analytics.api.routes.ads_ranking import router as ads_ranking_router
from oderbiz_analytics.api.routes.dashboard import router as dashboard_router
from oderbiz_analytics.api.routes.entities import router as entities_router
from oderbiz_analytics.api.routes.placement_insights import router as placement_insights_router
from oderbiz_analytics.api.routes.geo_insights import router as geo_insights_router
from oderbiz_analytics.api.routes.graph_user import router as graph_user_router
from oderbiz_analytics.api.routes.summary import router as summary_router
from oderbiz_analytics.api.routes.organic import router as organic_router
from oderbiz_analytics.api.routes.pages import router as pages_router
from oderbiz_analytics.api.routes.targeting import router as targeting_router
from oderbiz_analytics.api.routes.ad_labels import router as ad_labels_router
from oderbiz_analytics.api.routes.competitor import router as competitor_router
from oderbiz_analytics.api.routes.demographics import router as demographics_router
from oderbiz_analytics.api.routes.attribution import router as attribution_router
from oderbiz_analytics.api.routes.audience_insights import router as audience_insights_router
from oderbiz_analytics.api.routes.leads import router as leads_router
from oderbiz_analytics.api.routes.creative_fatigue import router as creative_fatigue_router
from oderbiz_analytics.api.routes.manual_data import router as manual_data_router
from oderbiz_analytics.api.routes.time_insights import router as time_insights_router
from oderbiz_analytics.api.routes.business_questions import router as business_questions_router
from oderbiz_analytics.api.routes.auth_site import router as auth_site_router
from oderbiz_analytics.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.duckdb_path)
    init_competitors_tables(settings.duckdb_path)
    yield


def _cors_allow_origins() -> list[str]:
    settings = get_settings()
    return [o.strip() for o in settings.cors_origins.split(",") if o.strip()]


app = FastAPI(title="Oderbiz Meta Ads Analytics API", version="0.1.0", lifespan=lifespan)
# Primero el interno: CORS queda como capa exterior (recibe OPTIONS y añade cabeceras a 401, etc.)
app.add_middleware(SiteAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_site_router, prefix="/api/v1")
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(business_portfolio_router, prefix="/api/v1")
app.include_router(entities_router, prefix="/api/v1")
app.include_router(placement_insights_router, prefix="/api/v1")
app.include_router(graph_user_router, prefix="/api/v1")
app.include_router(ads_ranking_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(geo_insights_router, prefix="/api/v1")
app.include_router(summary_router, prefix="/api/v1")
app.include_router(targeting_router, prefix="/api/v1")
app.include_router(organic_router, prefix="/api/v1")
app.include_router(pages_router, prefix="/api/v1")
app.include_router(ad_labels_router, prefix="/api/v1")
app.include_router(competitor_router, prefix="/api/v1")
app.include_router(demographics_router, prefix="/api/v1")
app.include_router(attribution_router, prefix="/api/v1")
app.include_router(audience_insights_router, prefix="/api/v1")
app.include_router(leads_router, prefix="/api/v1")
app.include_router(creative_fatigue_router, prefix="/api/v1")
app.include_router(manual_data_router, prefix="/api/v1")
app.include_router(time_insights_router, prefix="/api/v1")
app.include_router(business_questions_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}

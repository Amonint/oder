# backend/src/oderbiz_analytics/api/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from oderbiz_analytics.adapters.duckdb.client import init_db
from oderbiz_analytics.api.routes.accounts import router as accounts_router
from oderbiz_analytics.api.routes.ads_ranking import router as ads_ranking_router
from oderbiz_analytics.api.routes.dashboard import router as dashboard_router
from oderbiz_analytics.api.routes.geo_insights import router as geo_insights_router
from oderbiz_analytics.api.routes.summary import router as summary_router
from oderbiz_analytics.api.routes.targeting import router as targeting_router
from oderbiz_analytics.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.duckdb_path)
    yield


app = FastAPI(title="Oderbiz Meta Ads Analytics API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(ads_ranking_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(geo_insights_router, prefix="/api/v1")
app.include_router(summary_router, prefix="/api/v1")
app.include_router(targeting_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}

# backend/src/oderbiz_analytics/api/main.py
from fastapi import FastAPI

from oderbiz_analytics.api.routes.accounts import router as accounts_router
from oderbiz_analytics.api.routes.summary import router as summary_router

app = FastAPI(title="Oderbiz Meta Ads Analytics API", version="0.1.0")
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(summary_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}

# backend/src/oderbiz_analytics/api/routes/summary.py
from fastapi import APIRouter, Depends
from google.cloud import bigquery

from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/accounts", tags=["summary"])


@router.get("/{ad_account_id}/summary")
def account_summary(ad_account_id: str, settings: Settings = Depends(get_settings)):
    client = bigquery.Client(project=settings.gcp_project_id)
    q = f"""
    SELECT payload_json
    FROM `{settings.gcp_project_id}.{settings.bq_dataset}.raw_meta_insights`
    WHERE ad_account_id = @aid
    ORDER BY ingested_at DESC
    LIMIT 1
    """
    job = client.query(
        q,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("aid", "STRING", ad_account_id),
            ]
        ),
    )
    rows = list(job.result())
    if not rows:
        return {"data": None}
    return {"data": rows[0]["payload_json"]}

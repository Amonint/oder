-- backend/sql/001_create_tables.sql
-- Ejecutar en BigQuery con dataset parametrizado.
-- Sustituir ${BQ_DATASET} por el nombre real del dataset antes de ejecutar,
-- por ejemplo: sed 's/${BQ_DATASET}/meta_ads_analytics/g' 001_create_tables.sql | bq query --use_legacy_sql=false

CREATE TABLE IF NOT EXISTS `${BQ_DATASET}.raw_meta_insights` (
  ingest_id STRING NOT NULL,
  ad_account_id STRING NOT NULL,
  object_id STRING NOT NULL,
  level STRING NOT NULL,
  date_preset STRING,
  time_range_json STRING,
  fields STRING,
  payload_json STRING NOT NULL,
  ingested_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(ingested_at)
CLUSTER BY ad_account_id, object_id;

CREATE TABLE IF NOT EXISTS `${BQ_DATASET}.fact_ads_insights_daily` (
  ad_account_id STRING NOT NULL,
  ad_id STRING NOT NULL,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  impressions INT64,
  clicks INT64,
  spend NUMERIC,
  reach INT64,
  actions_json STRING,
  cost_per_action_json STRING,
  extracted_at TIMESTAMP NOT NULL
)
PARTITION BY date_start
CLUSTER BY ad_account_id, ad_id;

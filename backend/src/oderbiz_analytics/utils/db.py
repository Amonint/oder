"""DuckDB schema setup and initialization functions."""
import duckdb
from pathlib import Path


def init_competitors_tables(db_path: str):
    """Initialize competitors and competitor_ads tables if not exist."""
    conn = duckdb.connect(db_path)

    try:
        # competitors table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS competitors (
            page_id VARCHAR PRIMARY KEY,
            name VARCHAR,
            category VARCHAR,
            province_ec VARCHAR,
            province_confidence FLOAT,
            province_source VARCHAR,
            last_detected DATE,
            active_ads_count INTEGER,
            total_ads_count INTEGER,
            platforms JSON,
            languages JSON,
            metadata JSON
        )
        """)

        # competitor_ads table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS competitor_ads (
            ad_id VARCHAR PRIMARY KEY,
            page_id VARCHAR REFERENCES competitors(page_id),
            ad_creative_bodies TEXT,
            ad_creative_link_titles TEXT,
            ad_creative_link_descriptions TEXT,
            ad_creative_link_captions TEXT,
            ad_snapshot_url VARCHAR,
            publisher_platforms JSON,
            languages JSON,
            media_type VARCHAR,
            ad_creation_time DATE,
            ad_delivery_start_time DATE,
            ad_delivery_stop_time DATE,
            is_active BOOLEAN,
            detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        conn.commit()
    finally:
        conn.close()

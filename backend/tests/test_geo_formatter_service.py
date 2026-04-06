import pytest
from oderbiz_analytics.services.geo_formatter import (
    enrich_geo_row,
    get_geo_metadata,
    GEO_REGION_NAMES,
)


def test_enrich_geo_row_with_region():
    """Agregar nombre legible de región al row."""
    row = {"region": "ES-CA", "impressions": 1000, "spend": "50.00"}
    enriched = enrich_geo_row(row)
    assert enriched["region"] == "ES-CA"
    assert enriched["region_name"] == GEO_REGION_NAMES.get("ES-CA", "ES-CA")
    assert enriched["impressions"] == 1000


def test_enrich_geo_row_with_unknown_region():
    """Para región desconocida, mantener código original."""
    row = {"region": "UNKNOWN_CODE", "impressions": 500, "spend": "25.00"}
    enriched = enrich_geo_row(row)
    assert enriched["region"] == "UNKNOWN_CODE"
    assert enriched["region_name"] == "UNKNOWN_CODE"


def test_get_geo_metadata_account_scope():
    """Metadata indica alcance account."""
    total_rows = 17
    metadata = get_geo_metadata(scope="account", ad_id=None, total_rows=total_rows)
    assert metadata["scope"] == "account"
    assert metadata["ad_id"] is None
    assert metadata["total_rows"] == total_rows
    assert "complete_coverage" in metadata


def test_get_geo_metadata_ad_scope():
    """Metadata indica alcance ad específico."""
    total_rows = 5
    ad_id = "ad_123"
    metadata = get_geo_metadata(scope="ad", ad_id=ad_id, total_rows=total_rows)
    assert metadata["scope"] == "ad"
    assert metadata["ad_id"] == "ad_123"
    assert metadata["total_rows"] == total_rows

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


def test_enrich_geo_row_with_none_region():
    """Cuando region es None, region_name debería ser fallback a string vacío."""
    row = {"region": None, "impressions": 100, "spend": "10.00"}
    enriched = enrich_geo_row(row)
    assert enriched["region"] is None
    # region_name debería ser fallback de None a "", consistencia
    assert enriched["region_name"] == ""


def test_enrich_geo_row_with_empty_region():
    """Cuando region es string vacío, region_name debería ser fallback."""
    row = {"region": "", "impressions": 100, "spend": "10.00"}
    enriched = enrich_geo_row(row)
    assert enriched["region"] == ""
    # Vacío no está en GEO_REGION_NAMES, así que debería ser fallback
    assert enriched["region_name"] == ""


def test_enrich_geo_row_missing_region_key():
    """Cuando falta 'region' completamente, region_name debería ser fallback."""
    row = {"impressions": 100, "spend": "10.00"}  # sin region
    enriched = enrich_geo_row(row)
    assert "region_name" in enriched
    # get("region", "") devuelve "", que no está en mapeo
    assert enriched["region_name"] == ""


def test_get_geo_metadata_with_ad_id_none_and_ad_scope():
    """Cuando scope='ad' pero ad_id=None, la metadata debería indicarlo."""
    metadata = get_geo_metadata(scope="ad", ad_id=None, total_rows=5)
    assert metadata["scope"] == "ad"
    assert metadata["ad_id"] is None  # Documenta el comportamiento


def test_get_geo_metadata_with_negative_total_rows():
    """Cuando total_rows es negativo, debería aceptarlo (o validarse en ruta)."""
    metadata = get_geo_metadata(scope="account", ad_id=None, total_rows=-1)
    assert metadata["total_rows"] == -1
    # Nota: validación podría hacerse en ruta con Pydantic, no aquí

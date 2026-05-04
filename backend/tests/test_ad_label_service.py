import pytest
from oderbiz_analytics.services.ad_label import get_ad_label


def test_get_ad_label_with_valid_name():
    """Cuando ad_name existe y no está vacío, usarlo."""
    row = {"ad_id": "123", "ad_name": "Anuncio Verano 2026"}
    result = get_ad_label(row)
    assert result == "Anuncio Verano 2026"


def test_get_ad_label_with_empty_name():
    """Cuando ad_name es string vacío, retornar ID con formato fallback."""
    row = {"ad_id": "123", "ad_name": ""}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 123"


def test_get_ad_label_with_none_name():
    """Cuando ad_name es None, retornar ID con formato fallback."""
    row = {"ad_id": "456", "ad_name": None}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 456"


def test_get_ad_label_missing_ad_name_key():
    """Cuando falta la clave ad_name completamente, retornar fallback con ID."""
    row = {"ad_id": "789"}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 789"


def test_get_ad_label_with_whitespace_name():
    """Cuando ad_name solo tiene espacios, tratar como vacío."""
    row = {"ad_id": "101", "ad_name": "   "}
    result = get_ad_label(row)
    assert result == "Anuncio sin nombre — ID: 101"

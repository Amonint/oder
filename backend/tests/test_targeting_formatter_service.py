import pytest
from oderbiz_analytics.services.targeting_formatter import (
    format_targeting,
    format_geo_locations,
    format_flexible_spec,
)


def test_format_geo_locations_with_countries():
    """Formatear ubicaciones con países."""
    geo_locs = {
        "countries": ["ES", "PT"],
    }
    formatted = format_geo_locations(geo_locs)
    assert formatted["countries"] == ["ES", "PT"]


def test_format_geo_locations_with_regions():
    """Formatear ubicaciones con regiones."""
    geo_locs = {
        "regions": [{"key": "ES-CA"}],
    }
    formatted = format_geo_locations(geo_locs)
    assert len(formatted["regions"]) > 0
    # Debe tener region_name enriquecido
    assert "region_name" in formatted["regions"][0]


def test_format_flexible_spec_with_interests():
    """Agrupar flexible_spec por categoría (intereses)."""
    flexible_spec = [
        {
            "interests": [
                {"id": "6003107", "name": "Technology"},
            ]
        }
    ]
    formatted = format_flexible_spec(flexible_spec)
    assert "interests" in formatted
    assert len(formatted["interests"]) > 0


def test_format_targeting_full_payload():
    """Formatear targeting completo con edades, género, ubicaciones."""
    targeting = {
        "age_min": 18,
        "age_max": 65,
        "genders": [1],  # 1=Male, 2=Female, etc.
        "geo_locations": {
            "countries": ["ES"],
        },
        "flexible_spec": [
            {
                "interests": [
                    {"id": "6003107", "name": "Technology"},
                ]
            }
        ],
    }
    formatted = format_targeting(targeting)
    assert formatted["age_range"] == "18-65 años"
    assert formatted["genders"] == ["Masculino"]
    assert "locations" in formatted
    assert "audiences" in formatted


def test_format_targeting_with_missing_fields():
    """Cuando faltan campos, devolver estructura con valores por defecto."""
    targeting = {"age_min": 18}
    formatted = format_targeting(targeting)
    assert "age_range" in formatted
    assert "genders" in formatted
    assert formatted["genders"] == []


def test_format_geo_locations_with_radius_km():
    """Formatear ubicaciones con regiones y radio de cobertura."""
    geo_locs = {
        "regions": [
            {
                "key": "ES-MD",
                "radius": 50,
            }
        ],
    }
    formatted = format_geo_locations(geo_locs)
    assert len(formatted["regions"]) > 0
    assert formatted["regions"][0]["region_name"] == "Madrid"
    assert formatted["regions"][0]["radius_km"] == 50

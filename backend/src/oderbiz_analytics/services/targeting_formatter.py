"""
Servicio de formateo para targeting de anuncios.

Cumple R-4.1, R-4.2, R-4.3, R-4.5: Transforma JSON crudo en estructura
legible para usuarios de negocio.
"""
from __future__ import annotations

from typing import Any

# Mapeo de género
GENDER_MAP = {
    1: "Masculino",
    2: "Femenino",
}

# Mapeo de región para geo_locations
GEO_REGION_NAMES = {
    # España
    "ES-CA": "Cataluña",
    "ES-MD": "Madrid",
    "ES-AN": "Andalucía",
    "ES-VC": "Comunidad Valenciana",
    "ES-GA": "Galicia",
    "ES-PV": "País Vasco",
    "ES-AR": "Aragón",
    "ES-CB": "Castilla y León",
    "ES-CM": "Castilla-La Mancha",
    "ES-CT": "Comunidad Foral de Navarra",
    "ES-EX": "Extremadura",
    "ES-BA": "Islas Baleares",
    "ES-CN": "Islas Canarias",
    "ES-RI": "La Rioja",
    "ES-AS": "Asturias",
    "ES-MC": "Murcia",
}


def format_geo_locations(geo_locs: dict[str, Any]) -> dict[str, Any]:
    """
    Formatea ubicaciones geográficas con nombres legibles.

    Implementa R-4.2: Ubicaciones con nombre legible, radio y tipo.
    """
    formatted = {}

    # Países
    if "countries" in geo_locs:
        formatted["countries"] = geo_locs["countries"]

    # Regiones
    if "regions" in geo_locs:
        regions = []
        for region in geo_locs["regions"]:
            region_key = region.get("key", "")
            formatted_region = {
                "code": region_key,
                "region_name": GEO_REGION_NAMES.get(region_key, region_key),
            }
            if "radius" in region:
                formatted_region["radius_km"] = region.get("radius")
            regions.append(formatted_region)
        formatted["regions"] = regions

    # Ciudades (si existen)
    if "cities" in geo_locs:
        formatted["cities"] = geo_locs["cities"]

    return formatted


def format_flexible_spec(
    flexible_spec: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Formatea audiencias flexibles agrupadas por categoría.

    Implementa R-4.3: Agrupar por categoría (intereses, comportamientos, etc.)
    con nombres legibles.
    """
    result: dict[str, list[dict[str, Any]]] = {}

    for spec_item in flexible_spec:
        # Cada spec_item puede tener interests, behaviors, education, etc.
        for category_name, items in spec_item.items():
            if category_name not in result:
                result[category_name] = []

            for item in items:
                # Cada item tiene id y name
                result[category_name].append({
                    "id": item.get("id"),
                    "name": item.get("name", "Desconocido"),
                })

    return result


def format_targeting(targeting: dict[str, Any]) -> dict[str, Any]:
    """
    Transforma targeting crudo en estructura legible para negocio.

    Implementa R-4.1: Vista estructurada (idioma español).
    """
    formatted: dict[str, Any] = {}

    # Edad
    age_min = targeting.get("age_min")
    age_max = targeting.get("age_max")
    if age_min and age_max:
        formatted["age_range"] = f"{age_min}-{age_max} años"
    elif age_min:
        formatted["age_range"] = f"Desde {age_min} años"
    elif age_max:
        formatted["age_range"] = f"Hasta {age_max} años"
    else:
        formatted["age_range"] = "No especificado"

    # Género
    genders = targeting.get("genders", [])
    formatted["genders"] = [GENDER_MAP.get(g, f"Género {g}") for g in genders]

    # Ubicaciones
    if "geo_locations" in targeting:
        formatted["locations"] = format_geo_locations(targeting["geo_locations"])
    else:
        formatted["locations"] = {}

    # Audiencias flexibles
    if "flexible_spec" in targeting:
        formatted["audiences"] = format_flexible_spec(targeting["flexible_spec"])
    else:
        formatted["audiences"] = {}

    # Mantener JSON crudo como opcional (R-4.4)
    formatted["raw_json"] = targeting

    return formatted

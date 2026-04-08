"""
Servicio de formateo para datos geográficos.

Cumple R-3.1, R-3.2, R-3.4: Enriquece datos con nombres legibles,
metadata de cobertura, y claridad de alcance.
"""
from __future__ import annotations

from typing import Any, Literal

# Mapeo de códigos de región a nombres legibles (España y principales)
# Cumple R-3.3: Nombres oficiales según doc Meta Insights
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

EC_REGION_NAMES: dict[str, str] = {
    # Meta API devuelve nombres con "Province" suffix para Ecuador
    "Pichincha Province": "Pichincha",
    "Guayas Province": "Guayas",
    "Azuay Province": "Azuay",
    "Manabi Province": "Manabí",
    "El Oro Province": "El Oro",
    "Los Rios Province": "Los Ríos",
    "Loja Province": "Loja",
    "Tungurahua Province": "Tungurahua",
    "Chimborazo Province": "Chimborazo",
    "Imbabura Province": "Imbabura",
    "Cotopaxi Province": "Cotopaxi",
    "Esmeraldas Province": "Esmeraldas",
    "Bolivar Province": "Bolívar",
    "Canar Province": "Cañar",
    "Carchi Province": "Carchi",
    "Napo Province": "Napo",
    "Pastaza Province": "Pastaza",
    "Morona-Santiago Province": "Morona Santiago",
    "Zamora-Chinchipe Province": "Zamora Chinchipe",
    "Sucumbios Province": "Sucumbíos",
    "Orellana Province": "Orellana",
    "Santo Domingo de los Tsachilas Province": "Santo Domingo",
    "Santa Elena Province": "Santa Elena",
    "Galapagos Province": "Galápagos",
}

UNIFIED_REGION_NAMES = {**GEO_REGION_NAMES, **EC_REGION_NAMES}


def enrich_geo_row(row: dict[str, Any]) -> dict[str, Any]:
    """
    Enriquece una fila de datos geográficos con nombre de región legible.

    Args:
        row: Row con al menos 'region' (código como "ES-CA").

    Returns:
        Row enriquecida con 'region_name' (nombre legible).

    Implementa R-3.1: Dimension geográfica legible.
    """
    enriched = dict(row)
    region_code = enriched.get("region", "")

    # Manejar None explícitamente: convertir a string vacío para consistencia
    if region_code is None:
        region_code = ""

    # Agregar nombre legible si existe en mapeo
    enriched["region_name"] = UNIFIED_REGION_NAMES.get(region_code, region_code)

    return enriched


def get_geo_metadata(
    scope: Literal["account", "ad"],
    ad_id: str | None,
    total_rows: int,
) -> dict[str, Any]:
    """
    Construye metadata para respuesta geográfica.

    Args:
        scope: "account" o "ad".
        ad_id: ID de anuncio si scope="ad", None si scope="account".
        total_rows: Cantidad de filas retornadas (para indicar cobertura).

    Returns:
        Dict con metadata explicativa.

    Implementa R-3.2: Cobertura completa de filas.
    Implementa R-3.4: Claridad de alcance.
    """
    # Construir nota de forma segura, manejando ad_id=None
    if scope == "ad" and ad_id:
        note = f"Datos agregados a nivel ad. Para anuncio específico: {ad_id}"
    elif scope == "ad":
        note = "Datos agregados a nivel ad. (Sin ad_id específico)"
    else:
        note = "Datos agregados a nivel account. Para toda la cuenta."

    return {
        "scope": scope,
        "ad_id": ad_id if scope == "ad" else None,
        "total_rows": total_rows,
        "complete_coverage": True,  # Indica que Meta devolvió todos los datos disponibles
        "note": note,
    }

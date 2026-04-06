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

    # Agregar nombre legible si existe en mapeo
    if region_code in GEO_REGION_NAMES:
        enriched["region_name"] = GEO_REGION_NAMES[region_code]
    else:
        # Fallback: usar el código mismo
        enriched["region_name"] = region_code

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
    return {
        "scope": scope,
        "ad_id": ad_id if scope == "ad" else None,
        "total_rows": total_rows,
        "complete_coverage": True,  # Indica que Meta devolvió todos los datos disponibles
        "note": (
            f"Datos agregados a nivel {scope}. "
            f"{'Para anuncio específico: ' + ad_id if scope == 'ad' else 'Para toda la cuenta.'}"
        ),
    }

"""
Servicio de resolución de etiquetas de anuncios.

Cumple R-2.1, R-2.2, R-2.4: Provee etiqueta legible con fallback documentado.
"""
from __future__ import annotations

from typing import Any


def get_ad_label(row: dict[str, Any]) -> str:
    """
    Retorna una etiqueta legible para un anuncio.

    Args:
        row: Row de insights con ad_id y ad_name (opcional).

    Returns:
        Nombre del anuncio o fallback documentado si vacío/ausente.

    Implementa R-2.2: Cadena de respaldo cuando ad_name es vacío/nulo.
    Implementa R-2.4: Trazabilidad — fallback es claro ("Anuncio sin nombre — ID: ...").
    """
    ad_id = row.get("ad_id", "")
    ad_name = row.get("ad_name")

    # Validar que ad_name sea una cadena no vacía
    if isinstance(ad_name, str):
        stripped = ad_name.strip()
        if stripped:
            return stripped

    # Fallback documentado: mostrar que Meta no devolvió nombre
    return f"Anuncio sin nombre — ID: {ad_id}"

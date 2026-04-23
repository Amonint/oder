"""
Servicio de resolución de etiquetas de anuncios.

Cumple R-2.1, R-2.2, R-2.4: Provee etiqueta legible con fallback documentado.
"""
from __future__ import annotations

import re
from typing import Any

_EMPTY_PUBLICATION_RE = re.compile(r'^(?:publicaci[oó]n:\s*)?["“”\'`]\s*["“”\'`]$', re.IGNORECASE)


def is_missing_meta_name(value: object) -> bool:
    text = str(value or "").strip()
    if not text:
        return True
    return bool(_EMPTY_PUBLICATION_RE.match(text))


def format_ad_label(
    *,
    ad_id: object,
    ad_name: object = None,
    creative_name: object = None,
    story_id: object = None,
) -> str:
    ad_id_text = str(ad_id or "").strip()
    ad_name_text = str(ad_name or "").strip()
    if ad_name_text and not is_missing_meta_name(ad_name_text):
        return ad_name_text

    creative_name_text = str(creative_name or "").strip()
    if creative_name_text:
        if ad_id_text:
            return f"Publicación promocionada ({creative_name_text}) — ID: {ad_id_text}"
        return f"Publicación promocionada ({creative_name_text})"

    story_id_text = str(story_id or "").strip()
    if story_id_text:
        short_story = story_id_text[-10:] if len(story_id_text) > 10 else story_id_text
        if ad_id_text:
            return f"Publicación promocionada (story …{short_story}) — ID: {ad_id_text}"
        return f"Publicación promocionada (story …{short_story})"

    if ad_id_text:
        return f"Anuncio sin nombre — ID: {ad_id_text}"
    return "Anuncio sin nombre"


def infer_ad_label_source(
    *,
    ad_name: object = None,
    creative_name: object = None,
    story_id: object = None,
) -> str:
    ad_name_text = str(ad_name or "").strip()
    if ad_name_text and not is_missing_meta_name(ad_name_text):
        return "meta_ad_name"
    creative_name_text = str(creative_name or "").strip()
    if creative_name_text:
        return "creative_name"
    story_id_text = str(story_id or "").strip()
    if story_id_text:
        return "story_id"
    return "ad_id_fallback"


def format_entity_name(*, kind: str, entity_id: object, name: object) -> str:
    text = str(name or "").strip()
    entity_id_text = str(entity_id or "").strip()
    if text and not is_missing_meta_name(text):
        return text
    if entity_id_text:
        return f"{kind} sin nombre (ID: {entity_id_text})"
    return f"{kind} sin nombre"


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
    ad_id = row.get("ad_id") or row.get("id", "")
    ad_name = row.get("ad_name") or row.get("name")
    creative_name = row.get("creative_name")
    story_id = row.get("effective_object_story_id")
    return format_ad_label(
        ad_id=ad_id,
        ad_name=ad_name,
        creative_name=creative_name,
        story_id=story_id,
    )

from __future__ import annotations


def normalize_ad_account_id(ad_account_id: str) -> str:
    """Añade prefijo `act_` a IDs numéricos para cumplir el formato de Meta Graph API."""
    aid = ad_account_id.strip()
    if aid.startswith("act_"):
        return aid
    if aid.isdigit():
        return f"act_{aid}"
    return aid

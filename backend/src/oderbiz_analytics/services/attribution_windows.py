"""Shared Meta Ads attribution window codes (UI ↔ Marketing API)."""

from __future__ import annotations

VALID_UI_WINDOWS: dict[str, str] = {
    "click_1d": "1 día tras clic",
    "click_7d": "7 días tras clic",
    "click_28d": "28 días tras clic",
    "view_1d": "1 día tras impresión",
    "view_7d": "7 días tras impresión",
}

UI_TO_META: dict[str, str] = {
    "click_1d": "1d_click",
    "click_7d": "7d_click",
    "click_28d": "28d_click",
    "view_1d": "1d_view",
    "view_7d": "7d_view",
}


def meta_window_list(ui_code: str) -> list[str]:
    if ui_code not in VALID_UI_WINDOWS:
        raise ValueError(f"unknown attribution window: {ui_code}")
    return [UI_TO_META[ui_code]]

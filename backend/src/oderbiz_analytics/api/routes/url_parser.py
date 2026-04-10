# backend/src/oderbiz_analytics/api/routes/url_parser.py
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class ResolveStrategy(str, Enum):
    FACEBOOK_ALIAS = "facebook_alias"
    FACEBOOK_ID = "facebook_id"
    INSTAGRAM_USERNAME = "instagram_username"
    FREE_TEXT = "free_text"


@dataclass
class ParseResult:
    strategy: ResolveStrategy
    value: str


_FB_PROFILE_ID = re.compile(r'facebook\.com/profile\.php\?id=(\d+)', re.IGNORECASE)
_FB_PAGES_ID   = re.compile(r'facebook\.com/pages/[^/]+/(\d+)', re.IGNORECASE)
_FB_ALIAS      = re.compile(r'facebook\.com/([A-Za-z0-9._%-]+)', re.IGNORECASE)
_IG_USERNAME   = re.compile(r'instagram\.com/([A-Za-z0-9._]+)/?', re.IGNORECASE)

_FB_RESERVED = frozenset({
    "home", "login", "watch", "groups", "events", "marketplace",
    "pages", "help", "share", "sharer",
})
_IG_RESERVED = frozenset({"p", "reel", "explore", "accounts", "direct", "stories"})


def parse_competitor_input(text: str) -> ParseResult:
    text = text.strip()

    m = _FB_PROFILE_ID.search(text)
    if m:
        return ParseResult(strategy=ResolveStrategy.FACEBOOK_ID, value=m.group(1))

    m = _FB_PAGES_ID.search(text)
    if m:
        return ParseResult(strategy=ResolveStrategy.FACEBOOK_ID, value=m.group(1))

    m = _FB_ALIAS.search(text)
    if m:
        alias = m.group(1).rstrip("/")
        if alias.lower() not in _FB_RESERVED:
            return ParseResult(strategy=ResolveStrategy.FACEBOOK_ALIAS, value=alias)
        return ParseResult(strategy=ResolveStrategy.FREE_TEXT, value=text)

    m = _IG_USERNAME.search(text)
    if m:
        username = m.group(1)
        if username.lower() not in _IG_RESERVED:
            return ParseResult(strategy=ResolveStrategy.INSTAGRAM_USERNAME, value=username)
        return ParseResult(strategy=ResolveStrategy.FREE_TEXT, value=text)

    return ParseResult(strategy=ResolveStrategy.FREE_TEXT, value=text)

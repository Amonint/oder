# backend/tests/test_url_parser.py
import pytest
from oderbiz_analytics.api.routes.url_parser import parse_competitor_input, ResolveStrategy


@pytest.mark.parametrize("url,expected_strategy,expected_value", [
    ("https://www.facebook.com/FarmaciasAmericanas", ResolveStrategy.FACEBOOK_ALIAS, "FarmaciasAmericanas"),
    ("https://facebook.com/farmacias.americanas.ec", ResolveStrategy.FACEBOOK_ALIAS, "farmacias.americanas.ec"),
    ("https://www.facebook.com/profile.php?id=123456789", ResolveStrategy.FACEBOOK_ID, "123456789"),
    ("https://www.facebook.com/pages/Farmacias/123456789", ResolveStrategy.FACEBOOK_ID, "123456789"),
    ("https://www.instagram.com/farmaciasamericanas_ec/", ResolveStrategy.INSTAGRAM_USERNAME, "farmaciasamericanas_ec"),
    ("https://instagram.com/farmaciasamericanas_ec", ResolveStrategy.INSTAGRAM_USERNAME, "farmaciasamericanas_ec"),
    ("Farmacias Americanas", ResolveStrategy.FREE_TEXT, "Farmacias Americanas"),
    ("Nike Ecuador", ResolveStrategy.FREE_TEXT, "Nike Ecuador"),
])
def test_parse_competitor_input(url, expected_strategy, expected_value):
    result = parse_competitor_input(url)
    assert result.strategy == expected_strategy
    assert result.value == expected_value


def test_facebook_home_url_is_free_text():
    result = parse_competitor_input("https://www.facebook.com/home")
    assert result.strategy == ResolveStrategy.FREE_TEXT


def test_instagram_reel_url_is_free_text():
    result = parse_competitor_input("https://www.instagram.com/reel/abc123")
    assert result.strategy == ResolveStrategy.FREE_TEXT


def test_facebook_watch_url_is_free_text():
    result = parse_competitor_input("https://www.facebook.com/watch")
    assert result.strategy == ResolveStrategy.FREE_TEXT


def test_instagram_tv_url_is_free_text():
    result = parse_competitor_input("https://www.instagram.com/tv/abc123")
    assert result.strategy == ResolveStrategy.FREE_TEXT


def test_empty_input_is_free_text():
    result = parse_competitor_input("   ")
    assert result.strategy == ResolveStrategy.FREE_TEXT
    assert result.value == ""


def test_facebook_alias_with_query_params():
    result = parse_competitor_input("https://www.facebook.com/brand?ref=ts")
    assert result.strategy == ResolveStrategy.FACEBOOK_ALIAS
    assert result.value == "brand"


def test_ads_library_url_extracts_page_id():
    url = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=56050620920"
    result = parse_competitor_input(url)
    assert result.strategy == ResolveStrategy.FACEBOOK_ID
    assert result.value == "56050620920"


def test_ads_library_url_full_params():
    url = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[direction]=desc&sort_data[mode]=total_impressions&view_all_page_id=56050620920"
    result = parse_competitor_input(url)
    assert result.strategy == ResolveStrategy.FACEBOOK_ID
    assert result.value == "56050620920"

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

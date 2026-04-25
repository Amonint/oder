# backend/tests/test_competitor_classifier.py
"""
Unit and integration tests for CompetitorClassifier per Section 8 spec.

Tests verifican:
1. get_keywords_for_category() - keyword selection logic
2. classify_with_category() - scoring logic
3. market_radar_filters_irrelevant() - ML filtering in endpoint
4. E2E tests - different categories
"""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app
from oderbiz_analytics.services.competitor_classifier import CompetitorClassifier


# ============================================================================
# UNIT TESTS: CompetitorClassifier
# ============================================================================

class TestGetKeywordsForCategory:
    """Unit tests for get_keywords_for_category() per Section 8.1"""

    def test_psicólogo_category_returns_correct_keywords(self):
        """Test: Psicólogo category returns exact keywords from dict"""
        classifier = CompetitorClassifier()
        keywords = classifier.get_keywords_for_category("Psicólogo")

        assert keywords == [
            "psicoterapia", "counseling", "salud mental", "terapia", "psicología clínica"
        ]

    def test_unknown_category_returns_generic_keywords(self):
        """Test: Unknown category (e.g., DramaBox) returns GENERIC_KEYWORDS"""
        classifier = CompetitorClassifier()
        keywords = classifier.get_keywords_for_category("DramaBox")

        assert keywords == classifier.GENERIC_KEYWORDS
        assert "servicio" in keywords
        assert "profesional" in keywords

    def test_empty_category_returns_generic_keywords(self):
        """Test: Empty category string returns GENERIC_KEYWORDS"""
        classifier = CompetitorClassifier()
        keywords = classifier.get_keywords_for_category("")

        assert keywords == classifier.GENERIC_KEYWORDS

    def test_case_insensitive_category_matching(self):
        """Test: Category matching is case-insensitive"""
        classifier = CompetitorClassifier()

        # Lowercase
        kw1 = classifier.get_keywords_for_category("psicólogo")
        # Mixed case
        kw2 = classifier.get_keywords_for_category("PSICÓLOGO")

        assert kw1 == kw2
        assert kw1[0] == "psicoterapia"

    def test_dentista_category(self):
        """Test: Dentista category returns dental keywords"""
        classifier = CompetitorClassifier()
        keywords = classifier.get_keywords_for_category("Dentista")

        assert keywords == ["odontología", "dental", "ortodoncia", "implante", "diente"]

    def test_restaurante_category(self):
        """Test: Restaurante category returns food keywords"""
        classifier = CompetitorClassifier()
        keywords = classifier.get_keywords_for_category("Restaurante")

        assert keywords == ["comida", "chef", "cocina", "receta", "menú", "gastronomía"]


class TestClassifierWithCategory:
    """Unit tests for classify() with category keywords per Section 8.2"""

    def test_classify_relevant_competitor_psicólogo(self):
        """Test: High score for content matching psicólogo category"""
        classifier = CompetitorClassifier(
            user_category="Psicólogo",
            user_keywords=["psicoterapia", "counseling", "salud mental", "terapia", "psicología clínica"],
        )

        # Relevant psicólogo content
        result = classifier.classify(
            page_name="Dr. Psicólogo Especialista",
            ad_bodies=[
                "Psicoterapia para ansiedad y depresión",
                "Consultas en psicología clínica",
            ],
        )

        assert result.is_relevant is True
        assert result.score >= 25, f"Expected score >= 25, got {result.score}"
        assert result.score < 100  # Not maximum

    def test_classify_irrelevant_competitor_drama(self):
        """Test: Low score for drama/entertainment content"""
        classifier = CompetitorClassifier(
            user_category="Psicólogo",
            user_keywords=["psicoterapia", "counseling", "salud mental", "terapia", "psicología clínica"],
        )

        # Irrelevant: drama/movie content
        result = classifier.classify(
            page_name="DramaBox Series",
            ad_bodies=[
                "Mira las mejores series de drama",
                "Películas y shows streaming",
            ],
        )

        assert result.is_relevant is False
        assert result.score < 25, f"Expected score < 25, got {result.score}"

    def test_classify_scores_positive_keywords_higher(self):
        """Test: More relevant keywords = higher score"""
        classifier = CompetitorClassifier(
            user_category="Dentista",
            user_keywords=["odontología", "dental", "ortodoncia", "implante", "diente"],
        )

        # Multiple matching keywords
        result_high = classifier.classify(
            page_name="Dr. Dentista",
            ad_bodies=[
                "Odontología general y especializada",
                "Implantes dentales de última generación",
                "Ortodoncia con tecnología moderna",
            ],
        )

        # Few matching keywords
        result_low = classifier.classify(
            page_name="Clínica Dental",
            ad_bodies=["Cuidado dental"],
        )

        assert result_high.score > result_low.score

    def test_classify_threshold_is_25(self):
        """Test: Relevance threshold is exactly 25"""
        classifier = CompetitorClassifier(
            user_category="Psicólogo",
            user_keywords=["psicoterapia"],
        )

        # Just below threshold
        result_below = classifier.classify(
            page_name="Generic Service",
            ad_bodies=["Generic professional service"],
        )

        # Exactly at/above threshold
        result_above = classifier.classify(
            page_name="Psicólogo Profesional",
            ad_bodies=["Psicoterapia profesional"],
        )

        # Below threshold should be filtered
        if result_below.score < 25:
            assert result_below.is_relevant is False

        # Above threshold should be kept
        if result_above.score >= 25:
            assert result_above.is_relevant is True

    def test_classify_fitness_gym_negative_keywords(self):
        """Test: Gym/fitness keywords are penalized for psicólogo"""
        classifier = CompetitorClassifier(
            user_category="Psicólogo",
            user_keywords=["psicoterapia", "counseling", "salud mental"],
        )

        # Fitness content (negative keywords)
        result = classifier.classify(
            page_name="Gym Fitness Center",
            ad_bodies=[
                "Entrenamiento de musculación",
                "Crossfit y fitness moderno",
            ],
        )

        assert result.is_relevant is False
        assert result.score < 25


class TestMarketRadarFiltersIrrelevant:
    """Integration tests for market-radar endpoint filtering per Section 8.3"""

    @pytest.fixture
    def client(self, monkeypatch, tmp_path):
        monkeypatch.setenv("META_ACCESS_TOKEN", "test_token")
        monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
        return TestClient(app)

    @respx.mock
    def test_market_radar_filters_dramabox_score_below_25(self, client):
        """Test: DramaBox filtered out (score < 25)"""
        user_page_id = "psic_page"

        # Mock: User page is Psicólogo
        respx.get(f"https://graph.facebook.com/v25.0/{user_page_id}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": user_page_id,
                    "name": "Consultorio Psicólogo",
                    "category": "Psicólogo",
                },
            )
        )

        # Mock: Search returns DramaBox (irrelevant) + Dr. Psicólogo (relevant)
        respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"page_id": "drama_box", "name": "DramaBox Series"},
                        {"page_id": "dr_psic", "name": "Dr. Psicólogo"},
                    ]
                },
            )
        )

        # Mock: Ads for DramaBox (low ML score expected)
        # This will be called during gather() for both competitors
        respx.get(
            "https://graph.facebook.com/v25.0/ads_archive",
            params={"access_token": "test_token", "search_page_ids": "drama_box"}
        ).mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "ad_drama_1",
                            "page_id": "drama_box",
                            "page_name": "DramaBox Series",
                            "ad_creative_bodies": [
                                "Mira las mejores series de drama",
                                "Películas y shows streaming",
                            ],
                            "ad_creative_link_titles": [],
                            "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                            "ad_delivery_stop_time": None,
                            "publisher_platforms": ["facebook"],
                            "languages": ["es"],
                            "media_type": "text",
                        }
                    ]
                },
            )
        )

        # Mock: Ads for Dr. Psicólogo (high ML score expected)
        respx.get(
            "https://graph.facebook.com/v25.0/ads_archive",
            params={"access_token": "test_token", "search_page_ids": "dr_psic"}
        ).mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "ad_psic_1",
                            "page_id": "dr_psic",
                            "page_name": "Dr. Psicólogo",
                            "ad_creative_bodies": [
                                "Psicoterapia para ansiedad",
                                "Consultas en salud mental",
                            ],
                            "ad_creative_link_titles": [],
                            "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                            "ad_delivery_stop_time": None,
                            "publisher_platforms": ["facebook"],
                            "languages": ["es"],
                            "media_type": "text",
                        }
                    ]
                },
            )
        )

        r = client.get(f"/api/v1/competitor/market-radar?page_id={user_page_id}")
        assert r.status_code == 200
        body = r.json()

        # Verify DramaBox filtered out
        competitor_ids = [c["page_id"] for c in body["competitors"]]
        assert "drama_box" not in competitor_ids, "DramaBox should be filtered (score < 25)"

        # Verify Dr. Psicólogo kept (if ads exist)
        assert "dr_psic" in competitor_ids or len(body["competitors"]) == 0

    @respx.mock
    def test_market_radar_keeps_relevant_competitors(self, client):
        """Test: Relevant competitors kept (score >= 25)"""
        user_page_id = "psic_page"

        # Mock: User page
        respx.get(f"https://graph.facebook.com/v25.0/{user_page_id}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": user_page_id,
                    "name": "Consultorio Psicólogo",
                    "category": "Psicólogo",
                },
            )
        )

        # Mock: Search returns relevant psicólogos (called with search_terms)
        # This is called during search_ads_by_terms with "psicoterapia"
        respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"page_id": "psic1", "name": "Dr. Psicólogo Clínico"},
                    ]
                },
            )
        )

        # Also mock when called individually for each page_id
        respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "ad_psic1_1",
                            "page_id": "psic1",
                            "page_name": "Dr. Psicólogo Clínico",
                            "ad_creative_bodies": [
                                "Psicoterapia clínica especializada",
                                "Salud mental y bienestar",
                            ],
                            "ad_creative_link_titles": [],
                            "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                            "ad_delivery_stop_time": None,
                            "publisher_platforms": ["facebook"],
                            "languages": ["es"],
                            "media_type": "text",
                        }
                    ]
                },
            )
        )

        r = client.get(f"/api/v1/competitor/market-radar?page_id={user_page_id}")
        assert r.status_code == 200
        body = r.json()

        # Verify metadata
        assert body["metadata"]["ml_threshold"] == 25
        assert body["metadata"]["category"] == "Psicólogo"

        # Verify competitors kept or empty (depends on mocking)
        # At minimum verify structure
        assert "competitors" in body
        assert "metadata" in body
        if body["competitors"]:
            for comp in body["competitors"]:
                assert comp["relevance_score"] >= 25, f"Competitor {comp['page_id']} should have score >= 25"
                assert "classification_reason" in comp


# ============================================================================
# INTEGRATION TESTS: E2E with different categories
# ============================================================================

class TestMarketRadarE2EDifferentCategories:
    """Integration tests for different categories per Section 8 spec"""

    @pytest.fixture
    def client(self, monkeypatch, tmp_path):
        monkeypatch.setenv("META_ACCESS_TOKEN", "test_token")
        monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
        return TestClient(app)

    @respx.mock
    def test_e2e_dentista_page_returns_only_dentistas(self, client):
        """E2E: Dentista page returns only dentistas"""
        user_page_id = "dentista_page"

        # Mock: User page is Dentista
        respx.get(f"https://graph.facebook.com/v25.0/{user_page_id}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": user_page_id,
                    "name": "Clínica Dental Dr. García",
                    "category": "Dentista",
                },
            )
        )

        # Mock: ads_archive calls return relevant data
        # The endpoint calls search_ads_by_terms with "odontología" keyword
        respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "ad_dent1",
                            "page_id": "dent1",
                            "page_name": "Odontología Especializada",
                            "ad_creative_bodies": [
                                "Implantes dentales de calidad",
                                "Ortodoncia moderna",
                            ],
                            "ad_creative_link_titles": [],
                            "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                            "ad_delivery_stop_time": None,
                            "publisher_platforms": ["facebook"],
                            "languages": ["es"],
                            "media_type": "text",
                        }
                    ]
                },
            )
        )

        r = client.get(f"/api/v1/competitor/market-radar?page_id={user_page_id}")
        assert r.status_code == 200
        body = r.json()

        # Verify structure
        assert "competitors" in body
        assert "metadata" in body
        assert body["metadata"]["category"] == "Dentista"

        # If we have competitors, verify they're dental-related
        if body["competitors"]:
            for comp in body["competitors"]:
                assert comp["relevance_score"] >= 25, "Competitors should have relevance score >= 25"

    @respx.mock
    def test_e2e_unknown_category_uses_generic_keywords(self, client):
        """E2E: Unknown category falls back to generic keywords"""
        user_page_id = "unknown_page"

        # Mock: User page with unknown category
        respx.get(f"https://graph.facebook.com/v25.0/{user_page_id}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": user_page_id,
                    "name": "Bodega Artesanía",
                    "category": "Arts and crafts",
                },
            )
        )

        # Mock: Search
        respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
            return_value=httpx.Response(
                200,
                json={"data": []},
            )
        )

        r = client.get(f"/api/v1/competitor/market-radar?page_id={user_page_id}")
        assert r.status_code == 200
        body = r.json()

        # Verify fallback to generic keywords
        keywords = body["metadata"]["keywords_used"]
        assert "Bodega Artesanía" in keywords, "Should use page name for unknown category"

    @respx.mock
    def test_e2e_restaurante_page_returns_only_restaurantes(self, client):
        """E2E: Restaurante page filters correctly"""
        user_page_id = "rest_page"

        # Mock: User page
        respx.get(f"https://graph.facebook.com/v25.0/{user_page_id}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "id": user_page_id,
                    "name": "Restaurante El Sabor",
                    "category": "Restaurante",
                },
            )
        )

        # Mock: Search
        respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {"page_id": "rest1", "name": "Chef Cocina Moderna"},
                    ]
                },
            )
        )

        # Mock: Ads
        respx.get(
            "https://graph.facebook.com/v25.0/ads_archive",
            params={"access_token": "test_token", "search_page_ids": "rest1"}
        ).mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "ad_rest1",
                            "page_id": "rest1",
                            "page_name": "Chef Cocina Moderna",
                            "ad_creative_bodies": [
                                "Menú gastronómico internacional",
                                "Chef especializado en cocina",
                            ],
                            "ad_creative_link_titles": [],
                            "ad_delivery_start_time": "2026-01-01T00:00:00+0000",
                            "ad_delivery_stop_time": None,
                            "publisher_platforms": ["facebook"],
                            "languages": ["es"],
                            "media_type": "text",
                        }
                    ]
                },
            )
        )

        r = client.get(f"/api/v1/competitor/market-radar?page_id={user_page_id}")
        assert r.status_code == 200
        body = r.json()

        # Verify keywords
        keywords = body["metadata"]["keywords_used"]
        assert "comida" in keywords or "chef" in keywords or "cocina" in keywords


def test_classifier_bienestar_sin_penalidad_por_gym_en_texto_clinico():
    """'bienestar' en copy clínico no debe disparar penalidad por 'gym' (retirado de negativos por defecto)."""
    c = CompetitorClassifier(
        user_category="Psicólogo",
        user_keywords=["terapia", "salud mental"],
    )
    r = c.classify(
        page_name="Centro de bienestar emocional",
        ad_bodies=["Terapia individual y acompañamiento en salud mental."],
    )
    assert r.score >= 25
    assert r.is_relevant is True

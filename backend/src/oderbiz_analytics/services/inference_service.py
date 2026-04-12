from typing import Optional, Tuple
import re


class ProvinceInferenceService:
    """Infer Ecuador province from multiple sources."""

    PROVINCES_EC = {
        "loja": "Loja",
        "pichincha": "Pichincha",
        "guayas": "Guayas",
        "tungurahua": "Tungurahua",
        "chimborazo": "Chimborazo",
        "imbabura": "Imbabura",
        "carchi": "Carchi",
        "sucumbíos": "Sucumbíos",
        "orellana": "Orellana",
        "pastaza": "Pastaza",
        "morona santiago": "Morona Santiago",
        "zamora": "Zamora Chinchipe",
        "santa elena": "Santa Elena",
        "santo domingo": "Santo Domingo de los Tsáchilas",
        "cotopaxi": "Cotopaxi",
        "manabí": "Manabí",
        "los ríos": "Los Ríos",
        "el oro": "El Oro",
        "azuay": "Azuay",
        "cañar": "Cañar",
    }

    # Major cities mapped to provinces
    CITIES_TO_PROVINCE = {
        "quito": "Pichincha",
        "guayaquil": "Guayas",
        "cuenca": "Azuay",
        "loja": "Loja",
        "machala": "El Oro",
        "manta": "Manabí",
        "ambato": "Tungurahua",
        "latacunga": "Cotopaxi",
        "ibarra": "Imbabura",
        "riobamba": "Chimborazo",
        "santo domingo": "Santo Domingo de los Tsáchilas",
        "esmeraldas": "Esmeraldas",
        "puyo": "Pastaza",
        "tena": "Napo",
        "nuevo rocafuerte": "Orellana",
        "tulcán": "Carchi",
        "sucúa": "Morona Santiago",
        "zamora": "Zamora Chinchipe",
        "santa rosa": "El Oro",
        "puerto lópez": "Santa Elena",
    }

    @staticmethod
    def infer_province(
        page_id: str,
        page_name: str,
        page_location: Optional[dict],
        ads: list
    ) -> Tuple[Optional[str], float, str]:
        """
        Infer province with confidence score.
        Returns: (province_name, confidence: 0.0-1.0, source)
        """

        # Step 1: Meta location (highest confidence)
        if page_location and page_location.get("city"):
            city = page_location["city"].lower()
            province = ProvinceInferenceService.PROVINCES_EC.get(city)
            if province:
                return province, 1.0, "meta_location"

        # Step 2: Page name heuristic
        name_lower = page_name.lower()
        for keyword, province in ProvinceInferenceService.PROVINCES_EC.items():
            if keyword in name_lower:
                return province, 0.7, "page_name"

        # Step 3: Ad copy heuristic - look for cities and provinces
        for ad in ads[:10]:
            copy = (
                " ".join(ad.get("ad_creative_bodies") or []) +
                " " +
                " ".join(ad.get("ad_creative_link_descriptions") or [])
            ).lower()

            # First try to find cities (highest precision)
            for city, province in ProvinceInferenceService.CITIES_TO_PROVINCE.items():
                # Look for city mentions: "en Loja", "de Loja", "Loja", etc.
                if re.search(rf'\b{city}\b', copy):
                    return province, 0.6, "ad_copy_city"

            # Then try provinces with direct mention
            for keyword, province in ProvinceInferenceService.PROVINCES_EC.items():
                if f"en {keyword}" in copy or f"desde {keyword}" in copy:
                    return province, 0.5, "ad_copy_province"

        # Step 4: Landing page (would need URL extraction)
        # For now, skip as requires additional scraping

        # Fallback
        return None, 0.0, "unknown"

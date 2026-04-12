"""
Clasificador inteligente para identificar competidores relevantes.
Usa reglas + scoring basado en contenido y contexto del usuario.
"""

import re
from collections import Counter
from dataclasses import dataclass


@dataclass
class ClassificationResult:
    """Resultado de clasificación de un competidor."""
    is_relevant: bool
    score: float  # 0-100
    factors: dict  # Desglose de scoring
    reason: str


class CompetitorClassifier:
    """
    Clasificador de competidores usando análisis de contenido + reglas inteligentes.
    """

    # Default keywords for common business categories
    CATEGORY_KEYWORDS = {
        "Psicólogo": ["psicoterapia", "counseling", "salud mental", "terapia", "psicología clínica"],
        "Dentista": ["odontología", "dental", "ortodoncia", "implante", "diente"],
        "Restaurante": ["comida", "chef", "cocina", "receta", "menú", "gastronomía"],
        "Abogado": ["derecho", "legal", "asesoría", "abogacía", "litigio"],
        "Médico": ["medicina", "clínica", "consulta médica", "diagnóstico", "tratamiento"],
        "Contador": ["contabilidad", "impuestos", "auditoría", "fiscal", "tributario"],
        "Peluquería": ["peluquería", "corte", "cabello", "estética", "salon"],
        "Gym": ["fitness", "entrenamiento", "ejercicio", "musculación", "crossfit"],
        "Tienda": ["venta", "compra", "tienda", "boutique", "retail"],
        "Consultor": ["consultoría", "asesor", "coaching", "mentoring", "estrategia"],
    }

    # Fallback keywords when category not found
    GENERIC_KEYWORDS = [
        "servicio", "profesional", "consulta", "experto", "asesor",
        "especialista", "centro", "clínica", "empresa", "negocio"
    ]

    def __init__(
        self,
        user_category: str = "",
        user_keywords: list[str] | None = None,
        custom_negative_keywords: list[str] | None = None,
    ):
        """
        Args:
            user_category: Categoría de la página del usuario (ej: "Psicólogo")
            user_keywords: Palabras clave que definen competidores relevantes
            custom_negative_keywords: Palabras que indican NO competidor
        """
        self.user_category = user_category.lower() if user_category else ""
        self.user_keywords = [kw.lower() for kw in (user_keywords or [])]
        
        # Palabras clave negativas (ruido general)
        self.default_negative_keywords = {
            "drama", "película", "series", "film", "movie", "show", "tvshow",
            "streaming", "netflix", "youtube", "video", "contenido",
            "juego", "game", "gaming", "casino", "apuesta", "bet",
            "tienda", "compra", "venta", "ecommerce", "shop", "store",
            "deporte", "sports", "fitness", "gym",
        }
        
        # Agregar custom keywords negativas
        self.negative_keywords = self.default_negative_keywords.copy()
        if custom_negative_keywords:
            self.negative_keywords.update(kw.lower() for kw in custom_negative_keywords)
        
        # Palabras clave positivas (general)
        self.positive_indicators = {
            "servicio", "consulta", "asesor", "profesional", "experto",
            "especialista", "clínica", "consultorio", "centro",
            "atención", "cuidado", "bienestar", "salud", "wellness",
        }
    
    def _extract_text(self, page_name: str, ad_bodies: list[str]) -> str:
        """Extrae y normaliza todo el texto disponible."""
        all_text = [page_name or ""]
        all_text.extend(ad_bodies or [])
        combined = " ".join(all_text)
        return combined.lower()
    
    def _count_keywords(self, text: str, keywords: set[str]) -> dict:
        """Cuenta ocurrencias de keywords en el texto."""
        # Buscar palabras completas (no substrings)
        word_list = re.findall(r"\b\w+\b", text)
        counts = Counter(word_list)
        
        matches = {}
        for keyword in keywords:
            if keyword in counts:
                matches[keyword] = counts[keyword]
        
        return matches
    
    def _score_negative(self, text: str) -> float:
        """Calcula penalización por palabras negativas. Retorna 0-100."""
        negative_matches = self._count_keywords(text, self.negative_keywords)
        
        if not negative_matches:
            return 0.0
        
        # Cada palabra negativa = -20 puntos, máximo -80
        penalty = min(len(negative_matches) * 20, 80)
        return penalty
    
    def _score_positive(self, text: str) -> float:
        """Calcula bonificación por palabras positivas. Retorna 0-50."""
        # Palabras del usuario
        user_kw_matches = self._count_keywords(text, set(self.user_keywords))
        user_score = min(len(user_kw_matches) * 15, 30)
        
        # Palabras positivas generales
        positive_matches = self._count_keywords(text, self.positive_indicators)
        positive_score = min(len(positive_matches) * 5, 20)
        
        return user_score + positive_score
    
    def _score_category_match(self) -> float:
        """Bonificación si la página del usuario tiene categoría."""
        return 10.0 if self.user_category else 0.0

    def get_keywords_for_category(self, category: str) -> list[str]:
        """Get keywords for a category, with fallback to generic keywords."""
        if not category:
            return self.GENERIC_KEYWORDS

        # Normalize category (lowercase, strip)
        cat_normalized = category.lower().strip()

        # Check if category exists in keywords DB
        for key in self.CATEGORY_KEYWORDS:
            if key.lower() == cat_normalized:
                return self.CATEGORY_KEYWORDS[key]

        # Fallback: unknown category → use generic keywords
        return self.GENERIC_KEYWORDS

    def classify(
        self,
        page_name: str,
        ad_bodies: list[str],
    ) -> ClassificationResult:
        """
        Clasifica si un competidor es relevante.
        
        Args:
            page_name: Nombre de la página del anuncio
            ad_bodies: Lista de cuerpos de anuncios
        
        Returns:
            ClassificationResult con score 0-100 y factores
        """
        text = self._extract_text(page_name, ad_bodies)
        
        # Calcular componentes
        negative_penalty = self._score_negative(text)
        positive_bonus = self._score_positive(text)
        category_bonus = self._score_category_match()
        
        # Descuento severo si tiene palabras negativas
        if negative_penalty > 0:
            base_score = max(0, positive_bonus + category_bonus - negative_penalty)
        else:
            base_score = positive_bonus + category_bonus
        
        # Normalizar a 0-100
        score = min(max(base_score, 0), 100)
        
        # Determinar relevancia (threshold: 25)
        is_relevant = score >= 25
        
        # Generar razón
        if score < 10:
            reason = f"Demasiado ruido (score: {score:.0f})"
        elif score < 25:
            reason = f"Bajo interés (score: {score:.0f})"
        elif score < 50:
            reason = f"Posible competidor (score: {score:.0f})"
        elif score < 75:
            reason = f"Competidor probable (score: {score:.0f})"
        else:
            reason = f"Competidor relevante (score: {score:.0f})"
        
        return ClassificationResult(
            is_relevant=is_relevant,
            score=score,
            factors={
                "positive_bonus": positive_bonus,
                "negative_penalty": negative_penalty,
                "category_bonus": category_bonus,
                "base_score": base_score,
            },
            reason=reason,
        )
    
    def classify_batch(
        self,
        competitors: list[dict],
    ) -> list[dict]:
        """
        Clasifica múltiples competidores.
        
        Args:
            competitors: Lista de dicts con page_id, page_name, ad_creative_bodies
        
        Returns:
            Lista de competidores con scores
        """
        results = []
        
        for comp in competitors:
            classification = self.classify(
                page_name=comp.get("page_name", ""),
                ad_bodies=comp.get("ad_creative_bodies", []),
            )
            
            results.append({
                **comp,
                "relevance_score": classification.score,
                "is_relevant": classification.is_relevant,
                "classification_reason": classification.reason,
                "classification_factors": classification.factors,
            })
        
        return results

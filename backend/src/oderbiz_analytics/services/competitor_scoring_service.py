"""
Servicio para almacenar y recuperar histórico de clasificaciones de competidores.
Permite mejorar el modelo conforme acumula datos.
"""

import duckdb
import json
from typing import Optional


class CompetitorScoringService:
    """Maneja persistencia de scores de clasificación."""
    
    def __init__(self, db_path: str = "analytics.duckdb"):
        self.db_path = db_path
        self._init_tables()
    
    def _init_tables(self):
        """Crea tablas si no existen."""
        conn = duckdb.connect(self.db_path)
        try:
            conn.execute("CREATE SEQUENCE IF NOT EXISTS seq_competitor_classifications START 1")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS competitor_classifications (
                    id INTEGER PRIMARY KEY DEFAULT nextval('seq_competitor_classifications'),
                    page_id VARCHAR,
                    page_name VARCHAR,
                    user_page_id VARCHAR,
                    relevance_score DOUBLE,
                    is_relevant BOOLEAN,
                    classification_reason VARCHAR,
                    factors JSON,
                    search_term VARCHAR,
                    country VARCHAR,
                    classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    user_feedback BOOLEAN,
                    feedback_at TIMESTAMP
                )
            """)
        finally:
            conn.close()
    
    def save_classification(
        self,
        page_id: str,
        page_name: str,
        user_page_id: str,
        relevance_score: float,
        is_relevant: bool,
        classification_reason: str,
        factors: dict,
        search_term: str,
        country: str,
    ) -> int:
        """Guarda la clasificación más reciente para la tupla (page, usuario, término, país)."""
        conn = duckdb.connect(self.db_path)
        try:
            conn.execute(
                """
                DELETE FROM competitor_classifications
                WHERE page_id = ? AND user_page_id = ? AND search_term = ? AND country = ?
                """,
                [page_id, user_page_id, search_term, country],
            )
            result = conn.execute("""
                INSERT INTO competitor_classifications (
                    page_id, page_name, user_page_id, relevance_score, is_relevant,
                    classification_reason, factors, search_term, country
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            """, [
                page_id, page_name, user_page_id, relevance_score, is_relevant,
                classification_reason, json.dumps(factors), search_term, country
            ]).fetchall()
            
            return result[0][0] if result else None
        finally:
            conn.close()
    
    def get_avg_score_for_competitor(
        self,
        page_id: str,
        user_page_id: str,
    ) -> Optional[float]:
        """Obtiene el score promedio histórico de un competidor para ese usuario."""
        conn = duckdb.connect(self.db_path)
        try:
            result = conn.execute("""
                SELECT AVG(relevance_score) as avg_score
                FROM competitor_classifications
                WHERE page_id = ? AND user_page_id = ?
                LIMIT 1
            """, [page_id, user_page_id]).fetchall()
            
            return result[0][0] if result and result[0][0] is not None else None
        finally:
            conn.close()
    
    def get_classification_history(
        self,
        user_page_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """Obtiene el histórico de clasificaciones de un usuario."""
        conn = duckdb.connect(self.db_path)
        try:
            result = conn.execute("""
                SELECT 
                    page_id, page_name, relevance_score, is_relevant,
                    classification_reason, search_term, country, classified_at
                FROM competitor_classifications
                WHERE user_page_id = ?
                ORDER BY classified_at DESC
                LIMIT ?
            """, [user_page_id, limit]).fetchall()
            
            return [
                {
                    "page_id": row[0],
                    "page_name": row[1],
                    "relevance_score": row[2],
                    "is_relevant": row[3],
                    "classification_reason": row[4],
                    "search_term": row[5],
                    "country": row[6],
                    "classified_at": row[7].isoformat() if row[7] else None,
                }
                for row in result
            ]
        finally:
            conn.close()
    
    def feedback(
        self,
        classification_id: int,
        is_correct: bool,
    ):
        """Registra feedback del usuario sobre una clasificación."""
        conn = duckdb.connect(self.db_path)
        try:
            conn.execute("""
                UPDATE competitor_classifications
                SET user_feedback = ?, feedback_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, [is_correct, classification_id])
        finally:
            conn.close()

# Sistema de Inteligencia Competitiva - Market Radar Temporal

## 📊 Descripción

Sistema de monitoreo de competencia que usa **Machine Learning** para identificar competidores relevantes y analizar patrones de pauta (cuándo y cuánto pautañ).

**Características:**
- ✅ Clasificación inteligente de competidores con scoring ML
- ✅ Análisis temporal (frecuencia mensual, días preferidos)
- ✅ Palabras clave custom por usuario
- ✅ Histórico de clasificaciones persistido
- ✅ Filtrado automático de ruido (películas, gaming, ecommerce, etc.)

---

## 🚀 Cómo Usar

### Endpoint Base
```
GET /api/v1/competitor/market-radar-temporal
```

### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page_id` | string | ✅ | ID de tu página (para referencia) |
| `search_term` | string | ❌ | Término de búsqueda. Si omites, usa categoría de página |
| `country` | string | ❌ | Código país (EC, CO, MX, etc.) - default: EC |
| `custom_keywords` | string | ❌ | Palabras clave separadas por coma |
| `min_relevance_score` | int | ❌ | Score mínimo 0-100 (default: 25) |

### Ejemplos de Uso

#### 1. **Búsqueda Básica**
```bash
curl -X GET \
  "http://localhost:8000/api/v1/competitor/market-radar-temporal?page_id=123&search_term=psicólogo&country=EC" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 2. **Con Palabras Clave Custom**
```bash
curl -X GET \
  "http://localhost:8000/api/v1/competitor/market-radar-temporal?page_id=123&search_term=psicólogo&custom_keywords=psicología,terapia,salud%20mental,counseling" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 3. **Con Threshold Personalizado**
```bash
# Más estricto (solo competidores muy relevantes)
curl -X GET \
  "http://localhost:8000/api/v1/competitor/market-radar-temporal?page_id=123&search_term=psicólogo&min_relevance_score=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 4. **Búsqueda por Categoría (automática)**
```bash
# Si la página tiene categoría configurada, no necesitas search_term
curl -X GET \
  "http://localhost:8000/api/v1/competitor/market-radar-temporal?page_id=123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📈 Respuesta del Endpoint

```json
{
  "search_term": "psicólogo",
  "country": "EC",
  "custom_keywords": ["psicología", "terapia", "salud mental"],
  "total_ads_analyzed": 100,
  "total_competitors_found": 9,
  "competitors_after_ml_filter": 1,
  "ml_threshold": 25,
  "top_competitors": [
    {
      "page_id": "827576157111385",
      "page_name": "Tyler Foster",
      "total_ads": 1,
      "months": {
        "2026-04": 1
      },
      "days_of_week": {
        "Domingo": 1
      },
      "relevance_score": 25.0,
      "relevance_reason": "Posible competidor (score: 25)",
      "ml_factors": {
        "positive_bonus": 15,
        "negative_penalty": 0.0,
        "category_bonus": 10.0
      }
    }
  ],
  "summary": {
    "analysis_period": "Basado en 100 anuncios",
    "ml_classifier": "Reglas inteligentes + Scoring multi-factor",
    "scoring_factors": "Palabras clave positivas + Penalty negativas + Bonus categoría"
  }
}
```

---

## 🧠 Cómo Funciona el Scoring ML

### Fórmula de Puntuación

```
Score Final = Bonus Positivo - Penalidad Negativa + Bonus Categoría
Score Final = Clamp(0, 100)
```

### Componentes

#### 1. **Bonus Positivo (0-45 puntos)**
- **+15 puntos** por cada palabra clave del usuario encontrada
- **+5 puntos** por cada indicador positivo (servicio, consulta, asesor, especialista, etc.)
- Máximo: 45 puntos

#### 2. **Penalidad Negativa (0-80 puntos)**
- **-20 puntos** por cada palabra clave negativa encontrada
- Palabras negativas incluyen: drama, película, series, gaming, casino, ecommerce, streaming, etc.
- Máximo: 80 puntos (4+ palabras negativas = muy bajo score)

#### 3. **Bonus Categoría (0-10 puntos)**
- **+10 puntos** si la página tiene categoría configurada
- Ayuda a contextualizar la búsqueda

### Rangos de Score

| Score | Categoría | Significado |
|-------|-----------|-------------|
| 0-10 | ❌ Ruido | Claramente no competidor |
| 10-25 | ⚠️ Bajo interés | Probablemente no relevante |
| 25-50 | 🟡 Posible | Podría ser competidor |
| 50-75 | 🟢 Probable | Probablemente competidor |
| 75-100 | ✅ Muy Relevante | Definitivamente competidor |

---

## 🎯 Mejores Prácticas

### 1. **Palabras Clave Específicas**
```bash
# ❌ Genérico (baja precisión)
custom_keywords=servicios,profesional

# ✅ Específico (alta precisión)
custom_keywords=psicoterapia,counseling,salud mental,terapia cognitivo conductual
```

### 2. **Ajustar Threshold según Necesidad**
```bash
# Strict (solo muy relevantes)
min_relevance_score=50

# Moderate (default)
min_relevance_score=25

# Inclusive (incluir borderline)
min_relevance_score=10
```

### 3. **Combinar con Categoría de Página**
```bash
# Si tu página tiene categoría "Psicólogo", no necesitas search_term
# El sistema lo usará automáticamente
?page_id=YOUR_PAGE&country=EC
```

---

## 🔄 Persistencia e Histórico

El sistema guarda todas las clasificaciones en DuckDB:
- **Tabla:** `competitor_classifications`
- **Datos guardados:** page_id, page_name, score, razón, factores, search_term
- **Uso futuro:** Mejorar modelo basado en patrones históricos

---

## 🚀 Mejoras Futuras

1. **Feedback de Usuario**
   - Guardar si clasificación fue correcta/incorrecta
   - Mejorar modelo continuamente

2. **Deep Learning**
   - Integrar embeddings semánticos (Sentence Transformers)
   - Análisis de contenido más profundo

3. **Alertas Automáticas**
   - Notificar cuando competidor cambia pauta
   - Alertas por patrones estacionales detectados

4. **Análisis de Creativos**
   - Extraer palabras clave más usadas
   - Detectar patrones en mensajes de competidores

---

## 🛠️ Integración en Tu Código

### Python
```python
from oderbiz_analytics.services.competitor_classifier import CompetitorClassifier

# Crear clasificador
classifier = CompetitorClassifier(
    user_category="Psicólogo",
    user_keywords=["psicoterapia", "counseling", "salud mental"],
)

# Clasificar un competidor
result = classifier.classify(
    page_name="Hermano Elías Torres",
    ad_bodies=["Consulta psicológica en línea..."]
)

print(f"Score: {result.score}")
print(f"Relevante: {result.is_relevant}")
print(f"Razón: {result.reason}")
```

### Guardar en Histórico
```python
from oderbiz_analytics.services.competitor_scoring_service import CompetitorScoringService

scoring_service = CompetitorScoringService(db_path="analytics.duckdb")

# Guardar clasificación
scoring_service.save_classification(
    page_id="827576157111385",
    page_name="Tyler Foster",
    user_page_id="123",
    relevance_score=25.0,
    is_relevant=True,
    classification_reason="Posible competidor",
    factors={...},
    search_term="psicólogo",
    country="EC"
)
```

---

## 📝 Notas

- El sistema analiza hasta **100 anuncios** por búsqueda
- Requiere **Meta Access Token** con permisos de Ad Library
- Los resultados se basan en anuncios recientes (6-12 meses)
- El scoring es determinístico: mismo input = mismo score

---

**Última actualización:** 2026-04-12

# Market Radar ML Integration Design
**Date:** 2026-04-12  
**Status:** Design  
**Objective:** Integrate CompetitorClassifier into `/market-radar` endpoint for automatic competitor relevance filtering across all business categories.

---

## 1. Overview

Currently, the `/market-radar` endpoint returns all competitors found in Meta API searches, including irrelevant results (movies, unrelated businesses). This design integrates the ML-based `CompetitorClassifier` into the backend to automatically filter and rank competitors by relevance.

**Key Principle:** ML filtering happens transparently in backend. Frontend receives only relevant competitors. No UI changes needed.

**Scope:** Modify `/market-radar` endpoint + update `CompetitorClassifier` to support generic business categories.

---

## 2. Category Keywords Database

### 2.1 Static Dictionary in Code

Add `CATEGORY_KEYWORDS` and `GENERIC_KEYWORDS` to `CompetitorClassifier.py`:

```python
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
```

### 2.2 Keyword Selection Logic

New method in `CompetitorClassifier`:

```python
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
```

---

## 3. Endpoint Flow: `/market-radar`

### 3.1 Request
```
GET /market-radar?page_id={page_id}&country=EC
```

### 3.2 Processing Pipeline

```
Step 1: Get user page category
├─ GET /{page_id}?fields=category
├─ If category exists → proceed with category
└─ If no category → use generic keywords

Step 2: Select keywords
├─ keywords = get_keywords_for_category(category)
└─ Example: "Psicólogo" → ["psicoterapia", "counseling", ...]

Step 3: Search competitors in Meta API
├─ search_ads_by_terms(
│    search_terms = category or page_name,
│    countries = [country],
│    limit = 50
│  )
└─ Result: list of ads from competitors

Step 4: Group by competitor
├─ Aggregate by page_id
├─ Count total_ads, active_ads
└─ Collect temporal data (months, days_of_week)

Step 5: Initialize ML Classifier
├─ classifier = CompetitorClassifier(
│    user_category = category,
│    user_keywords = keywords,
│  )
└─ Now classifier knows what "relevant" means for this business

Step 6: Classify each competitor
├─ For each competitor:
│  ├─ classification = classifier.classify(
│  │    page_name = comp.page_name,
│  │    ad_bodies = comp.ad_creative_bodies,
│  │  )
│  └─ Store: classification.score, classification.is_relevant
└─ Only keep competitors with score >= 25

Step 7: Return filtered results
└─ Frontend receives clean, relevant competitors only
```

### 3.3 Response Changes

**Before (current):**
```json
{
  "competitors": [
    {"page_id": "123", "name": "Tyler Foster", "active_ads": 34, ...},
    {"page_id": "456", "name": "AcademiaCortex", "active_ads": 32, ...},
    {"page_id": "789", "name": "DramaBox", "active_ads": 36, ...}  // ← NOISE
  ]
}
```

**After (with ML):**
```json
{
  "competitors": [
    {"page_id": "123", "name": "Tyler Foster", "active_ads": 34, ...},
    {"page_id": "456", "name": "Agustin Graniel Psicologo", "active_ads": 8, ...}
  ],
  "metadata": {
    "total_ads_analyzed": 100,
    "total_competitors_found": 9,
    "competitors_after_ml_filter": 2,
    "ml_threshold": 25,
    "category": "Psicólogo",
    "keywords_used": ["psicoterapia", "counseling", "salud mental"]
  }
}
```

---

## 4. Code Changes Required

### 4.1 `CompetitorClassifier.py`

**Add:**
- Class constant: `CATEGORY_KEYWORDS` (dict)
- Class constant: `GENERIC_KEYWORDS` (list)
- Method: `get_keywords_for_category(category: str) -> list[str]`

**Modify:**
- Constructor to accept keywords from caller
- (No other changes needed)

### 4.2 `competitor.py` - `/market-radar` endpoint

**Changes:**
1. Import `CATEGORY_KEYWORDS` from classifier
2. When getting page data, extract category
3. Get keywords using `get_keywords_for_category()`
4. Create `CompetitorClassifier` with those keywords
5. Apply classification to each competitor
6. Filter by relevance_score >= 25
7. Add metadata to response

**Code outline:**
```python
@router.get("/market-radar")
async def get_market_radar(page_id: str, client: MetaGraphClient = Depends(...)) -> dict:
    # Get user page info
    page_data = await client.get_page_public_profile(page_id=page_id)
    category = page_data.get("category", "")
    page_name = page_data.get("name", page_id)
    
    # Get keywords for this category
    classifier = CompetitorClassifier(
        user_category=category,
        user_keywords=classifier.get_keywords_for_category(category)
    )
    
    # Search (existing logic)
    competitor_pages = await client.search_ads_by_terms(...)
    
    # Get ads for each competitor (existing logic)
    # Build competitors (existing logic)
    
    # NEW: Classify and filter
    competitors_scored = []
    for comp in competitors:
        classification = classifier.classify(
            page_name=comp["page_name"],
            ad_bodies=comp.get("ad_creative_bodies", [])
        )
        
        if classification.is_relevant:  # score >= 25
            comp["relevance_score"] = classification.score
            competitors_scored.append(comp)
    
    # Sort by relevance then by active_ads
    competitors_scored.sort(key=lambda x: (-x["relevance_score"], -x["active_ads"]))
    
    return {
        "competitors": competitors_scored[:5],
        "metadata": {
            "total_ads_analyzed": len(ads),
            "total_competitors_found": len(competitors),
            "competitors_after_ml_filter": len(competitors_scored),
            "category": category,
            "keywords_used": classifier.user_keywords,
        }
    }
```

---

## 5. Data Flow Diagram

```
User Page (Psicólogo)
    ↓
Get Category: "Psicólogo"
    ↓
Select Keywords: ["psicoterapia", "counseling", "salud mental", ...]
    ↓
Search Meta API: search_ads_by_terms("Psicólogo", countries=[EC])
    ↓
Found 100 ads from 9 competitors
    ↓
CompetitorClassifier
├─ Tyler Foster (content: "TDAH diagnosis...") → Score: 25 ✅
├─ AcademiaCortex (content: "...") → Score: 35 ✅
├─ DramaBox (content: "short drama films") → Score: 0 ❌ FILTERED
├─ Américo Gonza (content: "congress...") → Score: 5 ❌ FILTERED
└─ ... 5 more ❌
    ↓
Result: 2 relevant competitors
    ↓
Frontend sees: Tyler Foster, AcademiaCortex (clean, relevant)
```

---

## 6. Error Handling

| Scenario | Handling |
|----------|----------|
| No category on page | Use `GENERIC_KEYWORDS` (safe fallback) |
| Unknown category | Use `GENERIC_KEYWORDS` |
| Meta API fails | Return error (existing behavior) |
| No competitors found | Empty list (existing behavior) |
| All competitors filtered out | Empty list + metadata shows why |

---

## 7. Performance Considerations

- **API calls:** Same as before (no additional Meta API calls)
- **ML overhead:** Minimal - just scoring, no network calls
- **Memory:** Small - only holds competitor data during processing
- **Caching:** Competitors cached per page_id (existing)

**Performance:** ~same as current `/market-radar`

---

## 8. Testing Strategy

### Unit Tests
- `test_get_keywords_for_category()` - Verify keyword selection
- `test_classifier_with_category()` - Verify scoring with category keywords
- `test_market_radar_filters_irrelevant()` - Verify endpoint filters DramaBox, etc.

### Integration Tests
- End-to-end: Psicólogo page → returns only psicólogos
- Unknown category: Falls back to generic keywords
- Different categories: Dentista, Restaurante, etc.

---

## 9. Future Extensions (Not in Scope)

- Add more categories to `CATEGORY_KEYWORDS`
- Allow custom keywords per user (requires DB schema change)
- Machine learning model trained on historical feedback
- Dynamic keyword suggestions based on page content

---

## 10. Success Criteria

✅ MarketRadarPanel shows **only relevant competitors** (no DramaBox, movies, unrelated businesses)  
✅ Works for **any business category** (not just psicólogos)  
✅ **No UI changes** needed (transparent backend change)  
✅ **Performance** same or better than current  
✅ **Fallback logic** handles missing categories gracefully  

---

## Summary

**What:** Integrate ML classifier into `/market-radar` endpoint
**How:** Use category keywords + CompetitorClassifier to filter
**Result:** Clean, relevant competitors only
**Impact:** Better MarketRadarPanel UX, generic across all business types

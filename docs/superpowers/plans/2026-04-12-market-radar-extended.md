# Market Radar Extended Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Market Radar Extended: Top 5 Ecuador + Top 5 Provincia with full ad analysis, province inference, and DuckDB persistence.

**Architecture:** 
Backend exposes `/market-radar-extended` endpoint that detects province (Meta location → heuristic fallback), queries Meta for competitors, persists to DuckDB, ranks by activity. Frontend renders two sections (Ecuador + Province) with expandable competitor cards showing latest 10 ads each.

**Tech Stack:** FastAPI, DuckDB, React, React Query, shadcn/ui

---

## File Structure

### Backend Files

**New:**

- `backend/src/oderbiz_analytics/services/inference_service.py` — Province inference logic
- `backend/src/oderbiz_analytics/models/competitor.py` — Pydantic models for responses

**Modified:**

- `backend/src/oderbiz_analytics/api/routes/competitor.py` — Add `/market-radar-extended` endpoint
- `backend/src/oderbiz_analytics/adapters/meta/client.py` — Add `get_page_location()` method
- `backend/src/oderbiz_analytics/utils/db.py` — DuckDB table setup functions

### Frontend Files

**New:**

- `frontend/src/hooks/useMarketRadarExtended.ts` — React Query hook
- `frontend/src/components/market-radar/TopAdvertisersSection.tsx` — Top 5 ranking table
- `frontend/src/components/market-radar/CompetitorCard.tsx` — Card with metadata
- `frontend/src/components/market-radar/AdPreview.tsx` — Ad thumbnail
- `frontend/src/components/market-radar/AdModal.tsx` — Full ad details modal

**Modified:**

- `frontend/src/components/MarketRadarPanel.tsx` — Add two sections + new components

---

## Implementation Tasks

### Task 1: DuckDB Schema — Create Tables

**Files:**

- Create: `backend/src/oderbiz_analytics/utils/db.py` (new or modify if exists)
- **Step 1: Write schema setup function**

Open `backend/src/oderbiz_analytics/utils/db.py` and add:

```python
import duckdb
from pathlib import Path

def init_competitors_tables(db_path: str):
    """Initialize competitors and competitor_ads tables if not exist."""
    conn = duckdb.connect(db_path)
    
    # competitors table
    conn.execute("""
    CREATE TABLE IF NOT EXISTS competitors (
        page_id VARCHAR PRIMARY KEY,
        name VARCHAR,
        category VARCHAR,
        province_ec VARCHAR,
        province_confidence FLOAT,
        province_source VARCHAR,
        last_detected DATE,
        active_ads_count INTEGER,
        total_ads_count INTEGER,
        platforms JSON,
        languages JSON,
        metadata JSON
    )
    """)
    
    # competitor_ads table
    conn.execute("""
    CREATE TABLE IF NOT EXISTS competitor_ads (
        ad_id VARCHAR PRIMARY KEY,
        page_id VARCHAR REFERENCES competitors(page_id),
        ad_creative_bodies TEXT,
        ad_creative_link_titles TEXT,
        ad_creative_link_descriptions TEXT,
        ad_creative_link_captions TEXT,
        ad_snapshot_url VARCHAR,
        publisher_platforms JSON,
        languages JSON,
        media_type VARCHAR,
        ad_creation_time DATE,
        ad_delivery_start_time DATE,
        ad_delivery_stop_time DATE,
        is_active BOOLEAN,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    conn.close()
```

- **Step 2: Test by running init function**

Add to `backend/src/oderbiz_analytics/main.py` startup:

```python
from oderbiz_analytics.utils.db import init_competitors_tables

@app.on_event("startup")
async def startup():
    init_competitors_tables(os.getenv("DUCKDB_PATH"))
```

- **Step 3: Verify tables exist**

Run:

```bash
cd backend
python -c "
import duckdb
conn = duckdb.connect('path/to/analytics.duckdb')
print(conn.execute('SELECT * FROM information_schema.tables WHERE table_name LIKE \"competitor%\"').fetchall())
"
```

Expected: Two rows (competitors, competitor_ads)

- **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/utils/db.py backend/src/oderbiz_analytics/main.py
git commit -m "feat: add DuckDB schema for competitors and ads"
```

---

### Task 2: Province Inference Service

**Files:**

- Create: `backend/src/oderbiz_analytics/services/inference_service.py`
- **Step 1: Create inference service with heuristics**

```python
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
        
        # Step 3: Ad copy heuristic
        for ad in ads[:10]:
            copy = (
                " ".join(ad.get("ad_creative_bodies") or []) +
                " " +
                " ".join(ad.get("ad_creative_link_descriptions") or [])
            ).lower()
            for keyword, province in ProvinceInferenceService.PROVINCES_EC.items():
                if f"en {keyword}" in copy or f"desde {keyword}" in copy:
                    return province, 0.5, "ad_copy"
        
        # Step 4: Landing page (would need URL extraction)
        # For now, skip as requires additional scraping
        
        # Fallback
        return None, 0.0, "unknown"
```

- **Step 2: Test inference with mock data**

Create `backend/tests/test_inference_service.py`:

```python
import pytest
from oderbiz_analytics.services.inference_service import ProvinceInferenceService

def test_infer_province_from_meta_location():
    result = ProvinceInferenceService.infer_province(
        page_id="123",
        page_name="Some Business",
        page_location={"city": "Loja", "state": "Loja"},
        ads=[]
    )
    assert result == ("Loja", 1.0, "meta_location")

def test_infer_province_from_page_name():
    result = ProvinceInferenceService.infer_province(
        page_id="123",
        page_name="Psicólogo Loja - Terapia Online",
        page_location=None,
        ads=[]
    )
    assert result == ("Loja", 0.7, "page_name")

def test_infer_province_from_ad_copy():
    result = ProvinceInferenceService.infer_province(
        page_id="123",
        page_name="Generic Name",
        page_location=None,
        ads=[{
            "ad_creative_bodies": ["Terapia en Pichincha"],
            "ad_creative_link_descriptions": ["Disponible desde Pichincha"]
        }]
    )
    assert result == ("Pichincha", 0.5, "ad_copy")

def test_infer_province_fallback():
    result = ProvinceInferenceService.infer_province(
        page_id="123",
        page_name="Unknown",
        page_location=None,
        ads=[]
    )
    assert result == (None, 0.0, "unknown")
```

- **Step 3: Run tests**

```bash
cd backend
python -m pytest tests/test_inference_service.py -v
```

Expected: All 4 tests PASS

- **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/services/inference_service.py backend/tests/test_inference_service.py
git commit -m "feat: add ProvinceInferenceService with heuristics"
```

---

### Task 3: Add get_page_location to Meta Client

**Files:**

- Modify: `backend/src/oderbiz_analytics/adapters/meta/client.py`
- **Step 1: Add method to MetaGraphClient**

Find the `MetaGraphClient` class and add:

```python
async def get_page_location(self, page_id: str) -> dict:
    """Get page location (city, state, country, etc)."""
    url = f"{self.base_url}/{page_id}"
    params = {
        "fields": "location,phone",
        "access_token": self.access_token
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        if response.status_code != 200:
            raise MetaGraphApiError(response.status_code, response.text)
        data = response.json()
        return data.get("location", {})
```

- **Step 2: Test get_page_location**

In `backend/tests/test_meta_client.py`, add:

```python
@pytest.mark.asyncio
async def test_get_page_location():
    client = MetaGraphClient(access_token="test_token")
    
    # Mock the HTTP call
    with respx.mock:
        respx.get(
            "https://graph.facebook.com/v25.0/123456",
            params={"fields": "location,phone", "access_token": "test_token"}
        ).mock(return_value=httpx.Response(
            200,
            json={"location": {"city": "Loja", "state": "Loja", "country": "EC"}}
        ))
        
        result = await client.get_page_location("123456")
        assert result["city"] == "Loja"
```

- **Step 3: Run test**

```bash
cd backend
python -m pytest tests/test_meta_client.py::test_get_page_location -v
```

Expected: PASS

- **Step 4: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/meta/client.py backend/tests/test_meta_client.py
git commit -m "feat: add get_page_location method to MetaGraphClient"
```

---

### Task 4: Pydantic Models for Extended Radar Response

**Files:**

- Create: `backend/src/oderbiz_analytics/models/competitor.py`
- **Step 1: Define response models**

```python
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

class AdData(BaseModel):
    id: str
    ad_creative_bodies: List[str]
    ad_creative_link_titles: Optional[List[str]]
    ad_creative_link_descriptions: Optional[List[str]]
    ad_creative_link_captions: Optional[List[str]]
    ad_snapshot_url: str
    publisher_platforms: List[str]
    languages: List[str]
    media_type: Optional[str]
    ad_creation_time: Optional[date]
    ad_delivery_start_time: Optional[date]
    ad_delivery_stop_time: Optional[date]
    is_active: bool

class CompetitorData(BaseModel):
    rank: int
    page_id: str
    name: str
    province: Optional[str]
    province_confidence: float
    province_source: str
    active_ads: int
    total_ads: int
    last_detected: date
    platforms: List[str]
    languages: List[str]
    ads: List[AdData]

class ClientPageInfo(BaseModel):
    page_id: str
    name: str
    category: str
    province: Optional[str]
    province_confidence: float
    province_source: str

class MarketRadarMetadata(BaseModel):
    total_competitors_detected: int
    ecuador_competitors: int
    province_competitors: int
    last_sync: datetime
    sync_duration_seconds: float

class MarketRadarExtendedResponse(BaseModel):
    client_page: ClientPageInfo
    ecuador_top5: List[CompetitorData]
    province_top5: List[CompetitorData]
    metadata: MarketRadarMetadata
```

- **Step 2: Commit**

```bash
git add backend/src/oderbiz_analytics/models/competitor.py
git commit -m "feat: add Pydantic models for market radar extended"
```

---

### Task 5: Implement /market-radar-extended Endpoint

**Files:**

- Modify: `backend/src/oderbiz_analytics/api/routes/competitor.py`
- **Step 1: Add imports and helper functions**

At top of file:

```python
import time
from datetime import datetime
from oderbiz_analytics.services.inference_service import ProvinceInferenceService
from oderbiz_analytics.models.competitor import (
    AdData, CompetitorData, ClientPageInfo, MarketRadarMetadata, MarketRadarExtendedResponse
)
import duckdb
import json
```

- **Step 2: Add endpoint**

After existing `/market-radar` endpoint, add:

```python
@router.get("/market-radar-extended")
async def get_market_radar_extended(
    page_id: str,
    client: MetaGraphClient = Depends(get_meta_graph_client),
) -> dict:
    """Extended market radar with top 5 Ecuador + province, full ad details, and persistence."""
    start_time = time.time()
    
    try:
        # 1. Get client page info + location
        page_data = await client.get_page_public_profile(page_id=page_id)
        page_location = await client.get_page_location(page_id=page_id)
        
        category = page_data.get("category", "")
        page_name = page_data.get("name", page_id)
        keywords = _keywords_for_category(category, page_name)
        primary_keyword = keywords[0]
        
        # 2. Infer client province
        client_province, client_confidence, client_source = ProvinceInferenceService.infer_province(
            page_id=page_id,
            page_name=page_name,
            page_location=page_location,
            ads=[]  # No ads for client yet
        )
        
        # 3. Search competitors across all countries
        competitor_pages = await client.search_ads_by_terms(
            search_terms=primary_keyword,
            countries=_MONITOR_COUNTRIES,
            limit=20,
        )
        competitor_pages = [p for p in competitor_pages if p["page_id"] != page_id]
        
        # 4. Get ads for each competitor in parallel
        ads_tasks = [
            client.get_ads_archive(
                page_id=p["page_id"],
                countries=_MONITOR_COUNTRIES,
                fields=_ADS_ARCHIVE_FIELDS,
                limit=50,
            )
            for p in competitor_pages
        ]
        ads_results = await asyncio.gather(*ads_tasks, return_exceptions=True)
        
        # 5. Build competitors with province inference
        competitors_data = []
        for page, ads_result in zip(competitor_pages, ads_results):
            ads = ads_result if isinstance(ads_result, list) else []
            
            # Get page location
            try:
                page_loc = await client.get_page_location(page_id=page["page_id"])
            except:
                page_loc = None
            
            # Infer province
            province, confidence, source = ProvinceInferenceService.infer_province(
                page_id=page["page_id"],
                page_name=page["name"],
                page_location=page_loc,
                ads=ads
            )
            
            # Build competitor entry
            active_ads = sum(1 for ad in ads if _is_active(ad))
            
            comp_data = {
                "page_id": page["page_id"],
                "name": page["name"],
                "province": province,
                "province_confidence": confidence,
                "province_source": source,
                "active_ads": active_ads,
                "total_ads": len(ads),
                "platforms": list(set(p for ad in ads for p in (ad.get("publisher_platforms") or []))),
                "languages": list(set(l for ad in ads for l in (ad.get("languages") or []))),
                "ads": [
                    {
                        "id": ad["id"],
                        "ad_creative_bodies": ad.get("ad_creative_bodies") or [],
                        "ad_creative_link_titles": ad.get("ad_creative_link_titles") or [],
                        "ad_creative_link_descriptions": ad.get("ad_creative_link_descriptions") or [],
                        "ad_creative_link_captions": ad.get("ad_creative_link_captions") or [],
                        "ad_snapshot_url": ad.get("ad_snapshot_url"),
                        "publisher_platforms": ad.get("publisher_platforms") or [],
                        "languages": ad.get("languages") or [],
                        "media_type": ad.get("media_type"),
                        "ad_creation_time": ad.get("ad_creation_time"),
                        "ad_delivery_start_time": ad.get("ad_delivery_start_time"),
                        "ad_delivery_stop_time": ad.get("ad_delivery_stop_time"),
                        "is_active": _is_active(ad)
                    }
                    for ad in ads[:10]  # Only last 10 ads in response
                ],
                "last_detected": datetime.now().date().isoformat()
            }
            
            competitors_data.append(comp_data)
            
            # Persist to DuckDB
            try:
                db_path = os.getenv("DUCKDB_PATH", "analytics.duckdb")
                conn = duckdb.connect(db_path)
                
                conn.execute(
                    """
                    INSERT INTO competitors (page_id, name, category, province_ec, province_confidence, 
                                           province_source, last_detected, active_ads_count, total_ads_count,
                                           platforms, languages, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (page_id) DO UPDATE SET
                        last_detected = EXCLUDED.last_detected,
                        active_ads_count = EXCLUDED.active_ads_count,
                        total_ads_count = EXCLUDED.total_ads_count,
                        province_ec = EXCLUDED.province_ec,
                        province_confidence = EXCLUDED.province_confidence,
                        province_source = EXCLUDED.province_source
                    """,
                    [
                        page["page_id"],
                        page["name"],
                        category,
                        province,
                        confidence,
                        source,
                        comp_data["last_detected"],
                        active_ads,
                        len(ads),
                        json.dumps(comp_data["platforms"]),
                        json.dumps(comp_data["languages"]),
                        json.dumps({"inferred_at": datetime.now().isoformat()})
                    ]
                )
                
                # Insert ads
                for ad in ads[:10]:
                    conn.execute(
                        """
                        INSERT INTO competitor_ads (ad_id, page_id, ad_creative_bodies, ad_creative_link_titles,
                                                   ad_creative_link_descriptions, ad_creative_link_captions,
                                                   ad_snapshot_url, publisher_platforms, languages, media_type,
                                                   ad_creation_time, ad_delivery_start_time, ad_delivery_stop_time, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            ad["id"],
                            page["page_id"],
                            json.dumps(ad.get("ad_creative_bodies") or []),
                            json.dumps(ad.get("ad_creative_link_titles") or []),
                            json.dumps(ad.get("ad_creative_link_descriptions") or []),
                            json.dumps(ad.get("ad_creative_link_captions") or []),
                            ad.get("ad_snapshot_url"),
                            json.dumps(ad.get("publisher_platforms") or []),
                            json.dumps(ad.get("languages") or []),
                            ad.get("media_type"),
                            ad.get("ad_creation_time"),
                            ad.get("ad_delivery_start_time"),
                            ad.get("ad_delivery_stop_time"),
                            _is_active(ad)
                        ]
                    )
                
                conn.commit()
                conn.close()
            except Exception as e:
                # Log but don't fail — data returned in real-time
                print(f"DuckDB persist error: {e}")
        
        # 6. Rank by activity
        competitors_data.sort(key=lambda c: c["active_ads"], reverse=True)
        
        # 7. Split Ecuador vs Province
        ecuador_top5 = [
            {**c, "rank": i+1}
            for i, c in enumerate(competitors_data[:5])
        ]
        
        province_top5 = [
            {**c, "rank": i+1}
            for i, c in enumerate([c for c in competitors_data if c["province"] == client_province][:5])
        ]
        
        sync_duration = time.time() - start_time
        
        return {
            "client_page": {
                "page_id": page_id,
                "name": page_name,
                "category": category,
                "province": client_province,
                "province_confidence": client_confidence,
                "province_source": client_source
            },
            "ecuador_top5": ecuador_top5,
            "province_top5": province_top5,
            "metadata": {
                "total_competitors_detected": len(competitors_data),
                "ecuador_competitors": len(competitors_data),
                "province_competitors": len([c for c in competitors_data if c["province"] == client_province]),
                "last_sync": datetime.now().isoformat(),
                "sync_duration_seconds": sync_duration
            }
        }
    
    except MetaGraphApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
```

- **Step 3: Add missing import**

At top of file:

```python
import os
```

- **Step 4: Test endpoint with mock**

In `backend/tests/test_competitor_route.py`, add:

```python
@respx.mock
def test_market_radar_extended(client):
    respx.get("https://graph.facebook.com/v25.0/page_edu").mock(
        return_value=httpx.Response(
            200,
            json={"id": "page_edu", "name": "Rectoral Board", "category": "Education"}
        )
    )
    respx.get("https://graph.facebook.com/v25.0/ads_archive").mock(
        return_value=httpx.Response(200, json={"data": []})
    )
    r = client.get("/api/v1/competitor/market-radar-extended?page_id=page_edu")
    assert r.status_code == 200
    body = r.json()
    assert "client_page" in body
    assert "ecuador_top5" in body
    assert "province_top5" in body
    assert "metadata" in body
```

- **Step 5: Run test**

```bash
cd backend
python -m pytest tests/test_competitor_route.py::test_market_radar_extended -v
```

Expected: PASS

- **Step 6: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/competitor.py
git commit -m "feat: add /market-radar-extended endpoint with full competitor analysis"
```

---

### Task 6: Create useMarketRadarExtended Hook

**Files:**

- Create: `frontend/src/hooks/useMarketRadarExtended.ts`
- **Step 1: Create hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchMarketRadarExtended } from '@/api/client';

interface UseMarketRadarExtendedOptions {
  pageId: string | null;
}

export function useMarketRadarExtended({ pageId }: UseMarketRadarExtendedOptions) {
  return useQuery({
    queryKey: ['market-radar-extended', pageId],
    queryFn: async () => {
      if (!pageId) throw new Error('pageId required');
      return fetchMarketRadarExtended(pageId);
    },
    enabled: !!pageId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}
```

- **Step 2: Add API function**

In `frontend/src/api/client.ts`, add:

```typescript
export async function fetchMarketRadarExtended(pageId: string) {
  const url = `${API_URL}/competitor/market-radar-extended?page_id=${pageId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Market Radar API error: ${response.statusText}`);
  }
  return response.json();
}
```

- **Step 3: Test hook compiles**

```bash
cd frontend
npm run build --no-error-on-unmatched-pattern 2>&1 | grep -i "error" | head -5
```

Expected: No TypeScript errors

- **Step 4: Commit**

```bash
git add frontend/src/hooks/useMarketRadarExtended.ts frontend/src/api/client.ts
git commit -m "feat: add useMarketRadarExtended hook and API function"
```

---

### Task 7: Create TopAdvertisersSection Component

**Files:**

- Create: `frontend/src/components/market-radar/TopAdvertisersSection.tsx`
- **Step 1: Create component**

```typescript
import React from 'react';
import { CompetitorCard } from './CompetitorCard';

interface Competitor {
  rank: number;
  page_id: string;
  name: string;
  province: string | null;
  province_confidence: number;
  active_ads: number;
  total_ads: number;
  platforms: string[];
  languages: string[];
  ads: any[];
}

interface Props {
  competitors: Competitor[];
  title: string;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export function TopAdvertisersSection({ competitors, title, onSelectCompetitor }: Props) {
  if (competitors.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">No competitors found in this category.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {competitors.map((competitor) => (
          <CompetitorCard
            key={competitor.page_id}
            competitor={competitor}
            onSelectCompetitor={onSelectCompetitor}
          />
        ))}
      </div>
    </div>
  );
}
```

- **Step 2: Commit**

```bash
git add frontend/src/components/market-radar/TopAdvertisersSection.tsx
git commit -m "feat: add TopAdvertisersSection component"
```

---

### Task 8: Create CompetitorCard Component

**Files:**

- Create: `frontend/src/components/market-radar/CompetitorCard.tsx`
- **Step 1: Create component**

```typescript
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AdPreview } from './AdPreview';

interface Competitor {
  rank: number;
  page_id: string;
  name: string;
  province: string | null;
  province_confidence: number;
  active_ads: number;
  total_ads: number;
  platforms: string[];
  languages: string[];
  ads: any[];
}

interface Props {
  competitor: Competitor;
  onSelectCompetitor: (pageId: string, name: string) => void;
}

export function CompetitorCard({ competitor, onSelectCompetitor }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const confidenceColor = 
    competitor.province_confidence >= 0.8 ? 'green' :
    competitor.province_confidence >= 0.5 ? 'yellow' :
    'gray';

  return (
    <div className="border rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">#{competitor.rank}</span>
            <p className="text-sm font-semibold text-foreground">{competitor.name}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {competitor.province && (
              <Badge variant="outline" className={`bg-${confidenceColor}-50`}>
                {competitor.province} • {(competitor.province_confidence * 100).toFixed(0)}%
              </Badge>
            )}
            {!competitor.province && (
              <Badge variant="outline">Ubicación desconocida</Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectCompetitor(competitor.page_id, competitor.name)}
        >
          →
        </Button>
      </div>

      {/* Metadata */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{competitor.active_ads} activos / {competitor.total_ads} total</span>
        <span>{competitor.platforms.join(', ')}</span>
        <span>{competitor.languages.join(', ')}</span>
      </div>

      {/* Expandable ads section */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown className={`w-3 h-3 mr-1 ${isExpanded ? 'rotate-180' : ''}`} />
          {isExpanded ? 'Ocultar anuncios' : `Ver ${competitor.ads.length} anuncios`}
        </Button>

        {isExpanded && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {competitor.ads.map((ad) => (
              <AdPreview key={ad.id} ad={ad} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- **Step 2: Commit**

```bash
git add frontend/src/components/market-radar/CompetitorCard.tsx
git commit -m "feat: add CompetitorCard component with expand/collapse"
```

---

### Task 9: Create AdPreview Component

**Files:**

- Create: `frontend/src/components/market-radar/AdPreview.tsx`
- **Step 1: Create component**

```typescript
import React, { useState } from 'react';
import { AdModal } from './AdModal';

interface Ad {
  id: string;
  ad_snapshot_url: string;
  ad_creative_bodies: string[];
  media_type?: string;
}

interface Props {
  ad: Ad;
}

export function AdPreview({ ad }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const preview_text = ad.ad_creative_bodies[0]?.substring(0, 50) || 'Sin texto';
  const media_icon = ad.media_type === 'video' ? '▶' : '🖼';

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="block w-full text-left border rounded p-2 hover:bg-accent transition-colors"
      >
        {ad.ad_snapshot_url ? (
          <img
            src={ad.ad_snapshot_url}
            alt="ad"
            className="w-full h-20 object-cover rounded mb-1"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-20 bg-muted rounded mb-1 flex items-center justify-center text-sm">
            {media_icon}
          </div>
        )}
        <p className="text-xs truncate text-muted-foreground">{preview_text}...</p>
      </button>

      <AdModal ad={ad} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
```

- **Step 2: Commit**

```bash
git add frontend/src/components/market-radar/AdPreview.tsx
git commit -m "feat: add AdPreview component with thumbnail"
```

---

### Task 10: Create AdModal Component

**Files:**

- Create: `frontend/src/components/market-radar/AdModal.tsx`
- **Step 1: Create component**

```typescript
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface Ad {
  id: string;
  ad_snapshot_url: string;
  ad_creative_bodies: string[];
  ad_creative_link_titles: string[];
  ad_creative_link_descriptions: string[];
  publisher_platforms: string[];
  languages: string[];
  media_type?: string;
  ad_creation_time?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  is_active: boolean;
}

interface Props {
  ad: Ad;
  isOpen: boolean;
  onClose: () => void;
}

export function AdModal({ ad, isOpen, onClose }: Props) {
  const startDate = new Date(ad.ad_delivery_start_time || '').toLocaleDateString('es-ES');
  const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time).toLocaleDateString('es-ES') : 'En curso';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Detalles del Anuncio</DialogTitle>
          <DialogClose asChild>
            <button className="absolute right-4 top-4">
              <X className="w-4 h-4" />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className="space-y-4">
          {/* Visual */}
          {ad.ad_snapshot_url && (
            <div>
              <img
                src={ad.ad_snapshot_url}
                alt="ad"
                className="w-full rounded border"
                onError={(e) => {
                  e.currentTarget.alt = 'Sin imagen disponible';
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Textos */}
          <div className="space-y-2">
            {ad.ad_creative_bodies.map((body, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-muted-foreground">Texto</p>
                <p className="text-sm">{body}</p>
              </div>
            ))}

            {ad.ad_creative_link_titles[0] && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Título</p>
                <p className="text-sm">{ad.ad_creative_link_titles[0]}</p>
              </div>
            )}

            {ad.ad_creative_link_descriptions[0] && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Descripción</p>
                <p className="text-sm">{ad.ad_creative_link_descriptions[0]}</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Fechas de campaña</p>
              <p className="text-sm">{startDate} → {endDate}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Plataformas</p>
              <div className="flex gap-1 flex-wrap mt-1">
                {ad.publisher_platforms.map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Idiomas</p>
              <div className="flex gap-1 flex-wrap mt-1">
                {ad.languages.map((lang) => (
                  <Badge key={lang} variant="secondary" className="text-xs">
                    {lang}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Estado</p>
              <p className="text-sm">
                {ad.is_active ? '🟢 Activo' : '⚪ Pausado'}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- **Step 2: Commit**

```bash
git add frontend/src/components/market-radar/AdModal.tsx
git commit -m "feat: add AdModal component with full ad details"
```

---

### Task 11: Modify MarketRadarPanel to Add Two Sections

**Files:**

- Modify: `frontend/src/components/MarketRadarPanel.tsx`
- **Step 1: Update imports**

Replace existing imports with:

```typescript
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMarketRadarExtended } from "@/hooks/useMarketRadarExtended";
import { TopAdvertisersSection } from "@/components/market-radar/TopAdvertisersSection";
```

- **Step 2: Replace hook call**

Replace:

```typescript
const { data, isLoading, error } = useMarketRadar(pageId);
```

With:

```typescript
const { data, isLoading, error } = useMarketRadarExtended({ pageId });
```

- **Step 3: Update JSX to show two sections**

Replace the data section with:

```typescript
{/* Data */}
{data && !isLoading && (
  <div className="space-y-6">
    {/* Province detection */}
    <div className="bg-blue-50 p-3 rounded-lg space-y-1">
      <p className="text-xs font-semibold text-blue-900">🎯 Provincia Detectada</p>
      <p className="text-sm text-blue-800">
        {data.client_page.province || "Ubicación desconocida"}
        <span className="text-xs ml-2">
          ({(data.client_page.province_confidence * 100).toFixed(0)}% • {data.client_page.province_source})
        </span>
      </p>
    </div>

    {/* Ecuador Top 5 */}
    <TopAdvertisersSection
      competitors={data.ecuador_top5}
      title="🇪🇨 Top 5 Ecuador"
      onSelectCompetitor={onSelectCompetitor}
    />

    {/* Province Top 5 */}
    <TopAdvertisersSection
      competitors={data.province_top5}
      title={`📍 Top 5 ${data.client_page.province || "Provincia"}`}
      onSelectCompetitor={onSelectCompetitor}
    />

    {/* Metadata footer */}
    <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
      <p>Total detectados: {data.metadata.total_competitors_detected}</p>
      <p>Última sincronización: {new Date(data.metadata.last_sync).toLocaleString('es-ES')}</p>
    </div>
  </div>
)}
```

- **Step 4: Test component renders**

```bash
cd frontend
npm run build 2>&1 | grep -i "error" | head -5
```

Expected: No TypeScript errors

- **Step 5: Commit**

```bash
git add frontend/src/components/MarketRadarPanel.tsx
git commit -m "feat: update MarketRadarPanel with two sections (Ecuador + Province)"
```

---

## Spec Coverage Verification

✅ **Backend Models** — DuckDB tables + Pydantic models (Tasks 1, 4)  
✅ **Province Inference** — Service with heuristics (Task 2)  
✅ **Meta Integration** — get_page_location (Task 3)  
✅ **Endpoint** — /market-radar-extended with persistence (Task 5)  
✅ **Frontend Hook** — useMarketRadarExtended + API (Task 6)  
✅ **Frontend Components** — TopAdvertisersSection, CompetitorCard, AdPreview, AdModal (Tasks 7-10)  
✅ **UI Layout** — Two sections, expandable ads (Task 11)  

---

## Timeline

- Tasks 1-3: Backend models & services (1 day)
- Task 4: Pydantic models (30 min)
- Task 5: Main endpoint (2 hours)
- Tasks 6-11: Frontend (2 days)
- Testing & fixes: 1 day

**Total: 5-6 days (1 sprint)**
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class AdData(BaseModel):
    id: str
    ad_creative_bodies: List[str]
    ad_creative_link_titles: Optional[List[str]] = None
    ad_creative_link_descriptions: Optional[List[str]] = None
    ad_creative_link_captions: Optional[List[str]] = None
    ad_snapshot_url: str
    publisher_platforms: List[str]
    languages: List[str]
    media_type: Optional[str] = None
    ad_creation_time: Optional[date] = None
    ad_delivery_start_time: Optional[date] = None
    ad_delivery_stop_time: Optional[date] = None
    is_active: bool


class CompetitorData(BaseModel):
    rank: int
    page_id: str
    name: str
    province: Optional[str] = None
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
    province: Optional[str] = None
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

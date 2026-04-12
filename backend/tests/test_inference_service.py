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
    assert result == ("Pichincha", 0.5, "ad_copy_province")


def test_infer_province_fallback():
    result = ProvinceInferenceService.infer_province(
        page_id="123",
        page_name="Unknown",
        page_location=None,
        ads=[]
    )
    assert result == (None, 0.0, "unknown")

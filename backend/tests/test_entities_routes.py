import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as c:
        yield c


@respx.mock
def test_list_ads_includes_official_story_permalink(client):
    respx.get("https://graph.facebook.com/v25.0/act_123/ads").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "ad_1",
                        "name": "Ad 1",
                        "creative": {"effective_object_story_id": "111_222"},
                    }
                ]
            },
        )
    )
    respx.get("https://graph.facebook.com/v25.0/").mock(
        return_value=httpx.Response(
            200,
            json={
                "111_222": {
                    "id": "111_222",
                    "permalink_url": "https://www.facebook.com/111/posts/222/",
                }
            },
        )
    )

    response = client.get(
        "/api/v1/accounts/act_123/ads",
        headers={"Authorization": "Bearer tok"},
    )
    assert response.status_code == 200
    creative = response.json()["data"][0]["creative"]
    assert (
        creative["effective_object_story_permalink"]
        == "https://www.facebook.com/111/posts/222/"
    )

# backend/tests/test_api_accounts.py
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app
from oderbiz_analytics.api.routes import accounts as accounts_mod
from oderbiz_analytics.domain.models import AdAccount


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))

    async def fake_list_ad_accounts(self, **kwargs):
        return [AdAccount(id="act_1", name="Test Account", account_id="1", currency="USD")]

    monkeypatch.setattr(
        accounts_mod.MetaGraphClient,
        "list_ad_accounts",
        fake_list_ad_accounts,
    )
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_list_accounts(client):
    r = client.get("/api/v1/accounts")
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["id"] == "act_1"
    assert data[0]["name"] == "Test Account"

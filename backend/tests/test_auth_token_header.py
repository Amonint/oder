from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from oderbiz_analytics.api.main import app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("META_ACCESS_TOKEN", "env-token")
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "t.duckdb"))
    return TestClient(app)


@pytest.fixture
def client_no_meta_env(monkeypatch, tmp_path):
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "t.duckdb"))
    return TestClient(app)


def test_accounts_401_without_bearer_and_without_env_token(client_no_meta_env):
    r = client_no_meta_env.get("/api/v1/accounts")
    assert r.status_code == 401
    assert "Falta el token" in r.json().get("detail", "")


def test_accounts_prefers_bearer_token_over_env(client, monkeypatch):
    received_tokens = []

    async def fake_list(self, **kwargs):
        from oderbiz_analytics.domain.models import AdAccount

        received_tokens.append(self._token)
        return [AdAccount(id="act_x", name="A", account_id="1", currency="USD")]

    monkeypatch.setattr(
        "oderbiz_analytics.api.routes.accounts.MetaGraphClient.list_ad_accounts",
        fake_list,
    )

    r = client.get(
        "/api/v1/accounts",
        headers={"Authorization": "Bearer header-token"},
    )
    assert r.status_code == 200
    assert received_tokens and "header-token" in received_tokens[0]

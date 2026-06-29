"""Unit tests for src/plaid_client — credential injection, env base URL, and
the Plaid error envelope. httpx.AsyncClient is monkeypatched so no network is
hit (runs in CI/container where httpx is installed)."""
import asyncio

import pytest

from src import plaid_client as plaid


@pytest.fixture(autouse=True)
def _reset_shared_client():
    # plaid_client now reuses one module-level AsyncClient; reset it around each
    # test so each test's monkeypatched httpx.AsyncClient is the one that's used.
    plaid._client = None
    yield
    plaid._client = None


class _FakeResp:
    def __init__(self, status, data):
        self.status_code = status
        self._data = data

    def json(self):
        return self._data


def _fake_client(captured, status=200, data=None):
    payload = data if data is not None else {"ok": True}

    class _C:
        is_closed = False

        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None):
            captured["url"] = url
            captured["body"] = json
            return _FakeResp(status, payload)

    return _C


def test_call_injects_creds_and_env_base(monkeypatch):
    monkeypatch.setenv("PLAID_CLIENT_ID", "cid")
    monkeypatch.setenv("PLAID_SECRET", "sec")
    monkeypatch.setenv("PLAID_ENV", "sandbox")
    captured: dict = {}
    monkeypatch.setattr(plaid.httpx, "AsyncClient", _fake_client(captured))

    out = asyncio.run(plaid.call("/accounts/get", {"access_token": "tok"}))

    assert out == {"ok": True}
    assert captured["url"] == "https://sandbox.plaid.com/accounts/get"
    body = captured["body"]
    assert body["client_id"] == "cid"
    assert body["secret"] == "sec"
    assert body["access_token"] == "tok"  # caller field preserved


def test_not_configured_raises(monkeypatch):
    monkeypatch.delenv("PLAID_CLIENT_ID", raising=False)
    monkeypatch.delenv("PLAID_SECRET", raising=False)
    assert plaid.is_configured() is False
    with pytest.raises(plaid.PlaidError) as ei:
        asyncio.run(plaid.call("/accounts/get", {}))
    assert ei.value.code == "not_configured"


def test_error_envelope_raises_with_code(monkeypatch):
    monkeypatch.setenv("PLAID_CLIENT_ID", "cid")
    monkeypatch.setenv("PLAID_SECRET", "sec")
    captured: dict = {}
    monkeypatch.setattr(plaid.httpx, "AsyncClient",
                        _fake_client(captured, status=400,
                                     data={"error_code": "INVALID_ACCESS_TOKEN", "error_message": "bad token",
                                           "error_type": "INVALID_INPUT"}))
    with pytest.raises(plaid.PlaidError) as ei:
        asyncio.run(plaid.call("/accounts/get", {"access_token": "x"}))
    assert ei.value.code == "INVALID_ACCESS_TOKEN"
    assert ei.value.status == 400


def test_production_env_base(monkeypatch):
    monkeypatch.setenv("PLAID_ENV", "production")
    assert plaid.base_url() == "https://production.plaid.com"
    monkeypatch.setenv("PLAID_ENV", "bogus")
    assert plaid.base_url() == "https://sandbox.plaid.com"  # safe fallback

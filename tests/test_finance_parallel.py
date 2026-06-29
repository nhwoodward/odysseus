"""The per-institution aggregations (balances/transactions/recurring/investments)
fan their Plaid calls out concurrently with asyncio.gather. These tests lock in
that the fan-out (a) merges every item's contribution, (b) actually runs the
items concurrently rather than serially, and (c) preserves the per-item error
tolerance — one failing Item must not sink the others, and PRODUCT_NOT_READY must
surface as `pending`, not an error."""
import asyncio

from src import finance_service as fs
from src import plaid_client as plaid


def _tokens(n):
    # (pk, item_id, access_token, institution_name) — matches owner_tokens().
    return [(i, f"item-{i}", f"tok-{i}", f"Bank {i}") for i in range(n)]


def test_balances_merges_all_items_and_tolerates_one_failure(monkeypatch):
    monkeypatch.setattr(fs, "owner_tokens", lambda owner: _tokens(3))

    async def fake_call(path, payload):
        tok = payload["access_token"]
        if tok == "tok-1":
            raise plaid.PlaidError("boom", code="ITEM_LOGIN_REQUIRED")
        return {"accounts": [{"account_id": f"a-{tok}", "type": "depository",
                              "balances": {"current": 100.0}}]}

    monkeypatch.setattr(plaid, "call", fake_call)
    r = asyncio.run(fs.balances("owner"))

    # Items 0 and 2 succeed (asset each), item 1 errors but is reported, not fatal.
    assert len(r["accounts"]) == 2
    assert r["assets"] == 200.0
    assert r["net_worth"] == 200.0
    assert [e["code"] for e in r["errors"]] == ["ITEM_LOGIN_REQUIRED"]


def test_transactions_product_not_ready_is_pending_not_error(monkeypatch):
    monkeypatch.setattr(fs, "owner_tokens", lambda owner: _tokens(2))

    async def fake_call(path, payload):
        if payload["access_token"] == "tok-0":
            raise plaid.PlaidError("not ready", code="PRODUCT_NOT_READY")
        return {"transactions": [{"date": "2026-06-01", "name": "Shop", "amount": 5}],
                "total_transactions": 1}

    monkeypatch.setattr(plaid, "call", fake_call)
    r = asyncio.run(fs.transactions("owner", days=30))

    assert r["pending"] is True          # the not-ready item flips pending
    assert r["errors"] == []             # ...and is NOT recorded as an error
    assert len(r["transactions"]) == 1   # the ready item still returns


def test_aggregations_run_concurrently(monkeypatch):
    monkeypatch.setattr(fs, "owner_tokens", lambda owner: _tokens(4))
    inflight = {"now": 0, "max": 0}

    async def fake_call(path, payload):
        inflight["now"] += 1
        inflight["max"] = max(inflight["max"], inflight["now"])
        try:
            await asyncio.sleep(0.02)  # hold the slot so overlap is observable
            return {"accounts": []}
        finally:
            inflight["now"] -= 1

    monkeypatch.setattr(plaid, "call", fake_call)
    asyncio.run(fs.balances("owner"))
    # Serial execution would peak at 1 in-flight; concurrent fan-out peaks at >1.
    assert inflight["max"] > 1

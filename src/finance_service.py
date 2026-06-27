"""Owner-scoped, READ-ONLY personal-finance aggregation over the user's Plaid
Items. Shared by both the HTTP layer (routes/finance_routes.py) and the chat
agent tool (manage_finance in src/tool_implementations.py), so the two never
diverge. All functions tolerate a per-item Plaid error and report it rather than
failing the whole response. Access tokens are decrypted transparently by the
EncryptedText column and never logged.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List

from core.database import PlaidItem, SessionLocal
from src import plaid_client as plaid

logger = logging.getLogger(__name__)


def owner_tokens(owner: str):
    """[(pk, item_id, access_token, institution_name)] for the owner's active items."""
    db = SessionLocal()
    try:
        rows = db.query(PlaidItem).filter(
            PlaidItem.owner == owner,
            (PlaidItem.status == "active") | (PlaidItem.status.is_(None)),
        ).all()
        return [(it.id, it.item_id, it.access_token, it.institution_name) for it in rows if it.access_token]
    finally:
        db.close()


def _account_kind(acct_type) -> str:
    t = (acct_type or "").lower()
    if t in ("depository", "investment", "brokerage"):
        return "asset"
    if t in ("credit", "loan"):
        return "liability"
    return "other"


async def balances(owner: str) -> Dict[str, Any]:
    accounts: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for (_pk, item_id, token, inst) in owner_tokens(owner):
        try:
            data = await plaid.call("/accounts/balance/get", {"access_token": token})
            for a in data.get("accounts") or []:
                bal = a.get("balances") or {}
                accounts.append({
                    "account_id": a.get("account_id"), "name": a.get("name"), "mask": a.get("mask"),
                    "type": a.get("type"), "subtype": a.get("subtype"), "kind": _account_kind(a.get("type")),
                    "current": bal.get("current"), "available": bal.get("available"),
                    "iso_currency_code": bal.get("iso_currency_code") or bal.get("unofficial_currency_code"),
                    "institution": inst,
                })
        except plaid.PlaidError as e:
            errors.append({"item_id": item_id, "code": e.code})
    assets = sum((a["current"] or 0) for a in accounts if a["kind"] == "asset")
    liabilities = sum((a["current"] or 0) for a in accounts if a["kind"] == "liability")
    return {"accounts": accounts, "assets": round(assets, 2), "liabilities": round(liabilities, 2),
            "net_worth": round(assets - liabilities, 2), "errors": errors}


async def transactions(owner: str, days: int = 90) -> Dict[str, Any]:
    end = date.today()
    start = end - timedelta(days=max(1, min(days, 730)))
    txns: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    pending = False
    for (_pk, item_id, token, inst) in owner_tokens(owner):
        offset = 0
        try:
            while True:
                data = await plaid.call("/transactions/get", {
                    "access_token": token, "start_date": start.isoformat(), "end_date": end.isoformat(),
                    "options": {"count": 500, "offset": offset},
                })
                batch = data.get("transactions") or []
                for t in batch:
                    pfc = t.get("personal_finance_category") or {}
                    txns.append({
                        "date": t.get("date"), "name": t.get("merchant_name") or t.get("name"),
                        "amount": t.get("amount"),
                        "category": pfc.get("primary") or (t.get("category") or ["OTHER"])[0],
                        "iso_currency_code": t.get("iso_currency_code"), "pending": t.get("pending"),
                        "institution": inst,
                    })
                offset += len(batch)
                if not batch or offset >= (data.get("total_transactions") or 0):
                    break
        except plaid.PlaidError as e:
            if e.code == "PRODUCT_NOT_READY":
                pending = True
            else:
                errors.append({"item_id": item_id, "code": e.code})
    txns.sort(key=lambda x: x.get("date") or "", reverse=True)
    return {"transactions": txns, "start": start.isoformat(), "end": end.isoformat(),
            "pending": pending, "errors": errors}


_FREQ_PER_MONTH = {"WEEKLY": 4.345, "BIWEEKLY": 2.172, "SEMI_MONTHLY": 2.0, "MONTHLY": 1.0, "ANNUALLY": 1 / 12}


async def recurring(owner: str) -> Dict[str, Any]:
    streams: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for (_pk, item_id, token, inst) in owner_tokens(owner):
        try:
            data = await plaid.call("/transactions/recurring/get", {"access_token": token})
            for s in data.get("outflow_streams") or []:
                amt = (s.get("average_amount") or {}).get("amount")
                if amt is None:
                    amt = (s.get("last_amount") or {}).get("amount")
                streams.append({
                    "description": s.get("merchant_name") or s.get("description"),
                    "frequency": s.get("frequency"), "average_amount": abs(amt) if amt is not None else None,
                    "last_date": s.get("last_date"), "predicted_next_date": s.get("predicted_next_date"),
                    "status": s.get("status"),
                    "category": (s.get("personal_finance_category") or {}).get("primary"),
                    "institution": inst,
                })
        except plaid.PlaidError as e:
            errors.append({"item_id": item_id, "code": e.code})
    monthly = 0.0
    for s in streams:
        if s.get("average_amount"):
            monthly += s["average_amount"] * _FREQ_PER_MONTH.get((s.get("frequency") or "MONTHLY").upper(), 1.0)
    streams.sort(key=lambda x: (x.get("average_amount") or 0), reverse=True)
    return {"subscriptions": streams, "monthly_total": round(monthly, 2), "errors": errors}


async def investments(owner: str) -> Dict[str, Any]:
    holdings: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    total = 0.0
    for (_pk, item_id, token, inst) in owner_tokens(owner):
        try:
            data = await plaid.call("/investments/holdings/get", {"access_token": token})
            secs = {s.get("security_id"): s for s in (data.get("securities") or [])}
            for h in data.get("holdings") or []:
                sec = secs.get(h.get("security_id")) or {}
                val = h.get("institution_value")
                if val:
                    total += val
                holdings.append({
                    "name": sec.get("name") or sec.get("ticker_symbol") or "Holding",
                    "ticker": sec.get("ticker_symbol"), "type": sec.get("type"),
                    "quantity": h.get("quantity"), "value": val,
                    "iso_currency_code": h.get("iso_currency_code"), "institution": inst,
                })
        except plaid.PlaidError as e:
            if e.code != "PRODUCT_NOT_READY":
                errors.append({"item_id": item_id, "code": e.code})
    holdings.sort(key=lambda x: (x.get("value") or 0), reverse=True)
    alloc: Dict[str, float] = {}
    for h in holdings:
        k = h.get("type") or "other"
        alloc[k] = round(alloc.get(k, 0) + (h.get("value") or 0), 2)
    return {"holdings": holdings, "total_value": round(total, 2), "allocation": alloc, "errors": errors}


_SPEND_EXCLUDE = {"TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "BANK_FEES"}


def spending_by_category(txns: List[Dict[str, Any]]):
    """(by_category dict, total) for outflow transactions, excluding transfers."""
    by_cat: Dict[str, float] = {}
    total = 0.0
    for t in txns:
        amt = t.get("amount") or 0
        cat = t.get("category") or "OTHER"
        if amt > 0 and cat not in _SPEND_EXCLUDE:  # Plaid: positive amount = money out
            by_cat[cat] = round(by_cat.get(cat, 0) + amt, 2)
            total += amt
    return by_cat, round(total, 2)


async def summary(owner: str) -> Dict[str, Any]:
    """Compact rollup for the dashboard + the manage_finance agent tool."""
    bal = await balances(owner)
    txn = await transactions(owner, 30)
    rec = await recurring(owner)
    inv = await investments(owner)
    by_cat, spend_total = spending_by_category(txn["transactions"])
    top = sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)
    return {
        "net_worth": bal["net_worth"], "assets": bal["assets"], "liabilities": bal["liabilities"],
        "accounts_count": len(bal["accounts"]),
        "spending_30d_total": spend_total,
        "spending_by_category": [{"category": k, "amount": v} for k, v in top],
        "subscriptions_count": len(rec["subscriptions"]), "subscriptions_monthly": rec["monthly_total"],
        "investments_value": inv["total_value"], "investments_allocation": inv["allocation"],
        "pending": txn.get("pending", False),
    }

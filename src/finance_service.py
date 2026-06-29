"""Owner-scoped, READ-ONLY personal-finance aggregation over the user's Plaid
Items. Shared by both the HTTP layer (routes/finance_routes.py) and the chat
agent tool (manage_finance in src/tool_implementations.py), so the two never
diverge. All functions tolerate a per-item Plaid error and report it rather than
failing the whole response. Access tokens are decrypted transparently by the
EncryptedText column and never logged.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any, Dict, List

from core.database import BalanceSnapshot, PlaidItem, SessionLocal, utcnow_naive
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


# Each aggregation fans its per-institution Plaid calls out concurrently (one
# task per Item) instead of awaiting them serially — for a multi-institution user
# this turns N round-trips of latency into ~1. Per-item error tolerance is
# preserved: a failed Item contributes its error and the others still return.


async def balances(owner: str) -> Dict[str, Any]:
    async def _one(item):
        (_pk, item_id, token, inst) = item
        out: List[Dict[str, Any]] = []
        try:
            data = await plaid.call("/accounts/balance/get", {"access_token": token})
            for a in data.get("accounts") or []:
                bal = a.get("balances") or {}
                out.append({
                    "account_id": a.get("account_id"), "name": a.get("name"), "mask": a.get("mask"),
                    "type": a.get("type"), "subtype": a.get("subtype"), "kind": _account_kind(a.get("type")),
                    "current": bal.get("current"), "available": bal.get("available"),
                    "iso_currency_code": bal.get("iso_currency_code") or bal.get("unofficial_currency_code"),
                    "institution": inst,
                })
            return out, None
        except plaid.PlaidError as e:
            return out, {"item_id": item_id, "code": e.code}

    accounts: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for accts, err in await asyncio.gather(*[_one(it) for it in owner_tokens(owner)]):
        accounts.extend(accts)
        if err:
            errors.append(err)
    assets = sum((a["current"] or 0) for a in accounts if a["kind"] == "asset")
    liabilities = sum((a["current"] or 0) for a in accounts if a["kind"] == "liability")
    return {"accounts": accounts, "assets": round(assets, 2), "liabilities": round(liabilities, 2),
            "net_worth": round(assets - liabilities, 2), "errors": errors}


async def transactions(owner: str, days: int = 90) -> Dict[str, Any]:
    end = date.today()
    start = end - timedelta(days=max(1, min(days, 730)))

    async def _one(item):
        (_pk, item_id, token, inst) = item
        out: List[Dict[str, Any]] = []
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
                    out.append({
                        "date": t.get("date"), "name": t.get("merchant_name") or t.get("name"),
                        "amount": t.get("amount"),
                        "category": pfc.get("primary") or (t.get("category") or ["OTHER"])[0],
                        "iso_currency_code": t.get("iso_currency_code"), "pending": t.get("pending"),
                        "institution": inst,
                    })
                offset += len(batch)
                if not batch or offset >= (data.get("total_transactions") or 0):
                    break
            return out, None, False
        except plaid.PlaidError as e:
            if e.code == "PRODUCT_NOT_READY":
                return out, None, True
            return out, {"item_id": item_id, "code": e.code}, False

    txns: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    pending = False
    for items, err, item_pending in await asyncio.gather(*[_one(it) for it in owner_tokens(owner)]):
        txns.extend(items)
        if err:
            errors.append(err)
        if item_pending:
            pending = True
    txns.sort(key=lambda x: x.get("date") or "", reverse=True)
    return {"transactions": txns, "start": start.isoformat(), "end": end.isoformat(),
            "pending": pending, "errors": errors}


_FREQ_PER_MONTH = {"WEEKLY": 4.345, "BIWEEKLY": 2.172, "SEMI_MONTHLY": 2.0, "MONTHLY": 1.0, "ANNUALLY": 1 / 12}


async def recurring(owner: str) -> Dict[str, Any]:
    async def _one(item):
        (_pk, item_id, token, inst) = item
        out: List[Dict[str, Any]] = []
        try:
            data = await plaid.call("/transactions/recurring/get", {"access_token": token})
            for s in data.get("outflow_streams") or []:
                amt = (s.get("average_amount") or {}).get("amount")
                if amt is None:
                    amt = (s.get("last_amount") or {}).get("amount")
                out.append({
                    "description": s.get("merchant_name") or s.get("description"),
                    "frequency": s.get("frequency"), "average_amount": abs(amt) if amt is not None else None,
                    "last_date": s.get("last_date"), "predicted_next_date": s.get("predicted_next_date"),
                    "status": s.get("status"),
                    "category": (s.get("personal_finance_category") or {}).get("primary"),
                    "institution": inst,
                })
            return out, None
        except plaid.PlaidError as e:
            return out, {"item_id": item_id, "code": e.code}

    streams: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for items, err in await asyncio.gather(*[_one(it) for it in owner_tokens(owner)]):
        streams.extend(items)
        if err:
            errors.append(err)
    monthly = 0.0
    for s in streams:
        if s.get("average_amount"):
            monthly += s["average_amount"] * _FREQ_PER_MONTH.get((s.get("frequency") or "MONTHLY").upper(), 1.0)
    streams.sort(key=lambda x: (x.get("average_amount") or 0), reverse=True)
    return {"subscriptions": streams, "monthly_total": round(monthly, 2), "errors": errors}


async def investments(owner: str) -> Dict[str, Any]:
    async def _one(item):
        (_pk, item_id, token, inst) = item
        out: List[Dict[str, Any]] = []
        try:
            data = await plaid.call("/investments/holdings/get", {"access_token": token})
            secs = {s.get("security_id"): s for s in (data.get("securities") or [])}
            for h in data.get("holdings") or []:
                sec = secs.get(h.get("security_id")) or {}
                out.append({
                    "name": sec.get("name") or sec.get("ticker_symbol") or "Holding",
                    "ticker": sec.get("ticker_symbol"), "type": sec.get("type"),
                    "quantity": h.get("quantity"), "value": h.get("institution_value"),
                    "iso_currency_code": h.get("iso_currency_code"), "institution": inst,
                })
            return out, None
        except plaid.PlaidError as e:
            if e.code != "PRODUCT_NOT_READY":
                return out, {"item_id": item_id, "code": e.code}
            return out, None

    holdings: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    for items, err in await asyncio.gather(*[_one(it) for it in owner_tokens(owner)]):
        holdings.extend(items)
        if err:
            errors.append(err)
    total = sum(h["value"] for h in holdings if h.get("value"))
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


def _ym(d) -> str:
    """'2026-09-15' -> '2026-09'."""
    return (d or "")[:7]


def _day(d) -> int:
    try:
        return int((d or "")[8:10])
    except (ValueError, TypeError):
        return 0


async def cashflow(owner: str, months: int = 3) -> Dict[str, Any]:
    """Monthly income / expenses / net for the last `months` calendar months, plus
    this month's spending by category vs last month. Built from a ~95-day window.
    Sign: positive amount = outflow (expense), negative = inflow.

    MoM comparisons are LIKE-FOR-LIKE: the current month is month-to-date, so the
    previous month is truncated to the same day-of-month before computing
    income_mom / expense_mom / per-category delta (otherwise a partial month always
    reads "less than last month"). Genuine income is the INCOME category; other
    negatives (refunds / returns / cashback) reduce that month's spend rather than
    inflating income. Transfers / loan-payments / fees are excluded entirely."""
    txn = await transactions(owner, 95)
    today = date.today()
    this_ym = today.strftime("%Y-%m")
    prev_last = today.replace(day=1) - timedelta(days=1)
    prev_ym = prev_last.strftime("%Y-%m")
    cutoff_day = min(today.day, prev_last.day)  # same-period window into the prev month

    buckets: Dict[str, Dict[str, float]] = {}     # ym -> full-month {income, expenses} (for the bars)
    cat_now: Dict[str, float] = {}                # this-month spend by category
    cat_prev: Dict[str, float] = {}               # prev-month spend by category, month-to-date
    income_prev_mtd = 0.0
    expense_prev_mtd = 0.0
    for t in txn["transactions"]:
        ym = _ym(t.get("date"))
        if not ym:
            continue
        cat = t.get("category") or "OTHER"
        if cat in _SPEND_EXCLUDE:
            continue
        amt = t.get("amount") or 0
        b = buckets.setdefault(ym, {"income": 0.0, "expenses": 0.0})
        prev_mtd = ym == prev_ym and _day(t.get("date")) <= cutoff_day
        if amt > 0:  # outflow
            b["expenses"] += amt
            if ym == this_ym:
                cat_now[cat] = cat_now.get(cat, 0) + amt
            elif prev_mtd:
                cat_prev[cat] = cat_prev.get(cat, 0) + amt
                expense_prev_mtd += amt
        elif amt < 0:  # inflow
            if cat == "INCOME":
                b["income"] += -amt
                if prev_mtd:
                    income_prev_mtd += -amt
            else:  # refund / return / cashback → offset that month's spend (keeps net correct)
                b["expenses"] += amt
                if ym == this_ym:
                    cat_now[cat] = max(0.0, cat_now.get(cat, 0) + amt)
                elif prev_mtd:
                    cat_prev[cat] = max(0.0, cat_prev.get(cat, 0) + amt)
                    expense_prev_mtd += amt

    # Bar series: the last `months` CALENDAR months ending this month, zero-filled —
    # deterministic regardless of which months happen to have transactions.
    ordered: List[str] = []
    y, m = today.year, today.month
    for _ in range(months):
        ordered.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    ordered.reverse()
    series = [{
        "month": ym,
        "income": round((buckets.get(ym) or {}).get("income", 0.0), 2),
        "expenses": round((buckets.get(ym) or {}).get("expenses", 0.0), 2),
        "net": round((buckets.get(ym) or {}).get("income", 0.0) - (buckets.get(ym) or {}).get("expenses", 0.0), 2),
    } for ym in ordered]

    categories = []
    for cat, amt in sorted(cat_now.items(), key=lambda kv: kv[1], reverse=True):
        prev = cat_prev.get(cat, 0)
        delta = round((amt - prev) / prev * 100, 1) if prev > 0 else None
        categories.append({"category": cat, "amount": round(amt, 2), "prev": round(prev, 2), "delta_pct": delta})

    this_b = buckets.get(this_ym, {"income": 0.0, "expenses": 0.0})
    return {
        "months": series,
        "categories": categories,
        "this_month": {
            "income": round(this_b["income"], 2), "expenses": round(this_b["expenses"], 2),
            "net": round(this_b["income"] - this_b["expenses"], 2),
        },
        "income_mom": round(this_b["income"] - income_prev_mtd, 2),
        "expense_mom": round(this_b["expenses"] - expense_prev_mtd, 2),
        "pending": txn.get("pending", False),
    }


async def summary(owner: str) -> Dict[str, Any]:
    """Compact rollup for the dashboard + the manage_finance agent tool."""
    # The four aggregations are independent (each makes its own Plaid calls across
    # the user's items), so run them concurrently — serial execution summed their
    # latency and could blow the request hard-timeout on a cold first load with
    # several institutions (504). gather turns sum-of-4 into max-of-4.
    bal, txn, rec, inv = await asyncio.gather(
        balances(owner), transactions(owner, 30), recurring(owner), investments(owner),
    )
    by_cat, spend_total = spending_by_category(txn["transactions"])
    top = sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)
    # Accumulate the net-worth trend (Phase 1). Only when we have accounts AND no
    # per-item errors — never persist a spurious 0 from an all-errored/empty read,
    # nor a misleadingly partial net worth when only some institutions came back
    # (a missing item's balance would silently drop out). A gap beats a wrong point.
    if bal["accounts"] and not bal["errors"]:
        record_snapshot(owner, bal["net_worth"], bal["assets"], bal["liabilities"])
    return {
        "net_worth": bal["net_worth"], "assets": bal["assets"], "liabilities": bal["liabilities"],
        "accounts_count": len(bal["accounts"]),
        "spending_30d_total": spend_total,
        "spending_by_category": [{"category": k, "amount": v} for k, v in top],
        "subscriptions_count": len(rec["subscriptions"]), "subscriptions_monthly": rec["monthly_total"],
        "investments_value": inv["total_value"], "investments_allocation": inv["allocation"],
        "pending": txn.get("pending", False),
    }


def record_snapshot(owner: str, net_worth: float, assets: float, liabilities: float) -> None:
    """Upsert today's net-worth snapshot for the owner (one row per local day).

    Called from summary() on dashboard load — re-opening the dashboard the same day
    overwrites that day's figures with the latest. Best-effort: a snapshot write
    must never fail the read it rides along with.
    """
    today = date.today().isoformat()
    db = SessionLocal()
    try:
        row = db.query(BalanceSnapshot).filter(
            BalanceSnapshot.owner == owner, BalanceSnapshot.day == today,
        ).first()
        if row is None:
            row = BalanceSnapshot(owner=owner, day=today)
            db.add(row)
        row.net_worth = round(net_worth or 0.0, 2)
        row.assets = round(assets or 0.0, 2)
        row.liabilities = round(liabilities or 0.0, 2)
        row.captured_at = utcnow_naive()
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("finance: failed to record balance snapshot")
    finally:
        db.close()


def net_worth_history(owner: str) -> Dict[str, Any]:
    """Ordered daily net-worth snapshots for the owner (oldest → newest).

    The series accumulates forward from the first dashboard load; with <2 points
    the frontend shows the current figure and an "accumulating" hint.
    """
    db = SessionLocal()
    try:
        rows = db.query(BalanceSnapshot).filter(
            BalanceSnapshot.owner == owner,
        ).order_by(BalanceSnapshot.day.asc()).all()
        points = [{"day": r.day, "net_worth": r.net_worth, "assets": r.assets,
                   "liabilities": r.liabilities} for r in rows]
        return {"points": points}
    finally:
        db.close()

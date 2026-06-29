"""Unit test for finance_service.cashflow — bucketing, sign convention, and the
transfer exclusion, with the transactions fetch monkeypatched (no Plaid)."""
import asyncio
from datetime import date, timedelta

from src import finance_service as fs


def _months():
    today = date.today()
    this_m = today.strftime("%Y-%m")
    prev_m = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    return this_m, prev_m


def test_cashflow_income_expenses_and_transfer_exclusion(monkeypatch):
    this_m, prev_m = _months()
    # Day 01 so the previous-month rows always fall inside the month-to-date window
    # (the comparison truncates the prev month to today's day-of-month).
    fake = {
        "transactions": [
            {"date": f"{this_m}-01", "amount": 100, "category": "FOOD_AND_DRINK"},    # outflow this month
            {"date": f"{this_m}-01", "amount": -2000, "category": "INCOME"},           # inflow this month
            {"date": f"{prev_m}-01", "amount": 60, "category": "FOOD_AND_DRINK"},      # outflow last month
            {"date": f"{this_m}-01", "amount": 50, "category": "TRANSFER_OUT"},        # excluded from cash flow
            {"date": f"{this_m}-01", "amount": -25, "category": "GENERAL_MERCHANDISE"},  # refund → offsets spend, not income
        ],
        "pending": False,
    }

    async def fake_txn(owner, days=90):
        return fake

    monkeypatch.setattr(fs, "transactions", fake_txn)
    r = asyncio.run(fs.cashflow("owner"))

    assert r["this_month"]["income"] == 2000          # the -25 refund is NOT counted as income
    assert r["this_month"]["expenses"] == 75          # 100 spend - 25 refund offset; the $50 transfer is excluded
    assert r["this_month"]["net"] == 1925
    assert r["income_mom"] == 2000                    # 2000 this MTD - 0 last MTD
    assert r["expense_mom"] == 15                     # 75 - 60 (like-for-like month-to-date)

    food = next(c for c in r["categories"] if c["category"] == "FOOD_AND_DRINK")
    assert food["amount"] == 100 and food["prev"] == 60
    assert food["delta_pct"] == 66.7                  # (100-60)/60*100, rounded
    # transfers never appear as a spending category
    assert all(c["category"] != "TRANSFER_OUT" for c in r["categories"])

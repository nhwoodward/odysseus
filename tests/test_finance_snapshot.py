"""Unit test for the net-worth snapshot writer/reader (Phase 1).

Self-contained: builds its own in-memory SQLite engine + sessionmaker and points
finance_service.SessionLocal at it, so it exercises the real upsert/ordering
logic without touching the shared DB or Plaid.
"""
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.database import Base, BalanceSnapshot
from src import finance_service as fs


def _session_factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[BalanceSnapshot.__table__])
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def test_record_snapshot_upserts_per_day_and_reads_back(monkeypatch):
    monkeypatch.setattr(fs, "SessionLocal", _session_factory())

    fs.record_snapshot("alice", net_worth=-77748.0, assets=112924.0, liabilities=190673.0)
    hist = fs.net_worth_history("alice")
    assert len(hist["points"]) == 1
    p = hist["points"][0]
    assert p["day"] == date.today().isoformat()
    assert p["net_worth"] == -77748.0 and p["assets"] == 112924.0 and p["liabilities"] == 190673.0

    # Same-day write overwrites (one row per local day), not appends.
    fs.record_snapshot("alice", net_worth=-70000.0, assets=120000.0, liabilities=190000.0)
    hist = fs.net_worth_history("alice")
    assert len(hist["points"]) == 1
    assert hist["points"][0]["net_worth"] == -70000.0


def test_snapshots_are_owner_scoped(monkeypatch):
    monkeypatch.setattr(fs, "SessionLocal", _session_factory())
    fs.record_snapshot("alice", net_worth=100.0, assets=100.0, liabilities=0.0)
    fs.record_snapshot("bob", net_worth=999.0, assets=999.0, liabilities=0.0)
    assert len(fs.net_worth_history("alice")["points"]) == 1
    assert fs.net_worth_history("alice")["points"][0]["net_worth"] == 100.0
    assert fs.net_worth_history("bob")["points"][0]["net_worth"] == 999.0

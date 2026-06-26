"""Connectors backend — catalog logic + the security-critical per-user
isolation (a user's agent must never see another user's connected MCP servers).
"""
import pytest

import core.database as cdb
from core.database import McpServer
from tests.helpers.sqlite_db import make_temp_sqlite

_TS, _ENGINE, _TMPDB = make_temp_sqlite(cdb.Base.metadata)


@pytest.fixture(autouse=True)
def _bind_temp_db(monkeypatch):
    monkeypatch.setattr(cdb, "SessionLocal", _TS)
    # Start each test from an empty mcp_servers table.
    db = _TS()
    try:
        db.query(McpServer).delete()
        db.commit()
    finally:
        db.close()
    yield


def _seed(rows):
    db = _TS()
    try:
        for r in rows:
            db.add(McpServer(**r))
        db.commit()
    finally:
        db.close()


class _FakeMgr:
    """Minimal McpManager double exposing only get_all_tools()."""
    def __init__(self, tools):
        self._t = tools

    def get_all_tools(self, disabled_map=None):
        return self._t


# ── Catalog ──────────────────────────────────────────────────────────────────

def test_catalog_lists_and_filters():
    from src.connector_catalog import CONNECTOR_CATALOG, get_entry, list_catalog
    assert len(list_catalog()) == len(CONNECTOR_CATALOG)
    assert get_entry("notion")["url"] == "https://mcp.notion.com/mcp"
    assert get_entry("notion")["kind"] == "remote"
    assert get_entry("does-not-exist") is None
    only = list_catalog({"notion", "github"})
    assert {e["id"] for e in only} == {"notion", "github"}


def test_remote_entries_have_no_secret_fields_local_do():
    from src.connector_catalog import get_entry
    # remote OAuth connectors need no user-entered secrets
    assert get_entry("notion").get("fields", []) == []
    # local/api-key connectors expose labelled fields with help text
    brave = get_entry("brave")
    assert brave["kind"] == "local" and brave["auth_type"] == "api_key"
    assert any(f["key"] == "BRAVE_API_KEY" and f.get("secret") for f in brave["fields"])


# ── Per-user isolation (security) ────────────────────────────────────────────

def test_owner_isolation_hides_foreign_connections():
    from src.agent_loop import _load_mcp_disabled_map
    _seed([
        {"id": "srvA", "name": "A", "transport": "http", "owner": "alice", "catalog_id": "notion"},
        {"id": "srvB", "name": "B", "transport": "http", "owner": "bob", "catalog_id": "linear"},
        {"id": "srvShared", "name": "S", "transport": "stdio", "owner": None, "catalog_id": None},
    ])
    mgr = _FakeMgr([
        {"server_id": "srvA", "name": "search_pages"},
        {"server_id": "srvB", "name": "create_issue"},
        {"server_id": "srvShared", "name": "do_thing"},
    ])
    dmap = _load_mcp_disabled_map(owner="alice", mcp_mgr=mgr)
    # bob's server is fully hidden from alice (all its tools disabled)
    assert dmap.get("srvB") == {"create_issue"}
    # alice's own connection and the shared (NULL-owner) server stay visible
    assert "srvA" not in dmap
    assert "srvShared" not in dmap


def test_owner_isolation_preserves_existing_disabled_tools():
    from src.agent_loop import _load_mcp_disabled_map
    _seed([
        {"id": "srvA", "name": "A", "transport": "http", "owner": "alice",
         "catalog_id": "notion", "disabled_tools": '["delete_page"]'},
    ])
    mgr = _FakeMgr([{"server_id": "srvA", "name": "delete_page"}])
    dmap = _load_mcp_disabled_map(owner="alice", mcp_mgr=mgr)
    # alice's own per-tool toggle is honored; the server itself is not hidden
    assert dmap.get("srvA") == {"delete_page"}


def test_no_owner_means_no_isolation_layer():
    from src.agent_loop import _load_mcp_disabled_map
    _seed([{"id": "srvB", "name": "B", "transport": "http", "owner": "bob", "catalog_id": "x"}])
    mgr = _FakeMgr([{"server_id": "srvB", "name": "tool"}])
    # single-user / legacy mode (no owner): nothing extra hidden
    dmap = _load_mcp_disabled_map(owner=None, mcp_mgr=mgr)
    assert "srvB" not in dmap

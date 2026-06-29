"""Regression test for finding H1: app_api path-normalization blocklist bypass.

A traversal path like '/api/cookbook/../admin/x' does NOT start with a blocked
prefix, so the raw-path blocklist used to let it through — but httpx normalizes
it to '/api/admin/x' at send time, reaching a blocked admin endpoint. The fix
normalizes the path (posixpath.normpath) BEFORE the blocklist checks and the
send, so the blocklist sees what httpx will actually request.

Relies on tests/conftest.py to put the repo root on sys.path and stub heavy
optional deps (httpx, fastapi, ...) so src.tool_implementations imports cleanly.
"""
import asyncio
import json

import pytest

from src.tool_implementations import _normalize_app_api_path, do_app_api


def _run(coro):
    return asyncio.run(coro)


# --- the pure helper -------------------------------------------------------

def test_normalize_collapses_traversal_into_absolute_path():
    # '..' segments resolve against the path, matching httpx's send-time view.
    assert _normalize_app_api_path("/api/cookbook/../admin/x") == "/api/admin/x"
    assert _normalize_app_api_path("/api/x/../admin") == "/api/admin"
    # duplicate slashes collapse too
    assert _normalize_app_api_path("/api//cookbook//gpus") == "/api/cookbook/gpus"


def test_normalize_leaves_normal_paths_unchanged():
    # A legitimate path (incl. a trailing slash) must pass through verbatim.
    assert _normalize_app_api_path("/api/cookbook/gpus") == "/api/cookbook/gpus"
    assert _normalize_app_api_path("/api/notes/") == "/api/notes/"


def test_normalize_preserves_query_string():
    assert (
        _normalize_app_api_path("/api/cookbook/../admin/x?foo=1&b=2")
        == "/api/admin/x?foo=1&b=2"
    )


# --- the actual tool guard -------------------------------------------------

def test_traversal_into_blocked_prefix_is_rejected():
    # Resolves to /api/admin/x — must be refused with the 'blocked' error and
    # must NOT issue any HTTP request (blocklist fires before httpx).
    res = _run(do_app_api(json.dumps({
        "action": "call",
        "path": "/api/cookbook/../admin/x",
    })))
    assert res.get("exit_code") == 1
    assert "blocked" in (res.get("error") or "").lower()


def test_traversal_into_blocked_method_path_is_rejected():
    # POST /api/cookbook/foo/../state -> /api/cookbook/state, a blocked
    # (method, prefix) pair that previously could be reached via traversal.
    res = _run(do_app_api(json.dumps({
        "action": "call",
        "method": "POST",
        "path": "/api/cookbook/foo/../state",
        "body": {"tasks": []},
    })))
    assert res.get("exit_code") == 1
    assert "blocked" in (res.get("error") or "").lower()


if __name__ == "__main__":  # allow standalone run without pytest installed
    raise SystemExit(pytest.main([__file__, "-q"]))

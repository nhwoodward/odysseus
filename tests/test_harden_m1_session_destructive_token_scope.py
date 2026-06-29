"""Regression test for finding M1 — session destructive routes ignore token scope.

Destructive session endpoints (single-session delete, bulk delete) authorized
only via the owner check in ``_verify_session_owner``. That check resolves a
bearer ``ody_`` API token to its *owner* (via ``effective_user``), so a
narrow-scoped, non-interactive API token could delete the owner's sessions even
though it was never granted a destructive scope.

The fix gates each destructive route on ``require_user(request)``, which rejects
API-token requests with a 403 while still admitting real browser sessions (and
single-user / auth-disabled mode, where it returns "").

Style mirrors tests/test_session_ghost_delete.py: import the real
``routes.session_routes`` under conftest's MagicMock sqlalchemy stub, swapping in
MagicMock module objects for the heavy ORM modules so the closure-built route
handlers can be exercised directly.
"""

import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from tests.helpers.import_state import clear_module, preserve_import_state

_TEMP_STUBS = ("core.database", "core.models", "core.session_manager")
with preserve_import_state(*_TEMP_STUBS, "routes.session_routes"):
    for _name in _TEMP_STUBS:
        sys.modules[_name] = MagicMock(name=_name)
    clear_module("routes.session_routes")
    import routes.session_routes as SR  # noqa: E402

from fastapi import HTTPException  # noqa: E402

_MISSING = object()


def _session_local_returning(owner_value):
    """SessionLocal mock whose query(...).filter(...).first() yields a row with
    the given owner, or None when owner_value is _MISSING ("no DB row")."""
    db = MagicMock()
    row = None if owner_value is _MISSING else SimpleNamespace(owner=owner_value, is_important=False)
    db.query.return_value.filter.return_value.first.return_value = row
    return MagicMock(return_value=db)


def _req(**state):
    return SimpleNamespace(
        state=SimpleNamespace(**state),
        app=SimpleNamespace(state=SimpleNamespace(auth_manager=SimpleNamespace(is_configured=True))),
        client=SimpleNamespace(host="203.0.113.10"),
    )


def _api_token_req(owner="alice"):
    # How the auth middleware stamps a bearer ody_ token: pseudo-user "api",
    # api_token flag set, real owner recorded separately.
    return _req(current_user="api", api_token=True, api_token_owner=owner)


def _user_req(user="alice"):
    return _req(current_user=user, api_token=False, api_token_owner=None)


def _fake_manager(sid, owner="alice"):
    deleted = []

    def _delete(_sid):
        deleted.append(_sid)
        return True

    mgr = SimpleNamespace(
        sessions={sid: SimpleNamespace(id=sid, owner=owner)},
        delete_session=_delete,
        deleted=deleted,
    )
    return mgr


def _build_routes(session_manager):
    router = SR.setup_session_routes(session_manager, {}, None)
    handlers = {}
    for route in router.routes:
        methods = getattr(route, "methods", set()) or set()
        handlers[(route.path, frozenset(methods))] = route.endpoint
    return handlers


def _get(handlers, path, method):
    for (rpath, methods), endpoint in handlers.items():
        if rpath == path and method in methods:
            return endpoint
    raise AssertionError(f"route {method} {path} not found")


@pytest.fixture(autouse=True)
def _auth_enabled(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.delenv("LOCALHOST_BYPASS", raising=False)


# --- DELETE /api/session/{sid} ------------------------------------------------

def test_delete_session_rejects_api_token(monkeypatch):
    monkeypatch.setattr(SR, "SessionLocal", _session_local_returning("alice"))
    mgr = _fake_manager("sid-1", owner="alice")
    delete_session = _get(_build_routes(mgr), "/api/session/{sid}", "DELETE")

    with pytest.raises(HTTPException) as exc:
        delete_session(_api_token_req(owner="alice"), "sid-1")

    assert exc.value.status_code == 403
    assert mgr.deleted == []  # nothing was deleted


def test_delete_session_allows_authenticated_owner(monkeypatch):
    # No DB row -> falls through to the in-memory ghost owned by alice.
    monkeypatch.setattr(SR, "SessionLocal", _session_local_returning(_MISSING))
    mgr = _fake_manager("sid-1", owner="alice")
    delete_session = _get(_build_routes(mgr), "/api/session/{sid}", "DELETE")

    result = delete_session(_user_req("alice"), "sid-1")

    assert result == {"status": "deleted"}
    assert mgr.deleted == ["sid-1"]


# --- POST /api/sessions/bulk-delete ------------------------------------------

def test_bulk_delete_rejects_api_token(monkeypatch):
    monkeypatch.setattr(SR, "SessionLocal", _session_local_returning("alice"))
    mgr = _fake_manager("sid-1", owner="alice")
    bulk_delete = _get(_build_routes(mgr), "/api/sessions/bulk-delete", "POST")

    async def _json():
        return {"ids": ["sid-1"]}

    req = _api_token_req(owner="alice")
    req.json = _json

    with pytest.raises(HTTPException) as exc:
        asyncio.run(bulk_delete(req))

    # The 403 must propagate, not be swallowed by the per-id except/pass loop.
    assert exc.value.status_code == 403
    assert mgr.deleted == []


def test_bulk_delete_allows_authenticated_owner(monkeypatch):
    monkeypatch.setattr(SR, "SessionLocal", _session_local_returning(_MISSING))
    mgr = _fake_manager("sid-1", owner="alice")
    bulk_delete = _get(_build_routes(mgr), "/api/sessions/bulk-delete", "POST")

    async def _json():
        return {"ids": ["sid-1"]}

    req = _user_req("alice")
    req.json = _json

    result = asyncio.run(bulk_delete(req))

    assert result == {"deleted": 1}
    assert mgr.deleted == ["sid-1"]

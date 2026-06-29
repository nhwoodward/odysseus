"""User-facing Connectors API — a Claude/ChatGPT-style connector experience built
on the existing MCP client (``src/mcp_manager.py`` + ``src/mcp_oauth.py``).

Hybrid model:
  - Admins **curate** which catalog entries are available (``connectors_enabled``
    setting; absent = all available).
  - Each user **self-connects their own account**: a connect creates a per-user
    ``McpServer`` row (``owner`` + ``catalog_id`` set). Remote connectors run the
    existing OAuth 2.1 + DCR + PKCE flow; local (stdio) connectors fill the
    catalog template from user-entered fields.

Security:
  - Everything is owner-scoped; a user only ever sees/manages their own
    connections (admins see all). Agent tool isolation is enforced separately in
    ``agent_loop._load_mcp_disabled_map`` (foreign-owned servers are hidden).
  - **Local/stdio connectors execute code on the host**, so connecting one is
    gated to admins. Remote (OAuth) connectors are self-serve for any user.
  - Custom remote URLs are validated against SSRF via ``validate_public_http_url``.
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Form, HTTPException, Request

from core.database import McpServer, SessionLocal
from core.middleware import require_admin
from src.auth_helpers import require_user
from src.connector_catalog import CATEGORY_ORDER, CONNECTOR_CATALOG, get_entry, list_catalog
from src.mcp_manager import McpManager
from src.settings import get_setting, load_settings, save_settings
from src.url_security import validate_public_http_url

logger = logging.getLogger(__name__)

_ENABLED_SETTING = "connectors_enabled"  # list[str] of catalog ids; absent/None = all enabled


def _enabled_ids() -> Optional[set]:
    val = get_setting(_ENABLED_SETTING, None)
    if val is None:
        return None
    try:
        return set(val)
    except TypeError:
        return None


def _is_admin(request: Request) -> bool:
    try:
        require_admin(request)
        return True
    except HTTPException:
        return False


def _may_manage(server_owner: Optional[str], user: str, is_admin: bool) -> bool:
    """Authorization rule for managing a connector row (disconnect / tools).

    Admins may manage anything. Everyone else may manage ONLY their own
    per-user connection (``owner == user``). Shared / admin-global rows
    (``owner is None``) and other users' rows are denied to non-admins — this
    is the IDOR / privilege-escalation guard."""
    if is_admin:
        return True
    return server_owner is not None and server_owner == user


def _persist_status(server_id: str, status: dict) -> None:
    """Mirror the live manager status onto the durable McpServer row so the UI
    can show state before the manager has (re)connected (e.g. after a restart)."""
    db = SessionLocal()
    try:
        srv = db.query(McpServer).filter(McpServer.id == server_id).first()
        if not srv:
            return
        st = status.get("status")
        srv.needs_auth = (st == "needs_auth")
        srv.last_error = status.get("error")
        if st == "connected":
            srv.last_connected_at = datetime.utcnow()
        db.commit()
    except Exception as e:  # status is best-effort; never fail a connect on it
        logger.debug(f"connector status persist failed: {e}")
    finally:
        db.close()


def _connection_dto(srv: McpServer, status: dict) -> dict:
    st = status.get("status", "disconnected")
    return {
        "id": srv.id,
        "name": srv.name,
        "catalog_id": srv.catalog_id,
        "owner": srv.owner,
        "transport": srv.transport,
        "url": srv.url,
        "status": st,
        "tool_count": status.get("tool_count", 0),
        "needs_auth": st == "needs_auth",
        "auth_url": status.get("auth_url"),
        "error": status.get("error") or srv.last_error,
        "last_connected_at": srv.last_connected_at.isoformat() if srv.last_connected_at else None,
    }


def _connect_result(server_id: str, name: str, connected: bool, status: dict) -> dict:
    st = status.get("status", "disconnected")
    return {
        "id": server_id,
        "name": name,
        "connected": connected,
        "status": st,
        "needs_auth": st == "needs_auth",
        "auth_url": status.get("auth_url"),
        "tool_count": status.get("tool_count", 0),
        "error": status.get("error"),
    }


def setup_connector_routes(mcp_manager: McpManager) -> APIRouter:
    router = APIRouter(prefix="/api/connectors", tags=["connectors"])

    def _owned_server(server_id: str, user: str, request: Request) -> McpServer:
        """Return the server if the caller may manage it, else raise.

        Non-admins may ONLY manage their own per-user connections (owner ==
        user). Shared / admin-global servers (owner IS NULL) and other users'
        rows are off-limits — guards against IDOR / privilege escalation (e.g.
        a non-admin deleting a global admin MCP server, or retagging its tools,
        by passing its id). Admins may manage anything."""
        db = SessionLocal()
        try:
            srv = db.query(McpServer).filter(McpServer.id == server_id).first()
            if not srv:
                raise HTTPException(404, "Connection not found")
            if not _may_manage(srv.owner, user, _is_admin(request)):
                raise HTTPException(403, "Not your connection")
            db.expunge(srv)
            return srv
        finally:
            db.close()

    @router.get("/catalog")
    def catalog(request: Request):
        """The branded connector catalog. Users see only admin-enabled entries;
        admins see all (each annotated with an ``available`` flag)."""
        require_user(request)
        admin = _is_admin(request)
        enabled = _enabled_ids()
        items = list_catalog(None if admin else enabled)
        if admin:
            for it in items:
                it["available"] = (enabled is None) or (it["id"] in enabled)
        return {"connectors": items, "categories": CATEGORY_ORDER}

    @router.get("")
    @router.get("/")
    def my_connections(request: Request):
        """The caller's connections + live status (admins see all)."""
        user = require_user(request)
        admin = _is_admin(request)
        db = SessionLocal()
        try:
            q = db.query(McpServer).filter(McpServer.catalog_id.isnot(None))
            if not admin:
                q = q.filter(McpServer.owner == user)
            rows = q.all()
        finally:
            db.close()
        out = [_connection_dto(srv, mcp_manager.get_server_status(srv.id)) for srv in rows]
        return {"connections": out}

    @router.post("/{catalog_id}/connect")
    async def connect(catalog_id: str, request: Request, fields: str = Form("{}")):
        """Connect the current user to a catalog entry (creating an owner-scoped
        McpServer). Remote → OAuth (returns ``auth_url``); local → spawn stdio."""
        user = require_user(request)
        entry = get_entry(catalog_id)
        if not entry:
            raise HTTPException(404, "Unknown connector")

        enabled = _enabled_ids()
        admin = _is_admin(request)
        if enabled is not None and catalog_id not in enabled and not admin:
            raise HTTPException(403, "This connector isn't enabled by the administrator")
        # Local/stdio connectors execute on the host — admin only.
        if entry["kind"] == "local" and not admin:
            raise HTTPException(403, "Local connectors can only be added by an administrator")

        try:
            field_vals = json.loads(fields) if fields else {}
        except json.JSONDecodeError:
            field_vals = {}

        transport = entry.get("transport", "stdio")
        command = entry.get("command")
        args = list(entry.get("args", []))
        env = dict(entry.get("env", {}))
        url = entry.get("url")
        # Fill the template from user fields: ``__argN`` → positional arg, else env.
        for f in entry.get("fields", []):
            key = f.get("key", "")
            val = field_vals.get(key, "")
            if key.startswith("__arg"):
                try:
                    idx = int(key[len("__arg"):])
                except ValueError:
                    continue
                while len(args) <= idx:
                    args.append("")
                args[idx] = val
            elif key:
                env[key] = val

        db = SessionLocal()
        try:
            # Re-templating upsert: reconnecting an existing connector refreshes its
            # command/args/url/transport from the (possibly updated) catalog instead of
            # piling up duplicate rows or re-running stale args (e.g. a catalog package
            # bump must take effect on the next connect, not only on fresh adds).
            # Previously-stored secret env values are preserved when the user doesn't
            # re-supply them, and OAuth tokens are left untouched so remote reconnects
            # don't force a re-auth.
            existing = (
                db.query(McpServer)
                .filter(McpServer.owner == user, McpServer.catalog_id == catalog_id)
                .first()
            )
            if existing is not None:
                server_id = existing.id
                try:
                    prev_env = json.loads(existing.env) if existing.env else {}
                except (TypeError, ValueError):
                    prev_env = {}
                for f in entry.get("fields", []):
                    k = f.get("key", "")
                    if k and not k.startswith("__arg") and not field_vals.get(k) and prev_env.get(k):
                        env[k] = prev_env[k]
                existing.name = entry["name"]
                existing.transport = transport
                existing.command = command
                existing.args = json.dumps(args)
                existing.env = json.dumps(env)
                existing.url = url
                existing.is_enabled = True
                existing.last_error = None
            else:
                server_id = str(uuid.uuid4())[:8]
                db.add(McpServer(
                    id=server_id, name=entry["name"], transport=transport,
                    command=command, args=json.dumps(args), env=json.dumps(env),
                    url=url, is_enabled=True, owner=user, catalog_id=catalog_id,
                ))
            db.commit()
        finally:
            db.close()

        connected = await mcp_manager.connect_server(
            server_id=server_id, name=entry["name"], transport=transport,
            command=command, args=args, env=env, url=url,
        )
        status = mcp_manager.get_server_status(server_id)
        _persist_status(server_id, status)
        return _connect_result(server_id, entry["name"], connected, status)

    @router.post("/custom")
    async def connect_custom(request: Request, name: str = Form(...), url: str = Form(...)):
        """Add a custom remote MCP connector by URL (the universal primitive).
        SSRF-guarded; remote OAuth handles auth."""
        user = require_user(request)
        try:
            safe_url = validate_public_http_url(url)
        except Exception:
            raise HTTPException(400, "Enter a valid public https:// MCP server URL")

        server_id = str(uuid.uuid4())[:8]
        db = SessionLocal()
        try:
            db.add(McpServer(
                id=server_id, name=name or safe_url, transport="http",
                args="[]", env="{}", url=safe_url, is_enabled=True,
                owner=user, catalog_id="custom",
            ))
            db.commit()
        finally:
            db.close()

        connected = await mcp_manager.connect_server(
            server_id=server_id, name=name or safe_url, transport="http",
            command=None, args=[], env={}, url=safe_url,
        )
        status = mcp_manager.get_server_status(server_id)
        _persist_status(server_id, status)
        return _connect_result(server_id, name or safe_url, connected, status)

    @router.delete("/{server_id}")
    async def disconnect(server_id: str, request: Request):
        """Disconnect + delete the caller's connection (and its tokens)."""
        user = require_user(request)
        _owned_server(server_id, user, request)
        db = SessionLocal()
        try:
            srv = db.query(McpServer).filter(McpServer.id == server_id).first()
            if srv:
                db.delete(srv)
                db.commit()
        finally:
            db.close()
        await mcp_manager.disconnect_server(server_id)
        return {"ok": True}

    @router.get("/{server_id}/tools")
    def server_tools(server_id: str, request: Request):
        user = require_user(request)
        srv = _owned_server(server_id, user, request)
        disabled = set(json.loads(srv.disabled_tools)) if srv.disabled_tools else set()
        tools = [
            {**t, "is_disabled": t["name"] in disabled}
            for t in mcp_manager.get_all_tools() if t["server_id"] == server_id
        ]
        return {"tools": tools}

    @router.patch("/{server_id}/tools")
    async def update_tools(server_id: str, request: Request, disabled_tools: str = Form(...)):
        user = require_user(request)
        _owned_server(server_id, user, request)
        try:
            names = json.loads(disabled_tools)
        except json.JSONDecodeError:
            names = []
        db = SessionLocal()
        try:
            srv = db.query(McpServer).filter(McpServer.id == server_id).first()
            if srv:
                srv.disabled_tools = json.dumps(names)
                db.commit()
        finally:
            db.close()
        return {"ok": True}

    # ── Admin curation: which catalog entries are available to users ──
    @router.get("/admin/availability")
    def get_availability(request: Request):
        require_admin(request)
        return {
            "enabled": get_setting(_ENABLED_SETTING, None),  # None = all
            "all_ids": list(CONNECTOR_CATALOG.keys()),
        }

    @router.put("/admin/availability")
    def set_availability(request: Request, enabled: str = Form(...)):
        require_admin(request)
        try:
            ids = json.loads(enabled)
            if not isinstance(ids, list):
                ids = []
        except json.JSONDecodeError:
            ids = []
        settings = load_settings()
        settings[_ENABLED_SETTING] = ids
        save_settings(settings)
        return {"ok": True, "enabled": ids}

    return router

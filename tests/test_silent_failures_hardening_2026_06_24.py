"""Regression tests for the 2026-06-24 'no silent failures' hardening pass.

Locks in the behaviors that were silent or fail-open before this pass and are
now explicit. Each test maps to one cluster of the codebase QA:

  * ``atomic_write_bytes`` — binary secret/key files written owner-only (0600),
    no world-readable window, no truncated-on-crash file. (H3 / theme #1.)
  * ``write_file`` — refuses to silently truncate an existing non-empty file
    when the call has no body line; still allows intentional clears + new files.
  * ``save_assistant_response`` — surfaces a DB persist failure
    (``_persist_failed``) to the stream as ``{"id", "persist_failed"}`` instead
    of silent success. (H4.)
  * ``_load_mcp_disabled_map`` — fail-closed (None sentinel) on corrupt
    ``disabled_tools``; MCP schema/prompt consumers block ALL of that server's
    tools. (agent-loop fail-closed.)
  * ``execute_tool_block`` — a raising tool handler becomes a structured error
    result instead of tearing down the whole agent turn. (agent-loop fail-closed.)
"""
import os
import stat
from types import SimpleNamespace

import pytest


# ── atomic_write_bytes — owner-only perms (H3 / theme #1) ──────────────────
def test_atomic_write_bytes_creates_owner_only(tmp_path):
    from core.atomic_io import atomic_write_bytes

    p = tmp_path / "key.bin"
    atomic_write_bytes(str(p), b"secret-key-bytes")

    assert p.read_bytes() == b"secret-key-bytes"
    if os.name != "nt":
        assert stat.S_IMODE(os.lstat(p).st_mode) == 0o600
    # No leftover temp file.
    assert not list(tmp_path.glob("key.bin.tmp.*"))


def test_atomic_write_bytes_overwrite_re_restricts(tmp_path):
    # A pre-existing world-readable file must end up 0600 after overwrite —
    # os.replace preserves the *temp* file's perms (0600), not the old file's.
    from core.atomic_io import atomic_write_bytes

    p = tmp_path / "key.bin"
    p.write_bytes(b"old")
    if os.name != "nt":
        os.chmod(p, 0o644)
    atomic_write_bytes(str(p), b"new")

    assert p.read_bytes() == b"new"
    if os.name != "nt":
        assert stat.S_IMODE(os.lstat(p).st_mode) == 0o600


# ── write_file truncation guard ────────────────────────────────────────────
@pytest.mark.asyncio
async def test_write_file_refuses_to_truncate_existing_no_body(tmp_path):
    from src.agent_tools.filesystem_tools import WriteFileTool

    p = tmp_path / "existing.txt"
    p.write_text("important content\n")

    # No body line at all — almost certainly a malformed call, not an intent to
    # clear the file. Must refuse rather than silently empty it.
    res = await WriteFileTool().execute(str(p), {})
    assert res.get("exit_code") == 1
    assert "refusing to truncate" in res.get("error", "").lower()
    assert p.read_text() == "important content\n"  # untouched


@pytest.mark.asyncio
async def test_write_file_allows_intentional_empty_body_clear(tmp_path):
    from src.agent_tools.filesystem_tools import WriteFileTool

    p = tmp_path / "existing.txt"
    p.write_text("to be cleared\n")

    # An explicit (empty) body line IS an intentional clear — allowed.
    res = await WriteFileTool().execute(f"{p}\n", {})
    assert res.get("exit_code") == 0
    assert p.read_text() == ""


@pytest.mark.asyncio
async def test_write_file_allows_new_empty_file_no_body(tmp_path):
    from src.agent_tools.filesystem_tools import WriteFileTool

    p = tmp_path / "brand_new.txt"
    # No body line + file does not exist → create an empty file (allowed).
    res = await WriteFileTool().execute(str(p), {})
    assert res.get("exit_code") == 0
    assert p.read_text() == ""


# ── save_assistant_response surfaces persist failure (H4) ──────────────────
def _patch_session_accessed(monkeypatch):
    monkeypatch.setattr("core.database.update_session_last_accessed", lambda *a, **k: None)


def test_save_assistant_response_surfaces_persist_failed(monkeypatch):
    from routes.chat_helpers import save_assistant_response

    _patch_session_accessed(monkeypatch)

    class _Sess:
        def __init__(self):
            self.model = "m"
            self.history = []

        def add_message(self, m):
            # Simulate a failed DB commit: _persist_message stamps this flag.
            if m.metadata is None:
                m.metadata = {}
            m.metadata["_persist_failed"] = True
            self.history.append(m)

    sm = SimpleNamespace(save_sessions=lambda: None)
    out = save_assistant_response(_Sess(), sm, "s1", "hello", None, incognito=False)
    assert out == {"id": None, "persist_failed": True}


def test_save_assistant_response_returns_id_when_persist_ok(monkeypatch):
    from routes.chat_helpers import save_assistant_response

    _patch_session_accessed(monkeypatch)

    class _Sess:
        def __init__(self):
            self.model = "m"
            self.history = []

        def add_message(self, m):
            if m.metadata is None:
                m.metadata = {}
            m.metadata["_db_id"] = "db-42"
            self.history.append(m)

    sm = SimpleNamespace(save_sessions=lambda: None)
    out = save_assistant_response(_Sess(), sm, "s1", "hello", None, incognito=False)
    assert out == {"id": "db-42", "persist_failed": False}


# ── MCP disabled_tools fail-closed (agent-loop) ─────────────────────────────
def test_mcp_disabled_map_fail_closed_on_corrupt(monkeypatch):
    # Corrupt disabled_tools JSON -> None sentinel (fail-closed), not a silently
    # empty set that re-enables the operator's disabled tools.
    import src.agent_loop as al

    class _Srv:
        def __init__(self, sid, disabled_tools):
            self.id = sid
            self.disabled_tools = disabled_tools

    class _Query:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class _Db:
        def query(self, _model):
            return _Query([_Srv("srv1", "{not valid json")])

        def close(self):
            pass

    monkeypatch.setattr("core.database.SessionLocal", lambda: _Db())
    m = al._load_mcp_disabled_map()
    assert m == {"srv1": None}


def test_mcp_schemas_and_prompt_block_all_on_none_sentinel():
    from src.mcp_manager import McpManager

    m = McpManager()
    m._tools = {
        "srv1": [{"name": "t1", "description": "d", "input_schema": {}}],
        "srv2": [{"name": "t2", "description": "d", "input_schema": {}}],
    }
    m._connections = {"srv1": {"name": "S1"}, "srv2": {"name": "S2"}}

    disabled = {"srv1": None}  # corrupt-row sentinel

    schemas = m.get_all_openai_schemas(disabled)
    names = {s["function"]["name"] for s in schemas}
    assert "mcp__srv1__t1" not in names
    assert "mcp__srv2__t2" in names

    tools = m.get_all_tools(disabled)
    by_srv = {t["server_id"]: t for t in tools}
    assert by_srv["srv1"]["is_disabled"] is True
    assert by_srv["srv2"]["is_disabled"] is False

    # Prompt description must not crash on the None cache key and must omit srv1.
    desc = m.get_tool_descriptions_for_prompt(disabled)
    assert "S1" not in desc
    assert "S2" in desc


# ── execute_tool_block isolates handler exceptions (agent-loop) ─────────────
@pytest.mark.asyncio
async def test_execute_tool_block_converts_impl_exception_to_error(monkeypatch):
    # A tool handler raising an unexpected exception must NOT propagate and kill
    # the whole agent turn — it becomes a structured error result the loop feeds
    # back to the model. Patch the impl to raise and assert the wrapper absorbs it.
    import src.tool_execution as te
    from src.agent_tools import ToolBlock

    async def _raise(*a, **k):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(te, "_execute_tool_block_impl", _raise)
    desc, result = await te.execute_tool_block(
        ToolBlock("list_models", "{}"), owner="u"
    )

    assert result.get("exit_code") == 1
    assert "failed unexpectedly" in result.get("error", "")
    assert "error" in desc
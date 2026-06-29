"""Regression tests for the MCP stdio connect-retry (Google Maps "Connection
closed" durable fix). A stdio connector that fails its first attempt (e.g. npx
cold-downloading the package on a fresh image) must be retried so it self-heals
once the npm cache warms, while non-stdio transports are not retried."""
import asyncio
import pytest

mcp = pytest.importorskip("src.mcp_manager")


async def _noop_sleep(*a, **k):  # replaces asyncio.sleep without recursing into it
    return None


def _mgr():
    return mcp.McpManager()


def test_stdio_retries_then_succeeds(monkeypatch):
    mgr = _mgr()
    calls = {"n": 0}

    async def flaky_stdio(server_id, name, command, args, env):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("Connection closed")  # cold first attempt
        return True

    monkeypatch.setattr(mgr, "_connect_stdio", flaky_stdio)
    sleeps = []
    async def fake_sleep(s, *a, **k):
        sleeps.append(s)
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    ok = asyncio.run(mgr.connect_server("gm", "Google Maps", "stdio",
                                        command="npx", args=["-y", "x"], env={}))
    assert ok is True
    assert calls["n"] == 2          # retried exactly once after the failure
    assert sleeps and sleeps[0] == 4  # first backoff is 4s


def test_stdio_gives_up_after_three_attempts(monkeypatch):
    mgr = _mgr()
    calls = {"n": 0}

    async def always_fail(*a, **k):
        calls["n"] += 1
        raise RuntimeError("Connection closed")

    monkeypatch.setattr(mgr, "_connect_stdio", always_fail)
    monkeypatch.setattr(asyncio, "sleep", _noop_sleep)

    ok = asyncio.run(mgr.connect_server("x", "X", "stdio", command="npx", args=[], env={}))
    assert ok is False
    assert calls["n"] == 3          # 3 attempts, then surface the error
    assert mgr._connections["x"]["status"] == "error"


def test_non_stdio_is_not_retried(monkeypatch):
    mgr = _mgr()
    calls = {"n": 0}

    async def fail_http(*a, **k):
        calls["n"] += 1
        raise RuntimeError("nope")

    monkeypatch.setattr(mgr, "_start_http_connect", fail_http)
    monkeypatch.setattr(asyncio, "sleep", _noop_sleep)

    ok = asyncio.run(mgr.connect_server("h", "H", "http", url="http://x"))
    assert ok is False
    assert calls["n"] == 1          # http: single attempt, no retry

"""Regression tests for the M4 + M9 hardening follow-ups.

M4: re-importing a redacted backup must NOT overwrite live secrets with the
    "***REDACTED***" placeholder.
M9: memory.json read-modify-write must be serialized (re-entrant lock, no lost
    updates) across concurrent writers.
"""
import json
import os
import tempfile
import threading

import pytest


# ----------------------------- M4 -----------------------------
def test_import_merge_preserves_live_secret_over_placeholder():
    # Imported via the route module; needs app deps (runs under the container suite).
    bp = pytest.importorskip("routes.backup_routes")
    PLACEHOLDER = bp._EXPORT_REDACTION_PLACEHOLDER

    live = {
        "brave_api_key": "REAL-brave-123",
        "ui_theme": "zinc",
        "email_accounts": {"work": {"imap_password": "REAL-pw", "host": "old.example"}},
    }
    incoming = {  # what a redacted backup carries
        "brave_api_key": PLACEHOLDER,
        "ui_theme": "dark",  # legit non-secret change
        "email_accounts": {"work": {"imap_password": PLACEHOLDER, "host": "new.example"}},
    }
    merged = bp._merge_preserving_secrets(dict(live), incoming)
    # live secrets preserved (not clobbered by the placeholder)...
    assert merged["brave_api_key"] == "REAL-brave-123"
    assert merged["email_accounts"]["work"]["imap_password"] == "REAL-pw"
    # ...while non-secret fields still restore, even nested
    assert merged["ui_theme"] == "dark"
    assert merged["email_accounts"]["work"]["host"] == "new.example"
    # and the placeholder is never written anywhere
    assert PLACEHOLDER not in json.dumps(merged)


def test_contains_placeholder_detects_nested():
    bp = pytest.importorskip("routes.backup_routes")
    P = bp._EXPORT_REDACTION_PLACEHOLDER
    assert bp._contains_placeholder(P)
    assert bp._contains_placeholder({"a": {"b": P}})
    assert bp._contains_placeholder(["x", {"k": P}])
    assert not bp._contains_placeholder({"a": "clean", "b": ["ok"]})


# ----------------------------- M9 -----------------------------
def test_file_lock_is_reentrant_no_deadlock():
    from src.memory import _file_lock, _lock_depth
    d = tempfile.mkdtemp()
    lock = os.path.join(d, "memory.json.lock")
    reached = False
    with _file_lock(lock):
        with _file_lock(lock):  # nested same-thread acquire must not block
            with _file_lock(lock):
                reached = True
    assert reached
    # depth bookkeeping returns to zero
    assert getattr(_lock_depth, "by_path", {}).get(lock, 0) == 0


def test_concurrent_rmw_under_lock_loses_no_updates():
    from src.memory import _file_lock
    d = tempfile.mkdtemp()
    data = os.path.join(d, "memory.json")
    lock = data + ".lock"
    json.dump([], open(data, "w"))

    def rmw(tag):
        for i in range(25):
            with _file_lock(lock):  # == MemoryManager.transaction()
                cur = json.load(open(data))
                cur.append(f"{tag}-{i}")
                tmp = f"{data}.tmp.{os.getpid()}.{threading.get_ident()}.{i}"
                json.dump(cur, open(tmp, "w"))
                os.replace(tmp, data)

    threads = [threading.Thread(target=rmw, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(json.load(open(data))) == 100  # 4 writers * 25, none lost

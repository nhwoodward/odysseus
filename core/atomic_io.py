"""Atomic JSON file writes.

Use this everywhere a JSON config file is persisted. A plain `open("w") +
json.dump` truncates the file on first write and only fills it with new
content afterwards — a kill -9 / power loss / OOM in between produces a
truncated or empty file. For password DBs (`auth.json`) and live state
(`sessions.json`, `settings.json`, `integrations.json`, `cookbook_state.json`),
that's a data-loss event.

`atomic_write_json` writes to a sibling tmp file, fsyncs, then `os.replace`s
into place. On POSIX `os.replace` is atomic on the same filesystem.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional


def _open_private(tmp: str):
    """Open `tmp` for writing, created owner-only (0600).

    These files hold the password DB (`auth.json`), live session tokens
    (`sessions.json`), and other secrets/state. A plain ``open("w")`` honours
    the process umask (commonly 022 → world-readable 0644), so on a multi-user
    host any local user could read a session token and impersonate a logged-in
    user. ``os.open`` with an explicit 0600 mode closes that window; ``os.replace``
    below preserves the temp file's permissions, so the destination ends up
    owner-only even if it previously existed world-readable.
    """
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    return os.fdopen(fd, "w", encoding="utf-8")


def atomic_write_json(path: str, data: Any, *, indent: Optional[int] = None, ensure_ascii: bool = True) -> None:
    """Atomically persist `data` as JSON at `path` (owner-only perms).

    The temp file uses the live PID as a suffix so two processes saving the
    same file (e.g. unit tests) don't collide on the rename target.
    ``ensure_ascii`` is forwarded to :func:`json.dump` (default True, matching
    ``json``); pass False to keep non-ASCII text readable on disk — the file
    still round-trips identically via ``json.load``.
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    with _open_private(tmp) as f:
        json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def atomic_write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    with _open_private(tmp) as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def atomic_write_bytes(path: str, data: bytes) -> None:
    """Atomically persist raw ``bytes`` at ``path`` (owner-only perms).

    Same TOCTOU-closing guarantee as :func:`atomic_write_text`/`_open_private`
    but for binary secret/key files (the Fernet app key, the API-key key).
    ``open("wb")`` honours the umask (often → 0644 world-readable); a
    write-then-chmod sequence leaves a window where the key is world-readable
    and a mid-write crash yields a truncated file. Creating the temp file at
    0600 up front and ``os.replace``-ing closes both.
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

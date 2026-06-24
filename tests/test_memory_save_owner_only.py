"""Regression test: memory.json must be persisted owner-only (0600).

``MemoryManager.save`` previously did a hand-rolled tmp+replace. That was
atomic-ish but left ``memory.json`` world-readable (umask 0644) and un-fsync'd,
and memory entries hold sensitive user text. The fix delegates to
``core.atomic_io.atomic_write_json`` (0600 temp fd + fsync + os.replace),
matching the secret/state-file hardening. This test pins the perms so the
world-readable write can't silently return.
"""
import os

from src.memory import MemoryManager


def test_save_writes_memory_file_owner_only(tmp_path):
    mgr = MemoryManager(str(tmp_path))
    mgr.save([{"id": "x", "text": "secret fact", "timestamp": 0, "source": "user", "category": "fact"}])

    mem_path = os.path.join(str(tmp_path), "memory.json")
    assert os.path.exists(mem_path)
    assert (os.stat(mem_path).st_mode & 0o777) == 0o600
    # No tmp leftover from the atomic write.
    assert not list(p for p in os.scandir(str(tmp_path)) if p.name.endswith(".tmp." + str(os.getpid())))


def test_save_round_trips_non_ascii(tmp_path):
    # ensure_ascii=False is forwarded so non-ASCII memory text stays readable
    # on disk (round-trips identically on load).
    mgr = MemoryManager(str(tmp_path))
    entries = [{"id": "x", "text": "café — naïve", "timestamp": 0, "source": "user", "category": "fact"}]
    mgr.save(entries)

    loaded = mgr.load_all()
    assert loaded[0]["text"] == "café — naïve"
"""Regression test for finding M9: memory.json read-modify-write race.

``MemoryManager.increment_uses`` / ``claim_ownerless`` do load_all -> mutate ->
save with no locking. Concurrent web/agent/MCP writers each loaded the same
snapshot and clobbered one another's update (lost-update race). The fix wraps
those critical sections in an exclusive advisory file lock (``fcntl.flock`` on a
sidecar ``memory.json.lock``) so the updates serialize.

These tests run many threads concurrently and assert that every increment is
counted (no lost update). To make the race deterministic we widen the
load->save window with a sleep *inside* the locked section; without the lock the
final count would fall short of the expected total, with the lock it is exact.
"""
import threading
import time

import pytest

from src.memory import MemoryManager, _file_lock


class _SlowSaveManager(MemoryManager):
    """Widen the read-modify-write window so an unserialized race would lose bumps."""

    def save(self, entries):
        # The sleep sits inside increment_uses's locked region; it would expose a
        # lost-update race if the lock were absent, and proves serialization when present.
        time.sleep(0.01)
        return super().save(entries)


def test_concurrent_increment_uses_loses_no_updates(tmp_path):
    mgr = _SlowSaveManager(str(tmp_path))
    mem_id = "mem-1"
    mgr.save([{"id": mem_id, "text": "fact", "timestamp": 0,
               "source": "user", "category": "fact", "uses": 0}])

    threads_count = 8
    bumps_per_thread = 5
    barrier = threading.Barrier(threads_count)

    def worker():
        barrier.wait()  # release all threads at once to maximize interleaving
        for _ in range(bumps_per_thread):
            mgr.increment_uses([mem_id])

    threads = [threading.Thread(target=worker) for _ in range(threads_count)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    final = mgr.load_all()
    assert len(final) == 1
    # Every single bump must be reflected — no lost updates.
    assert final[0]["uses"] == threads_count * bumps_per_thread


def test_file_lock_acquires_and_releases(tmp_path):
    # The lock must be re-acquirable after release (no stuck/leaked lock), and a
    # second independent waiter must observe ordering rather than racing in.
    lock_path = str(tmp_path / "memory.json.lock")

    order = []
    entered_first = threading.Event()
    release_first = threading.Event()

    def first():
        with _file_lock(lock_path):
            order.append("first-enter")
            entered_first.set()
            release_first.wait(timeout=2)
            order.append("first-exit")

    def second():
        entered_first.wait(timeout=2)
        with _file_lock(lock_path):
            order.append("second-enter")

    t1 = threading.Thread(target=first)
    t2 = threading.Thread(target=second)
    t1.start()
    entered_first.wait(timeout=2)
    t2.start()
    # Give the second thread a moment to block on the held lock.
    time.sleep(0.05)
    assert "second-enter" not in order  # blocked while first holds the lock
    release_first.set()
    t1.join(timeout=2)
    t2.join(timeout=2)

    assert order == ["first-enter", "first-exit", "second-enter"]

    # And the lock is reusable once everyone released it.
    with _file_lock(lock_path):
        pass


def test_increment_uses_noop_when_no_ids(tmp_path):
    # Single-writer/empty path is unaffected by the locking.
    mgr = MemoryManager(str(tmp_path))
    mgr.save([{"id": "a", "text": "x", "timestamp": 0,
               "source": "user", "category": "fact", "uses": 3}])
    mgr.increment_uses([])
    assert mgr.load_all()[0]["uses"] == 3

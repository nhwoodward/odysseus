"""Regression (finding M12): the Cookbook tmux runner/wrapper scripts that embed
the Hugging Face token (``export HF_TOKEN='...'``) must be written owner-only,
never world-readable.

``routes/cookbook_routes.py`` previously wrote ``TMUX_LOG_DIR/<session>_run.sh``
(and the local download wrapper ``<session>.sh``) via ``Path.write_text`` — which
honours the process umask (commonly 0o022 -> world-readable 0o644) — and then
``safe_chmod(..., 0o755)``. On a multi-user host any local user could read the HF
token out of ``/tmp`` between/after those steps. The fix writes the script with
``core.atomic_io.atomic_write_text`` (creates the file 0o600 up front, closing the
TOCTOU window) and ``chmod 0o700`` (owner-only execute, NOT 0o755).

Two layers here:
  1. Behavioural: the exact helpers the route now uses really do yield an
     owner-only file even under a world-readable umask.
  2. Source guard: the route keeps using that hardened pattern and never
     regresses back to a world-readable 0o755 secret script.

POSIX-only for the mode assertions: ``safe_chmod`` is a documented no-op on
Windows (user-profile files are ACL-restricted), so those are skipped there.
"""
import os
import stat
import sys

import pytest

from core.atomic_io import atomic_write_text
from core.platform_compat import safe_chmod

_WINDOWS = sys.platform.startswith("win")

# A runner body shaped like the real one — the secret line is what must not leak.
_RUNNER_BODY = "\n".join([
    "#!/bin/bash",
    "export HF_TOKEN='hf_super_secret_value'",
    "export CUDA_VISIBLE_DEVICES='0'",
    "vllm serve some/model",
]) + "\n"


def _mode(path) -> int:
    return stat.S_IMODE(os.stat(path).st_mode)


@pytest.mark.skipif(_WINDOWS, reason="POSIX permission bits only")
def test_runner_script_written_owner_only(tmp_path):
    """Replicates the hardened write sequence and asserts the script is 0o700."""
    runner_path = tmp_path / "cookbook-deadbeef_run.sh"
    old_umask = os.umask(0o022)  # simulate a typical (world-readable) multi-user host
    try:
        atomic_write_text(str(runner_path), _RUNNER_BODY)
        # atomic_write_text must create it owner-only up front (0o600), regardless
        # of the umask — this closes the window before the chmod even runs.
        assert _mode(runner_path) & 0o077 == 0, (
            f"secret runner is group/other-accessible before chmod: {oct(_mode(runner_path))}"
        )
        # The route then chmods to 0o700 (owner execute only), NOT 0o755.
        safe_chmod(runner_path, 0o700)
    finally:
        os.umask(old_umask)

    assert _mode(runner_path) == 0o700, f"expected 0o700, got {oct(_mode(runner_path))}"
    # The core property the finding cares about: no group/other read (or any) bit.
    assert _mode(runner_path) & stat.S_IRGRP == 0
    assert _mode(runner_path) & stat.S_IROTH == 0
    # Content still round-trips (functional behaviour preserved).
    assert runner_path.read_text() == _RUNNER_BODY


@pytest.mark.skipif(_WINDOWS, reason="POSIX permission bits only")
def test_plain_write_text_would_have_leaked(tmp_path):
    """Documents the vulnerability the fix closes: the old ``write_text`` path
    produces a world-readable file under the same umask."""
    leaky = tmp_path / "old_run.sh"
    old_umask = os.umask(0o022)
    try:
        leaky.write_text(_RUNNER_BODY, encoding="utf-8")
    finally:
        os.umask(old_umask)
    # This is exactly the pre-fix state: other-readable. (Asserting it proves the
    # umask in this test environment actually exercises the world-readable case.)
    assert _mode(leaky) & stat.S_IROTH != 0


def _route_source() -> str:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(repo_root, "routes", "cookbook_routes.py")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def test_route_does_not_regress_to_world_readable_runner():
    """Source guard: the secret-bearing runner/wrapper writes stay hardened."""
    src = _route_source()
    # No world-readable secret script anywhere.
    assert "safe_chmod(runner_path, 0o755)" not in src, (
        "runner script chmod regressed to world-readable 0o755"
    )
    assert "wrapper_script.chmod(0o755)" not in src, (
        "download wrapper chmod regressed to world-readable 0o755"
    )
    # The hardened pattern is present for both the serve/download runner and the
    # local download wrapper.
    assert "atomic_write_text(str(runner_path)" in src
    assert "safe_chmod(runner_path, 0o700)" in src
    assert "atomic_write_text(str(wrapper_script)" in src
    assert "wrapper_script.chmod(0o700)" in src

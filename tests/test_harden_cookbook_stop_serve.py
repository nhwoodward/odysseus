"""Regression test for the cookbook stop-serve command-injection fix.

The serve-stop action used to be a shell string built in the browser and POSTed
to /api/shell/exec. It is now a typed backend route whose only injectable field,
session_id, is validated against _SERVE_SESSION_RE before any tmux/ssh action.
This locks that validation contract so it can't silently loosen.
"""
import pytest

cookbook_routes = pytest.importorskip("routes.cookbook_routes")
_RE = cookbook_routes._SERVE_SESSION_RE


@pytest.mark.parametrize("sid", [
    "serve-deadbeef",
    "serve-DEADbeef00",
    "cookbook-abc123",
    "serve-0a1b2c3d",
])
def test_valid_session_ids_accepted(sid):
    assert _RE.match(sid), f"legit id rejected: {sid!r}"


@pytest.mark.parametrize("sid", [
    "serve-a; rm -rf /",          # command chaining
    "serve-a && reboot",
    "serve-$(whoami)",            # command substitution
    "serve-a`id`",
    "serve-a'b",                  # quote break-out (remote ssh path)
    "serve-a\nrm -rf /",          # newline injection
    "serve-a b",                  # whitespace
    "serve-a/../etc",             # traversal
    "evil-deadbeef",              # wrong prefix
    "serve-",                     # empty body
    "",                           # empty
    "serve-" + "a" * 200,         # over-long
])
def test_injection_and_malformed_ids_rejected(sid):
    assert not _RE.match(sid), f"dangerous id accepted: {sid!r}"

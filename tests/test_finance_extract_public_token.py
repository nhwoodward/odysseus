"""Regression tests for routes.finance_routes._extract_public_token.

The production /link/token/get response returns `link_token` as a STRING and the
completed public_token under link_sessions[].results.item_add_results[]. A prior
version called `.get()` on the string link_token, raising AttributeError and
500'ing /exchange on every poll (so the account was authenticated but never
stored). These pin the real response shapes."""
from routes.finance_routes import _extract_public_token


def test_hosted_link_response_link_token_is_string():
    # Real /link/token/get shape: link_token is a STRING; result under link_sessions.
    session = {
        "link_token": "link-production-abc123",
        "link_sessions": [
            {
                "link_session_id": "ls_1",
                "results": {
                    "item_add_results": [
                        {"public_token": "public-production-xyz", "accounts": [{"id": "a1"}]}
                    ]
                },
            }
        ],
    }
    assert _extract_public_token(session) == "public-production-xyz"


def test_does_not_crash_on_string_link_token():
    # Regression: a string link_token must not raise AttributeError (it returns None).
    assert _extract_public_token({"link_token": "link-production-only"}) is None


def test_deprecated_on_success_fallback():
    session = {
        "link_token": "link-production-abc",
        "link_sessions": [{"on_success": {"public_token": "public-prod-onsuccess"}}],
    }
    assert _extract_public_token(session) == "public-prod-onsuccess"


def test_legacy_top_level_results():
    session = {
        "link_token": "link-sandbox-1",
        "results": {"item_add_results": [{"public_token": "public-legacy"}]},
    }
    assert _extract_public_token(session) == "public-legacy"


def test_in_progress_session_returns_none():
    # No public_token yet (user hasn't finished) -> None so the frontend keeps polling.
    session = {
        "link_token": "link-production-pending",
        "link_sessions": [{"results": {"item_add_results": []}}],
    }
    assert _extract_public_token(session) is None


def test_recursive_fallback_finds_token_in_unexpected_shape():
    # Safety net: an unforeseen nesting still yields the token via the scan.
    session = {"link_token": "link-x", "weird": {"nested": [{"public_token": "public-deep"}]}}
    assert _extract_public_token(session) == "public-deep"

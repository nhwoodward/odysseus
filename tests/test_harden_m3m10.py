"""Regression tests for finding M3M10 in routes/email_pollers.py.

M3: email prompt-injection -> calendar mutation. An untrusted inbound email
    must not be able to drive DESTRUCTIVE calendar ops (cancel/update of
    existing events). Only create/noop survive from untrusted senders.

M10: scheduled-send recipient lists must be parsed with email.utils.getaddresses
     so an RFC-5322 quoted display name containing a comma stays one recipient.
"""

import email.utils

from routes.email_pollers import _filter_email_calendar_ops


# ── M3: destructive calendar ops from untrusted senders are dropped ──────────

def test_untrusted_email_destructive_ops_dropped():
    ops = [
        {"action": "create", "title": "Lunch", "date": "2026-07-01T12:00:00"},
        {"action": "cancel", "uid": "victim-event-1"},
        {"action": "update", "uid": "victim-event-2", "date": "2026-07-02T09:00:00"},
        {"action": "delete_event", "uid": "victim-event-3"},
        {"action": "update_event", "uid": "victim-event-4"},
        {"action": "noop"},
    ]
    kept, dropped = _filter_email_calendar_ops(ops, trusted=False)

    kept_actions = {o["action"] for o in kept}
    dropped_actions = {o["action"] for o in dropped}

    # Only create/noop survive when the sender is untrusted.
    assert kept_actions == {"create", "noop"}
    # Every destructive flavour is blocked, including the raw tool-action names.
    assert dropped_actions == {"cancel", "update", "delete_event", "update_event"}
    # No destructive op leaks through to the mutating calendar call.
    assert all(o["action"] not in {"cancel", "update", "delete_event", "update_event"} for o in kept)


def test_trusted_email_destructive_ops_preserved():
    ops = [
        {"action": "create", "title": "Lunch", "date": "2026-07-01T12:00:00"},
        {"action": "cancel", "uid": "my-event-1"},
        {"action": "update", "uid": "my-event-2", "date": "2026-07-02T09:00:00"},
    ]
    kept, dropped = _filter_email_calendar_ops(ops, trusted=True)

    # Trusted mail (user-composed / sent from own address) keeps everything.
    assert dropped == []
    assert [o["action"] for o in kept] == ["create", "cancel", "update"]


def test_filter_handles_garbage_and_empty():
    # Non-dict / empty inputs must not raise and must not be treated as ops.
    kept, dropped = _filter_email_calendar_ops([None, "bad", {}, {"action": "CANCEL"}], trusted=False)
    # Upper-case action is normalised and dropped; junk falls through harmlessly.
    assert {"action": "CANCEL"} in dropped
    assert _filter_email_calendar_ops(None, trusted=False) == ([], [])


# ── M10: quoted-comma display name parses to a single recipient ──────────────

def test_getaddresses_quoted_comma_is_one_recipient():
    to_field = '"Smith, John" <john@x.com>, jane@y.com'
    # Naive str.split(',') would yield 3 fragments and corrupt the envelope.
    assert len(to_field.split(",")) == 3

    parsed = email.utils.getaddresses([to_field])
    addrs = [addr for _name, addr in parsed if addr]

    assert addrs == ["john@x.com", "jane@y.com"]


def test_getaddresses_matches_pollers_recipient_build():
    # Mirrors the To/Cc/Bcc construction in _scheduled_poll_once.
    to_f = '"Doe, Jane" <jane@x.com>'
    cc_f = "team@y.com, ops@z.com"
    bcc_f = ""
    recipients = [
        addr
        for _name, addr in email.utils.getaddresses([to_f or "", cc_f or "", bcc_f or ""])
        if addr
    ]
    assert recipients == ["jane@x.com", "team@y.com", "ops@z.com"]

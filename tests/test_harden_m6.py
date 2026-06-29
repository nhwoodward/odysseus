"""Regression coverage for finding M6: IMAP CRLF command injection.

User-controlled folder names, free-text search queries, and Message-ID values
are interpolated into IMAP command strings in mcp_servers/email_server.py. The
pre-fix quoting only escaped backslash and double-quote, so a value containing
CR/LF (\\r\\n) could smuggle an extra IMAP command onto the wire. The fix routes
every such value through `_imap_safe`, which drops CR/LF and other C0 control
characters before quoting. These tests assert no newline ever reaches the IMAP
command string while legitimate names/queries are preserved.
"""

import pytest

pytest.importorskip("mcp")

import mcp_servers.email_server as es


class CaptureConn:
    """Minimal IMAP stand-in that records the strings handed to SELECT/SEARCH."""

    def __init__(self):
        self.selects = []
        self.searches = []

    def select(self, folder, readonly=False):
        self.selects.append(folder)
        return "OK", []

    def uid(self, command, *args):
        if command == "SEARCH":
            self.searches.append(args[-1])
        return "OK", [b""]

    def logout(self):
        pass


def _assert_no_crlf(value):
    assert "\r" not in value and "\n" not in value, repr(value)


def test_imap_safe_strips_control_chars():
    assert es._imap_safe("a\r\nb") == "ab"
    assert es._imap_safe("a\tb\x00c\x7fd") == "abcd"
    # Legitimate text is untouched.
    assert es._imap_safe("normal text") == "normal text"
    assert es._imap_safe(None) == ""


def test_q_strips_crlf_but_keeps_legit_names():
    out = es._q("INBOX\r\nA1 DELETE everything")
    _assert_no_crlf(out)
    # Spaced / provider mailbox names still quoted as before.
    assert es._q("Sent Items") == '"Sent Items"'
    assert es._q("[Gmail]/All Mail") == '"[Gmail]/All Mail"'


def test_search_query_with_crlf_does_not_inject(monkeypatch):
    conn = CaptureConn()
    monkeypatch.setattr(es, "_imap_connect", lambda account=None: conn)
    monkeypatch.setattr(es, "_get_cached_summaries", lambda: {})

    es._search_emails('hi"\r\nA001 DELETE INBOX', folders=["INBOX"])

    assert conn.searches, "expected a SEARCH command to be issued"
    for cmd in conn.searches:
        _assert_no_crlf(cmd)
    for folder in conn.selects:
        _assert_no_crlf(folder)


def test_read_email_message_id_with_crlf_does_not_inject(monkeypatch):
    conn = CaptureConn()
    monkeypatch.setattr(es, "_imap_connect", lambda account=None: conn)
    monkeypatch.setattr(es, "_load_config", lambda account=None: {})

    es._read_email(message_id='x>\r\nA1 LOGOUT', folder="INBOX")

    assert conn.searches, "expected a Message-ID SEARCH to be issued"
    for cmd in conn.searches:
        _assert_no_crlf(cmd)
    for folder in conn.selects:
        _assert_no_crlf(folder)

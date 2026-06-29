"""Regression test for finding M4: /api/export must not leak plaintext secrets.

The export redactor masks credential-bearing setting values (API keys, IMAP/SMTP
passwords, OAuth client-secrets/tokens, including nested email-account and OAuth
structures) while leaving legitimate non-secret config (numeric budgets, boolean
has_* flags, URLs/paths) untouched.
"""

from routes.backup_routes import (
    _EXPORT_REDACTION_PLACEHOLDER,
    _redact_secrets,
    _is_secret_key,
)

PLACEHOLDER = _EXPORT_REDACTION_PLACEHOLDER

# A settings blob shaped like the real one, carrying every documented secret.
_SETTINGS = {
    "brave_api_key": "brv-REAL-SECRET-1",
    "google_pse_key": "pse-REAL-SECRET-2",
    "tavily_api_key": "tvly-REAL-SECRET-3",
    "serper_api_key": "srp-REAL-SECRET-4",
    "plaid_secret": "plaid-REAL-SECRET-5",
    "carddav_password": "carddav-REAL-SECRET-6",
    # nested email accounts
    "email_accounts": [
        {
            "name": "work",
            "imap_host": "imap.example.com",
            "imap_password": "imap-REAL-SECRET-7",
            "smtp_password": "smtp-REAL-SECRET-8",
            "has_imap_password": True,   # boolean flag — keep
        }
    ],
    # nested oauth structure
    "oauth": {
        "client_id": "public-client-id",
        "client_secret": "oauth-REAL-SECRET-9",
        "access_token": "at-REAL-SECRET-10",
        "refresh_token": "rt-REAL-SECRET-11",
        "token_uri": "https://oauth2.googleapis.com/token",
    },
    # legitimate non-secret config that happens to contain "token"
    "max_tokens": 4096,
    "agent_input_token_budget": 120000,
    "tokens_per_second": 37.5,
    "has_password": False,
    "model": "gpt-4",
    "empty_secret": "",
}

# Every real secret value that must NOT survive serialization.
_REAL_SECRETS = [
    "brv-REAL-SECRET-1",
    "pse-REAL-SECRET-2",
    "tvly-REAL-SECRET-3",
    "srp-REAL-SECRET-4",
    "plaid-REAL-SECRET-5",
    "carddav-REAL-SECRET-6",
    "imap-REAL-SECRET-7",
    "smtp-REAL-SECRET-8",
    "oauth-REAL-SECRET-9",
    "at-REAL-SECRET-10",
    "rt-REAL-SECRET-11",
]


def test_redacted_export_contains_no_real_secrets():
    import json

    redacted = _redact_secrets(_SETTINGS)
    blob = json.dumps(redacted)
    for secret in _REAL_SECRETS:
        assert secret not in blob, f"plaintext secret leaked into export: {secret}"


def test_secret_keys_become_placeholder():
    redacted = _redact_secrets(_SETTINGS)
    assert redacted["brave_api_key"] == PLACEHOLDER
    assert redacted["google_pse_key"] == PLACEHOLDER
    assert redacted["tavily_api_key"] == PLACEHOLDER
    assert redacted["serper_api_key"] == PLACEHOLDER
    assert redacted["plaid_secret"] == PLACEHOLDER
    assert redacted["carddav_password"] == PLACEHOLDER
    # nested email-account secrets
    acct = redacted["email_accounts"][0]
    assert acct["imap_password"] == PLACEHOLDER
    assert acct["smtp_password"] == PLACEHOLDER
    # nested oauth secrets
    oauth = redacted["oauth"]
    assert oauth["client_secret"] == PLACEHOLDER
    assert oauth["access_token"] == PLACEHOLDER
    assert oauth["refresh_token"] == PLACEHOLDER


def test_non_secret_config_preserved():
    redacted = _redact_secrets(_SETTINGS)
    # numeric budgets / rates must be untouched (would corrupt a restore)
    assert redacted["max_tokens"] == 4096
    assert redacted["agent_input_token_budget"] == 120000
    assert redacted["tokens_per_second"] == 37.5
    # boolean has_* flags are not secrets
    assert redacted["has_password"] is False
    assert redacted["email_accounts"][0]["has_imap_password"] is True
    # plain identifiers / non-secret values survive
    assert redacted["model"] == "gpt-4"
    assert redacted["email_accounts"][0]["name"] == "work"
    assert redacted["email_accounts"][0]["imap_host"] == "imap.example.com"
    assert redacted["oauth"]["client_id"] == "public-client-id"  # no "secret"/"token"
    # empty secret stays empty (not masked into a fake value)
    assert redacted["empty_secret"] == ""


def test_token_named_string_is_conservatively_masked():
    # token_uri is a public OAuth endpoint (not a secret) but its key matches the
    # "token" pattern; the redactor errs safe and masks string values, which is
    # acceptable for an export. Numeric/boolean token-named config stays intact
    # (covered by test_non_secret_config_preserved).
    redacted = _redact_secrets(_SETTINGS)
    assert redacted["oauth"]["token_uri"] == PLACEHOLDER


def test_input_not_mutated():
    before = _SETTINGS["brave_api_key"]
    _redact_secrets(_SETTINGS)
    assert _SETTINGS["brave_api_key"] == before  # original untouched


def test_is_secret_key_classifier():
    assert _is_secret_key("brave_api_key")
    assert _is_secret_key("google_pse_key")      # explicit set
    assert _is_secret_key("client_secret")
    assert _is_secret_key("refresh_token")
    # "max_tokens" matches the regex (contains "token"); its int VALUE is what
    # protects it from masking via the string-only guard in _redact_secrets,
    # not this name classifier.
    assert _is_secret_key("max_tokens")
    assert not _is_secret_key("model")
    assert not _is_secret_key(None)

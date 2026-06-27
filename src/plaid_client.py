"""Thin Plaid REST client (httpx) for the personal-finance feature.

No SDK dependency — Plaid is plain JSON POST with ``client_id``/``secret`` (and
for data calls, the user's ``access_token``) in the request body. Configured by
env so it starts in Sandbox and moves to Production by changing PLAID_ENV:

    PLAID_CLIENT_ID=...    PLAID_SECRET=...    PLAID_ENV=sandbox

Only READ-ONLY products are used (transactions / balances / liabilities /
investments) plus Link token create/exchange. Access tokens are NEVER logged.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

_ENV_BASES = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def _cfg() -> tuple[str, str, str]:
    return (
        os.getenv("PLAID_CLIENT_ID", "").strip(),
        os.getenv("PLAID_SECRET", "").strip(),
        os.getenv("PLAID_ENV", "sandbox").strip().lower(),
    )


def is_configured() -> bool:
    """True when PLAID_CLIENT_ID and PLAID_SECRET are both set."""
    cid, secret, _ = _cfg()
    return bool(cid and secret)


def plaid_env() -> str:
    return _cfg()[2] or "sandbox"


def base_url() -> str:
    return _ENV_BASES.get(plaid_env(), _ENV_BASES["sandbox"])


class PlaidError(Exception):
    """A Plaid API error (network, config, or Plaid error envelope)."""

    def __init__(self, message: str, code: Optional[str] = None, status: Optional[int] = None, payload: Optional[dict] = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.payload = payload or {}


async def call(path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """POST ``path`` (e.g. "/accounts/balance/get") with client creds injected.

    Raises PlaidError on a missing config, transport failure, or a Plaid error
    envelope (``error_code``/``error_message``). The caller passes only the
    request-specific fields (e.g. ``{"access_token": tok}``)."""
    cid, secret, _ = _cfg()
    if not (cid and secret):
        raise PlaidError("Plaid is not configured — set PLAID_CLIENT_ID and PLAID_SECRET.", code="not_configured")

    body: Dict[str, Any] = {"client_id": cid, "secret": secret, **(payload or {})}
    url = base_url() + path
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=body)
    except httpx.HTTPError as e:
        raise PlaidError(f"Plaid request to {path} failed: {e}", code="transport_error") from e

    try:
        data = r.json()
    except ValueError:
        raise PlaidError(f"Plaid {path} returned {r.status_code} (non-JSON body)", code="bad_response", status=r.status_code)

    # Plaid signals errors with an error envelope AND a 4xx/5xx status.
    err_code = data.get("error_code")
    if r.status_code >= 400 or err_code:
        # Log the code/type only — never the message body or tokens.
        logger.warning("Plaid %s error: %s (%s) status=%s", path, err_code, data.get("error_type"), r.status_code)
        raise PlaidError(
            data.get("error_message") or f"Plaid {path} failed ({r.status_code})",
            code=err_code,
            status=r.status_code,
            payload={k: data.get(k) for k in ("error_type", "error_code", "request_id")},
        )
    return data

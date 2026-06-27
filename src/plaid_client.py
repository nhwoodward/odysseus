"""Thin Plaid REST client (httpx) for the personal-finance feature.

No SDK dependency — Plaid is plain JSON POST with ``client_id``/``secret`` (and
for data calls, the user's ``access_token``) in the request body. Configured via
the admin Finance setup UI (stored encrypted in settings) **or** env vars; UI
settings win so the keys take effect with no restart. Starts in Sandbox and
moves to Production via ``plaid_env`` / PLAID_ENV:

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
    """Return (client_id, secret, env).

    UI-entered admin settings take precedence over env vars so the operator can
    configure Plaid in the app with no restart; env (image / docker-compose) is
    the fallback. The secret lives Fernet-encrypted in settings (``plaid_secret``).
    """
    cid = secret = env = ""
    try:
        from src.settings import get_setting

        cid = (get_setting("plaid_client_id", "") or "").strip()
        env = (get_setting("plaid_env", "") or "").strip().lower()
        enc = get_setting("plaid_secret", "") or ""
        if enc:
            from src.secret_storage import decrypt

            secret = (decrypt(enc) or "").strip()
    except Exception:  # settings store unavailable — fall back to env
        logger.debug("Plaid settings lookup failed; using env", exc_info=True)

    cid = cid or os.getenv("PLAID_CLIENT_ID", "").strip()
    secret = secret or os.getenv("PLAID_SECRET", "").strip()
    env = env or os.getenv("PLAID_ENV", "sandbox").strip().lower()
    return cid, secret, env


def config_summary() -> Dict[str, Any]:
    """Admin-facing config snapshot for the setup UI. NEVER includes the secret
    value itself — only whether one is set, and where the config came from."""
    cid, secret, env = _cfg()
    settings_cid = ""
    try:
        from src.settings import get_setting

        settings_cid = (get_setting("plaid_client_id", "") or "").strip()
    except Exception:
        settings_cid = ""
    return {
        "configured": bool(cid and secret),
        "env": env or "sandbox",
        "client_id": cid,
        "has_secret": bool(secret),
        "source": "settings" if settings_cid else ("env" if cid else "none"),
    }


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

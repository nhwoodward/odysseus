"""Personal-finance API — connect bank/brokerage accounts via Plaid and pull
read-only financial data (balances, transactions, recurring, investments).

Design (see plan): Plaid **Hosted Link** (a Plaid-hosted page opened in a popup,
mirroring the connectors' OAuth popup) so the restrictive CSP stays intact — no
embedded cdn.plaid.com script. Everything is **owner-scoped** (a user only ever
touches their own Items) and **read-only** (no Transfer/Payment products). The
Plaid ``access_token`` is Fernet-encrypted at rest (PlaidItem.access_token).

Connect flow:
  1. POST /api/finance/link-token  -> /link/token/create (hosted_link) -> returns
     {hosted_link_url, link_token}. Frontend opens the URL in a popup.
  2. POST /api/finance/exchange {link_token} (polled after the popup) ->
     /link/token/get to read the public_token, then /item/public_token/exchange
     -> store an encrypted PlaidItem (owner, item_id, institution).
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Form, HTTPException, Request

from core.database import PlaidItem, SessionLocal
from core.middleware import require_admin
from src.auth_helpers import require_user
from src import plaid_client as plaid
from src import finance_service
from src import secret_storage
from src.settings import load_settings, save_settings

logger = logging.getLogger(__name__)

# Read-only products we request at Link time (balances come implicitly). Only
# `transactions` is REQUIRED — Plaid filters out any institution that doesn't
# support every product in `products`, which blocks banks with no brokerage
# (USAA sold its investments to Schwab in 2020; Amex; most checking accounts)
# with "connectivity not supported". `investments`/`liabilities` go in
# `required_if_supported_products` so they're pulled + billed only when the
# institution supports them, and non-supporting institutions still link.
_PRODUCTS = ["transactions"]
_OPTIONAL_PRODUCTS = ["investments", "liabilities"]
_COUNTRY_CODES = ["US"]


def _items(db, owner: str, *, active_only: bool = True) -> List[PlaidItem]:
    q = db.query(PlaidItem).filter(PlaidItem.owner == owner)
    if active_only:
        q = q.filter((PlaidItem.status == "active") | (PlaidItem.status.is_(None)))
    return q.all()


def _item_public(it: PlaidItem) -> Dict[str, Any]:
    """Item metadata safe to return to the client (NO access_token)."""
    try:
        accounts = json.loads(it.accounts) if it.accounts else []
    except (ValueError, TypeError):
        accounts = []
    return {
        "id": it.id,
        "item_id": it.item_id,
        "institution_name": it.institution_name,
        "institution_id": it.institution_id,
        "status": it.status or "active",
        "error": it.error,
        "accounts": accounts,
    }


def setup_finance_routes() -> APIRouter:
    router = APIRouter(prefix="/api/finance", tags=["finance"])

    @router.get("/status")
    async def status(request: Request):
        """Whether Plaid is configured + how many institutions this user linked."""
        owner = require_user(request)
        db = SessionLocal()
        try:
            count = len(_items(db, owner))
        finally:
            db.close()
        return {"configured": plaid.is_configured(), "env": plaid.plaid_env(), "item_count": count}

    @router.get("/config")
    async def get_config(request: Request):
        """Admin-only: the Plaid setup snapshot for the in-UI onboarding card.

        Returns whether keys are set, the env, the client_id, and where the
        config came from (settings vs env). NEVER returns the secret value."""
        require_admin(request)
        return plaid.config_summary()

    @router.put("/config")
    async def put_config(
        request: Request,
        client_id: str = Form(...),
        env: str = Form("sandbox"),
        secret: str = Form(""),
    ):
        """Admin-only: store operator Plaid keys (encrypted) so the dashboard +
        the manage_finance tool go live with no restart. The secret is only
        rewritten when a new one is supplied, so env/client_id can change
        without re-entering it."""
        require_admin(request)
        env = (env or "sandbox").strip().lower()
        if env not in ("sandbox", "development", "production"):
            raise HTTPException(400, "env must be sandbox, development, or production.")
        settings = load_settings()
        settings["plaid_client_id"] = client_id.strip()
        settings["plaid_env"] = env
        if secret.strip():
            settings["plaid_secret"] = secret_storage.encrypt(secret.strip())
        save_settings(settings)
        return plaid.config_summary()

    @router.get("/items")
    async def list_items(request: Request):
        owner = require_user(request)
        db = SessionLocal()
        try:
            return {"items": [_item_public(it) for it in _items(db, owner)]}
        finally:
            db.close()

    @router.post("/link-token")
    async def create_link_token(request: Request):
        """Create a Hosted Link token; returns the Plaid-hosted URL to open."""
        owner = require_user(request)
        if not plaid.is_configured():
            raise HTTPException(503, "Plaid is not configured. Set PLAID_CLIENT_ID / PLAID_SECRET.")
        # Bring the popup back to the app on completion; the frontend also polls.
        origin = str(request.base_url).rstrip("/")
        payload = {
            "user": {"client_user_id": owner or "local"},
            "client_name": "Odysseus",
            "products": _PRODUCTS,
            "required_if_supported_products": _OPTIONAL_PRODUCTS,
            "country_codes": _COUNTRY_CODES,
            "language": "en",
            "hosted_link": {"completion_redirect_uri": f"{origin}/v2/finance"},
        }
        try:
            data = await plaid.call("/link/token/create", payload)
        except plaid.PlaidError as e:
            raise HTTPException(502, f"Couldn't start Plaid Link: {e}")
        return {
            "link_token": data.get("link_token"),
            "hosted_link_url": data.get("hosted_link_url"),
            "expiration": data.get("expiration"),
        }

    @router.post("/exchange")
    async def exchange(request: Request, link_token: str = Form(...)):
        """Poll /link/token/get for the public_token, then exchange + store it.

        Returns {pending: true} until the user finishes the hosted session, so
        the frontend can poll. On success, stores an owner-scoped PlaidItem."""
        owner = require_user(request)
        try:
            sess = await plaid.call("/link/token/get", {"link_token": link_token})
        except plaid.PlaidError as e:
            raise HTTPException(502, f"Couldn't read the Plaid Link session: {e}")

        public_token = _extract_public_token(sess)
        if not public_token:
            return {"pending": True}

        try:
            ex = await plaid.call("/item/public_token/exchange", {"public_token": public_token})
            access_token = ex.get("access_token")
            item_id = ex.get("item_id")
            if not access_token or not item_id:
                raise plaid.PlaidError("exchange returned no access_token/item_id")
            inst_id, inst_name, accounts = await _item_metadata(access_token)
        except plaid.PlaidError as e:
            raise HTTPException(502, f"Couldn't connect the account: {e}")

        db = SessionLocal()
        try:
            existing = db.query(PlaidItem).filter(PlaidItem.owner == owner, PlaidItem.item_id == item_id).first()
            it = existing or PlaidItem(id=uuid.uuid4().hex, owner=owner, item_id=item_id)
            it.access_token = access_token
            it.institution_id = inst_id
            it.institution_name = inst_name
            it.accounts = json.dumps(accounts)
            it.status = "active"
            it.error = None
            if not existing:
                db.add(it)
            db.commit()
            return {"pending": False, "item": _item_public(it)}
        finally:
            db.close()

    @router.delete("/items/{item_pk}")
    async def remove_item(request: Request, item_pk: str):
        owner = require_user(request)
        db = SessionLocal()
        try:
            it = db.query(PlaidItem).filter(PlaidItem.id == item_pk, PlaidItem.owner == owner).first()
            if not it:
                raise HTTPException(404, "Not found")
            token = it.access_token
            db.delete(it)
            db.commit()
        finally:
            db.close()
        # Best-effort: tell Plaid to invalidate the Item too.
        try:
            await plaid.call("/item/remove", {"access_token": token})
        except plaid.PlaidError as e:
            logger.warning("Plaid /item/remove failed (row already deleted): %s", e.code)
        return {"removed": True}

    # ── Read-only financial data (owner-scoped, aggregated across the user's
    #    connected Items). Each tolerates a per-item Plaid error (e.g. a product
    #    not ready yet) and reports it without failing the whole response. ──
    @router.get("/accounts")
    async def accounts(request: Request):
        return await finance_service.balances(require_user(request))

    @router.get("/transactions")
    async def transactions(request: Request, days: int = 90):
        return await finance_service.transactions(require_user(request), days)

    @router.get("/recurring")
    async def recurring(request: Request):
        return await finance_service.recurring(require_user(request))

    @router.get("/investments")
    async def investments(request: Request):
        return await finance_service.investments(require_user(request))

    @router.get("/summary")
    async def summary(request: Request):
        return await finance_service.summary(require_user(request))

    @router.get("/cashflow")
    async def cashflow(request: Request):
        return await finance_service.cashflow(require_user(request))

    @router.get("/networth")
    async def networth(request: Request):
        # Net-worth trend (Phase 1) — reads the accumulated daily snapshots.
        return finance_service.net_worth_history(require_user(request))

    return router


def _extract_public_token(session: Dict[str, Any]) -> Optional[str]:
    """Pull the public_token out of a /link/token/get response.

    For Hosted Link the completed result lives at
    ``link_sessions[].results.item_add_results[].public_token``. IMPORTANT: the
    top-level ``link_token`` in this response is a STRING (the token itself), not
    an object — older code that did ``session.get("link_token").get(...)`` raised
    AttributeError and 500'd the exchange on every poll, so the token was never
    stored. We read the documented spots (each level guarded) and fall back to a
    recursive scan so a future shape change can't silently break the exchange."""
    def _from_results(results: Any) -> Optional[str]:
        if not isinstance(results, dict):
            return None
        for add in (results.get("item_add_results") or []):
            if isinstance(add, dict) and isinstance(add.get("public_token"), str):
                return add["public_token"]
        return None

    # Primary (Hosted Link): link_sessions[].results.item_add_results[].public_token
    for ls in (session.get("link_sessions") or []):
        if not isinstance(ls, dict):
            continue
        pt = _from_results(ls.get("results"))
        if pt:
            return pt
        # Deprecated but still present on some responses.
        on_success = ls.get("on_success")
        if isinstance(on_success, dict) and isinstance(on_success.get("public_token"), str):
            return on_success["public_token"]

    # Legacy top-level results shape, then a bare public_token.
    pt = _from_results(session.get("results"))
    if pt:
        return pt
    if isinstance(session.get("public_token"), str):
        return session["public_token"]

    # Last resort: recursively scan for any public_token (shape-change safety net).
    found: Optional[str] = None

    def _scan(obj: Any) -> None:
        nonlocal found
        if found:
            return
        if isinstance(obj, dict):
            if isinstance(obj.get("public_token"), str):
                found = obj["public_token"]
                return
            for v in obj.values():
                _scan(v)
        elif isinstance(obj, list):
            for v in obj:
                _scan(v)

    _scan(session)
    return found


async def _item_metadata(access_token: str):
    """Resolve institution + accounts for a freshly connected access_token."""
    inst_id = inst_name = None
    accounts: List[Dict[str, Any]] = []
    try:
        info = await plaid.call("/accounts/get", {"access_token": access_token})
        inst_id = (info.get("item") or {}).get("institution_id")
        for a in info.get("accounts") or []:
            accounts.append({
                "account_id": a.get("account_id"),
                "name": a.get("name"),
                "mask": a.get("mask"),
                "type": a.get("type"),
                "subtype": a.get("subtype"),
            })
        if inst_id:
            try:
                inst = await plaid.call("/institutions/get_by_id", {
                    "institution_id": inst_id, "country_codes": _COUNTRY_CODES,
                })
                inst_name = (inst.get("institution") or {}).get("name")
            except plaid.PlaidError:
                pass
    except plaid.PlaidError as e:
        logger.warning("Couldn't load item metadata: %s", e.code)
    return inst_id, inst_name, accounts


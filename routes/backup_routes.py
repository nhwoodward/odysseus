"""Backup routes — export/import user data (memories, presets, settings, skills, preferences)."""

import json
import logging
import re
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response
from core.middleware import require_admin
from src.auth_helpers import get_current_user
from src.settings import load_settings, save_settings, load_features, save_features

logger = logging.getLogger(__name__)

# Settings keys that an imported backup file must never be allowed to set,
# because they control the agent's filesystem reach or where the app sends
# traffic. A malicious or tampered backup could otherwise escalate file access
# or redirect the app at an attacker host. Restore these via the settings UI.
_IMPORT_BLOCKED_SETTING_KEYS = frozenset({
    "tool_path_extra_roots",   # widens read_file/write_file allowlist
    "endpoints",               # outbound endpoint overrides
    "endpoint_overrides",
    "active_endpoint",
})

# Settings (and nested email-account / OAuth fields) whose values are plaintext
# secrets. They are masked before an export leaves the box so a backup file
# never carries API keys, IMAP/SMTP passwords, or OAuth client-secrets/tokens
# off the machine. Import is intentionally unaffected.
_EXPORT_REDACTION_PLACEHOLDER = "***REDACTED***"

# Secret keys whose names don't match the regex below (e.g. google_pse_key has
# no "api_key"/"secret"/"token" substring).
_EXPORT_REDACTED_SETTING_KEYS = frozenset({
    "google_pse_key",
})

# Key-name shapes that hold credentials, matched case-insensitively against
# every dict key in the export (including nested structures).
_EXPORT_SECRET_KEY_RE = re.compile(
    r"(secret|token|password|passwd|api_key|client_secret|credential)",
    re.IGNORECASE,
)


def _is_secret_key(key) -> bool:
    """True when *key* names a credential-bearing setting."""
    return isinstance(key, str) and (
        key in _EXPORT_REDACTED_SETTING_KEYS
        or bool(_EXPORT_SECRET_KEY_RE.search(key))
    )


def _redact_secrets(obj):
    """Return a copy of *obj* with plaintext secret values masked.

    Recurses through dicts/lists. A value is replaced with the redaction
    placeholder only when its key looks like a credential AND the value is a
    non-empty string — so numeric budgets (max_tokens, ...) and boolean
    has_password-style flags stay intact, while actual API keys, passwords,
    client secrets and OAuth tokens are masked. The input is not mutated.
    """
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if _is_secret_key(k) and isinstance(v, str) and v != "":
                out[k] = _EXPORT_REDACTION_PLACEHOLDER
            else:
                out[k] = _redact_secrets(v)
        return out
    if isinstance(obj, list):
        return [_redact_secrets(item) for item in obj]
    return obj


def _contains_placeholder(v) -> bool:
    """True if `v` is, or anywhere contains, the export redaction placeholder."""
    if v == _EXPORT_REDACTION_PLACEHOLDER:
        return True
    if isinstance(v, dict):
        return any(_contains_placeholder(x) for x in v.values())
    if isinstance(v, list):
        return any(_contains_placeholder(x) for x in v)
    return False


def _merge_preserving_secrets(current: dict, incoming: dict) -> dict:
    """Deep-merge `incoming` into `current` WITHOUT overwriting a live value with
    a redaction placeholder. Exports mask secrets (`_redact_secrets`), so a
    re-imported backup carries "***REDACTED***" where real keys/passwords/tokens
    used to be; a naive ``current.update(incoming)`` would clobber the live
    secrets with that placeholder. Here: a value that is/contains the placeholder
    is recursed into when both sides are dicts (so non-secret subfields still
    restore) and otherwise skipped (the live secret is kept); clean values apply
    normally."""
    for k, v in incoming.items():
        if _contains_placeholder(v):
            if isinstance(v, dict) and isinstance(current.get(k), dict):
                _merge_preserving_secrets(current[k], v)
            # else: scalar/list holding a redacted secret — keep current's value
            continue
        current[k] = v
    return current


def setup_backup_routes(memory_manager, preset_manager, skills_manager) -> APIRouter:
    router = APIRouter(tags=["backup"])

    @router.get("/api/export")
    async def export_data(request: Request):
        """Export all user data as a downloadable JSON file."""
        require_admin(request)
        user = get_current_user(request)

        # Memories (filtered by owner when auth is enabled)
        memories = memory_manager.load(owner=user)

        # Presets (shared across users — export all)
        presets = preset_manager.get_all()

        # Skills (filtered by owner when auth is enabled)
        skills = skills_manager.load(owner=user)

        # Settings (secret-bearing values masked before the export leaves the box)
        settings = _redact_secrets(load_settings())

        # Feature flags
        features = load_features()

        # User preferences
        from routes.prefs_routes import _load_for_user
        preferences = _load_for_user(user)

        export_data = {
            "version": 1,
            "exported_at": datetime.now().isoformat(),
            "exported_by": user,
            "memories": memories,
            "presets": presets,
            "skills": skills,
            "settings": settings,
            "features": features,
            "preferences": preferences,
        }

        filename = f"odysseus_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        return Response(
            content=json.dumps(export_data, indent=2, ensure_ascii=False),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    @router.post("/api/import")
    async def import_data(request: Request):
        """Import user data from a previously exported JSON file. Merges with existing data."""
        require_admin(request)
        user = get_current_user(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")

        if not isinstance(body, dict):
            raise HTTPException(400, "Expected a JSON object")

        imported = []

        # ── Memories ──
        if "memories" in body and isinstance(body["memories"], list):
            existing = memory_manager.load_all()
            # Dedup against THIS user's own memories only. Using every tenant's
            # rows (load_all) meant a memory whose text matched any other
            # user's was silently skipped, so the importing user lost their own
            # data. The full store is still saved back below.
            existing_texts = {e.get("text", "").strip().lower()
                              for e in existing if e.get("owner") == user}
            added = 0
            for mem in body["memories"]:
                if not isinstance(mem, dict) or not mem.get("text"):
                    continue
                if mem["text"].strip().lower() in existing_texts:
                    continue  # skip duplicates
                # Assign owner when auth is enabled
                if user and not mem.get("owner"):
                    mem["owner"] = user
                existing.append(mem)
                existing_texts.add(mem["text"].strip().lower())
                added += 1
            memory_manager.save(existing)
            imported.append(f"{added} memories")

        # ── Skills ──
        if "skills" in body and isinstance(body["skills"], list):
            existing = skills_manager.load_all()
            # Dedup against THIS user's own skills only. Using every tenant's
            # rows (load_all) meant a skill whose id/name/title matched any
            # other user's was silently skipped, so the importing user lost
            # their own data — same cross-tenant bug fixed for memories above.
            # The full store is still saved back below.
            own = [s for s in existing if s.get("owner") == user]
            existing_names = {s.get("name") for s in own if s.get("name")}
            existing_ids = {s.get("id") for s in own if s.get("id")}
            existing_titles = {
                (s.get("title") or s.get("description") or "").strip().lower()
                for s in own
            }
            added = 0
            for skill in body["skills"]:
                if not isinstance(skill, dict):
                    continue
                title = (
                    skill.get("title") or skill.get("description")
                    or skill.get("name") or ""
                ).strip()
                if not title:
                    continue
                sid = skill.get("id") or skill.get("name")
                if sid and sid in existing_ids:
                    continue
                nm = skill.get("name")
                if nm and nm in existing_names:
                    continue
                if title.lower() in existing_titles:
                    continue
                owner = skill.get("owner")
                if user and not owner:
                    owner = user
                # Skills live on disk as SKILL.md files; the old JSON-era
                # skills_manager.save() no longer exists. Write each new skill
                # via add_skill (source="user" skips auto-dedup — this is an
                # explicit backup restore).
                result = skills_manager.add_skill(
                    title=title,
                    name=skill.get("name"),
                    description=skill.get("description"),
                    problem=skill.get("problem", ""),
                    solution=skill.get("solution", ""),
                    steps=skill.get("steps"),
                    tags=skill.get("tags"),
                    source="user",
                    teacher_model=skill.get("teacher_model"),
                    confidence=skill.get("confidence", 0.8),
                    owner=owner,
                    category=skill.get("category", "general"),
                    when_to_use=skill.get("when_to_use"),
                    procedure=skill.get("procedure"),
                    pitfalls=skill.get("pitfalls"),
                    verification=skill.get("verification"),
                    platforms=skill.get("platforms"),
                    requires_toolsets=skill.get("requires_toolsets"),
                    fallback_for_toolsets=skill.get("fallback_for_toolsets"),
                    status=skill.get("status", "draft"),
                    version=skill.get("version", "1.0.0"),
                )
                if result.get("_deduped"):
                    continue
                if result.get("name"):
                    existing_names.add(result["name"])
                if result.get("id"):
                    existing_ids.add(result["id"])
                existing_titles.add(title.lower())
                added += 1
            imported.append(f"{added} skills")

        # ── Presets ──
        if "presets" in body and isinstance(body["presets"], dict):
            current = preset_manager.get_all()
            for key, value in body["presets"].items():
                if isinstance(value, dict):
                    current[key] = value
                elif isinstance(value, list):
                    current[key] = value
            preset_manager.save(current)
            imported.append("presets")

        # ── Settings ──
        if "settings" in body and isinstance(body["settings"], dict):
            current = load_settings()
            # Defense-in-depth: never let an imported backup rewrite
            # security-sensitive keys. tool_path_extra_roots widens the agent's
            # read_file/write_file allowlist; endpoint/model overrides redirect
            # the app at attacker-controlled hosts. These are intentionally NOT
            # restored from a backup file — re-set them in the settings UI.
            incoming = {k: v for k, v in body["settings"].items()
                        if k not in _IMPORT_BLOCKED_SETTING_KEYS}
            dropped = sorted(set(body["settings"]) - set(incoming))
            if dropped:
                logger.warning("import_data: ignored security-sensitive setting keys: %s", dropped)
            # Merge without letting redacted-export placeholders overwrite the
            # live secrets they stand in for (M4 round-trip safety).
            _merge_preserving_secrets(current, incoming)
            save_settings(current)
            imported.append("settings")

        # ── Features ──
        if "features" in body and isinstance(body["features"], dict):
            current = load_features()
            current.update(body["features"])
            save_features(current)
            imported.append("features")

        # ── Preferences ──
        if "preferences" in body and isinstance(body["preferences"], dict):
            from routes.prefs_routes import _load_for_user, _save_for_user
            current = _load_for_user(user)
            current.update(body["preferences"])
            _save_for_user(user, current)
            imported.append("preferences")

        if not imported:
            return {"ok": False, "message": "No recognized data found in the file"}

        return {"ok": True, "imported": imported, "message": f"Imported: {', '.join(imported)}"}

    return router

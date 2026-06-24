# Odysseus — Whole-Codebase QA: Silent Failures & Correctness
**Date:** 2026-06-24 · **Method:** QA-Engineer + Lead-PM workflow — subsystem finders → independent adversarial verification (refute-by-default) → 4 HIGH findings additionally **hand-verified against source by the reviewer**.

## Coverage — all 18 subsystems examined (two depths)
The agent fan-out hit the **monthly spend limit** (`claude.ai/settings/usage`) after 6 subsystems, so the remaining 12 were reviewed **by the reviewer directly** (targeted Read + grep, no subagents) at triage-to-moderate depth.

- ✅ **Deep + independently verified (6):** agent-core, tool-execution, agent-tools, auth-security, db-persistence, email → **24 confirmed (0 crit · 4 high · 11 med · 9 low)**; 4 HIGH additionally hand-verified.
- 🔎 **Reviewer-conducted (11):** calendar/CalDAV, memory/RAG/embeddings, cookbook/model-serve, deep-research, documents/uploads, tasks/scheduler/webhooks, chat/compare/session routes, integrations, media, app-config, legacy frontend (static/js) → mostly **fail-closed and benign best-effort**; net-new: a few low/debt items (below).
- ⛔ **Not reviewable from `dev` (1):** v2 React **source** isn't on this branch (only the minified `static-v2/assets/` bundle); the `.tsx` lives on `feat/web-v2`/PR #1 and is covered by the prior agent-render & live-QA audits.

**Overall verdict: needs-work** — driven almost entirely by the **first 6 subsystems**; the other 11 are comparatively clean. No startup crashes; risk is concentrated silent-failure + multi-user-security in auth/tools/db/agent-core/email.

---

## Systemic themes (fix these patterns, not just instances)

1. **World-readable secret/key files (write-then-chmod TOCTOU, chmod failure swallowed).** Affects HIGH-3 plus several med/low. One fix — an atomic writer that creates the temp file at `0600` and locks `data/` to `0700`, logging (not swallowing) chmod failures — closes the whole cluster.
2. **Multi-user / reverse-proxy gaps.** Data tools aren't owner-scoped (HIGH-1) and rate-limiting/IP handling assumes a direct client (HIGH-2). Relevant because the live deploy runs with auth enabled behind a tunnel.
3. **Silent data-loss.** Failures that the user/operator never sees: message persist (HIGH-4), memory writes, email Trash-before-delete, `write_file` truncation.
4. **Agent-loop fail-open / fragility.** One tool's unexpected exception tears down the whole turn; a corrupt MCP `disabled_tools` re-enables blocked tools.

> **PR cross-link:** the still-unmerged **PR #3** (5-tier hardening) already touches `core/session_manager.py` (`_persist_failed`) and adds chmod work in `platform_compat.py` — landing it likely resolves **HIGH-4** and part of theme #1, but **not** `atomic_io.py`/`secret_storage.py`/`vault_routes.py`. Extend PR #3's chmod approach to those.

---

## HIGH (4) — all hand-verified against source

| # | Subsystem | File | Issue & impact | Fix |
|---|---|---|---|---|
| H1 | tools-exec | `src/tool_implementations.py:3663-3738` (+ `src/tool_security.py:14-54`) | **`manage_research` has no owner scoping and is NOT in `NON_ADMIN_BLOCKED_TOOLS`** (its line-115 entry is the *plan-mode* set only). A non-admin can `list`/`read`/**`delete`** every user's deep-research files → cross-tenant exposure + irreversible loss. Path-traversal gate is fine; tenant gate is absent. | Scope each action to `owner` (check an owner field per file); add `manage_research`+`trigger_research` to `NON_ADMIN_BLOCKED_TOOLS` or gate on `owner_is_admin_or_single_user`. |
| H2 | auth-security | `routes/auth_routes.py:101,115,132` | Login/signup/setup limiters key on `request.client.host` → behind the documented proxy **all clients collapse into one bucket** (brute-force protection nullified; one client can 429-lock everyone out). `request.client` can also be `None` → 500. | Derive client IP trusted-proxy-aware (right-most XFF only when behind a configured proxy); guard `request.client is None`. |
| H3 | auth-security | `core/auth.py:158-165,225-226` → `core/atomic_io.py:21-43` | **`sessions.json` (live tokens) and `auth.json` (TOTP secrets, bcrypt hashes) written with default umask perms, never `0600`; `data/` never `0700`.** On a multi-user host any local user reads a session token and impersonates anyone, incl. admins — bypassing password/TOTP. | `chmod 0700 data/` at startup; have the atomic writer create the temp file at `0600` before `os.replace`; log chmod failures. |
| H4 | db-persist | `core/session_manager.py:209-265` | **Failed message persist is swallowed** (catch→log→rollback→return). Reply shows live, never written, vanishes on reload — no error to user or API. | `_persist_message` should re-raise / return False; `add_message` propagates so the route can surface "not saved". |

---

## MEDIUM (11)
- **tools-exec / security** — `src/tool_implementations.py:4086-4091`: `vault_unlock` writes the Bitwarden session key to a **world-readable** file; the `0600` chmod failure is swallowed.
- **tools-exec / correctness** — `src/tool_implementations.py:3277-3286`: `adopt_served_model` chat-endpoint registration **always fails silently** (field-name mismatch).
- **agent-core / security** — `src/agent_loop.py:50-55`: MCP `disabled_tools` map **fails OPEN** on corrupt JSON — disabled tools silently become callable, no warning.
- **agent-core / reliability** — `src/tool_execution.py:730-866` / `agent_loop.py:2828`: an unexpected exception in any `do_*` handler **kills the whole agent turn** (streamed text + prior tool results discarded).
- **agent-core / data-loss** — `src/ai_interaction.py:994-1068`: `manage_memory` add/edit/delete is an unlocked read-modify-write — **concurrent turns drop entries**.
- **auth-security / data-loss** — `routes/vault_routes.py:62-77`: `BW_SESSION` persisted via non-atomic, world-readable-before-chmod write; corrupts silently on mid-write crash.
- **email / silent-failure** — `routes/email_routes.py:2121-2159`: cancelling a *failed* scheduled email silently no-ops (row never deleted, returns success).
- **email / correctness** — `routes/email_pollers.py:1010-1064`: scheduled-email poller sends through a receive-only account's empty/cross-account `From` when SMTP isn't ready.
- **email / data-loss** — `routes/email_routes.py:1896-1906`: `delete_odysseus_reminder_emails` permanently deletes when the Trash **copy** fails (no warning).
- **email / silent-failure** — `routes/email_pollers.py:418-443`: background auto-reply/summary/classify **swallow LLM HTTP errors** as silent skips.
- **email / correctness** — `routes/email_pollers.py:1037-1041`: poller splits recipient headers on commas, corrupting display-name addresses.

## LOW (9)
- `src/agent_loop.py:1463-1558` — native tool call that fails schema conversion gets an **empty** tool result (model can't tell it was dropped; loops).
- `src/agent_loop.py:1592-1597` — estimated-usage token fallback ignores multimodal + tool-call content (context meter underreports).
- `src/tool_execution.py:475-476` — `_direct_fallback` swallows tool-handler launch exceptions without logging.
- `src/agent_tools/filesystem_tools.py:160-190` — `write_file` silently truncates an existing file to empty when the call has no body line.
- `src/agent_tools/claude_code_tool.py:70-77,200,242` — `delegate_to_claude_code` `files_created` unreliable when build dir holds >300 files.
- `src/agent_tools/web_tools.py:39-51` — `web_search` reports an empty, context-free error on timeout via the direct-fallback path.
- `src/secret_storage.py:42-45` (+ `src/api_key_manager.py:27-33`) — encryption-key files written world-readable before chmod (TOCTOU).
- `routes/auth_routes.py:101,115,132` — rate-limited routes dereference `request.client.host` with no `None` guard.
- `core/session_manager.py:663-673` — `cleanup_empty_sessions` deletes by trusting the `message_count` column instead of counting real rows.

---

## Part 2 — reviewer-conducted review of the remaining 12 subsystems
Examined directly (no subagents) after the spend cap. Headline: **no new HIGH/critical** — these subsystems are mostly fail-closed access checks and benign best-effort `except` blocks.

- **tasks / scheduler / webhooks** — ✅ well-hardened. Task-execution failures are logged, persisted to `TaskRun.error` (UI-visible), notified, and `next_run` is advanced with a *fresh-session commit-failure recovery* so a broken task can't busy-loop. Webhook delivery records `last_error`/`last_status_code`. *Low:* non-`llm`/`research` task failures aren't push-notified (only logged + run history). SSRF guard (`webhook_manager.py:88-110`) is fully **fail-closed**.
- **memory / RAG / embeddings** — benign best-effort (defensive collection get/delete, multi-strategy JSON parse fallbacks). Error-vs-empty already addressed by PR #3 Tier 3.
- **deep-research** — fail-*closed* path confinement (`research_handler.py:58-61`) and owner checks (`research_routes.py:139`). Note: the route owner-scopes, which is exactly what the `manage_research` **tool** (HIGH-1) fails to do.
- **documents / uploads** — cleanup `except: pass` are best-effort; `upload_handler` returns `False` on failure (caller-handled), not swallowed.
- **cookbook / model-serve** — admin-gated. *Note (unverified):* `cookbook_routes.py` runs `subprocess.run(ssh_base + [remote_host, shell_cmd], …)` for the remote hwfit scan — confirm `remote_host`/`shell_cmd` validation holds (existing `test_codex_ssh_host_validation` suggests it does).
- **calendar / CalDAV** — `decrypt()` failure falls through to a clean "Missing URL/username/password" error, not silent loss.
- **chat / compare / session routes** — access/admin checks fail **closed** (`return False` on exception).
- **integrations (copilot/chatgpt/codex/mcp)** — OAuth tokens stored in the (encrypted) DB, not plaintext files; the `return True`-on-except cases are non-gating (subscription availability / teacher escalation), not auth bypasses.
- **media (stt/tts/gallery/images)** — admin checks fail closed; image-resize `except: pass` is cosmetic best-effort.
- **app-init / config / settings** — no startup-crash or fail-open patterns surfaced.
- **legacy frontend (`static/js`)** — *Medium debt, lower priority (being sunset by v2):* **302 empty `catch` blocks** and ~half of 790 `fetch()` calls don't check `res.ok`; e.g. `chat.js:670` logs an upload failure to console with **no user feedback**. Most empties are DOM/theme best-effort.
- **v2 React source** — not on `dev`; see coverage note.

## Recommended fix order
1. **Secret/key file perms** (theme #1): one atomic-writer fix → closes H3 + vault/secret med/lows.
2. **H1 owner-scope research tools** + add to non-admin blocklist (cross-tenant delete is the scariest).
3. **H2 proxy-aware rate limiting** + `request.client` None-guard.
4. **Silent data-loss**: land **PR #3** (gets H4 + memory/persist hardening), then the email Trash-delete + `write_file` truncation.
5. **Agent-loop fail-closed**: wrap per-tool dispatch; fail-closed on corrupt MCP `disabled_tools`.
6. **Finish QA on the 12 un-reviewed subsystems** once the spend cap resets.

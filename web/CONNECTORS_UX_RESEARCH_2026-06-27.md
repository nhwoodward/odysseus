# Connectors UX Research — connection · auth · errors · permissions (+ Canva/Maps as features)

**Date:** 2026-06-27
**Method:** ultracode research workflow — 12 parallel web-research agents over primary docs (Anthropic, OpenAI, Notion, Linear, Raycast, Cursor, VS Code/GitHub, Zapier, Make, Google, Plaid, NN/g, Auth0) + a curated Mobbin competitor-screen gallery (web platform).
**Target:** the Odysseus **Connectors** feature — branded MCP catalog + per-user one-click OAuth + per-tool toggles + admin curation (`feat/web-v2-connectors` / `feat/web-v2-finance`).

> **Why this doc exists.** It started as a debugging session ("my MCP servers aren't connecting"). The diagnosis: **Canva** was registered but OAuth-pending (`https://mcp.canva.com/mcp`, "Needs authentication"), and **Google Maps** was never registered *and* the package everyone references (`@modelcontextprotocol/server-google-maps`) is now **archived**. The same archived package was shipping in Odysseus's own `connector_catalog.py` (now patched to the maintained `@cablate/mcp-google-map`). That friction is exactly the surface this research is about — so we surveyed how the leaders handle it.

> **Image note.** Mobbin thumbnails are linked to their canonical screen/flow. If a thumbnail doesn't render in your viewer, click it — the Mobbin link is the source of truth.

---

## TL;DR — the patterns that matter most

1. **Curate at the org, consent per user.** Admins make a connector *available*; every individual still completes their own delegated OAuth. No shared service-account tokens.
2. **Auth is a three-state lifecycle, not a boolean:** connected → silently-refreshing → action-required. Leaders refresh tokens proactively and treat "needs reauth" as a first-class, inline-actionable state.
3. **Per-tool, three-stance permissions are table stakes:** Allow / Ask / Blocked, with a read-vs-write distinction driven by the MCP `readOnlyHint`.
4. **Enforce permissions at *both* discovery and execution.** Hiding a tool in the UI is not a security boundary.
5. **Capability transparency *before* connecting:** Read / Read & write / Interactive shown on catalog cards and as a filter.
6. **Design & Maps render as interactive in-thread widgets**, not text or links — the assistant *orchestrates a real product's capability* and shows a familiar, host-consistent surface.

What Odysseus already does well (keep): per-user `owner`-scoped connections with the `_may_manage()` IDOR guard, encrypted `oauth_tokens`, DCR+PKCE OAuth, live `useConnections()` polling that flips Authorize→Connected, SSRF-validated custom URLs, per-tool toggles, and admin availability curation. The gaps below are mostly *depth* on top of a solid base.

---

## 1. How leaders handle connector connection & auth

### Connection models: "curate at the org, consent per user"
The dominant pattern is a two-tier split — an admin makes a connector *available*, but each individual still completes their own OAuth; there are no shared service-account tokens.

- **Claude:** connectors are "enabled org-wide from Admin Settings… individual users in your organization can connect their own accounts," using "delegated, per-user OAuth wherever possible… no service accounts with elevated access" ([Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)).
- **ChatGPT:** personal OAuth self-service coexists with an admin-managed "sync" that indexes a whole corpus once but still filters results to each user's source permissions ([Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt), [Apps with sync](https://help.openai.com/en/articles/10847137-chatgpt-apps-with-sync)).
- **Notion:** AI Connectors install once at workspace level yet "each prospective user needs to individually follow the auth flow," and individuals can layer in *private* resources (e.g. their own Slack DMs) only they can see ([Notion AI Connectors](https://www.notion.com/help/notion-ai-connectors)).
- **Linear:** an admin installs the org integration once, then "each member should connect their personal GitHub account" so synced activity is attributed to the individual, not a bot ([GitHub — Linear](https://linear.app/docs/github)).
- **Zapier vs Make** diverge on ownership: a Zapier connection is per-user-account but shareable/transferable; Make connections are team-scoped — "all users in your team… can use and manage any connections you create" ([Zapier](https://help.zapier.com/hc/en-us/articles/36818633398157-App-connections-on-Zapier), [Make](https://help.make.com/connect-an-application)).
- **Architectural gotcha:** even "local" Desktop apps call custom MCP servers **from the vendor's cloud**, so private/firewalled servers silently fail unless reachable from the vendor's IP ranges ([Custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)).

### OAuth & consent flows
- Everyone uses a **browser redirect/popup round-trip**, not a headless grant. Claude pins a fixed callback (`claude.ai/api/mcp/auth_callback`) and sends **S256 PKCE on every authorization request**, supporting three registration models — DCR, Client ID Metadata Documents, and Anthropic-held credentials ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication)). *(Claude Code itself uses RFC 8252 loopback redirects and, on headless Linux, prints the URL and accepts a pasted callback — the exact path that unblocked the Canva connection in this session.)*
- **Consent is increasingly scoped, not blanket.** Notion's flow is sequential — a capabilities-disclosure screen, then a "Select pages" picker that "only displays pages or databases to which a user has full access," then "Allow access" — so a connection can never be granted more than the grantor already holds ([Authorization — Notion](https://developers.notion.com/docs/authorization)).
- **IDE/desktop tools push secrets out of committed config and self-initiate OAuth.** VS Code 1.101+ implements the MCP auth spec with built-in DCR, so a remote server often needs only `type:http` + `url` and the IDE starts OAuth itself ([VS Code MCP config](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)). Cursor uses one static redirect for all servers and stores credentials after a one-click "Add to Cursor" install ([Cursor MCP](https://cursor.com/docs/mcp)).
- **Custom/remote MCP is a first-class add path.** ChatGPT Developer Mode and Claude "custom connectors" both let a user paste a public `/mcp` HTTPS URL, OAuth optional under "Advanced settings" ([Developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)).

### Error handling & re-authentication
Leaders model auth as a **three-state lifecycle** — connected, silently-refreshing, action-required.

- **Token hygiene is automatic and invisible** at the high end: Claude refreshes "reactively on a 401 response, with a proactive refresh up to five minutes before the stored expiry" ([Claude auth](https://claude.com/docs/connectors/building/authentication)). Linear access tokens expire after 24h and refresh via `refresh_token` ([Linear OAuth](https://linear.app/developers/oauth-2-0-authentication)); ChatGPT connector tokens typically renew every ~30–90 days ([Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)).
- **Reconnect is a discrete, inline affordance.** Zapier's centralized App Connections page color-codes Active (green check) vs Expired (red X) with an inline **Reconnect** button, status filters, *and* a proactive email on expiry — surfacing concrete copy like "This account connection is expired… reconnect" ([Manage your app connections — Zapier](https://help.zapier.com/hc/en-us/articles/8496290788109-Manage-your-app-connections)). Make shows "Invalid refresh token. Please reauthorize the connection" with a Reauthorize button ([Make Connections](https://help.make.com/connections)).
- **The industry's core failure mode is silent failure.** Notion sends *no* notification on expiry — automations keep looking connected and quietly do nothing. The documented fix is the abbreviated, identity-preserving re-auth typified by **Plaid "update mode"**: detect via 401, warn ~7 days out via `PENDING_DISCONNECT`/`PENDING_EXPIRATION` webhooks, repair with minimum input, keep the same token/ID, confirm with `LOGIN_REPAIRED` ([Plaid update mode](https://plaid.com/docs/link/update-mode/)).
- **The most legible re-auth state machines live in power-user surfaces.** Claude Code's `/mcp` panel shows "⏸ Pending approval," "✗ Rejected," failed-on-backoff, "Clear authentication," and a paste-the-callback-URL fallback, and auto-reconnects with exponential backoff (5 attempts) — explicitly *not* retrying auth/not-found errors since they need a config change ([Claude Code MCP](https://code.claude.com/docs/en/mcp)). Raycast surfaces Running / Stopped / Error with a Start/Stop/Restart/Logout panel ([Raycast MCP](https://manual.raycast.com/ai/model-context-protocol)). For hosted Claude/ChatGPT the documented recovery is mostly remove-and-reconnect; the exact in-product "needs reconnect" banner copy is under-documented in primary sources. Error copy should stay blame-free and never leak raw codes (`401`, `invalid_grant`) to users ([NN/g Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)).

### Permission granularity
- **Per-tool, three-stance permissions are now table stakes.** Claude sets each tool to "Always allow / Needs approval / Blocked" under Customize → Connectors → Tool permissions, with examples like "read email but don't send" ([Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)). ChatGPT exposes "Always ask / Any changes / Important actions" and respects the MCP `readOnlyHint` annotation — unannotated tools default to *write* and are approval-gated ([Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt)).
- **Capability transparency before connecting.** Claude's directory exposes "Interactive / Read & write / Read" as a first-class filter and on each connector page, so write risk is visible *pre-consent* ([Connectors directory](https://claude.com/connectors)). Notion's capability tags are real opt-in scopes (Content: Read/Update/Insert; User info: none/without-email/with-email), shown at creation *and* in each page's Share menu.
- **Two enforcement layers are a security boundary, not just UX:** filter at discovery so the model never sees forbidden tools, *and* reject out-of-scope direct calls at execution. UI-only gating with broad service credentials creates confused-deputy / cross-tenant escalation ([MCP RBAC — Maxim AI](https://www.getmaxim.ai/articles/mcp-rbac-tool-level-permissions-for-production-ai-agents/)). Allowlists beat denylists, which are trivially bypassed ([The Denylist Delusion](https://www.backslash.security/blog/cursor-ai-security-flaw-autorun-denylist)).
- **Admin curation with override.** ChatGPT "Action control" picks Allow-all / read-only / Custom *and* dictates how future-added actions are handled (enable all new / only new read / disable new), layered on RBAC ([OpenAI Admin Controls](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-in-apps-enterprise-edu-and-business)). Claude lets owners pin read-only org-wide so "individual users can't override it." Linear keeps scopes least-privilege: `read` always present, narrow create-only scopes, `admin` documented as "never ask… unless absolutely needed" ([Linear OAuth](https://linear.app/developers/oauth-2-0-authentication)).

---

## 2. Canva-style design & Maps-style location as features

The 2025–2026 consensus: design and location capabilities are exposed to the assistant as **atomic MCP tools whose results render as interactive, embedded widgets in the conversation** — not plain text or external links.

> **Spec caveat:** OpenAI's Apps SDK formalized in-chat widgets with structured JSON + an `outputTemplate` that renders a React component in an iframe, synced via a `window.openai` bridge (`toolOutput`, `callTool`, `sendFollowupMessage`, `requestDisplayMode`) ([Apps SDK UX](https://developers.openai.com/apps-sdk/concepts/ux-principles), [Build ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)). This bridge is **OpenAI-specific** — it is *not* rendered identically by Claude/Gemini. The vendor-neutral alternative is **MCP-UI** (resource-embedded UI in the MCP spec). The two are **not interoperable**; a host picks one.

### Design (Canva / Figma) as a first-class capability
- **Canva** ships an official AI Connector (MCP at `https://mcp.canva.com/mcp`, on Claude since July 2025, now also ChatGPT + Microsoft Copilot): create designs from a prompt, autofill/find/edit/resize, apply the user's **Brand Kit**, export to PDF/PNG/JPG/PPTX/MP4 — surfacing an *editable* design preview in-thread rather than a static image, per-user auth via DCR ([Canva MCP](https://www.canva.dev/docs/mcp/), [Canva × Claude](https://www.canva.com/newsroom/news/claude-ai-connector/)).
- **Figma's** MCP server is the design-to-code / code-to-design bridge: paste a frame URL → token-efficient structured context (layout-as-relationships, hex→design-token references, Code Connect mappings) so the agent generates accurate code; the reverse captures live browser UI into editable Figma frames ([Figma MCP](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)).
- **UX discipline:** separate data tools from render tools; put everything the widget needs in `structuredContent`; start inline, reserve fullscreen for editors/galleries; inherit the host design system (system fonts/colors, brand only on the primary button); meet WCAG AA + dark mode; wire two-way state so users keep "talking to the app" ([Apps SDK UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)).

### Location / Maps as a first-class capability
- **In-chat travel apps** (Expedia, Booking.com, Zillow in ChatGPT) render interactive maps, live pricing/availability, photos and conversational filters ("under £700", "with a balcony"), then **hand off to the partner** to complete the booking/tour ([Apps in ChatGPT](https://openai.com/index/introducing-apps-in-chatgpt/)).
- **Google "Grounding with Google Maps"** (GA Oct 2025) grounds answers in 250M+ places and returns source annotations (place name + URL, **mandatory Maps attribution shown within one interaction**) plus a context token that fetches an optional interactive Maps widget (photos/reviews/details); routing is still restricted preview ([Maps grounding — Gemini API](https://ai.google.dev/gemini-api/docs/maps-grounding)).
- **Strategic shift:** the assistant *orchestrates a real product's capability* and shows a familiar, branded-but-system-consistent surface, instead of porting the whole app into chat. Render a recognizable map (markers, clustering, detail pane), let users refine conversationally, show live data from the source (not model memory), and honor freshness/attribution. Guard the auth boundary: treat the MCP server as an OAuth resource server, use Resource Indicators (RFC 8707), validate token audience ([MCP auth — Auth0](https://auth0.com/blog/mcp-specs-update-all-about-auth/)).

---

## 3. Mobbin competitor gallery

### 3.1 Catalog / discovery & connected-vs-available
The closest references are **Claude's own** connector surfaces — a browseable directory and a Connected/Disconnected settings list with an external-link `Connect ↗` affordance:

[![Claude — Connectors directory modal (Skills/Connectors/Plugins tabs, search, Anthropic & Partners filter, Interactive badges)](https://mobbin.com/api/mcp/short/wWJrmFaw)](https://mobbin.com/screens/c5ecfff7-9ccf-4eba-8076-dd1b41dcd987)
[![Claude — Connectors settings: Connected vs Disconnected, Connect ↗, custom connector, Browse/Add custom](https://mobbin.com/api/mcp/short/Q0O8QE1f)](https://mobbin.com/screens/658b07c2-6455-4911-adc5-c0fdcbec8fc1)

Connected-vs-available splits, capability tags, count badges and search:

[![Notion — "My connections" + "Discover new connections" with LINK PREVIEW / SYNC capability tags and NEW badges](https://mobbin.com/api/mcp/short/OLLmDFE9)](https://mobbin.com/screens/05f9804e-5eaa-40ae-ae77-3f00a82b5c6c)
[![Apollo — Connected integrations (4) / Available (29) split, category filter + search, per-row Disconnect](https://mobbin.com/api/mcp/short/sa5YMSyn)](https://mobbin.com/screens/e4e07047-5579-43e7-87f4-b61a25df1e46)
[![Linear — "Connected accounts": Connect ↗ external-link affordance + org-level "Connect workspace"](https://mobbin.com/api/mcp/short/Rrq2b7No)](https://mobbin.com/screens/3b7417c7-551f-4935-890f-4788e4d8d334)
[![Charma — card grid with explicit "✓ Connected" state + overflow menu + AI Toolkit badges](https://mobbin.com/api/mcp/short/95QbA36p)](https://mobbin.com/screens/b8829590-0ca1-47ff-a6b1-1f9536ac5154)
[![Sana AI — "Available integrations" data-source cards (Google Drive, Notion, Dropbox, Confluence…)](https://mobbin.com/api/mcp/short/gfqT1Kd9)](https://mobbin.com/screens/eb18a223-33c8-49f3-8bf8-cb33e70899e0)
[![Fabric — Sources with explicit sync-direction notes (1-way read-only vs 2-way)](https://mobbin.com/api/mcp/short/FFPMBDE6)](https://mobbin.com/screens/162f77fe-5b3a-4c52-a051-9a9847f6646a)
[![Miro — Integrations tab, simple list with Connect buttons](https://mobbin.com/api/mcp/short/y4fy1E07)](https://mobbin.com/screens/332ce966-a691-461a-becd-a89a29bb6cfa)
[![Current — Integrations modal with Connect / Disconnect per row](https://mobbin.com/api/mcp/short/lc4Tm2IG)](https://mobbin.com/screens/6654643c-789f-4b48-ad8a-74fe89593b79)

### 3.2 OAuth connect & consent flows
The textbook consent screen states *who* gets access, *which scopes*, the redirect target, and a remove-anytime note:

[![ChatGPT → Notion MCP consent: "Grant chatgpt.com access to Notion", workspace selector, scope checklist, redirect-URL trust checkbox](https://mobbin.com/api/mcp/short/JhoQc59N)](https://mobbin.com/flows/473e4bc1-9512-483d-b5d7-34839f1cca40)
[![Spotify → Amie OAuth consent: scopes grouped (View account data / View activity / Take actions) + "remove access at any time"](https://mobbin.com/api/mcp/short/1lpsy2FH)](https://mobbin.com/flows/a4d27160-382a-42ff-ac01-a23e28edc9a2)
[![Reddit → Google sign-in consent ("Google will allow Reddit to access…") with Cancel / Continue](https://mobbin.com/api/mcp/short/FFrnfdmj)](https://mobbin.com/flows/51ec77f0-7832-416d-a74d-1a6d6ad8f753)

### 3.3 Granular tool / scope permissions
Three-stance and read-vs-write permission UIs to model the per-tool upgrade on:

[![ClickUp — Custom Permissions matrix: per-action toggles across Guest / Member / Admin columns](https://mobbin.com/api/mcp/short/FRKlJEyR)](https://mobbin.com/screens/1ef19eb7-0d21-4856-98dd-94a718dae0a0)
[![Vercel — OAuth app scopes as toggles (openid / email / profile / offline_access) with per-scope descriptions](https://mobbin.com/api/mcp/short/BnzBOqcU)](https://mobbin.com/screens/47e87a64-b57a-4042-b754-9f6e7eb1b269)
[![Whop — app permissions as read/create/delete scopes, each marked Required, with plain-language descriptions](https://mobbin.com/api/mcp/short/RAb4bJ4z)](https://mobbin.com/screens/84eb7de4-5269-4e61-aef2-6f29e2c3192d)
[![Okta — feature toggles with inline success toasts on enable](https://mobbin.com/api/mcp/short/8tACp1Qv)](https://mobbin.com/screens/51f38edb-d1c4-4cee-a8b9-2bdd6ee96034)

### 3.4 Maps & design as in-product features
Maps rendered as an interactive widget alongside conversational results, and design generated from a prompt:

[![Perplexity — "Show me a map of the best places…": Places tab, result cards + live interactive map](https://mobbin.com/api/mcp/short/WSpKCAtv)](https://mobbin.com/screens/409adc7b-317d-4856-aa5e-f4b6ac0b7a48)
[![Perplexity — map with a place-detail popover (rating, address, phone, hours, categories)](https://mobbin.com/api/mcp/short/2kS4eiyh)](https://mobbin.com/screens/24c38749-d554-42ee-8911-e4c9967431ac)
[![Tripadvisor — split list + map with clustered markers and "Search as I move the map"](https://mobbin.com/api/mcp/short/Tx47yCvI)](https://mobbin.com/screens/4eac46a0-749f-4358-8e07-2f4805e3f5e4)
[![Canva — Magic Media: generate images/graphics from a text prompt inside the editor](https://mobbin.com/api/mcp/short/kjtxeV9k)](https://mobbin.com/screens/5cf75d13-a9a7-470a-ad7b-850cb88e22a3)
[![Manus — slide deck created from a prompt (Slides mode, sample prompts, templates)](https://mobbin.com/api/mcp/short/Vg9IJ9TK)](https://mobbin.com/screens/10fcbb26-3619-4697-8613-eeeacc7b89b1)
[![Gamma — AI deck generation with art-style / model / aspect controls](https://mobbin.com/api/mcp/short/dqpwf3EZ)](https://mobbin.com/screens/6154cf8d-d6ca-4fc0-8e6f-8d40c4d1288d)

---

## Competitor teardown — at a glance

| Product | Connection model | Auth / consent | Error & re-auth | Permission granularity | Catalog / discovery |
|---|---|---|---|---|---|
| **Claude (Anthropic)** | Org-enable → per-user OAuth; remote MCP run from Anthropic cloud; Claude Code runs local | Fixed callback + S256 PKCE every request; DCR / CIMD / Anthropic-held creds | Auto refresh (5 min pre-expiry); Claude Code `/mcp` rich state machine; web Settings thinner (disconnect+reconnect) | Per-conversation on/off **+** per-tool Allow/Needs-approval/Blocked; admins pin read-only org-wide | Public directory + in-product modal; facets: Works-with / Use-case / **Capabilities (Interactive/R&W/Read)** |
| **ChatGPT (OpenAI)** | Personal OAuth self-service **+** admin "sync" indexing; remote MCP "apps" | Browser redirect; "clear consent" screen; Developer Mode for custom `/mcp` URLs | Tokens ~30–90 d; mostly auto-reconnect w/ manual re-grant fallback; banner copy under-documented | "Always ask / Any changes / Important actions"; `readOnlyHint` → unannotated = write/approval-gated; per-tool toggles; admin Action Control | App Directory (Featured/Productivity… + search); admin-curated availability; invoke via `@app` |
| **Notion** | 3 parallel systems (API/link-preview, AI Connectors, Security); workspace-install + per-user auth + private resources | Sequential consent: capabilities → **page picker (only your full-access pages)** → Allow | Link-preview errors (Access denied / Not found); **no expiry notification**; recover via remove+reconnect | Real opt-in scopes (Content R/U/I; User-info tiers); per-page sharing; Enterprise approved-list | "My connections" vs "Discover new connections"; AI-connector catalog in 5 categories with gear/＋ |
| **Linear** | Org integration (admin) **+** per-user "Connected accounts"; `actor=user`/`actor=app` | OAuth code flow w/ `state`; catalog "Add to Linear" deep-links in-app first, then provider | 24 h tokens; refresh-default-on drove reconnect wave; recover via Disconnect→re-authorize (reset as nuclear) | Least-privilege scopes (`read` always; create-only; `admin` "never ask"); GitHub repo-scoping | `linear.app/integrations`: ⌘K search, category tabs, creator attribution, detail pages |
| **Raycast** | Local-first per-device; stdio or HTTP/OAuth; tokens in encrypted DB + Keychain | PKCE overlay ("Connect to provider…"); HTTP/OAuth servers stay off until Sign In | Explicit **Running / Stopped / Error** + Start/Stop/Restart/Logout panel | Runtime per-tool **approval** (global or per-chat); extension credential isolation | Consumer Store (Featured, install/command counts) + Official-vs-Community MCP meta-registry |
| **Cursor / VS Code** | Local IDE, per-machine `mcp.json` (`mcpServers` vs `servers`!); project scope committable | One-time browser OAuth (VS Code 1.101+ auto-DCR); secrets via `${env}`/`inputs` | Per-server status + tool count; VS Code trust gate; re-auth not always self-healing (stale client) | Per-server enable/disable + per-tool toggles + per-invocation approval; sandbox scopes | One-click "Add to Cursor" / "Install in VS Code"; **GitHub MCP Registry** (org-verified, stars); enterprise allow/registry-only |
| **Zapier / Make** | Zapier = per-user (shareable/transferable); Make = **team-scoped** | Popup OAuth; user-named connections ("dropbox company") | Centralized health page: green-check/red-X + inline **Reconnect** + email (Zapier); Reauthorize button (Make) | Provider scopes at consent; admin allow/denylist + action-level prohibition (Enterprise) | 9,000+/3,500+ apps → search + category facets + **trust tiers** (Make: Verified/Community/Built-in) |

---

## 4. Gap analysis vs Odysseus Connectors

| Pattern (leaders) | Odysseus today | Gap |
|---|---|---|
| Curate-at-org / consent-per-user | ✅ `owner`-scoped `McpServer` rows; admin availability allow-list (`connectors_enabled`); `_may_manage()` IDOR guard; agent-loop `_load_mcp_disabled_map` isolation | **Solid.** No structural gap. |
| Three-state auth lifecycle w/ proactive refresh | ⚠️ `_persist_status()` mirrors `needs_auth`/`last_error` only *after* an 8 s connect fails; `useConnections()` polls only while "settling" | A token dying **between sessions** reads "connected" until the next call quietly fails. No proactive refresh / pre-expiry nudge. |
| Inline reconnect at point of use | ⚠️ Amber `needs_auth="Authorize"` chip on the settings card; composer "Sources" popover w/ status dots exists (Phase 3) | The break is *felt in chat* but the only fix lives on the settings page. Dots don't carry a Reconnect action. |
| Per-tool **three-stance** + read/write | ⚠️ Per-tool **binary** `Switch` (`disabled_tools` JSON) | Can't express "read Drive but block create/edit." No `readOnlyHint`, no default-deny for writes. |
| Enforce at discovery **and** execution | ⚠️ Tools hidden via disabled-map at discovery | Verify server-side rejection of out-of-scope **direct** calls (hidden ≠ blocked). |
| Capability transparency pre-connect | ❌ `connector_catalog.py` is category-grouped data with `capabilities` but cards don't surface Read/Write/Interactive | User can't judge blast radius before consent. |
| Catalog search / facets | ✅ search + Featured/All tabs (connectors-discovery work) | Add capability/status facets as catalog grows. |
| Provenance / version pinning | ❌ no trust tier; the `google_maps` archived-package bug is exactly this | Add trust tier + pinned versions (this doc's origin story). |
| Blame-free typed errors | ⚠️ `last_error` mirrored to DB and rendered raw in the red chip | Risks leaking OAuth codes/stack traces. |
| Disconnect/revoke + token purge | ✅ DELETE removes connection + tokens | Confirm encrypted `oauth_tokens` are zeroed and server-side revoke is attempted. |
| Custom remote-URL "developer mode" | ✅ `POST /api/connectors/custom`, **SSRF-validated** (`validate_public_http_url`) | Exists but not surfaced as a clear UI affordance; add prompt-injection warning + DNS-rebinding re-check. |
| Design/Maps as in-chat widgets | ❓ Canva + `google_maps` listed; render behavior **unverified** | Likely plain-text passthrough — verify, then add host-side widget rendering. |
| Admin per-tool lock + future-actions policy | ⚠️ admin curates **availability** only | Can't pin a connector read-only org-wide or set how new tools behave. |
| Connection naming (multi-account) | ⚠️ "Add another" exists | No label to distinguish "Notion (work)" vs "Notion (personal)." |
| Tool-change re-consent ("rug pull") | ❌ none | A connector that adds/changes tools post-approval isn't re-confirmed. |
| Admin audit log of tool invocations | ❌ none | High value for a multi-tenant AI workspace. |

---

## 5. Recommendations for Odysseus Connectors

> **One workstream, three recs.** Items **#3, #4, #13** are layers of a single *permission model* (user three-stance → server-side enforcement → admin policy). Build them together, not as three independent tickets.

### P0 — correctness & safety

**1. Replace reactive-only status with a proactive three-state lifecycle.** Add proactive token refresh ahead of expiry in `mcp_oauth.py` and a pre-expiry nudge, so `statusChip()` never says "connected" while the token is dead. (Grounding: Claude "proactive refresh up to 5 min before expiry"; Plaid `PENDING_DISCONNECT`; the silent-failure pitfall. *The exact lead-time — e.g. refresh at ~75% of token lifetime — is an engineering choice, not a copied number.*) — `mcp_oauth.py`, `connector_routes.py:_persist_status`.

**2. Attach a one-click Reconnect to the affordances that already exist.** The Phase-3 composer "Sources" dots and the 2.5 s `useConnections()` settle-polling already ship — *reuse them*: hang a Reconnect action (deep-link to stored `auth_url`) on the amber dot + a re-surfacing banner; reconnect just re-enters the settling state and the existing poll flips the chip back to emerald. (Grounding: ChatGPT remove+reconnect path; NN/g "every needs-reauth state carries an inline action.") — `ConnectorsRoute.tsx`, `ComposerControls.tsx` `SourcesMenu`.

**3. Upgrade per-tool binary `Switch` → three-stance Allow / Needs-approval / Blocked with read-vs-write.** Adopt the MCP `readOnlyHint` so unannotated tools default to *write/approval-gated*; default new connectors and all write tools to Ask/Blocked. (Grounding: Claude "Always allow / Needs approval / Blocked"; ChatGPT `readOnlyHint` write-gating.) — `ConnectorsRoute.tsx`, `connector_routes.py` tools PATCH, `disabled_tools` → richer policy.

**4. Enforce tool permissions at BOTH discovery and execution, under the user's delegated token.** Filter forbidden tools from what the model sees *and* reject out-of-scope calls server-side, running under the connecting user's encrypted token — never broad service creds. (Grounding: two-layer enforcement boundary; Claude "action still requires the user's underlying source-system permission.") — `agent_loop.py` `_load_mcp_disabled_map`, `connector_routes.py`.

### P1 — discovery, trust & error quality

**5. Show capability tags (Read / Read & write / Interactive) on catalog cards before connecting.** The `capabilities` field exists in `connector_catalog.py` — surface it on the card + add it as a facet. (Grounding: Claude directory's first-class "Interactive / Read & write / Read" filter; Notion capability tags.) — `connector_catalog.py`, `ConnectorsRoute.tsx`.

**6. Add a provenance / verification tier + version pinning to the catalog.** The archived-`google_maps` bug is exactly the trust problem catalogs solve. Add a trust tier (Verified/Community/Custom) and pinned package versions, badged in the UI. (Grounding: Make's Verified/Community/Built-in; GitHub MCP Registry org-verification + stars.) — `connector_catalog.py`.

**7. Stop surfacing raw `last_error`; write blame-free, typed copy.** Map errors to one-line named messages ("Your Notion connection expired. Reconnect to keep using it.") and log raw detail for operators only. (Grounding: NN/g; "never surface 401/invalid_grant.") — `connector_routes.py:_persist_status`, `ConnectorsRoute.tsx`.

**8. Distinguish admin-revoked / org-policy disconnects from personal expiry.** Clicking Reconnect on an admin-revoked connection should *not* just fail again — classify the failure and route to a distinct message. (Grounding: Claude's "corporate identity… managed through their own Claude account" message.) — `connector_routes.py`.

**9. Add a pre-connect consent / capability-disclosure step.** Before kicking OAuth, show a short "what this connector can access" panel (Notion's sequential model). Pairs with #5. (Grounding: Notion capabilities-disclosure screen; "clear consent for data access" in ChatGPT.) — `ConnectorsRoute.tsx` connect flow.

### P2 — power-user reach & robustness

**10. Render design/maps tool results as in-chat widgets — but get the architecture right.** Odysseus is the *host/client*; third-party servers (Canva) **emit** their own UI templates — so first **verify** whether Odysseus currently renders or flattens them, then add **host-side rendering** for one spec only (**MCP-UI** vs **OpenAI Apps SDK** — they are not interoperable; MCP-UI is the vendor-neutral choice). Note: only servers that ship templates get rich widgets; `google_maps` (a plain data server) would need an **Odysseus-authored** map render tool, not a passthrough. Honor attribution/freshness. (Grounding: Apps SDK `outputTemplate`/`structuredContent`; Canva editable preview; Google Maps grounding widget + mandatory attribution.) — new render layer + chat surface.

**11. Surface the existing custom-URL path as a guarded "developer mode."** `POST /api/connectors/custom` already exists and is SSRF-validated (`validate_public_http_url`) — give it a clear UI affordance, a prompt-injection warning, and a DNS-rebinding/redirect re-validation pass (consistent with the recent CardDAV SSRF hardening). (Grounding: ChatGPT Developer Mode; Claude custom connectors.) — `ConnectorsRoute.tsx`, reuse `connector_routes.py:/custom`.

**12. Let users name connections on "Add another."** Add a label so multiple accounts of one connector are distinguishable. (Grounding: Zapier/Make user-named connections; Notion multi-account auto-routing.) — `ConnectorsRoute.tsx`, `McpServer.name`.

**13. Extend admin "Available to users" into a per-tool lock + future-actions policy.** Let admins pin a connector read-only org-wide and choose how newly added tools behave (enable all / only new read / disable). (Grounding: Claude `toolPolicy` in `managedMcpServers`; ChatGPT Action Control's future-actions options.) — admin availability endpoints, layered above per-user `Switch`.

**14. Tool-definition-change re-consent ("rug-pull" protection).** Re-prompt when a connector's tool set/descriptions change after approval; pairs naturally with version pinning (#6). (Grounding: MCP supply-chain/rug-pull guidance; trust-tier rationale.) — `mcp_manager.py` tool-hash compare + `connector_routes.py`.

**15. Single-flight token refresh + idempotent agent write-retries with pause/resume.** Autonomous agent runs will hit expired tokens concurrently; add a refresh lock in `mcp_oauth.py`, idempotency keys for write tool calls, and a "Paused: connector needs reauthorization" run state that resumes after reconnect. (Grounding: refresh-stampede / idempotent-retry / pause-the-run guidance.) — `mcp_oauth.py`, `agent_loop.py`.

**16. Admin audit log of connector tool invocations.** Record who/what/when for connector tool calls — high value for a multi-tenant AI workspace and a natural pairing with the IDOR/isolation work already done. (Grounding: enterprise admin-control expectations across ChatGPT/Claude/Zapier.) — new audit sink + admin view.

---

## Appendix — the original issue, resolved

| Item | Status | Detail |
|---|---|---|
| **Canva MCP** | Action: run `/mcp` → "claude.ai Canva" → Authenticate | Was OAuth-pending, not failing. v2.1.195 prints the URL on headless Linux; paste the callback back. |
| **Google Maps MCP (personal)** | Blocked on your API key | `claude mcp add google-maps --env GOOGLE_MAPS_API_KEY=… -- npx -y @cablate/mcp-google-map --stdio` (enable Places API New + Routes API first). |
| **Odysseus catalog** | ✅ Patched | `connector_catalog.py` `google_maps` now uses maintained `@cablate/mcp-google-map --stdio`; 6/6 connector tests pass. |
| Google official remote MCP | Alternative | `https://mapstools.googleapis.com/mcp` (Maps Grounding Lite: `search_places`, `compute_routes`, `lookup_weather`, …) — Google Cloud auth, heavier than an env key. |

### Primary sources
Anthropic ([Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities), [Custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Auth](https://claude.com/docs/connectors/building/authentication), [Directory](https://claude.com/connectors), [Claude Code MCP](https://code.claude.com/docs/en/mcp)) · OpenAI ([Apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt), [Apps with sync](https://help.openai.com/en/articles/10847137-chatgpt-apps-with-sync), [Admin Controls](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-in-apps-enterprise-edu-and-business), [Developer mode](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt), [Apps SDK](https://developers.openai.com/apps-sdk/concepts/ux-principles)) · Notion ([AI Connectors](https://www.notion.com/help/notion-ai-connectors), [Authorization](https://developers.notion.com/docs/authorization), [Connections](https://www.notion.com/help/add-and-manage-connections-with-the-api)) · Linear ([OAuth](https://linear.app/developers/oauth-2-0-authentication), [GitHub](https://linear.app/docs/github), [Integrations](https://linear.app/integrations)) · Raycast ([MCP](https://manual.raycast.com/ai/model-context-protocol), [OAuth](https://developers.raycast.com/api-reference/oauth)) · Cursor ([MCP](https://cursor.com/docs/mcp)) · VS Code/GitHub ([MCP config](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [MCP Registry](https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/)) · Zapier ([Connections](https://help.zapier.com/hc/en-us/articles/8496290788109-Manage-your-app-connections), [Access policies](https://help.zapier.com/hc/en-us/articles/8496307974541-Manage-access-to-apps-in-Zapier)) · Make ([Connect](https://help.make.com/connect-an-application), [Connections](https://help.make.com/connections)) · Google ([Maps grounding](https://ai.google.dev/gemini-api/docs/maps-grounding)) · Canva ([MCP](https://www.canva.dev/docs/mcp/)) · Figma ([MCP](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)) · Plaid ([Update mode](https://plaid.com/docs/link/update-mode/)) · NN/g ([Error messages](https://www.nngroup.com/articles/error-message-guidelines/)) · Auth0 ([MCP auth](https://auth0.com/blog/mcp-specs-update-all-about-auth/)) · Maxim AI ([MCP RBAC](https://www.getmaxim.ai/articles/mcp-rbac-tool-level-permissions-for-production-ai-agents/)).

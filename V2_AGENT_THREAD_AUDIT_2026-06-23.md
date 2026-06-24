# Odysseus OG → v2 — Chat & Agent-Thread Experience Audit

**Date:** 2026-06-23 · **Reviewer:** QA Engineer (Claude Code) · **Scope:** the chat conversation surface and the live agent tool-thread, OG (`/`) vs v2 (`/v2`). Method: authenticated live testing of both deployed sites + code-level render-pipeline audit (workflow) of `useChat.ts`, `Message.tsx`, `ToolThread.tsx`, `artifact.ts` vs `chat.js`, `chatRenderer.js`.
**Credentials:** `Claude Code` / `iamclaude` (non-admin).

---

## Verdict

**v2 is a faithful port of OG's chat + agent-thread, not a regression.** The prior memory's four headline claims (`v2-agent-render-parity`: "ignores `round_texts`, shows raw `full_response`, leaks `edit_document` fence, lumps/collapses tools") are **refuted** by code audit. What remains is a set of **medium/low-fidelity ergonomic gaps**, plus two **shared** text-leak behaviors (present on OG too, caused by the model emitting tool calls / sources as raw text rather than via the SSE protocol).

No P0. The experience is safe to cut over; the gaps below are polish, not breakage.

---

## 1. OG baseline (what good looks like)

Live on OG, an agent chat (`glm-5.2`, web_search + document tools) renders as **interleaved `msg-ai` prose + `.agent-thread` wrappers**, one wrapper per agent round, with a `.agent-thread-node` card per tool call. Tool cards are **collapsible** (click to expand Output/Diff), diffs are **per-line colored** (add green / del red), generated images get a captioned footer, tool names are **friendly-labeled** ("Web Search" not `web_search`), commands show **full multiline**, screenshots are sanitized, and a live "thinking…" ticker + stall watchdog keep the thread feeling alive. `context_tokens` is shown as a **percentage of the model window**, not just an absolute count. Sources render as an **inline sources box** built from the `web_sources` SSE event (`buildSourcesBox`), not from a ` ```sources ` text fence.

For **document tools** (`create_document` / `edit_document` / `update_document`), OG's `stripToolBlocks` (`chatRenderer.js:408-421`) removes the fence from the prose so the artifact card is the only representation — no leaked fence text.

---

## 2. What v2 gets RIGHT (refuting the prior memory)

Code audit confirms v2 faithfully reproduces the core agent-thread model:

- **Rounds are separated.** Live streaming uses `agent_step` events to open a fresh round (`useChat.ts:348`), and on reload `buildRounds` (`useChat.ts:96-106`) reconstructs rounds from the `round_texts` metadata. The memory's "ignores `round_texts` / lumps all rounds together" claim is **false**.
- **Document fences are stripped.** `artifact.ts` `parseArtifact` removes the `create_document` fence; `TOOL_FENCE_RE` (`artifact.ts:94`) strips `edit_document` / `update_document` / `suggest_document` fences. The memory's "leaked `edit_document` fence" claim is **false** (verified live: document-tool chats render a clean artifact card, no fence in prose).
- **Per-tool cards, not collapsed.** `ToolThread.tsx` renders one `ToolRow` per tool (`tool_start` → `tool_output`), with images/diffs/screenshots forwarded (`useChat.ts:328-337`). The memory's "lumps/collapses tools" claim is **false**.
- **Not raw `full_response`.** v2 builds display text from streamed `delta` + cleaned round text, not the mashed `full_response` blob. The memory's "shows raw `full_response`" claim is **false**.
- **Streaming E2E works live.** send → delta → tool cards → metrics → regenerate all verified on the deployed site.

---

## 3. Real gaps (medium/low fidelity, v2-specific)

These are genuine ergonomic regressions vs OG — not breakage, but visible quality drops on agent threads:

| # | Gap | OG | v2 | Location | Severity |
|---|---|---|---|---|---|
| 1 | **` ```web_search ` fence not stripped** | stripped (`EXEC_FENCE_RE`) | **leaked** (`TOOL_FENCE_RE` only covers edit/update/suggest) | `artifact.ts:94` vs `chatRenderer.js:410` | **P1** |
| 2 | **context-tokens shown absolute, no %** | % of model window | raw token count | `Message.tsx:303-311` | P2 |
| 3 | **per-tool Output/Diff not collapsible** | `<details>` toggle | bare `<pre>` capped 4000 chars | `ToolThread.tsx:27-30` | P2 |
| 4 | **diffs plain, not per-line colored** | add/del colored lines | plain `<pre>` | `ToolThread.tsx:27-29` | P2 |
| 5 | **generated images have no captioned footer** | captioned footer | bare `<img>` | `ToolThread.tsx:32` | P2 |
| 6 | **raw tool name, no friendly label** | "Web Search" | `web_search` | `ToolThread.tsx:22` | P2 |
| 7 | **command truncated** | full multiline | first line / 90 chars | `ToolThread.tsx:23` | P2 |
| 8 | **Reasoning is plain text, no markdown** | markdown-rendered thinking | plain text | `Message.tsx:122-137` | P2 |
| 9 | **sources as side-panel button, not inline box** | inline sources box | "N sources" button → panel | `Message.tsx:275-278` | P2 |
| 10 | **no live "thinking…" ticker / stall watchdog** | present | absent | `useChat.ts` | P2 |
| 11 | **no background/cross-session stream-completion toast** | present | absent | `useChat.ts` | P2 |
| 12 | **silent model fallback** (no notice on teacher_takeover-style swaps) | surfaced | only `teacher_takeover`/`escalation_failed` | `useChat.ts:365-368` | P2 |
| 13 | **screenshot not sanitized** | sanitized | raw forwarded | `useChat.ts:328-337` | P2 |

**Gap #1 is the only P1** and the highest-value fix: extend v2's `TOOL_FENCE_RE` to also strip `web_search` / `read_file` / `write_file` fences (mirror OG's `EXEC_FENCE_RE`). One regex change closes the one fence class OG strips that v2 doesn't.

---

## 4. Shared behaviors (NOT v2 regressions — present on OG too)

Observed live on v2 and traced to **model/backend behavior**, not v2 rendering. OG exhibits the same because it uses the same backend and (for these two) the same stripping logic:

- **Bare `web_search {"query":…}` text in prose.** When `glm-5.2` emits a tool call as **bare prose** (no ` ```web_search ` fence, no `[TOOL_CALL]` tag), neither app strips it: OG's `TOOL_CALL_RE` only matches `[TOOL_CALL]…[/TOOL_CALL]` and `EXEC_FENCE_RE` only matches fenced blocks. **Both render the bare `web_search {…}` as text.** This is a model emission issue, not a v2 gap. (When the model *does* fence it, OG strips and v2 leaks — that's Gap #1.)
- **` ```sources ` fence leaked as a code block.** Neither `EXEC_FENCE_RE` (OG) nor `TOOL_FENCE_RE` (v2) includes `sources`. The backend emits both a `web_sources` SSE event (→ v2 sources button / OG inline box) **and** the ` ```sources ` text in the `delta` content, so **both apps render the fence verbatim as a code block** in addition to their structured sources UI. Shared double-emission; fix belongs in the backend (don't send the ` ```sources ` text in `delta` once sources are emitted as an event) or in a shared strip step.

**Action (shared, backend):** stop including the ` ```sources ` fence in the streamed `delta` once a `web_sources` event has been emitted, so neither app shows the redundant code block.

---

## 5. Compare-mode agent thread (carried from the broader QA)

Separate from single-chat, Compare panes drop non-`delta` SSE events (`CompareRoute.tsx:281-291`): `tool_start` / `tool_output` / `image_url` are not handled, so agent-mode panes show streamed text but **no tool cards**, and image-model panes render empty. This is a confirmed P1 on Compare specifically (not the main chat thread). Fix: add the three event branches mirroring `useChat.ts:324-337`.

---

## 6. Recommendations (prioritized)

1. **(P1, one-line) Strip `web_search`/`read_file`/`write_file` fences in v2** — add them to `TOOL_FENCE_RE` in `web/src/lib/artifact.ts:94` to match OG's `EXEC_FENCE_RE`. Closes Gap #1.
2. **(P1, Compare) Add `tool_start`/`tool_output`/`image_url` branches** in `CompareRoute.tsx:281-291` so agent/image panes render.
3. **(P2, shared/backend) Stop emitting ` ```sources ` text in `delta`** once `web_sources` event fires — removes the redundant code block on both apps.
4. **(P2, polish sprint) The ToolThread fidelity cluster** (Gaps #2–13): collapsible Output/Diff `<details>`, per-line colored diffs, friendly tool labels, full multiline command, image footer, markdown Reasoning, context-% , live ticker / stall watchdog, background-stream toast. These collectively bring v2's agent thread to OG's polish level.
5. **(Memory) Update `v2-agent-render-parity`** — its four headline claims are refuted; the real gap list is this audit's §3.

---

## 7. Bottom line

The v2 chat + agent-thread is a **correct, faithful port** of OG's. The prior "render parity" memory overstated the problem — v2 separates rounds, strips document fences, renders per-tool cards, and does not show raw `full_response`. The remaining gaps are **one P1 fence-strip fix + one P1 Compare fix + a P2 polish cluster**, plus two **shared** text-leak behaviors that belong to the model/backend, not v2. Nothing here blocks cutover; Gap #1 + the Compare fix are the only items worth doing before default-cutover.
# Odysseus v2 — AI Workspace UX & Workflow‑Optimization Plan
**Date:** 2026‑06‑24 · **Author:** QA/PM pass (Claude) · **Sources:** Mobbin (real web AI products) + 21st.dev / Magic MCP (component patterns)

This plan turns competitive UX research into a prioritized, surface‑by‑surface roadmap for the Odysseus v2 React workspace. It is deliberately aligned with the parallel **whole‑codebase "no silent failures" QA** — the same principle ("never fail silently") applies to the UI: every async surface must show loading / empty / error, and every agent step must show explicit status.

---

## 1. What best‑in‑class AI workspaces do (research basis)

| Surface | Pattern observed | Reference screens |
|---|---|---|
| **Composer** | Input is the command center: inline capability pills (Search · Reason · Deep research · Create image), attach (+), mic/voice, model picker with one‑line descriptions and **reasoning‑effort** | ChatGPT [composer pills](https://mobbin.com/screens/c6447afb-8253-4556-bc9e-93e87cb080f9), [model dropdown](https://mobbin.com/screens/e76a50ef-84d0-480e-8d9d-9d15efcbc52d); Cursor [multi‑model + effort](https://mobbin.com/screens/5086a06b-e76b-49ad-a5e4-c2100759b758) |
| **Empty / landing** | Centered "What can I help with?" + centered input + tailored suggestion chips | ChatGPT [empty state](https://mobbin.com/screens/2a8d4b15-5c45-4999-bd3c-8b9ef866e316) |
| **Sidebar / history** | Date‑grouped, searchable, pinnable threads; projects/collections with **colored labels**; **skeleton loaders** (no blank panels) | Sana AI [collections+skeletons](https://mobbin.com/screens/67badb84-c7a8-40c6-a056-145579a97cdb), [history](https://mobbin.com/screens/7618a94b-e66b-4811-8a98-03d7985997dc) |
| **Agent run** | Right‑hand **Computer / Deliverables** tabs; **per‑step status + elapsed time + success/fail badges**; run queue with a "To Review" count | WRITER [run+deliverables](https://mobbin.com/flows/05b3c653-52ee-4323-8170-2cb7e314c0da); StackAI [run progress](https://mobbin.com/flows/ccd6c5b7-03d6-497e-bff6-bb262fd8ee64); Relevance AI [running agent](https://mobbin.com/flows/15552b10-8c6a-49ef-a2b4-d92c80bd5b0f) |
| **Sources / context** | Right panel of sources; **@‑mention to add files/collections**; upload file/image inline | Sana AI [running a task](https://mobbin.com/flows/c817c473-688a-4554-acc0-42f14086fcd3) |
| **Command palette** | ⌘K with scoped context chip, **grouped** results (Actions / Recent / Pages), **per‑row keyboard hints**, footer nav legend + result count | Linear [palette](https://mobbin.com/screens/8a6d227b-63e6-483c-925f-d256d0989a10); Vapi [⌘K](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b); Fey [shortcuts](https://mobbin.com/screens/ff52ac90-4d18-4765-98da-df1e362a5ee1) |
| **AI canvas / artifact** | Split chat ↔ document; AI edits proposed as **Apply revision / Reject** (no silent overwrite); affected region highlighted; doc toolbar + export; skeleton while streaming | MS Copilot [suggest→apply](https://mobbin.com/screens/976de619-328b-4989-8d92-8f1a1aa36365); Langdock [canvas](https://mobbin.com/screens/579fb137-50fa-42d0-9222-4970f35648d5) |
| **Message actions** | Hover‑revealed action cluster + overflow (copy · copy‑link · regenerate · edit · branch); destructive in red | Discord [message menu](https://mobbin.com/screens/bbf7f045-4893-497c-80c1-c716fce4891a); Twist [actions](https://mobbin.com/screens/a0f85236-3218-4d65-9667-2228653229b6) |

---

## 2. Design principles
1. **Never fail silently in the UI.** Every fetch/mutation has loading + empty + error states; every agent tool step shows running / success / **failed**. (Mirrors the codebase QA goal.)
2. **Composer is the command center.** Capability, model, effort, tools, attachments, voice all reachable from the input.
3. **Guided entry, progressive disclosure.** Personalized suggestion chips on empty state; advanced controls tucked behind disclosure.
4. **Keyboard‑first.** ⌘K palette + per‑row shortcuts + a discoverable legend make power use fast.
5. **Suggest‑then‑apply for AI edits.** AI never silently rewrites a user's document; it proposes, the user accepts/rejects, version history records it.
6. **Consistent affordances.** One message‑action cluster, one menu pattern, one destructive‑red convention everywhere.

---

## 3. Prioritized initiatives (mapped to v2 surfaces)

> v2 already has: streaming chat, model endpoints, slash commands, contextual right panel (sources), live artifact panel + editable artifacts + version history, Projects, shareable links, personalization/onboarding, global shortcuts + help overlay, compare mode. These initiatives **upgrade** those, not build from zero.

### P0 — highest leverage (also closes "silent UI" gaps)
- **A. Agent run timeline with explicit per‑step status + timing + deliverables panel.**
  Render each tool step as running → success/**failed** with elapsed time; collect outputs in a Deliverables/Artifacts tab. Directly fixes invisible/lumped tool steps and surfaces failures the user currently can't see. *Where:* `Message`/`ToolThread`/`AgentRound` in v2. *Build aid:* 21st.dev **"Agent Plan"** component (lucide status icons + framer‑motion task/subtask tree with status, priority, per‑step tools) is a near‑drop‑in basis.
- **D. Canvas "suggest → Apply / Reject" for artifact edits.** Replace silent overwrite of editable artifacts with a proposed‑diff card (Apply revision / Reject), region highlight, version‑history entry. *Where:* live document/artifact panel.
- **I. Frontend "no silent failures" sweep.** Skeleton loaders, explicit empty/error states, `res.ok` checks, no `.catch(()=>{})`. *Where:* all v2 data hooks / SSE parsing. (The QA workflow's `fe-v2` + `fe-legacy` findings feed this directly.)

### P1 — workflow speed
- **B. ⌘K command palette upgrade** — scoped chip, grouped (Actions / Recent / Navigate / Skills), per‑row shortcut hints, footer legend + count. *Where:* global shortcuts + slash‑command registry.
- **C. Composer capability pills + model/effort picker** — surface Search / Deep research / Compare / Create image as pills; model dropdown with descriptions + reasoning‑effort. *Where:* composer + model endpoints.
- **G. Sources/context side panel with @‑mention** to add files/collections/memory as context. *Where:* contextual right panel.

### P2 — polish & consistency
- **E. Guided empty state** with personalized suggestion chips. *Where:* onboarding/personalization.
- **F. Sidebar** date‑grouped + searchable + pinnable + colored project labels + skeletons. *Where:* sidebar/Projects.
- **H. Consistent message‑action cluster** (copy · copy‑link · regenerate · edit · branch), reusing existing shareable links for copy‑link. *Where:* per‑message actions.

---

## 4. Workflow‑optimization layer (do things faster)
- **⌘K everywhere** with recents + per‑row shortcuts (Linear/Vapi pattern).
- **Slash commands + @‑context** unified in the composer.
- **Compare with per‑model effort** (Cursor's multi‑model + effort selector) layered onto existing compare mode.
- **Run queue / "To Review"** surface for detached agent runs (Relevance AI), building on v2's existing reconnect‑to‑detached‑runs.
- **Discoverable keyboard legend** in the help overlay.

---

## 5. Sequencing
- **Phase 1 (this cycle):** A + D + I — they deliver the most value *and* close silent‑failure UX gaps in lockstep with the codebase QA.
- **Phase 2:** B + C + G — the speed layer.
- **Phase 3:** E + F + H — guided entry, sidebar, and affordance consistency.

---

## 6. Implementation notes (from Magic / 21st.dev)
- **Agent timeline:** 21st.dev *Agent Plan* — `lucide-react` status icons (`CheckCircle2` / `CircleDotDashed` / `CircleX` / `Circle` / `CircleAlert`) + `framer-motion`, a task→subtask tree carrying `status`, `priority`, and per‑step `tools`. Adapt to Odysseus's agent‑round/tool‑step model.
- **Command palette & AI prompt input:** matching 21st.dev components exist and can be generated via the Magic builder at implementation time; full snippets were captured to the session's `tool-results/` for reference.

*All screen citations link to Mobbin for side‑by‑side reference.*

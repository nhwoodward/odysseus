# Odysseus v2 — QA + Design Audit

_2026-06-26 · QA Engineer + Lead Product Designer review · code + Mobbin benchmarks + Magic references_

Severity: **P0** = broken/blocking or critical a11y · **P1** = significant polish/correctness gap · **P2** = nice-to-have.
Paths are under `web/src/`.

---

## A. Design system & visual consistency (Lead Designer)

**Maturity:** ~3 shared primitives only (`Button`, `Switch`, settings `fields.tsx`). ~60% of UI is ad-hoc Tailwind. Card / Input / Dialog / Badge / EmptyState / Skeleton / IconButton are all reimplemented per-file.

| # | Issue | Severity | Evidence |
|---|---|---|---|
| A1 | **No Dialog primitive** — 15+ hand-rolled modal overlays (`bg-black/40` + `rounded-xl border bg-popover p-4 shadow-lg animate-pop-in`), inconsistent shadow/padding/max-width; most lack focus-trap/escape | P1 | `routes/SkillsRoute.tsx:66,108,159,195,254,285`, `routes/ChatConsole.tsx:56`, `components/chat/ComposerControls.tsx:51,150`, `components/chat/Message.tsx:25,67`, `components/onboarding/OnboardingDialog.tsx` |
| A2 | **No Input primitive** — 80+ inline strings, 3–4 variants (`h-8` vs `h-9`, `px-2` vs `px-3`) | P1 | `routes/SkillsRoute.tsx:9`, `routes/ProjectsRoute.tsx:68`, `routes/SettingsRoute.tsx` (`inpCls`/`taCls`/`selectCls`), `components/settings/fields.tsx:10` |
| A3 | **No Card primitive** — `rounded-lg border bg-card p-{2,2.5,3}` repeated ~100+× with drifting padding | P1 | `routes/ProjectsRoute.tsx:126,139`, most routes |
| A4 | **No Badge/pill primitive** — heights/padding/text vary (`py-0.5` vs `py-1`, `text-[10px]` vs `[11px]`) | P1 | `routes/SkillsRoute.tsx:46`, `routes/SettingsRoute.tsx:119,123`, `components/chat/DocHistory.tsx:56` |
| A5 | **No IconButton variant** — `rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground` repeated ~30× | P2 | `routes/ProjectsRoute.tsx:61,102`, `routes/NotesRoute.tsx:206,213`, `components/settings/fields.tsx:92,98` |
| A6 | **Hardcoded hex bypassing tokens** (breaks theming) | P1 | `routes/NotesRoute.tsx` (note palette #fee2e2…), `routes/SettingsRoute.tsx:223` (accent palette), `routes/CalendarRoute.tsx` (#5b8abf), `routes/CompareRoute.tsx` (inline hex) |
| A7 | **Typography off-scale** — `text-[9px]/[10px]/[11px]/[13px]/[15px]` (40+ sites) | P2 | `routes/NotesRoute.tsx:161`, `components/chat/Message.tsx:169,171`, `components/chat/DocHistory.tsx:23` |
| A8 | Radius/shadow used without hierarchy (md/lg/xl/2xl interchangeably; shadow-sm…2xl) | P2 | app-wide |

**Mobbin benchmark:** Connectors already matches Claude's Directory; chat composer matches Le Chat/ChatGPT/Grok. Highest-leverage fixes: **Dialog → Input → Card → EmptyState/Skeleton → Badge → IconButton** (top 3 remove ~40% of inconsistency + ~300 LOC).

---

## B. UX states · responsiveness · accessibility (QA + Designer)

| # | Issue | Severity | Evidence |
|---|---|---|---|
| B1 | **Sidebar collapsed icon-rail: all icon buttons missing `aria-label`** (sessions, account, workspace toggle, drag-reorder) — WCAG A | P0 | `components/shell/Sidebar.tsx` (collapsed render) |
| B2 | **Color-only status badges** (success/error/running, fit levels) — colorblind users can't distinguish | P1 | `routes/TasksRoute.tsx` (run status), `routes/CookbookRoute.tsx:17,234` (fit/status tones), `routes/CalendarRoute.tsx` (importance/overdue) |
| B3 | **~50% of routes render blank empty states** (no icon/heading/CTA) | P1 | `routes/ResearchRoute.tsx`, `MemoryRoute.tsx`, `PersonalRoute.tsx`, `RagRoute.tsx`, `ProjectsRoute.tsx` |
| B4 | **Password inputs label-less** (placeholder only) | P1 | `routes/SettingsRoute.tsx:110-125` |
| B5 | Notes canvas tools (pen/eraser/text/line/circle/undo) — no keyboard nav, no `aria-label` | P1 | `routes/NotesRoute.tsx` (DrawingPad) |
| B6 | Icon-only toolbar/action buttons lack `aria-label` (editor toolbar, doc rows, bulk actions) | P1 | `routes/DocumentsRoute.tsx`, `routes/RagRoute.tsx`, `routes/MemoryRoute.tsx`, `routes/ProjectsRoute.tsx` |
| B7 | Dialogs lack focus-trap / Escape / focus-return | P1 | all ad-hoc modals (fixed by Dialog primitive, A1) |
| B8 | Gallery editor `<iframe>` lacks `title`/label; legacy bridge | P2 | `routes/GalleryRoute.tsx` |
| B9 | Research progress bar lacks `aria-valuenow/max`; collapsibles lack `aria-expanded` | P2 | `routes/ResearchRoute.tsx`, `routes/EmailRoute.tsx` (FoldedPlainEmailBody) |
| B10 | ~40% routes weak error visibility (failures swallowed) | P1 | `EmailRoute`, `DocumentsRoute`, `MemoryRoute` |
| B11 | Fixed-width tables risk mobile overflow | P2 | `routes/CompareRoute.tsx` (min-w-[760px]), `routes/CookbookRoute.tsx` |

**Route polish ranking** — strongest: Compare, Cookbook, Settings, Skills, Email, Calendar. Roughest: Projects, Research, Personal, Rag, Sidebar (collapsed), ComingSoon (stub). **Mobbin empty-state gold standard:** icon/illustration + heading + supporting text + primary CTA (Steep/Typeform/Quicken/HoneyBook).

---

## C. Correctness · robustness · performance (QA Engineer)

| # | Issue | Severity | Evidence |
|---|---|---|---|
| C1 | **No route code-splitting** — `App.tsx` eagerly imports all 18 routes → single ~1.9 MB / 544 KB gz chunk | P1 | `App.tsx`; heavy deps (katex, highlight.js, rehype, framer-motion, react-markdown) all upfront |
| C2 | **No list virtualization** — full DOM for 100s–1000s of items | P1 | `routes/GalleryRoute.tsx:446`, `routes/EmailRoute.tsx:1950`, `routes/DocumentsRoute.tsx`, `routes/MemoryRoute.tsx` |
| C3 | **Silent failures** — `.catch(()=>{})` / `.catch(()=>({}))` / missing `res.ok` | P1 | `api/admin.ts:77`, `api/compare.ts:46,60`, `lib/useChat.ts:311,669`, `components/shell/NoteReminderPoller.tsx:243` |
| C4 | SSE/poll races — no AbortController on per-item patches; stale-closure risk in `handleEvent` | P2 | `lib/useChat.ts:505`, `NoteReminderPoller.tsx:215-259`, `routes/CompareRoute.tsx:841` |
| C5 | Only 3 `React.memo` in the codebase; large monolith routes re-render fully | P2 | `Composer.tsx` (1669 LOC), `EmailRoute.tsx` (2477), `CalendarRoute.tsx` (2012) |
| C6 | Fast pollers (1.5–4 s) without jitter/backoff | P2 | `api/skills.ts:119` (1.5 s), `api/research.ts:144` (4 s) |
| C7 | Test coverage ~15% — critical paths (chat, email, notes, tasks) untested | P2 | 18 test files / 117 source |

---

## Prioritized execution order (lead with design system + visual polish)

1. **Phase 1 — primitives:** Dialog, Input/Textarea, Card, Badge (color+text → fixes B2 at source), EmptyState, Skeleton, IconButton + `index.css` tokens (fixes A1–A8, B7).
2. **Phase 2 — apply across all 17 routes:** swap ad-hoc → primitives; add EmptyState (B3) + Skeleton + surfaced errors (B10); normalize typography/radius/spacing.
3. **Phase 3 — a11y:** B1 (Sidebar) first, then B4/B5/B6/B8/B9.
4. **Phase 4 — perf:** C1 (lazy routes) → C2 (virtualize) → C3 (silent failures) → C5/C6.

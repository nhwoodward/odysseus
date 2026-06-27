import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, Loader2, CheckCircle2, AlertCircle, FileCode2, Image as ImageIcon, BookOpen } from "lucide-react"
import { ToolStatusIcon, ToolStepDetail } from "./ToolThread"
import { StreamingMarkdown } from "./Markdown"
import { usePanel } from "@/stores/panel"
import { apiJson } from "@/lib/api"
import { useNow, formatElapsed } from "@/lib/useNow"
import { buildRunSummary, toolHasDetail, toolLabel, type Deliverable } from "@/lib/agentRun"
import { safeHref } from "@/lib/safeImage"
import { cn } from "@/lib/utils"
import type { ToolEvent } from "@/types"

// One agent round, cleaned for display: the model's prose for that step plus the
// tools it then ran. Mirrors the `cleanRoundText` output assembled in Message.
export interface TimelineRound { display: string; tools: ToolEvent[] }

// A single step on the vertical rail. The status glyph sits on the connector
// line as the node (ringed by the card background so the line tucks behind it);
// clicking expands the reused per-step detail (command / output / diff / image).
// This is the React form of the legacy `.agent-thread-node`.
function StepNode({ t }: { t: ToolEvent }) {
  const [open, setOpen] = useState(false)
  const [start] = useState(() => Date.now())
  const now = useNow(!!t.running)
  const detail = toolHasDetail(t)
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-px flex size-[15px] items-center justify-center rounded-full bg-card ring-4 ring-card">
        <ToolStatusIcon t={t} />
      </span>
      <button
        type="button"
        disabled={!detail}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-1.5 py-0.5 text-left", !detail && "cursor-default")}
      >
        {detail && <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />}
        <span className="font-medium text-foreground">{toolLabel(t.name)}</span>
        {t.running && <span className="text-label tabular-nums text-muted-foreground/70">{formatElapsed(now - start)}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pb-1 pt-0.5"><ToolStepDetail t={t} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

// A round's tool steps as a connected vertical timeline (single rail line behind
// the ringed status nodes).
function TimelineGroup({ tools }: { tools: ToolEvent[] }) {
  return (
    <ol className="relative space-y-2.5 py-0.5 text-xs">
      <span aria-hidden className="absolute left-[7px] top-2.5 bottom-2.5 w-px bg-border/70" />
      {tools.map((t, i) => <StepNode key={i} t={t} />)}
    </ol>
  )
}

// Open a deliverable in the right-hand ContextPanel (reusing the same panel the
// artifact card and file list use), or a new tab for an image.
async function openDeliverable(d: Deliverable) {
  const p = usePanel.getState()
  if (d.kind === "doc") {
    p.showDoc(d.title, d.language)
    if (d.docId) {
      p.setDocId(d.docId)
      try {
        const doc = await apiJson<{ current_content?: string }>(`/api/document/${d.docId}`)
        if (usePanel.getState().doc?.docId === d.docId) p.setDocContent(doc.current_content || "")
      } catch {
        if (usePanel.getState().doc?.docId === d.docId) p.setDocError("Couldn’t load this document.")
      }
    } else if (d.content != null) {
      p.setDocContent(d.content)
    }
  } else if (d.kind === "sources") {
    p.show("sources", { title: "Sources", payload: d.sources || [] })
  } else if (d.kind === "image" && d.url) {
    const href = safeHref(d.url)
    if (href) window.open(href, "_blank", "noopener")
  }
}

function DeliverableChip({ d }: { d: Deliverable }) {
  const Icon = d.kind === "image" ? ImageIcon : d.kind === "sources" ? BookOpen : FileCode2
  return (
    <button
      type="button"
      onClick={() => openDeliverable(d)}
      title={d.title}
      className="inline-flex max-w-52 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-label text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{d.title}</span>
    </button>
  )
}

// The agent-run timeline: a collapsible run header (overall status + done/total
// step count + live elapsed) over the model's per-round prose interleaved with a
// connected timeline of its tool steps, plus a Deliverables strip. Restores the
// legacy "agent thread" structure V2 had flattened into one tool card, and adds
// the run-level overview + deliverables (UX-plan Initiative A). Collapsing the
// header hides the step timelines but keeps the prose answer and deliverables.
export function AgentTimeline({ rounds, streaming, streamStartAt, deliverables }: {
  rounds: TimelineRound[]
  streaming: boolean
  streamStartAt?: number
  deliverables: Deliverable[]
}) {
  const summary = buildRunSummary(rounds)
  const [open, setOpen] = useState(true)
  const now = useNow(streaming)
  const lastIdx = rounds.length - 1

  // A rare multi-round, text-only turn (no tools): just render the prose with no
  // run chrome — there are no steps to time or summarize.
  if (summary.total === 0) {
    return <>{rounds.map((r, i) => (r.display ? <StreamingMarkdown key={i} content={r.display} streaming={streaming && i === lastIdx} /> : null))}</>
  }

  const elapsed = streaming && streamStartAt ? formatElapsed(now - streamStartAt) : ""
  const StatusIcon = summary.running ? Loader2 : summary.error ? AlertCircle : CheckCircle2
  const statusClass = summary.running ? "animate-spin text-muted-foreground" : summary.error ? "text-destructive" : "text-emerald-500"

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")} />
        <StatusIcon className={cn("size-3.5", statusClass)} />
        <span className="font-medium text-foreground">{summary.running ? "Working…" : "Agent run"}</span>
        <span className="tabular-nums">· {summary.done}/{summary.total} step{summary.total === 1 ? "" : "s"}</span>
        {elapsed && <span className="tabular-nums text-muted-foreground/70">· {elapsed}</span>}
      </button>

      {rounds.map((r, i) => (
        <div key={i} className="space-y-2">
          {r.display && <StreamingMarkdown content={r.display} streaming={streaming && i === lastIdx} />}
          {open && r.tools.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
              <TimelineGroup tools={r.tools} />
            </motion.div>
          )}
        </div>
      ))}

      {deliverables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-label font-medium text-muted-foreground">Deliverables</span>
          {deliverables.map((d, i) => <DeliverableChip key={i} d={d} />)}
        </div>
      )}
    </div>
  )
}

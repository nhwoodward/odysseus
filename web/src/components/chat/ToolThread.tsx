import { useState } from "react"
import { ChevronRight, Terminal, Loader2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { safeImageSrc } from "@/lib/safeImage"
import { useNow, formatElapsed } from "@/lib/useNow"
import { visibleCommand } from "@/lib/agentRun"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import type { ToolEvent, ToolDiff } from "@/types"

// One hunk of a unified diff, colored per line like the legacy UI
// (chatRenderer.js: diff-add / diff-del / diff-ctx / diff-meta / diff-hunk).
export function DiffView({ diff, open, onToggle }: { diff: ToolDiff; open: boolean; onToggle: () => void }) {
  const stat = [
    diff.new_file ? "new" : "",
    diff.added ? `+${diff.added}` : "",
    diff.removed ? `−${diff.removed}` : "",
  ].filter(Boolean).join("  ")
  const rows = (diff.text || "").split("\n").map((line, i) => {
    let cls = "text-muted-foreground"
    let text = line
    if (line.startsWith("+++") || line.startsWith("---")) cls = "text-muted-foreground/50"
    else if (line.startsWith("@@")) cls = "text-blue-500"
    else if (line.startsWith("+")) { cls = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"; text = line.slice(1) }
    else if (line.startsWith("-")) { cls = "bg-rose-500/10 text-rose-700 dark:text-rose-400"; text = line.slice(1) }
    else if (line.startsWith(" ")) text = line.slice(1)
    return <span key={i} className={cn("block whitespace-pre-wrap px-1", cls)}>{text || " "}</span>
  })
  return (
    <div className="mt-1">
      <button onClick={onToggle} className="flex w-full items-center gap-1.5 text-label text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className={cn("size-3 transition-transform duration-200", open && "rotate-90")} />
        <span className="font-mono">{diff.file || "diff"}</span>
        {stat && <span className="text-muted-foreground/60">{stat}</span>}
      </button>
      {open && <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-1 text-label leading-relaxed">{rows}</pre>}
    </div>
  )
}

// Status glyph for a tool step (running spinner / non-zero exit X / success
// check). Shared by the flat ToolThread rows and the AgentTimeline rail nodes
// so both stay in lockstep.
export function ToolStatusIcon({ t }: { t: ToolEvent }) {
  const err = t.exitCode != null && t.exitCode !== 0
  return t.running
    ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
    : err
      ? <X className="size-3.5 shrink-0 text-destructive" />
      : <Check className="size-3.5 shrink-0 text-emerald-500" />
}

// The expandable body of a tool step: full (multiline) command, live progress,
// per-line colored diff, output, and generated image / browser screenshot.
// Extracted from ToolRow so the AgentTimeline reuses the exact same per-step
// rendering instead of drifting a second copy.
export function ToolStepDetail({ t }: { t: ToolEvent }) {
  const cmd = visibleCommand(t)
  const image = safeImageSrc(t.imageUrl) || safeImageSrc(t.screenshot)
  const diff = t.diff?.text
  const [outOpen, setOutOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  return (
    <>
      {cmd && !diff && (
        <Collapsible className="mt-1">
          <CollapsibleTrigger asChild>
            <button className="group flex cursor-pointer items-center gap-1 font-mono text-label text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
              <span className="truncate">{cmd.split("\n")[0]}</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-label leading-relaxed">{cmd}</pre>
          </CollapsibleContent>
        </Collapsible>
      )}
      {t.running && t.progress && <div className="mt-1 truncate pl-5 font-mono text-label text-muted-foreground">{t.progress}</div>}
      {diff && <DiffView diff={t.diff!} open={diffOpen} onToggle={() => setDiffOpen((o) => !o)} />}
      {t.output && !diff && (
        <div className="mt-1">
          <button onClick={() => setOutOpen((o) => !o)} className="flex items-center gap-1 text-label text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className={cn("size-3 transition-transform duration-200", outOpen && "rotate-90")} />
            <span>Output</span>
          </button>
          {outOpen && <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-label leading-relaxed">{String(t.output).slice(0, 4000)}</pre>}
        </div>
      )}
      {/* Generated image / browser screenshot — sanitized src + prompt caption. */}
      {image && (
        <figure className="mt-1.5">
          <img src={image} alt={t.imagePrompt || t.name} className="max-h-64 rounded border" />
          {(t.imagePrompt || t.name) && (
            <figcaption className="mt-1 truncate text-micro text-muted-foreground">{t.imagePrompt || t.name}</figcaption>
          )}
        </figure>
      )}
    </>
  )
}

function ToolRow({ t }: { t: ToolEvent }) {
  // Live elapsed timer on the running step — captured at mount (tool_start
  // adds the row, so mount ≈ step start) and frozen once it settles.
  const [start] = useState(() => Date.now())
  const now = useNow(!!t.running)
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5">
        <ToolStatusIcon t={t} />
        <span className="font-medium text-foreground">{t.name}</span>
        {t.running && <span className="text-label tabular-nums text-muted-foreground/70">{formatElapsed(now - start)}</span>}
      </div>
      <ToolStepDetail t={t} />
    </div>
  )
}

// Flat tool card — used for a plain (non-agent) reply that ran a tool or two,
// where the run-level timeline would be overkill. Agent turns render the
// connected AgentTimeline instead.
export function ToolThread({ tools, defaultOpen = false }: { tools: ToolEvent[]; defaultOpen?: boolean }) {
  const anyRunning = tools.some((t) => t.running)
  // Collapsed by default — expand to inspect each step's command and output.
  // Agent turns pass defaultOpen so the steps are visible like the legacy UI.
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card text-xs">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")} />
          {anyRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Terminal className="size-3.5" />}
          <span>{anyRunning ? "Working…" : `${tools.length} step${tools.length > 1 ? "s" : ""}`}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2.5 border-t px-3 py-2">
          {tools.map((t, i) => <ToolRow key={i} t={t} />)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

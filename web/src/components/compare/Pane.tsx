import { useMemo } from "react"
import {
  Check,
  Code2,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Square,
  X,
  Zap,
} from "lucide-react"
import { Markdown } from "@/components/chat/Markdown"
import { IconButton } from "@/components/ui/IconButton"
import { cn } from "@/lib/utils"
import { formatElapsed, type GradeStatus, type PaneMetrics } from "@/components/compare/util"

function extractHtmlFromText(text: string): string | null {
  const fenceRe = /`{3,}(?:html)?\s*\r?\n([\s\S]*?)`{3,}/gi
  let match: RegExpExecArray | null
  while ((match = fenceRe.exec(text)) !== null) {
    const code = match[1].trim()
    if (/<!doctype\s+html|<html[\s>]/i.test(code)) return code
  }
  const bare = text.match(/(<!doctype\s+html[\s\S]*<\/html>)/i) || text.match(/(<html[\s>][\s\S]*<\/html>)/i)
  return bare ? bare[1].trim() : null
}

export function Pane({
  side,
  model,
  body,
  win,
  met,
  running,
  err,
  onCopy,
  copied,
  onExpand,
  expanded,
  hidden,
  fastest,
  elapsedMs,
  previewOpen,
  onTogglePreview,
  onReroll,
  canReroll,
  rerolling,
  grade,
  activityLabel = "Generating...",
  onStop,
  canStop,
}: {
  side: string
  model: string
  body: string
  win: boolean
  met: PaneMetrics | null
  running: boolean
  err?: string
  onCopy: () => void
  copied: boolean
  onExpand: () => void
  expanded: boolean
  hidden: boolean
  fastest: boolean
  elapsedMs: number | null
  previewOpen: boolean
  onTogglePreview: () => void
  onReroll: () => void
  canReroll: boolean
  rerolling: boolean
  grade: GradeStatus | null
  activityLabel?: string
  onStop: () => void
  canStop: boolean
}) {
  const htmlPreview = useMemo(() => extractHtmlFromText(body), [body])
  const previewActive = previewOpen && !!htmlPreview

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col rounded-md border bg-card", win && "ring-2 ring-primary", hidden && "hidden")}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{side}</span>
            {grade && (
              <span
                title={grade === "pass" ? "Response contains the expected answer" : "Expected answer not found in response"}
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-micro font-semibold",
                  grade === "pass" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive",
                )}
              >
                {grade === "pass" ? <Check className="size-3" /> : <X className="size-3" />}
              </span>
            )}
            {fastest && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider text-primary"><Zap className="size-3" />Fastest</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={model}>{model}</div>
        </div>
        <div className="ml-2 flex shrink-0 flex-wrap items-center justify-end gap-0.5 md:flex-nowrap">
          {canStop && (
            <IconButton icon={<Square />} label="Stop this model" onClick={onStop} className="text-muted-foreground hover:text-destructive" />
          )}
          {htmlPreview && (
            <IconButton
              icon={previewActive ? <Code2 /> : <Play />}
              label={previewActive ? "Show code" : "Run preview"}
              onClick={onTogglePreview}
              className={cn("text-muted-foreground", previewActive && "text-primary")}
            />
          )}
          <IconButton
            icon={rerolling ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            label="Re-roll response"
            onClick={onReroll}
            disabled={!canReroll}
            className="text-muted-foreground disabled:pointer-events-none disabled:opacity-35"
          />
          <IconButton
            icon={copied ? <Check /> : <Copy />}
            label="Copy response"
            onClick={onCopy}
            disabled={!body}
            className="text-muted-foreground disabled:pointer-events-none disabled:opacity-35"
          />
          <IconButton
            icon={expanded ? <Minimize2 /> : <Maximize2 />}
            label={expanded ? "Collapse pane" : "Expand pane"}
            onClick={onExpand}
            className="text-muted-foreground"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {previewActive && htmlPreview ? (
          <iframe title={`${side} HTML preview`} sandbox="allow-scripts" srcDoc={htmlPreview} className="min-h-[24rem] w-full rounded-md border bg-white" />
        ) : body ? <Markdown>{body}</Markdown> : err ? <span className="text-sm text-destructive">{err}</span> : running ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{activityLabel}</div> : <span className="text-sm text-muted-foreground">No output yet.</span>}
      </div>
      {(met || elapsedMs != null) && (
        <div className="flex flex-wrap gap-3 border-t px-3 py-1.5 text-label text-muted-foreground">
          {met?.results != null && <span>{met.results} results</span>}
          {met?.time != null && <span>{Number(met.time).toFixed(2)}s search</span>}
          {met?.tokens_out != null && <span>{met.tokens_out} tok</span>}
          {met?.tok_per_sec != null && <span>{Math.round(met.tok_per_sec)} tok/s</span>}
          {met?.context_percent != null && <span title="Share of the model's context window used by the prompt">{Number(met.context_percent).toFixed(met.context_percent < 10 ? 1 : 0)}% ctx</span>}
          {met?.cost != null && <span title="Estimated total · equivalent cost for 1,000 responses">${Number(met.cost).toFixed(4)} · ${(Number(met.cost) * 1000).toFixed(2)}/1k</span>}
          {elapsedMs != null && <span>{formatElapsed(elapsedMs)}</span>}
        </div>
      )}
    </div>
  )
}

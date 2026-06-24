import { useMemo, useState } from "react"
import { Globe, Play, Square, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { extractBrowserSite } from "@/lib/browserPreview"
import type { ToolEvent } from "@/types"

// Recover + render a website the agent built in an ephemeral browser tab from
// the message's tool events. Renders nothing when there's no such site. The
// extraction is memoized on the tool list — parsing the ~32KB injected HTML on
// every streaming tick would be wasteful. Keeping the hook here (rather than in
// Message, which early-returns for user turns) keeps it unconditional.
export function BrowserSiteCard({ tools }: { tools: ToolEvent[] | undefined }) {
  const site = useMemo(() => extractBrowserSite(tools), [tools])
  if (!site) return null
  return <BrowserPreview html={site.html} title={site.title} />
}

// Renders a website the agent built inside an ephemeral browser tab. The agent
// drove the builtin browser MCP (browser_evaluate to inject HTML, then closed
// the tab) — so the site was never saved as a document/artifact and doesn't
// appear in the thread on its own. `extractBrowserSite` recovers the injected
// HTML from the tool call's saved `command`; this card renders it live again.
//
// Security: the preview runs in a sandboxed <iframe srcDoc>. We NEVER set
// `allow-same-origin`, so the iframe gets an opaque origin — its scripts cannot
// read this app's cookies, localStorage, or session (the session-exfil vector
// flagged in the CompareRoute iframe audit requires same-origin access to
// fire). Default `sandbox=""` runs no scripts at all (static render of the
// HTML+CSS, which is enough for most static-injected sites); "Run scripts" opts
// into interactivity while keeping the opaque-origin guard. We deliberately do
// not offer an "open in new tab via blob URL" action — a blob URL inherits the
// app origin and WOULD be able to read the session.
export function BrowserPreview({ html, title }: { html: string; title: string }) {
  const [live, setLive] = useState(false)
  const [copied, setCopied] = useState(false)
  const sandbox = live ? "allow-scripts allow-forms" : ""
  const copy = async () => {
    try { await navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <Globe className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <span className="shrink-0 rounded-full border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
          built in browser tab
        </span>
      </div>
      <iframe
        srcDoc={html}
        sandbox={sandbox}
        title={title}
        className="h-[420px] w-full bg-white"
      />
      <div className="flex items-center gap-1 border-t px-2 py-1.5">
        <button
          onClick={() => setLive((v) => !v)}
          title={live ? "Stop scripts (static preview)" : "Run scripts in an isolated origin"}
          className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-accent",
            live ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {live ? <Square className="size-3" /> : <Play className="size-3" />}
          {live ? "Stop scripts" : "Run scripts"}
        </button>
        <button
          onClick={copy}
          title="Copy the recovered HTML"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          HTML
        </button>
        <span className="ml-auto hidden truncate pl-2 text-[10px] text-muted-foreground/70 sm:inline">
          reconstructed from the agent's injected HTML — the tab was ephemeral
        </span>
      </div>
    </div>
  )
}
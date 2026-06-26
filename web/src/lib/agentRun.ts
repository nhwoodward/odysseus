// Adapters that turn a streamed/persisted agent turn (ChatMessage.rounds +
// tools) into the data the AgentTimeline renders: a run summary (overall status
// + step count), friendly tool labels, and the run's tangible deliverables
// (documents, images, sources). Pure functions — no React, easy to unit-test.
import type { ChatMessage, ToolEvent, Source } from "@/types"

export interface RunSummary {
  total: number
  done: number
  running: boolean
  error: boolean
}

// Roll up every tool across all rounds into an overall run status. A step is
// "done" once it has settled (running === false), whether it succeeded or
// failed; `error` is true if any settled step had a non-zero exit code. Takes
// just the tool arrays so both AgentRound and the timeline's cleaned rounds fit.
export function buildRunSummary(rounds: { tools: ToolEvent[] }[]): RunSummary {
  const tools = rounds.flatMap((r) => r.tools)
  let done = 0
  let running = false
  let error = false
  for (const t of tools) {
    if (t.running) { running = true; continue }
    if (t.exitCode != null && t.exitCode !== 0) error = true
    done++
  }
  return { total: tools.length, done, running, error }
}

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  websearch: "Web Search",
  web_fetch: "Fetch Page",
  fetch_url: "Fetch Page",
  read_file: "Read File",
  write_file: "Write File",
  edit_file: "Edit File",
  list_dir: "List Files",
  glob: "Find Files",
  grep: "Search Code",
  bash: "Shell",
  python: "Python",
  create_document: "Create Document",
  edit_document: "Edit Document",
  update_document: "Update Document",
  suggest_document: "Suggest Edit",
  generate_image: "Generate Image",
  manage_memory: "Memory",
  manage_notes: "Notes",
  manage_calendar: "Calendar",
  manage_tasks: "Tasks",
  manage_email: "Email",
  update_plan: "Plan",
  ask_user: "Ask",
}

// Human-readable label for a tool name. Falls back to title-casing the raw
// name, and unwraps MCP-namespaced names (mcp__server__tool → "Tool").
export function toolLabel(name: string): string {
  if (!name) return "Step"
  const known = TOOL_LABELS[name]
  if (known) return known
  const base = name.startsWith("mcp__") ? (name.split("__").filter(Boolean).pop() || name) : name
  return base.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// The doc-edit FIND/REPLACE body is carried as the command; its first line is a
// `<<<FIND>>>` marker — raw tool syntax that shouldn't surface. Hide it.
export function visibleCommand(t: ToolEvent): string {
  const raw = t.command || (typeof t.input === "string" ? t.input : "")
  return raw.startsWith("<<<") ? "" : raw
}

// Does a step have any expandable detail worth a disclosure toggle?
export function toolHasDetail(t: ToolEvent): boolean {
  return !!(visibleCommand(t) || t.output || t.diff?.text || t.imageUrl || t.screenshot || (t.running && t.progress))
}

export type DeliverableKind = "doc" | "image" | "sources"
export interface Deliverable {
  kind: DeliverableKind
  title: string
  docId?: string
  language?: string
  content?: string
  url?: string
  count?: number
  sources?: Source[]
}

// Aggregate the tangible outputs of an agent turn so the run can surface a
// "Deliverables" strip: documents the agent edited/created (tool.docId),
// generated images (tool.imageUrl), and cited sources. Dedupes documents by id
// and images by url. The live create_document artifact is intentionally NOT
// included here — it keeps its own prominent ArtifactCard (with the streaming
// "generating…" affordance) in the message body.
export function collectDeliverables(m: ChatMessage): Deliverable[] {
  const out: Deliverable[] = []
  const seenDocs = new Set<string>()
  const seenImg = new Set<string>()
  const tools: ToolEvent[] = m.rounds?.length ? m.rounds.flatMap((r) => r.tools) : (m.tools || [])
  for (const t of tools) {
    if (t.docId && !seenDocs.has(t.docId)) {
      seenDocs.add(t.docId)
      out.push({ kind: "doc", title: t.docTitle || "Document", docId: t.docId })
    }
    const img = t.imageUrl
    if (img && !seenImg.has(img)) {
      seenImg.add(img)
      out.push({ kind: "image", title: t.imagePrompt || "Image", url: img })
    }
  }
  if (m.sources?.length) {
    out.push({
      kind: "sources",
      title: `${m.sources.length} source${m.sources.length === 1 ? "" : "s"}`,
      count: m.sources.length,
      sources: m.sources,
    })
  }
  return out
}

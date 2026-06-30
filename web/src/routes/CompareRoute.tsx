import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  EyeOff,
  Eye,
  GitCompareArrows,
  History,
  Loader2,
  MessagesSquare,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Share2,
  Shuffle,
  Square,
  Trash2,
  Trophy,
  X,
} from "lucide-react"
import { useAuthStatus } from "@/api/auth"
import { createSession, deleteSession } from "@/api/sessions"
import {
  listSearchProviders,
  probeSelectedModels,
  recordCompareVote,
  searchWithProvider,
  startCompare,
  stopChatSession,
  revealCompare,
  useCompareHistory,
  voteCompare,
  type CompareStart,
  type SearchProviderInfo,
  type SearchProviderResponse,
  type SearchResultItem,
} from "@/api/compare"
import { streamChat } from "@/lib/sse"
import { safeImageSrc } from "@/lib/safeImage"
import { Button } from "@/components/ui/button"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/stores/toast"
import { cn } from "@/lib/utils"
import { ModelSelect } from "@/components/compare/ModelSelect"
import { EvalPromptSelect } from "@/components/compare/EvalPromptSelect"
import { Scoreboard } from "@/components/compare/Scoreboard"
import { Pane } from "@/components/compare/Pane"
import { ProviderSelect } from "@/components/compare/ProviderSelect"
import { EMPTY_SEL, formatElapsed, shortName, type CompareMode, type EvalPrompt, type GradeStatus, type PaneMetrics, type Sel } from "@/components/compare/util"

type RevealedModels = Record<string, string>
type ProbeStatus = { kind: "ok" | "error" | "info"; text: string }

interface ComparePaneState {
  id: string
  sel: Sel
  synthSel: Sel
  body: string
  met: PaneMetrics | null
  err: string
  elapsedMs: number | null
  grade: GradeStatus | null
  sessionId?: string
}

const MODES: Array<{ value: CompareMode; label: string; icon: typeof MessagesSquare }> = [
  { value: "chat", label: "Chat", icon: MessagesSquare },
  { value: "agent", label: "Agent", icon: Bot },
  { value: "search", label: "Search", icon: Search },
  { value: "research", label: "Research", icon: Search },
]

const IMAGE_MODEL_PREFIXES = ["dall-e", "gpt-image", "chatgpt-image", "stable-diffusion", "sdxl", "flux", "midjourney"]
const MIN_COMPARE_PANES = 2
const MAX_COMPARE_PANES = 8

function isImageModel(model: string) {
  const lower = model.toLowerCase()
  return IMAGE_MODEL_PREFIXES.some((prefix) => lower.includes(prefix))
}

function newPane(id?: string, sel: Sel = EMPTY_SEL, synthSel: Sel = EMPTY_SEL): ComparePaneState {
  return {
    id: id || `pane-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sel: { ...sel },
    synthSel: { ...synthSel },
    body: "",
    met: null,
    err: "",
    elapsedMs: null,
    grade: null,
  }
}

function clearPaneRun(pane: ComparePaneState): ComparePaneState {
  return {
    ...pane,
    body: "",
    met: null,
    err: "",
    elapsedMs: null,
    grade: null,
    sessionId: undefined,
  }
}

function paneSlot(index: number, parallel: boolean) {
  return parallel ? String.fromCharCode(65 + index) : String(index + 1)
}

function paneLabel(index: number, parallel: boolean) {
  return `Model ${paneSlot(index, parallel)}`
}

async function streamPane(
  sessionId: string,
  prompt: string,
  mode: CompareMode,
  onDelta: (d: string) => void,
  onMetrics: (m: PaneMetrics) => void,
  onError: (msg: string) => void,
  controller: AbortController,
  timeoutSeconds: number,
  // Append display-only markdown (tool steps / generated images) to the pane
  // body WITHOUT feeding the grading `output` buffer — onDelta is reserved for
  // the model's answer text. Lets agent-mode tool steps and image-model panes
  // render instead of being silently dropped.
  onAppend?: (md: string) => void,
) {
  const fd = new FormData()
  fd.set("message", prompt)
  fd.set("session", sessionId)
  fd.set("compare_mode", "true")
  fd.set("no_documents", "true")
  fd.set("no_memory", "true")
  fd.set("use_rag", "false")
  if (mode === "agent") {
    fd.set("mode", "agent")
    fd.set("allow_web_search", "true")
    fd.set("allow_bash", "true")
  } else {
    fd.set("mode", "chat")
    if (mode === "research") fd.set("use_research", "true")
  }

  let timedOut = false
  let timeoutId: number | undefined
  const resetTimeout = () => {
    if (timeoutId) window.clearTimeout(timeoutId)
    timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, Math.max(15, timeoutSeconds) * 1000)
  }

  resetTimeout()
  try {
    await streamChat(fd, (e) => {
      resetTimeout()
      const ev = e as Record<string, unknown>
      if (typeof ev.delta === "string" && !ev.thinking) onDelta(ev.delta as string)
      else if (e.type === "metrics") {
        const dm = (ev.data as Record<string, unknown>) || ev
        onMetrics({ tokens_out: (dm.output_tokens ?? dm.tokens_out) as number, tok_per_sec: (dm.tokens_per_second ?? dm.tok_per_sec) as number, cost: dm.cost as number, context_percent: (dm.context_percent ?? dm.context_pct) as number })
      } else if (e.type === "tool_start") {
        const name = String(ev.tool || ev.tool_name || "tool")
        const cmd = String(ev.command || ev.tool_input || "").split("\n")[0].slice(0, 200)
        onAppend?.(`\n\n> 🔧 **${markdownEscape(name)}**${cmd ? ` — \`${markdownEscape(cmd)}\`` : ""}\n`)
      } else if (e.type === "tool_output") {
        const ok = ev.exit_code == null || ev.exit_code === 0
        const out = (String(ev.output || ev.tool_output || "").split("\n").filter(Boolean)[0] || "").slice(0, 160)
        onAppend?.(`\n\n> ↳ ${ok ? "✓" : "✗"}${out ? ` ${markdownEscape(out)}` : ""}\n`)
      } else if (e.type === "image_url" || typeof ev.image_url === "string") {
        const url = safeImageSrc(ev.image_url)
        if (url) onAppend?.(`\n\n![${markdownEscape(String(ev.image_prompt || "image"))}](${url})\n`)
      } else if (e.type === "error") {
        onError((ev.text as string) || (ev.error as string) || "Model error")
      }
    }, controller.signal)
  } catch (e) {
    if (controller.signal.aborted) throw new Error(timedOut ? `Timed out after ${timeoutSeconds}s` : "Stopped", { cause: e })
    throw e
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

function markdownEscape(text: string) {
  return text.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1")
}

function formatSearchResult(result: SearchResultItem, index: number) {
  const title = String(result.title || result.url || `Result ${index + 1}`)
  const url = typeof result.url === "string" ? result.url : ""
  const snippet = typeof result.snippet === "string" ? result.snippet.trim() : ""
  const heading = url ? `### ${index + 1}. [${markdownEscape(title)}](${url})` : `### ${index + 1}. ${markdownEscape(title)}`
  const parts = [heading]
  if (snippet) parts.push(markdownEscape(snippet))
  if (url) parts.push(`<${url}>`)
  return parts.join("\n\n")
}

function formatSearchResponse(data: SearchProviderResponse) {
  if (data.error) return `**Error:** ${markdownEscape(data.error)}`
  const results = data.results || []
  if (results.length === 0) return "_No results found._"
  return results.map(formatSearchResult).join("\n\n")
}

function searchResultCount(data: SearchProviderResponse) {
  return Array.isArray(data.results) ? data.results.length : 0
}

function searchResultsForSynthesis(data: SearchProviderResponse) {
  return (data.results || []).map((result, index) => {
    const title = String(result.title || result.url || `Result ${index + 1}`)
    const snippet = typeof result.snippet === "string" ? result.snippet : ""
    const url = typeof result.url === "string" ? result.url : ""
    return `[${index + 1}] ${title}\n${snippet}\nURL: ${url}`
  }).join("\n\n")
}

function buildSearchSynthesisPrompt(query: string, data: SearchProviderResponse) {
  return `Analyze these search results for the query "${query}". Summarize the key findings, note any consensus or conflicting information, and provide a brief synthesis.\n\nSearch Results:\n${searchResultsForSynthesis(data)}`
}

function paneMetricsLine(met: PaneMetrics | null, elapsedMs: number | null) {
  const parts: string[] = []
  if (met?.results != null) parts.push(`${met.results} results`)
  if (met?.time != null) parts.push(`${Number(met.time).toFixed(2)}s search`)
  if (met?.tokens_out != null) parts.push(`${met.tokens_out} tok`)
  if (met?.tok_per_sec != null) parts.push(`${Math.round(met.tok_per_sec)} tok/s`)
  if (met?.context_percent != null) parts.push(`${Number(met.context_percent).toFixed(met.context_percent < 10 ? 1 : 0)}% ctx`)
  if (met?.cost != null) parts.push(`$${Number(met.cost).toFixed(4)} · $${(Number(met.cost) * 1000).toFixed(2)}/1k`)
  if (elapsedMs != null) parts.push(formatElapsed(elapsedMs))
  return parts.join(" · ")
}

// Build a self-contained Markdown document of the current comparison:
// the shared prompt, then each pane's label, model, metrics, and response.
function buildComparisonMarkdown(
  prompt: string,
  panes: ComparePaneState[],
  modelLabel: (pane: ComparePaneState, index: number) => string,
) {
  const lines: string[] = ["# Model comparison", ""]
  if (prompt.trim()) {
    lines.push("## Prompt", "", prompt.trim(), "")
  }
  panes.forEach((pane, index) => {
    lines.push(`## ${modelLabel(pane, index)}`, "")
    const meta = paneMetricsLine(pane.met, pane.elapsedMs)
    if (meta) lines.push(`_${meta}_`, "")
    if (pane.body) lines.push(pane.body.trim(), "")
    else if (pane.err) lines.push(`**Error:** ${pane.err}`, "")
    else lines.push("_No output._", "")
  })
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
}

function nowMs() {
  return performance.now()
}

function gradeResponse(response: string, expected: string): GradeStatus | null {
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim()
  const r = norm(response)
  const e = norm(expected)
  if (!r || !e) return null
  if (e.includes("yourself") || e.includes("verify") || e.length > 120) return null

  let pass = r.includes(e)
  if (!pass) {
    const match = expected.match(/-?\d[\d,]*(?:\.\d+)?/)
    if (match) {
      const number = match[0].replace(/,/g, "")
      const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      pass = new RegExp(`(^|[^\\d.])${escaped}(?![\\d.])`).test(response)
    }
  }
  return pass ? "pass" : "fail"
}

export function CompareRoute() {
  const qc = useQueryClient()
  const { data: auth } = useAuthStatus()
  const history = useCompareHistory()
  const [panes, setPanes] = useState<ComparePaneState[]>(() => [newPane("pane-a"), newPane("pane-b")])
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<CompareMode>("chat")
  const [blind, setBlind] = useState(true)
  const [parallel, setParallel] = useState(true)
  const [saveOnClose, setSaveOnClose] = useState(false)
  const [timeoutSeconds, setTimeoutSeconds] = useState(300)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [comp, setComp] = useState<CompareStart | null>(null)
  const [voted, setVoted] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<RevealedModels | null>(null)
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const [expandedPane, setExpandedPane] = useState<string | null>(null)
  const [previewPane, setPreviewPane] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [rerolling, setRerolling] = useState<string | null>(null)
  const [expectedAnswer, setExpectedAnswer] = useState("")
  const [probing, setProbing] = useState(false)
  const [probeStatus, setProbeStatus] = useState<ProbeStatus | null>(null)
  const [probedModels, setProbedModels] = useState<Set<string>>(() => new Set())
  const [searchProviders, setSearchProviders] = useState<SearchProviderInfo[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providersError, setProvidersError] = useState("")
  const [exportOpen, setExportOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const controllersRef = useRef<Record<string, AbortController | null>>({})
  const sessionIdsRef = useRef<string[]>([])
  const saveOnCloseRef = useRef(false)
  const panesRef = useRef<ComparePaneState[]>(panes)
  const expectedAnswerRef = useRef("")
  const searchProvidersRequestedRef = useRef(false)
  const streamBusy = running || rerolling !== null
  const anyBusy = streamBusy || probing
  const selectedModels = useMemo(() => mode === "search" ? [] : panes.map((pane) => pane.sel).filter((sel) => !!sel.model), [mode, panes])
  const unprobedModels = useMemo(() => selectedModels.filter((sel) => !probedModels.has(sel.model)), [selectedModels, probedModels])
  const canProbeModels = !!auth?.is_admin
  const availableSearchProviders = useMemo(() => searchProviders.filter((provider) => provider.available), [searchProviders])
  const searchProviderIds = useMemo(() => new Set(availableSearchProviders.map((provider) => provider.id)), [availableSearchProviders])
  const providerLabelById = useMemo(() => new Map(searchProviders.map((provider) => [provider.id, provider.label])), [searchProviders])
  const providerLabel = (providerId: string) => providerLabelById.get(providerId) || providerId
  const paneModelName = (pane: ComparePaneState) => mode === "search" ? providerLabel(pane.sel.model) : pane.sel.model
  const allPanesReady = panes.length >= MIN_COMPARE_PANES && panes.every((pane) => (
    mode === "search" ? searchProviderIds.has(pane.sel.model) : !!pane.sel.model
  ))
  const roundStarted = panes.some((pane) => !!pane.sessionId || !!pane.body || !!pane.err)
  const canVote = roundStarted && !anyBusy && panes.some((pane) => !!pane.body || !!pane.err)
  const canShuffle = !anyBusy && !roundStarted && panes.length > 1
  const fastestPane = !anyBusy && panes.length > 0 && panes.every((pane) => pane.elapsedMs != null)
    ? panes.reduce((best, pane) => (pane.elapsedMs! < best.elapsedMs! ? pane : best), panes[0])
    : null

  const patchPane = (paneId: string, patch: Partial<ComparePaneState>) => {
    setPanes((prev) => prev.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane)))
  }

  const updatePane = (paneId: string, updater: (pane: ComparePaneState) => ComparePaneState) => {
    setPanes((prev) => prev.map((pane) => (pane.id === paneId ? updater(pane) : pane)))
  }

  const currentSessionIds = () => panes.map((pane) => pane.sessionId).filter((id): id is string => !!id)

  const abortControllers = () => {
    Object.values(controllersRef.current).forEach((ctrl) => ctrl?.abort())
  }

  const cleanupSessions = async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (unique.length === 0) return
    await Promise.allSettled(unique.map((id) => deleteSession(id)))
  }

  const clearRoundState = (sessionIds: string[] = currentSessionIds(), options: { resetSelections?: boolean; searchProviders?: SearchProviderInfo[] } = {}) => {
    abortControllers()
    if (sessionIds.length > 0) void cleanupSessions(sessionIds)
    controllersRef.current = {}
    setRunning(false)
    setErr("")
    setComp(null)
    setVoted(null)
    setRevealed(null)
    setCopied(null)
    setExpandedPane(null)
    setPreviewPane(null)
    setRevealing(false)
    setRerolling(null)
    const resetProviders = options.searchProviders || []
    setPanes((prev) => prev.map((pane, index) => {
      const provider = resetProviders[Math.min(index, resetProviders.length - 1)]
      const sel = options.resetSelections
        ? provider ? { model: provider.id, endpointId: "", endpointUrl: "" } : { ...EMPTY_SEL }
        : pane.sel
      const synthSel = options.resetSelections ? { ...EMPTY_SEL } : pane.synthSel
      return clearPaneRun({ ...pane, sel, synthSel })
    }))
  }

  useEffect(() => {
    expectedAnswerRef.current = expectedAnswer
  }, [expectedAnswer])

  useEffect(() => {
    if (!exportOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExportOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [exportOpen])

  useEffect(() => {
    sessionIdsRef.current = panes.map((pane) => pane.sessionId).filter((id): id is string => !!id)
    panesRef.current = panes
  }, [panes])

  useEffect(() => { saveOnCloseRef.current = saveOnClose }, [saveOnClose])

  useEffect(() => {
    const onBeforeUnload = () => {
      const ids = sessionIdsRef.current
      if (ids.length === 0) return
      if (saveOnCloseRef.current) {
        const names = panesRef.current.map((pane) => shortName(pane.sel.model)).filter(Boolean)
        const folder = `Compare: ${names.join(" vs ") || "Saved"}`
        ids.forEach((id) => { const body = new URLSearchParams({ folder }); void fetch(`/api/session/${id}`, { method: "PATCH", credentials: "same-origin", body, keepalive: true }) })
        return
      }
      if (!navigator.sendBeacon) return
      navigator.sendBeacon(
        "/api/sessions/bulk-delete",
        new Blob([JSON.stringify({ ids })], { type: "application/json" }),
      )
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      abortControllers()
      const ids = sessionIdsRef.current
      if (saveOnCloseRef.current) {
        const names = panesRef.current.map((pane) => shortName(pane.sel.model)).filter(Boolean)
        const folder = `Compare: ${names.join(" vs ") || "Saved"}`
        ids.forEach((id) => { const body = new FormData(); body.set("folder", folder); void fetch(`/api/session/${id}`, { method: "PATCH", credentials: "same-origin", body }).catch(() => {}) })
      } else ids.forEach((id) => { void deleteSession(id).catch(() => {}) })
    }
  }, [])

  useEffect(() => {
    if (mode !== "search" || searchProvidersRequestedRef.current) return
    let active = true
    searchProvidersRequestedRef.current = true
    setProvidersLoading(true)
    setProvidersError("")
    listSearchProviders().then((providers) => {
      if (!active) return
      setSearchProviders(providers)
      const available = providers.filter((provider) => provider.available)
      if (available.length > 0) {
        setPanes((prev) => prev.map((pane, index) => {
          if (available.some((provider) => provider.id === pane.sel.model)) return pane
          const provider = available[Math.min(index, available.length - 1)]
          return clearPaneRun({ ...pane, sel: { model: provider.id, endpointId: "", endpointUrl: "" } })
        }))
      }
    }).catch((e) => {
      if (!active) return
      setProvidersError(e instanceof Error ? e.message : "Failed to load search providers")
    }).finally(() => {
      if (active) setProvidersLoading(false)
    })
    return () => { active = false }
  }, [mode])

  const streamPaneById = async (paneId: string, sessionId: string, controller: AbortController) => {
    patchPane(paneId, { body: "", met: null, err: "", elapsedMs: null, grade: null })
    setCopied((pane) => pane === paneId ? null : pane)
    setPreviewPane((pane) => pane === paneId ? null : pane)
    const started = nowMs()
    let output = ""
    await streamPane(sessionId, prompt, mode, (d) => {
      output += d
      updatePane(paneId, (pane) => ({ ...pane, body: pane.body + d }))
    }, (metrics) => patchPane(paneId, { met: metrics }), (message) => patchPane(paneId, { err: message }), controller, timeoutSeconds, (md) => updatePane(paneId, (pane) => ({ ...pane, body: pane.body + md })))
    patchPane(paneId, { elapsedMs: nowMs() - started })
    const expected = expectedAnswerRef.current
    if (expected) patchPane(paneId, { grade: gradeResponse(output, expected) })
  }

  const appendPaneBody = (paneId: string, text: string) => {
    updatePane(paneId, (pane) => ({ ...pane, body: pane.body + text }))
  }

  const streamSearchSynthesis = async (pane: ComparePaneState, data: SearchProviderResponse, controller: AbortController) => {
    if (!pane.synthSel.model || data.error || searchResultCount(data) === 0) return
    let sessionId = ""
    try {
      const session = await createSession({
        name: `[CMP] Search analysis ${shortName(pane.synthSel.model)}`,
        model: pane.synthSel.model,
        endpoint_id: pane.synthSel.endpointId,
        endpoint_url: pane.synthSel.endpointUrl,
        skip_validation: !!pane.synthSel.endpointId,
      })
      sessionId = session.id
      appendPaneBody(pane.id, "\n\n---\n\n## Analysis\n\n")
      await streamPane(session.id, buildSearchSynthesisPrompt(prompt, data), "chat", (delta) => {
        appendPaneBody(pane.id, delta)
      }, (metrics) => {
        updatePane(pane.id, (current) => ({ ...current, met: { ...(current.met || {}), ...metrics } }))
      }, (message) => {
        appendPaneBody(pane.id, `\n\n**Analysis error:** ${markdownEscape(message)}`)
      }, controller, timeoutSeconds)
    } catch (e) {
      const message = controller.signal.aborted ? "Analysis stopped" : e instanceof Error ? e.message : "Analysis failed"
      appendPaneBody(pane.id, `\n\n**${markdownEscape(message)}**`)
    } finally {
      if (sessionId) await deleteSession(sessionId).catch(() => {})
    }
  }

  const searchPaneById = async (pane: ComparePaneState, controller: AbortController) => {
    const paneId = pane.id
    patchPane(paneId, { body: "", met: null, err: "", elapsedMs: null, grade: null })
    setCopied((pane) => pane === paneId ? null : pane)
    setPreviewPane((pane) => pane === paneId ? null : pane)
    const started = nowMs()
    try {
      const data = await searchWithProvider(prompt, pane.sel.model, 10, controller.signal)
      patchPane(paneId, {
        body: data.error ? "" : formatSearchResponse(data),
        err: data.error || "",
        met: { results: searchResultCount(data), time: data.time },
        elapsedMs: nowMs() - started,
      })
      if (!data.error) await streamSearchSynthesis(pane, data, controller)
      patchPane(paneId, { elapsedMs: nowMs() - started })
    } catch (e) {
      const message = controller.signal.aborted ? "Stopped" : e instanceof Error ? e.message : "Search failed"
      patchPane(paneId, { err: message, elapsedMs: nowMs() - started })
    }
  }

  const probeModels = async () => {
    if (!canProbeModels || anyBusy || selectedModels.length === 0) return
    const pending = unprobedModels
    if (pending.length === 0) {
      const message = "All selected models verified"
      setProbeStatus({ kind: "ok", text: message })
      toast(message, "success")
      return
    }

    setProbing(true)
    setProbeStatus({ kind: "info", text: `Checking ${pending.length} model${pending.length === 1 ? "" : "s"}...` })
    try {
      const skipped = pending.filter((sel) => isImageModel(sel.model))
      const toProbe = pending.filter((sel) => !isImageModel(sel.model))
      const results = toProbe.length > 0
        ? await probeSelectedModels(toProbe.map((sel) => ({
          endpoint_id: sel.endpointId,
          model: sel.model,
          endpoint: sel.endpointUrl,
          with_tools: mode === "agent",
        })))
        : []
      const passed = results.filter((result) => result.status === "ok" && result.model)
      const failed = results.filter((result) => result.status !== "ok")
      const verifiedCount = passed.length + skipped.length

      setProbedModels((prev) => {
        const next = new Set(prev)
        skipped.forEach((sel) => next.add(sel.model))
        passed.forEach((result) => { if (result.model) next.add(result.model) })
        return next
      })

      if (failed.length > 0) {
        const first = failed[0]
        const label = blind ? "A model" : shortName(first.model || "model")
        const detail = first.error ? `: ${first.error}` : ""
        const message = `${failed.length} model${failed.length === 1 ? "" : "s"} failed. ${label}${detail}`
        setProbeStatus({ kind: "error", text: message })
        toast(message, "error", 5000)
      } else {
        const message = `${verifiedCount} model${verifiedCount === 1 ? "" : "s"} verified`
        setProbeStatus({ kind: "ok", text: message })
        toast(message, "success")
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Probe failed"
      setProbeStatus({ kind: "error", text: message })
      toast(message, "error", 5000)
    } finally {
      setProbing(false)
    }
  }

  const run = async () => {
    if (!prompt.trim() || !allPanesReady || anyBusy) return
    const roundPanes = panes.map((pane) => ({ ...pane, sel: { ...pane.sel }, synthSel: { ...pane.synthSel } }))
    const oldSessionIds = roundPanes.map((pane) => pane.sessionId).filter((id): id is string => !!id)
    setRunning(true)
    setErr("")
    setComp(null)
    setVoted(null)
    setRevealed(null)
    setExpandedPane(null)
    setPreviewPane(null)
    setRevealing(false)
    setRerolling(null)
    setPanes((prev) => prev.map(clearPaneRun))
    try {
      await cleanupSessions(oldSessionIds)
      if (mode === "search") {
        const controllers: Record<string, AbortController> = {}
        roundPanes.forEach((pane) => { controllers[pane.id] = new AbortController() })
        controllersRef.current = controllers
        const runPane = async (pane: ComparePaneState) => {
          const ctrl = controllers[pane.id]
          if (!ctrl) return
          await searchPaneById(pane, ctrl)
        }

        if (parallel) {
          await Promise.allSettled(roundPanes.map(runPane))
        } else {
          for (const pane of roundPanes) {
            const ctrl = controllers[pane.id]
            if (!ctrl || ctrl.signal.aborted) break
            await runPane(pane)
          }
        }
        return
      }

      const sessions: Record<string, string> = {}

      if (roundPanes.length === 2) {
        const first = roundPanes[0]
        const second = roundPanes[1]
        const c = await startCompare({
          prompt,
          model_a: first.sel.model, endpoint_a_id: first.sel.endpointId, endpoint_a: first.sel.endpointUrl,
          model_b: second.sel.model, endpoint_b_id: second.sel.endpointId, endpoint_b: second.sel.endpointUrl,
          is_blind: blind,
        })
        setComp(c)
        sessions[first.id] = c.session_left
        sessions[second.id] = c.session_right
        if (!c.is_blind) {
          setRevealed({
            [first.id]: c.model_left || first.sel.model,
            [second.id]: c.model_right || second.sel.model,
          })
        }
      } else {
        const created = await Promise.all(roundPanes.map(async (pane, index) => {
          const session = await createSession({
            name: `[CMP] ${blind ? paneLabel(index, parallel) : shortName(pane.sel.model)}`,
            model: pane.sel.model,
            endpoint_id: pane.sel.endpointId,
            endpoint_url: pane.sel.endpointUrl,
            skip_validation: !!pane.sel.endpointId,
          })
          return [pane.id, session.id] as const
        }))
        created.forEach(([paneId, sessionId]) => { sessions[paneId] = sessionId })
        if (!blind) {
          setRevealed(Object.fromEntries(roundPanes.map((pane) => [pane.id, pane.sel.model])))
        }
      }

      setPanes((prev) => prev.map((pane) => sessions[pane.id] ? { ...pane, sessionId: sessions[pane.id] } : pane))
      const controllers: Record<string, AbortController> = {}
      roundPanes.forEach((pane) => { controllers[pane.id] = new AbortController() })
      controllersRef.current = controllers
      const runPane = async (pane: ComparePaneState) => {
        const ctrl = controllers[pane.id]
        const sessionId = sessions[pane.id]
        if (!ctrl || !sessionId) return
        try {
          await streamPaneById(pane.id, sessionId, ctrl)
        } catch (e) {
          const message = e instanceof Error ? e.message : `${paneLabel(roundPanes.indexOf(pane), parallel)} failed`
          patchPane(pane.id, { err: message })
        }
      }

      if (parallel) {
        await Promise.allSettled(roundPanes.map(runPane))
      } else {
        for (const pane of roundPanes) {
          const ctrl = controllers[pane.id]
          if (!ctrl || ctrl.signal.aborted) break
          await runPane(pane)
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Comparison failed")
    } finally {
      setRunning(false)
      controllersRef.current = {}
    }
  }

  const stop = () => {
    abortControllers()
  }

  // Abort a single pane: close its SSE socket *and* cancel the detached
  // backend run via its session id (the run keeps generating otherwise).
  const stopPane = (paneId: string) => {
    controllersRef.current[paneId]?.abort()
    const pane = panes.find((item) => item.id === paneId)
    if (pane?.sessionId) void stopChatSession(pane.sessionId).catch(() => {})
  }

  const reset = () => {
    clearRoundState()
  }

  const changeMode = (nextMode: CompareMode) => {
    if (nextMode === mode || anyBusy || roundStarted) return
    clearRoundState(currentSessionIds(), { resetSelections: true, searchProviders: nextMode === "search" ? availableSearchProviders : undefined })
    setMode(nextMode)
    setParallel(nextMode === "chat" || nextMode === "agent")
    setExpectedAnswer("")
    setProbeStatus(null)
  }

  const rerollPane = async (paneId: string) => {
    const pane = panes.find((item) => item.id === paneId)
    if (!pane || !prompt.trim() || anyBusy || voted) return
    if (mode !== "search" && !pane.sessionId) return
    const ctrl = new AbortController()
    controllersRef.current[paneId]?.abort()
    controllersRef.current[paneId] = ctrl
    setRerolling(paneId)
    try {
      if (mode === "search") await searchPaneById(pane, ctrl)
      else await streamPaneById(paneId, pane.sessionId!, ctrl)
    } catch (e) {
      patchPane(paneId, { err: e instanceof Error ? e.message : mode === "search" ? "Search failed" : "Model failed" })
    } finally {
      if (controllersRef.current[paneId] === ctrl) controllersRef.current[paneId] = null
      setRerolling(null)
    }
  }

  const reveal = async () => {
    if (revealed || revealing || !roundStarted) return
    setRevealing(true)
    try {
      if (comp && panes.length === 2) {
        const result = await revealCompare(comp.id)
        setRevealed({
          [panes[0].id]: result.revealed.left,
          [panes[1].id]: result.revealed.right,
        })
      } else {
        setRevealed(Object.fromEntries(panes.map((pane) => [pane.id, paneModelName(pane)])))
      }
    } catch {
      toast("Couldn't reveal model names")
    } finally {
      setRevealing(false)
    }
  }

  const vote = async (winner: string) => {
    if (voted || !canVote) return
    try {
      if (comp && panes.length === 2) {
        const result = await voteCompare(comp.id, winner === "tie" ? "tie" : winner === panes[0].id ? "left" : "right")
        setRevealed({
          [panes[0].id]: result.revealed.left,
          [panes[1].id]: result.revealed.right,
        })
      } else {
        const modelNames = panes.map(paneModelName)
        const winningPane = panes.find((pane) => pane.id === winner)
        await recordCompareVote({
          prompt,
          models: modelNames,
          winner: winner === "tie" ? "tie" : winningPane ? paneModelName(winningPane) : "",
          is_blind: blind,
        })
        setRevealed(Object.fromEntries(panes.map((pane) => [pane.id, paneModelName(pane)])))
      }
      setVoted(winner)
      qc.invalidateQueries({ queryKey: ["compare-history"] })
    } catch {
      toast("Couldn't record your vote")
    }
  }

  const copyPane = async (paneId: string, text: string) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(paneId)
    window.setTimeout(() => setCopied(null), 1200)
  }

  // Model heading used in exports: reveal the real model name when it's known
  // (non-blind or already revealed/voted), otherwise keep the blind label.
  const exportModelLabel = (pane: ComparePaneState, index: number) => {
    const revealedName = revealed?.[pane.id]
    if (revealedName) return `${paneLabel(index, parallel)} — ${shortName(revealedName)}`
    if (!blind) {
      const name = paneModelName(pane)
      return name ? `${paneLabel(index, parallel)} — ${shortName(name)}` : paneLabel(index, parallel)
    }
    return paneLabel(index, parallel)
  }

  const hasExportableRound = panes.some((pane) => !!pane.body || !!pane.err)

  const buildExportMarkdown = () => buildComparisonMarkdown(prompt, panes, exportModelLabel)

  const copyExportMarkdown = async () => {
    setExportOpen(false)
    if (!hasExportableRound) return
    try {
      await navigator.clipboard.writeText(buildExportMarkdown())
      toast("Comparison copied as Markdown", "success")
    } catch {
      toast("Couldn't copy to clipboard", "error")
    }
  }

  const downloadExportMarkdown = () => {
    setExportOpen(false)
    if (!hasExportableRound) return
    const blob = new Blob([buildExportMarkdown()], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
    const a = document.createElement("a")
    a.href = url
    a.download = `comparison-${stamp}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const printExport = () => {
    setExportOpen(false)
    if (!hasExportableRound) return
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const sections = panes.map((pane, index) => {
      const meta = paneMetricsLine(pane.met, pane.elapsedMs)
      const content = pane.body
        ? `<pre>${esc(pane.body.trim())}</pre>`
        : pane.err
          ? `<p class="err">Error: ${esc(pane.err)}</p>`
          : `<p class="muted">No output.</p>`
      return `<section><h2>${esc(exportModelLabel(pane, index))}</h2>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}${content}</section>`
    }).join("")
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Model comparison</title><style>
      body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111;margin:2rem;max-width:54rem}
      h1{font-size:1.4rem;margin:0 0 1rem} h2{font-size:1.05rem;margin:1.5rem 0 .35rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}
      pre{white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:.75rem;border-radius:.4rem;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
      .prompt{background:#f0f0f0;padding:.75rem;border-radius:.4rem;white-space:pre-wrap}
      .meta,.muted{color:#666;font-size:12px} .meta{margin:.1rem 0 .5rem} .err{color:#b00020}
      section{break-inside:avoid}
    </style></head><body><h1>Model comparison</h1>${prompt.trim() ? `<h2>Prompt</h2><div class="prompt">${esc(prompt.trim())}</div>` : ""}${sections}</body></html>`
    const w = window.open("", "_blank")
    if (!w) {
      toast("Allow pop-ups to print the comparison", "error")
      return
    }
    w.document.write(html)
    w.document.close()
    w.focus()
    window.setTimeout(() => w.print(), 250)
  }

  const pickEvalPrompt = (item: EvalPrompt) => {
    setPrompt(item.prompt)
    setExpectedAnswer(item.answer || "")
    setPanes((prev) => prev.map((pane) => ({ ...pane, grade: null })))
  }

  const replacePaneSelection = (paneId: string, sel: Sel) => {
    const sessionIds = currentSessionIds()
    abortControllers()
    if (sessionIds.length > 0) void cleanupSessions(sessionIds)
    setPanes((prev) => prev.map((pane) => clearPaneRun(pane.id === paneId ? { ...pane, sel } : pane)))
    setErr("")
    setComp(null)
    setVoted(null)
    setRevealed(null)
    setCopied(null)
    setExpandedPane(null)
    setPreviewPane(null)
    setProbeStatus(null)
  }

  const replacePaneSynthSelection = (paneId: string, synthSel: Sel) => {
    const sessionIds = currentSessionIds()
    abortControllers()
    if (sessionIds.length > 0) void cleanupSessions(sessionIds)
    setPanes((prev) => prev.map((pane) => clearPaneRun(pane.id === paneId ? { ...pane, synthSel } : pane)))
    setErr("")
    setComp(null)
    setVoted(null)
    setRevealed(null)
    setCopied(null)
    setExpandedPane(null)
    setPreviewPane(null)
  }

  const addPane = () => {
    if (anyBusy || panes.length >= MAX_COMPARE_PANES) return
    clearRoundState()
    setPanes((prev) => {
      const provider = mode === "search" && availableSearchProviders.length > 0
        ? availableSearchProviders[Math.min(prev.length, availableSearchProviders.length - 1)]
        : null
      return [...prev.map(clearPaneRun), newPane(undefined, provider ? { model: provider.id, endpointId: "", endpointUrl: "" } : EMPTY_SEL)]
    })
    setProbeStatus(null)
  }

  const removePane = (paneId: string) => {
    if (anyBusy || panes.length <= MIN_COMPARE_PANES) return
    const sessionIds = currentSessionIds()
    abortControllers()
    if (sessionIds.length > 0) void cleanupSessions(sessionIds)
    setPanes((prev) => prev.filter((pane) => pane.id !== paneId).map(clearPaneRun))
    setErr("")
    setComp(null)
    setVoted(null)
    setRevealed(null)
    setCopied(null)
    setExpandedPane(null)
    setPreviewPane(null)
    setProbeStatus(null)
  }

  const shufflePanes = () => {
    if (!canShuffle) return
    setPanes((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[next[i], next[j]] = [next[j], next[i]]
      }
      return next
    })
    setProbeStatus(null)
  }

  const votedLabel = voted === "tie"
    ? "Tie"
    : voted
      ? shortName(revealed?.[voted] || panes.find((pane) => pane.id === voted)?.sel.model || "Model")
      : ""

  const setTimeoutFromInput = (value: string) => {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    setTimeoutSeconds(Math.max(15, Math.min(3600, Math.round(next))))
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col" data-tour="compare-root">
      <RouteHeader
        icon={GitCompareArrows}
        title={(
          <>
            <h1 className="truncate text-sm font-semibold">Compare models</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">{panes.length}/{MAX_COMPARE_PANES}</span>
          </>
        )}
        actions={(
          <>
            {canProbeModels && selectedModels.length > 0 && unprobedModels.length > 0 && (
              <Button variant="outline" size="sm" onClick={probeModels} disabled={anyBusy} title="Probe unverified models with a small test request">
                {probing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Probe
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={addPane} disabled={anyBusy || panes.length >= MAX_COMPARE_PANES} title="Add model pane">
              <Plus className="size-4" />Add
            </Button>
            <Button variant="outline" size="sm" onClick={shufflePanes} disabled={!canShuffle} title={roundStarted ? "Reset before shuffling this round" : "Shuffle pane positions"}>
              <Shuffle className="size-4" />Shuffle
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScoreOpen((v) => !v)}><History className="size-4" />Score</Button>
            <div className="relative" ref={exportMenuRef}>
              <Button variant="outline" size="sm" onClick={() => setExportOpen((v) => !v)} disabled={!hasExportableRound} title={hasExportableRound ? "Export this comparison" : "Run a comparison to enable export"}>
                <Share2 className="size-4" />Export<ChevronDown className="size-3.5 opacity-60" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                  <button onClick={copyExportMarkdown} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground">
                    <Copy className="size-4 text-muted-foreground" />Copy all as Markdown
                  </button>
                  <button onClick={downloadExportMarkdown} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground">
                    <Download className="size-4 text-muted-foreground" />Download .md
                  </button>
                  <button onClick={printExport} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground">
                    <Printer className="size-4 text-muted-foreground" />Print / Save as PDF
                  </button>
                </div>
              )}
            </div>
            {streamBusy ? (
              <Button variant="outline" size="sm" onClick={stop}><Square className="size-4" />Stop</Button>
            ) : (
              <Button variant="ghost" size="icon" title="Reset" aria-label="Reset" onClick={reset} disabled={probing}><RotateCcw className="size-4" /></Button>
            )}
          </>
        )}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-2 md:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border bg-background p-0.5" data-tour="compare-mode">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => changeMode(value)}
                disabled={anyBusy || roundStarted}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium text-muted-foreground transition-colors disabled:opacity-50", mode === value && "bg-accent text-foreground")}
              >
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground" data-tour="compare-blind">
            <Switch checked={blind} onCheckedChange={setBlind} disabled={anyBusy || roundStarted} />
            <EyeOff className="size-3.5" />Blind
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground" data-tour="compare-parallel">
            <Switch checked={parallel} onCheckedChange={setParallel} disabled={anyBusy || roundStarted} />
            Parallel
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground" title="Keep comparison chats in a Compare folder when you leave this page">
            <Switch checked={saveOnClose} onCheckedChange={setSaveOnClose} />
            Save on close
          </label>
          <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Timeout
            <input type="number" min={15} max={3600} step={15} value={timeoutSeconds} onChange={(e) => setTimeoutFromInput(e.target.value)} disabled={anyBusy} className="h-8 w-20 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring disabled:opacity-50" />
          </label>
          {probeStatus && (
            <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", probeStatus.kind === "error" ? "text-destructive" : probeStatus.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {probeStatus.kind === "info" && <Loader2 className="size-3.5 animate-spin" />}
              {probeStatus.kind === "ok" && <Check className="size-3.5" />}
              {probeStatus.kind === "error" && <X className="size-3.5" />}
              <span className="truncate">{probeStatus.text}</span>
            </span>
          )}
        </div>
        {scoreOpen && <Scoreboard items={history.data || []} />}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4" data-tour="compare-models">
          {panes.map((pane, index) => (
            <div key={pane.id} className="flex min-w-0 items-end gap-2">
              {mode === "search" ? (
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <ProviderSelect
                    value={pane.sel}
                    onChange={(sel) => replacePaneSelection(pane.id, sel)}
                    label={`Provider ${paneSlot(index, parallel)}`}
                    providers={availableSearchProviders}
                    loading={providersLoading}
                    disabled={anyBusy}
                  />
                  <ModelSelect
                    value={pane.synthSel}
                    onChange={(sel) => replacePaneSynthSelection(pane.id, sel)}
                    label={`Analysis ${paneSlot(index, parallel)}`}
                    allowEmpty
                    emptyLabel="No analysis"
                  />
                </div>
              ) : (
                <ModelSelect value={pane.sel} onChange={(sel) => replacePaneSelection(pane.id, sel)} label={paneLabel(index, parallel)} />
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Remove pane"
                aria-label="Remove pane"
                disabled={anyBusy || panes.length <= MIN_COMPARE_PANES}
                onClick={() => removePane(pane.id)}
                className="mb-0 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        {mode === "search" && providersError && <p className="text-xs text-destructive">{providersError}</p>}
        {mode === "search" && !providersLoading && !providersError && availableSearchProviders.length === 0 && (
          <p className="text-xs text-muted-foreground">No configured search providers are available.</p>
        )}
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-end" data-tour="compare-prompt">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt to send to all models…" rows={2} className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring" />
          <EvalPromptSelect mode={mode} disabled={anyBusy} onPick={pickEvalPrompt} />
          <Button onClick={run} disabled={anyBusy || !prompt.trim() || !allPanesReady}>{running ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Run</Button>
        </div>
        {expectedAnswer && (
          <div className="flex max-w-full items-center gap-2 rounded-md border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            <span className="shrink-0 font-medium">Expected:</span>
            <strong className="min-w-0 truncate font-semibold text-foreground" title={expectedAnswer}>{expectedAnswer}</strong>
            <button
              type="button"
              title="Dismiss expected answer"
              aria-label="Dismiss expected answer"
              onClick={() => { setExpectedAnswer(""); setPanes((prev) => prev.map((pane) => ({ ...pane, grade: null }))) }}
              className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className={cn(
          "grid min-h-0 flex-1 auto-rows-[minmax(18rem,1fr)] gap-3 overflow-auto pr-1",
          expandedPane ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3",
        )} data-tour="compare-panes">
          {panes.map((pane, index) => {
            const label = paneLabel(index, parallel)
            const visibleModel = revealed?.[pane.id] || (blind ? "Hidden until vote" : paneModelName(pane) || (mode === "search" ? "Select a provider" : "Select a model"))
            return (
              <Pane
                key={pane.id}
                side={label}
                model={visibleModel}
                body={pane.body}
                win={voted === pane.id}
                met={pane.met}
                running={running || rerolling === pane.id}
                err={pane.err}
                copied={copied === pane.id}
                onCopy={() => copyPane(pane.id, pane.body)}
                onExpand={() => setExpandedPane((current) => current === pane.id ? null : pane.id)}
                expanded={expandedPane === pane.id}
                hidden={!!expandedPane && expandedPane !== pane.id}
                fastest={fastestPane?.id === pane.id}
                elapsedMs={pane.elapsedMs}
                previewOpen={previewPane === pane.id}
                onTogglePreview={() => setPreviewPane((current) => current === pane.id ? null : pane.id)}
                onReroll={() => rerollPane(pane.id)}
                canReroll={(mode === "search" || !!pane.sessionId) && !anyBusy && !voted && (!!pane.body || !!pane.err)}
                rerolling={rerolling === pane.id}
                grade={pane.grade}
                activityLabel={mode === "search" ? "Searching..." : "Generating..."}
                onStop={() => stopPane(pane.id)}
                canStop={mode !== "search" && (running || rerolling === pane.id) && !!pane.sessionId && pane.elapsedMs == null}
              />
            )
          })}
        </div>
        {canVote && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {voted ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Trophy className="size-4" />Voted: {votedLabel}</span>
            ) : (
              <>
                <span className="mr-1 text-sm text-muted-foreground">Which is better?</span>
                {blind && !revealed && <Button variant="ghost" size="sm" disabled={revealing} onClick={reveal}>{revealing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}Reveal</Button>}
                {panes.map((pane, index) => (
                  <Button key={pane.id} variant="outline" size="sm" onClick={() => vote(pane.id)}>
                    {revealed?.[pane.id] ? shortName(revealed[pane.id]) : paneLabel(index, parallel)}
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => vote("tie")}>Tie</Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

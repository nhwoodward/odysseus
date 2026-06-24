// Client-side parser for the agent's `create_document` fence.
//
// The agent streams a document as a fenced block (mirrors the legacy chat.js
// fence fallback and the backend `create_document` tool format in
// src/agent_tools/document_tools.py):
//
//   ```create_document
//   <title>
//   <language?>          (optional — only if it's a known language token)
//   <content…>
//   ```
//
// We detect it live in the assistant's text so the document opens in the side
// panel (with an HTML/SVG preview) and the raw code is stripped from the chat
// bubble — instead of dumping the fence as plaintext.

// Keep in sync with _KNOWN_LANGS in src/agent_tools/document_tools.py.
const KNOWN_LANGS = new Set([
  "python", "javascript", "typescript", "html", "css", "markdown", "json",
  "yaml", "bash", "sql", "rust", "go", "java", "c", "cpp", "xml", "toml",
  "ini", "ruby", "php", "csv", "email", "text", "plain", "svg",
])

// Languages we render as a live preview (sandboxed iframe) rather than code.
const RENDERABLE = new Set(["html", "htm", "svg", "xml"])
export function isRenderable(language?: string): boolean {
  return !!language && RENDERABLE.has(language.toLowerCase())
}

export type RenderLang = "html" | "svg" | ""
// Decide whether a document should render as a live HTML/SVG preview. `language`
// is often empty (a doc titled "page.html" may carry no language), so also infer
// from the title extension and a content sniff.
export function detectRenderLang(content?: string, language?: string, title?: string): RenderLang {
  const lang = language?.toLowerCase()
  if (isRenderable(lang)) return lang === "svg" ? "svg" : "html"
  const t = title || ""
  if (/\.svg$/i.test(t)) return "svg"
  if (/\.(html?|xml)$/i.test(t)) return "html"
  const sniff = (content || "").trimStart().slice(0, 300).toLowerCase()
  if (/^(<!doctype html|<html[\s>]|<\?xml)/.test(sniff)) return "html"
  if (sniff.startsWith("<svg")) return "svg"
  return ""
}

export interface Artifact {
  title: string
  language?: string
  content: string
  closed: boolean // true once the closing ``` has streamed in
}

const FENCE = "```create_document"

// Parse the FIRST create_document fence out of `raw`. Returns the chat text to
// display (fence removed) and the extracted artifact, if any.
export function parseArtifact(raw: string): { display: string; artifact?: Artifact } {
  const idx = raw.indexOf(FENCE)
  if (idx < 0) return { display: raw }
  const headerNl = raw.indexOf("\n", idx + FENCE.length)
  if (headerNl < 0) return { display: raw.slice(0, idx).trimEnd() } // header still streaming

  const pre = raw.slice(0, idx).trimEnd()
  let rest = raw.slice(headerNl + 1)

  let closed = false
  let post = ""
  const closeIdx = rest.indexOf("\n```")
  if (closeIdx >= 0) {
    closed = true
    post = rest.slice(closeIdx + 4).trimStart()
    rest = rest.slice(0, closeIdx)
  }

  const lines = rest.split("\n")
  const title = (lines.shift() || "Untitled").trim() || "Untitled"
  let language: string | undefined
  if (lines.length) {
    const cand = lines[0].trim().toLowerCase()
    if (cand && cand.length < 20 && !cand.includes(" ") && KNOWN_LANGS.has(cand)) {
      language = cand
      lines.shift()
    }
  }
  const content = lines.join("\n")
  const display = [pre, post].filter(Boolean).join("\n\n")
  return { display, artifact: { title, language, content, closed } }
}

// Tool fences the model emits as a code block instead of via the tool
// protocol. The tool actually ran and renders as a ToolThread card, so the
// fence must never reach the chat bubble. Mirrors the original frontend's
// EXEC_FENCE_RE (chatRenderer.js). We deliberately do NOT strip ```bash /
// ```python — those are legitimate code the model shows the user, not tool
// calls. create_document is also handled by parseArtifact (the first fence),
// and is included here so any further create_document fences in the same
// round are removed too.
const TOOL_FENCE_RE = /```(?:web_search|websearch|web_fetch|fetch_url|read_file|write_file|create_document|edit_file|edit_document|update_document|suggest_document)\s*\n[\s\S]*?\n```/g

// The model sometimes cites web sources as a fenced ```sources block IN
// ADDITION to the structured `web_sources` / `research_sources` SSE event,
// which we surface as the Sources button. When we have structured sources the
// fence is a redundant raw code block — strip it. When we don't (the model
// just cited sources in an ordinary reply, no tool ran), keep the fence so the
// citations are not lost. Conditional on `hasSources` below.
const SOURCES_FENCE_RE = /```sources\s*\n[\s\S]*?\n```/g

// Bare tool-call prose: a non-tool-protocol model writes the intended call as
// plain text, e.g.  `web_search {"query": "...", "time_filter": "month"}`.
// The backend already strips this from persisted round_texts (src/tool_parsing.py
// `_parse_raw_web_json_lookup`); mirror it client-side so the LIVE stream (raw
// text) matches the cleaned reload. Only converts when a known web-tool name
// precedes a JSON object whose keys are web-search args — narrow on purpose so
// a sentence that merely mentions search is never stripped.
const BARE_WEB_TOOL_RE = /\b(?:web_search|websearch|google_search|google_search_retrieval|google_search_grounding)\b\s*/g
const WEB_SEARCH_ARG_KEYS = new Set(["query", "queries", "time_filter", "freshness", "max_pages"])

// End index (exclusive) of the balanced {...} starting at text[i], or -1 if
// unbalanced (a fence/JSON still streaming mid-token). String-aware so braces
// inside JSON string values don't fool the counter.
function balancedJsonEnd(text: string, i: number): number {
  if (text[i] !== "{") return -1
  let depth = 0
  let inStr: string | null = null
  let esc = false
  for (let j = i; j < text.length; j++) {
    const c = text[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === inStr) inStr = null
    } else if (c === '"') inStr = c
    else if (c === "{") depth++
    else if (c === "}") { depth--; if (depth === 0) return j + 1 }
  }
  return -1
}

function stripBareWebToolProse(text: string): string {
  let out = ""
  let last = 0
  BARE_WEB_TOOL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BARE_WEB_TOOL_RE.exec(text))) {
    const searchStart = m.index + m[0].length
    const searchEnd = Math.min(text.length, searchStart + 1200)
    let cutEnd = -1
    for (let k = searchStart; k < searchEnd; k++) {
      if (text[k] !== "{") continue
      const end = balancedJsonEnd(text, k)
      if (end < 0) break // incomplete JSON mid-stream — leave for a later render
      let parsed: unknown
      try { parsed = JSON.parse(text.slice(k, end)) } catch { continue }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed as Record<string, unknown>)
        if (keys.length && keys.every((key) => WEB_SEARCH_ARG_KEYS.has(key))) {
          cutEnd = end // strip the tool-name mention + the JSON object
          break
        }
      }
    }
    if (cutEnd > 0) {
      out += text.slice(last, m.index)
      last = cutEnd
      BARE_WEB_TOOL_RE.lastIndex = cutEnd
    }
  }
  out += text.slice(last)
  return out
}

// Strip a ```sources fence from arbitrary text (used for the flat, non-round
// reply path where cleanRoundText isn't called). Caller decides whether to
// invoke this (only when structured sources are already surfaced as a button).
export function stripSourcesFence(text: string): string {
  return text.replace(SOURCES_FENCE_RE, "")
}

// Clean one agent round's text for display: drop the create_document fence (it
// opens in the side panel), remove the other tool fences, and strip bare
// tool-call prose the model leaked as text. `hasSources` controls the
// ```sources fence strip (see SOURCES_FENCE_RE). Returns the display text plus
// any create_document artifact found.
export function cleanRoundText(
  raw: string,
  opts?: { hasSources?: boolean },
): { display: string; artifact?: Artifact } {
  const { display, artifact } = parseArtifact(raw)
  let out = display.replace(TOOL_FENCE_RE, "")
  out = stripBareWebToolProse(out)
  if (opts?.hasSources) out = out.replace(SOURCES_FENCE_RE, "")
  return { display: out.replace(/\n{3,}/g, "\n\n").trim(), artifact }
}

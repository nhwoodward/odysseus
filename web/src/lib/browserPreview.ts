// Recover a website the agent built inside an ephemeral browser tab.
//
// When the agent drives the builtin browser MCP it typically injects a full
// HTML document via `browser_evaluate` (e.g.
// `document.documentElement.innerHTML = \`<!DOCTYPE html>…\``) and then closes
// the tab. Nothing is persisted as a document/artifact, and `take_screenshot`
// (when called with `filename`) writes a PNG to the workspace and returns a
// text path — so neither the website nor its screenshots surface in the chat
// thread. The one thing that IS saved is the tool call's `command` JSON, which
// contains the injected HTML verbatim. This module extracts that HTML so a
// BrowserPreview card can render the actual site retroactively, for any
// past or future browser-built page, purely client-side.

import type { ToolEvent } from "@/types"

export interface BrowserSite {
  html: string
  title: string
}

// Targets that mean "the agent injected HTML into the live tab". The generic
// `.innerHTML`/`.outerHTML` alternatives cover the documentElement/body/head
// variants too, so we don't enumerate them. `insertAdjacentHTML(pos, html)`
// passes the HTML as the SECOND arg — handled specially below.
const INJECT_RE =
  /(?:\.innerHTML|\.outerHTML|document\.write(?:ln)?|insertAdjacentHTML|document\.open)\s*[=(]/

function unescapeJs(ch: string): string {
  switch (ch) {
    case "n": return "\n"
    case "t": return "\t"
    case "r": return "\r"
    case "0": return "\0"
    case "\\": return "\\"
    case "`": return "`"
    case '"': return '"'
    case "'": return "'"
    case "/": return "/"
    case "b": return "\b"
    case "f": return "\f"
    default: return ch
  }
}

// Scan a template literal starting at the opening backtick `openIdx`. Returns
// the literal body (interpolations `${…}` replaced with the empty string,
// since we can't evaluate them) and the index of the closing backtick, or null
// if unterminated. Handles escaped chars and nested template literals inside
// `${…}` (rare, but a script in the page may use them).
function scanTemplateLiteral(src: string, openIdx: number): { body: string; end: number } | null {
  let i = openIdx + 1
  let body = ""
  while (i < src.length) {
    const ch = src[i]
    if (ch === "\\") {
      // \uXXXX and \xXX — keep the escape sequence verbatim (the browser decodes
      // it; rendering it raw is fine and avoids mistreating the next chars).
      if (src[i + 1] === "u" || src[i + 1] === "x") {
        const m = src.slice(i).match(/^\\[ux][0-9a-fA-F]{2,4}/)
        if (m) { body += m[0]; i += m[0].length; continue }
      }
      body += unescapeJs(src[i + 1] ?? "")
      i += 2
      continue
    }
    if (ch === "`") return { body, end: i }
    if (ch === "$" && src[i + 1] === "{") {
      // Interpolation — scan balanced braces, allowing nested template literals.
      let depth = 1
      let j = i + 2
      while (j < src.length && depth > 0) {
        const cc = src[j]
        if (cc === "`") {
          const nested = scanTemplateLiteral(src, j)
          if (!nested) return null
          j = nested.end + 1
          continue
        }
        if (cc === "\\") { j += 2; continue }
        if (cc === "{") depth++
        else if (cc === "}") depth--
        if (depth === 0) break
        j++
      }
      if (depth !== 0) return null
      // Can't evaluate the expression — drop it. (Static sites rarely use
      // interpolation; the page still renders its structure + styles.)
      i = j + 1
      continue
    }
    body += ch
    i++
  }
  return null
}

// Scan a quoted string literal starting at the quote char `qIdx`. Returns the
// body and closing-quote index, or null if unterminated.
function scanStringLiteral(src: string, qIdx: number): { body: string; end: number } | null {
  const quote = src[qIdx]
  let i = qIdx + 1
  let body = ""
  while (i < src.length) {
    const ch = src[i]
    if (ch === "\\") {
      if (src[i + 1] === "u" || src[i + 1] === "x") {
        const m = src.slice(i).match(/^\\[ux][0-9a-fA-F]{2,4}/)
        if (m) { body += m[0]; i += m[0].length; continue }
      }
      body += unescapeJs(src[i + 1] ?? "")
      i += 2
      continue
    }
    if (ch === quote) return { body, end: i }
    body += ch
    i++
  }
  return null
}

// Pull the HTML payload out of one tool call's command. Returns null if the
// call didn't inject a document-sized HTML string.
export function extractHtmlFromCommand(name: string | undefined, command: string | undefined): string | null {
  if (!command) return null
  // The command is the tool args as a JSON string, e.g.
  // {"function": "() => { document.documentElement.innerHTML = `<!DOCTYPE…` }"}
  // or {"url": "data:text/html,…"}. JSON.parse decodes the outer escapes
  // (\n → newline, \" → ", — → em-dash) leaving clean JS/URL source.
  let arg: unknown
  try { arg = JSON.parse(command) } catch { return null }
  if (typeof arg !== "object" || !arg) return null
  const a = arg as Record<string, string>

  // data: URL navigation — decode the embedded HTML.
  const url = typeof a.url === "string" ? a.url : undefined
  if (url && /^data:text\/html/i.test(url)) {
    const comma = url.indexOf(",")
    if (comma > 0) {
      const meta = url.slice(0, comma)
      const payload = url.slice(comma + 1)
      if (/base64/i.test(meta)) {
        try { return atob(payload) } catch { return null }
      }
      return decodeURIComponent(payload)
    }
  }

  const fn = typeof a.function === "string" ? a.function : undefined
  if (!fn) return null

  // Find every injection point and extract the HTML literal it assigns. The
  // agent iterates, so collect them all and pick the best at the end.
  const found: string[] = []
  let searchFrom = 0
  while (searchFrom < fn.length) {
    const m = INJECT_RE.exec(fn.slice(searchFrom))
    if (!m) break
    const isInsertAdjacent = m[0].startsWith("insertAdjacentHTML")
    let j = searchFrom + m.index + m[0].length
    const scanAt = (k: number): { body: string; end: number } | null => {
      let p = k
      while (p < fn.length && /\s/.test(fn[p])) p++
      if (fn[p] === "`") return scanTemplateLiteral(fn, p)
      if (fn[p] === '"' || fn[p] === "'") return scanStringLiteral(fn, p)
      return null
    }
    // insertAdjacentHTML(position, html) — the HTML is the 2nd arg. Skip the
    // first literal (the position) and the comma, then scan the real payload.
    if (isInsertAdjacent) {
      const pos = scanAt(j)
      if (pos) {
        let p = pos.end + 1
        while (p < fn.length && /\s/.test(fn[p])) p++
        if (fn[p] === ",") j = p + 1
      }
    }
    const lit = scanAt(j)
    if (lit) {
      const html = lit.body.trim()
      // A real document either clears the size floor or carries a strong
      // structural marker (so a compact-but-complete landing page isn't lost).
      if (/<[a-z!]/i.test(html) && (html.length > 200 || /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html))) found.push(html)
      searchFrom = lit.end + 1
    } else {
      searchFrom = j
    }
  }

  // Strict scan found a COMPLETE document (closing </html>) — trust it; no need
  // for the riskier greedy fallback below.
  if (found.some((h) => /<\/html\s*>/i.test(h))) return pickBestDocument(found)

  // Fallback for a page whose own content has an unescaped backtick (e.g. a
  // <script> using a template literal, or text like `npm install`): the strict
  // scanner closes the outer literal early, so a truncated fragment (maybe even
  // one with a <body> tag but no </html>) is all it got. Grab the span from the
  // first backtick after the first injection target to the LAST backtick in the
  // function — for the common single-template-literal injection that span IS
  // the whole document. Only used when strict found nothing complete, so the
  // over-capture risk across multiple literals doesn't apply.
  const inj = INJECT_RE.exec(fn)
  if (inj) {
    const first = fn.indexOf("`", inj.index + inj[0].length)
    const last = fn.lastIndexOf("`")
    if (first !== -1 && last > first) {
      const greedy = decodeJsBody(fn.slice(first + 1, last)).trim()
      if (looksFullDocument(greedy)) found.push(greedy)
    }
  }

  if (!found.length) return null
  return pickBestDocument(found)
}

// Decode the JS escape sequences in a literal body without re-scanning for a
// delimiter (used by the greedy fallback, which already knows its bounds).
function decodeJsBody(raw: string): string {
  let out = ""
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\\") {
      if (raw[i + 1] === "u" || raw[i + 1] === "x") {
        const m = raw.slice(i).match(/^\\[ux][0-9a-fA-F]{2,4}/)
        if (m) { out += m[0]; i += m[0].length - 1; continue }
      }
      out += unescapeJs(raw[i + 1] ?? "")
      i++
      continue
    }
    out += raw[i]
  }
  return out
}

// A candidate that has a closing </html> or an opening <body> tag is a full
// document (vs a fragment). `<body[\s>]` matches a real tag, not the substring
// "<body" buried in escaped page content.
function looksFullDocument(html: string): boolean {
  return /<\/html>|<body[\s>]/i.test(html)
}

// Pick the website from a set of injected HTML strings. Prefer full documents
// over fragments, and the LARGEST full document — the finished site is the
// biggest; a later small re-render (error page, confirmation, sub-fragment)
// must not clobber it. Falls back to the largest of any match.
function pickBestDocument(candidates: string[]): string {
  const full = candidates.filter(looksFullDocument)
  const pool = full.length ? full : candidates
  return pool.reduce((a, b) => (b.length >= a.length ? b : a))
}

function titleFromHtml(html: string): string {
  const m = /<title>([^<]*)<\/title>/i.exec(html)
  return (m?.[1] || "").trim()
}

// Browser snapshot tool output includes a "Page Title: X" line — use it as a
// fallback label when the HTML itself has no <title>.
function titleFromSnapshot(tools: ToolEvent[]): string | null {
  for (const t of tools) {
    if (!t.name?.includes("browser_snapshot") || !t.output) continue
    // Snapshot output is a markdown dump: "… Page Title: NOAH — Creative
    // Developer ###" — strip the trailing fence (#…) and whitespace.
    const m = /Page Title:\s*(.+)/i.exec(String(t.output))
    if (m?.[1]) return m[1].replace(/\s*#+\s*$/, "").trim()
  }
  return null
}

// Scan a message's tool events for a browser-built website and return its HTML
// + a label. Across all browser tools, picks the largest full document (the
// finished site) — the same selection rule used within a single command.
export function extractBrowserSite(tools: ToolEvent[] | undefined): BrowserSite | null {
  if (!tools?.length) return null
  const candidates: string[] = []
  for (const t of tools) {
    const name = t.name || ""
    if (!name.includes("browser_evaluate") && !name.includes("browser_navigate")) continue
    const html = extractHtmlFromCommand(name, t.command)
    if (html) candidates.push(html)
  }
  if (!candidates.length) return null
  const best = pickBestDocument(candidates)
  const title = titleFromHtml(best) || titleFromSnapshot(tools) || "Website preview"
  return { html: best, title }
}
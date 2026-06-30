import { useMemo, useState } from "react"
import { ArrowLeft, PenSquare, X, Reply, ReplyAll, Forward, Archive, MailOpen, Trash2, ChevronDown, Star, CheckCheck, FileText, Sparkles, ShieldCheck, MessagesSquare } from "lucide-react"
import { SkeletonList } from "@/components/ui/skeleton"
import {
  useEmail, useEmailActions, useAttachments, aiReply, summarizeEmail, saveEmailSenderContact,
  type EmailAttachment, type EmailBoundaries, type ThreadTurn,
} from "@/api/email"
import { useNoteMutations } from "@/api/notes"
import { AttachmentRow } from "@/components/email/AttachmentRow"
import { MoveMenu } from "@/components/email/MoveMenu"
import { ReminderMenu } from "@/components/email/ReminderMenu"
import { ReaderMoreMenu } from "@/components/email/ReaderMoreMenu"
import { extractEmailAddress, localDateTimeValue, firstNameFromSender } from "@/components/email/emailFormat"
import type { Prefill } from "@/components/email/types"
import { buildEmailDraft } from "@/lib/emailDraft"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/IconButton"
import { useConfirm } from "@/components/ui/confirm"
import { cn } from "@/lib/utils"

function replySubject(subject?: string): string {
  const base = (subject || "").trim()
  return /^re\s*:/i.test(base) ? base : `Re: ${base}`
}

function forwardSubject(subject?: string): string {
  const base = (subject || "").trim()
  return /^fwd?\s*:/i.test(base) ? base : `Fwd: ${base}`
}

function splitAddressList(value?: string): string[] {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean)
}

function buildReplyAllCc(data: { to?: string; cc?: string } | undefined, ownAddresses: string[]): string {
  const mine = new Set(ownAddresses.map(extractEmailAddress).filter(Boolean))
  const seen = new Set<string>()
  const result: string[] = []
  for (const addr of [...splitAddressList(data?.to), ...splitAddressList(data?.cc)]) {
    const key = extractEmailAddress(addr)
    if (!key || mine.has(key) || seen.has(key)) continue
    seen.add(key)
    result.push(addr)
  }
  return result.join(", ")
}

function htmlToText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ")
  const el = document.createElement("div")
  el.innerHTML = html
  return el.textContent || el.innerText || ""
}

function cleanAiReply(text: string): string {
  return text
    .replace(/<<<\s*(?:REPLY|SUMMARY|OUTPUT)\s*>>+/gi, "")
    .replace(/<<<\s*END\s*>>+/gi, "")
    .trim()
}

function quoteOriginal(body: string, from: string, date?: string): string {
  const quoted = body.split("\n").map((line) => `> ${line}`).join("\n")
  let when = date || ""
  try {
    if (date) {
      const d = new Date(date)
      if (!Number.isNaN(d.getTime())) when = d.toLocaleString()
    }
  } catch { /* keep server date */ }
  return `\n\n---------- Previous message ----------\nOn ${when}, ${from} wrote:\n${quoted}`
}

type PlainTextFoldKind = "signature" | "quote"
interface PlainTextFold { kind: PlainTextFoldKind; label: string; meta?: string; body: string }
interface FoldedPlainEmail { head: string; folds: PlainTextFold[] }

const SIGNATURE_BLOAT_MIN_CHARS = 200
const WROTE_WORDS = "(?:wrote|escribio|schrieb|skrev|schreef|napisal|napisala|napisali|hat geschrieben|kirjoitti|escreveu)"
const HTML_EMAIL_FOLD_CSS = `
body{margin:0;padding:24px;background:#fff;color:#18181b;overflow-wrap:anywhere;}
img,table{max-width:100%;}
.odys-email-fold{margin:12px 0;border:1px solid #e4e4e7;border-radius:6px;background:#fafafa;overflow:hidden;}
.odys-email-fold>summary{display:flex;align-items:center;gap:8px;min-height:34px;padding:8px 10px;cursor:pointer;color:#71717b;font:600 12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;list-style:none;}
.odys-email-fold>summary::-webkit-details-marker{display:none;}
.odys-email-fold>summary::after{content:"v";margin-left:auto;font-size:10px;transition:transform .15s ease;}
.odys-email-fold[open]>summary::after{transform:rotate(180deg);}
.odys-email-fold-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:400;}
.odys-email-fold-body{border-top:1px solid #e4e4e7;padding:10px;color:#52525b;}
.odys-email-fold-body blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #d4d4d8;}
`

function lineSlices(text: string): Array<{ line: string; start: number; end: number; next: number }> {
  const matches = text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)
  const rows: Array<{ line: string; start: number; end: number; next: number }> = []
  for (const match of matches) {
    const raw = match[0]
    if (!raw) continue
    const start = match.index || 0
    const line = raw.replace(/\r?\n|\r$/, "")
    rows.push({ line, start, end: start + line.length, next: start + raw.length })
  }
  return rows
}

function compactPlainText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function isBloatedSignature(text: string): boolean {
  return compactPlainText(text).length >= SIGNATURE_BLOAT_MIN_CHARS
}

function truncateFoldMeta(value: string, limit: number): string {
  const clean = value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim()
  return clean.length > limit ? `${clean.slice(0, Math.max(0, limit - 3))}...` : clean
}

function quoteFoldMeta(section: string): string {
  const unquoted = section.replace(/^\s*>+\s?/gm, "")
  const lines = unquoted.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 14)
  const from = lines.find((line) => /^From\s*:/i.test(line))?.replace(/^From\s*:\s*/i, "") || ""
  const sent = lines.find((line) => /^(Sent|Date)\s*:/i.test(line))?.replace(/^(Sent|Date)\s*:\s*/i, "") || ""
  if (from && sent) return `${truncateFoldMeta(from, 60)} · ${truncateFoldMeta(sent, 28)}`
  if (from) return truncateFoldMeta(from, 80)
  if (sent) return truncateFoldMeta(sent, 80)

  const wroteLine = lines.find((line) => new RegExp(`^On\\s+.+\\s${WROTE_WORDS}\\s*:\\s*$`, "i").test(line))
  const wroteMatch = wroteLine?.match(new RegExp(`^On\\s+(.+?)\\s${WROTE_WORDS}\\s*:\\s*$`, "i"))
  if (!wroteMatch) return ""
  const attribution = wroteMatch[1].replace(/,\s*$/, "").trim()
  const splitAt = attribution.lastIndexOf(",")
  if (splitAt > 0) {
    const date = attribution.slice(0, splitAt).trim()
    const person = attribution.slice(splitAt + 1).trim()
    if (person && date) return `${truncateFoldMeta(person, 60)} · ${truncateFoldMeta(date, 28)}`
  }
  return truncateFoldMeta(attribution, 80)
}

function findQuoteStart(text: string): number {
  const rows = lineSlices(text)
  if (rows.length === 0) return -1
  const wroteLineRe = new RegExp(`^\\s*On\\s+.+\\s${WROTE_WORDS}\\s*:\\s*$`, "i")
  const originalRe = /^\s*[-_=]{3,}\s*(?:Original Message|Forwarded message|Previous message|Ursprungliche Nachricht|Mensaje original|Messaggio originale|Oorspronkelijk bericht)\s*[-_=]{3,}\s*$/i
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i].line.trim()
    if (originalRe.test(line) || wroteLineRe.test(line)) return rows[i].start
    if (/^From\s*:/i.test(line)) {
      const window = rows.slice(i, i + 8).map((row) => row.line).join("\n")
      if (/^(Sent|Date)\s*:/im.test(window) && /^Subject\s*:/im.test(window)) return rows[i].start
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (!/^\s*>/.test(rows[i].line)) continue
    const head = text.slice(0, rows[i].start)
    if (!head.trim()) continue
    const tailRows = rows.slice(i)
    const quotedRows = tailRows.filter((row) => /^\s*>/.test(row.line))
    const quotedText = quotedRows.map((row) => row.line.replace(/^\s*>+\s?/, "")).join("\n")
    if (quotedRows.length >= 2 && compactPlainText(quotedText).length >= 120) return rows[i].start
  }
  return -1
}

function looksContactish(line: string): boolean {
  return /[@]|tel\.?:|mobile:|phone:|www\.|https?:\/\/|^\+?\d[\d \-().]{6,}$/i.test(line.trim())
}

function findSignatureFoldStart(text: string): number {
  const rows = lineSlices(text)
  if (rows.length === 0) return -1
  const closingRe = /^(?:Best regards|Best wishes|Kind regards|Yours truly|Yours sincerely|Yours faithfully|Sincerely|Cheers|Thanks|Thank you|Regards|Warm regards|Many thanks|Talk soon|Take care)[,!.\s]*$/i
  const mobileRe = /^(?:Sent from my (?:iPhone|iPad|Android|Galaxy|Pixel|phone|mobile)|Get Outlook for (?:iOS|Android|Windows|Mac|mobile))/i
  const disclaimerRe = /^(?:CONFIDENTIALITY NOTICE|DISCLAIMER|This e-?mail (?:is confidential|may contain confidential)|The information (?:contained )?in this e-?mail|This message and any attachments)/i

  for (const row of rows) {
    if (row.line.trim() !== "--") continue
    const tail = text.slice(row.next)
    if (isBloatedSignature(tail)) return row.start
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!mobileRe.test(row.line.trim()) && !disclaimerRe.test(row.line.trim())) continue
    const tail = text.slice(row.start)
    if (isBloatedSignature(tail)) return row.start
  }

  const lateBodyStart = Math.max(text.length * 0.45, text.length - 1200)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.start < lateBodyStart || !closingRe.test(row.line.trim())) continue
    let foldStart = row.next
    for (let j = i + 1; j < rows.length; j++) {
      const nextLine = rows[j].line.trim()
      if (!nextLine) continue
      if (!looksContactish(nextLine)) foldStart = rows[j].next
      break
    }
    const tail = text.slice(foldStart)
    if (isBloatedSignature(tail)) return foldStart
  }
  return -1
}

function boundaryOffset(value: unknown, length: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < length ? Math.floor(value) : -1
}

function splitFoldedPlainEmailByBoundaries(text: string, boundaries?: EmailBoundaries | null): FoldedPlainEmail | null {
  if (!boundaries || !text) return null
  const sigStart = boundaryOffset(boundaries.sig_start, text.length)
  const quoteStart = boundaryOffset(boundaries.quote_start, text.length)
  if (sigStart < 0 && quoteStart < 0) return null

  const folds: PlainTextFold[] = []

  if (sigStart >= 0 && quoteStart >= 0) {
    if (sigStart < quoteStart) {
      const sigBody = text.slice(sigStart, quoteStart).trim()
      const quoteBody = text.slice(quoteStart).trim()
      if (sigBody && isBloatedSignature(sigBody)) {
        folds.push({ kind: "signature", label: "Signature", body: sigBody })
        if (quoteBody) folds.push({ kind: "quote", label: "Earlier thread", meta: quoteFoldMeta(quoteBody), body: quoteBody })
        return { head: text.slice(0, sigStart).trimEnd(), folds }
      }
      if (quoteBody) folds.push({ kind: "quote", label: "Earlier thread", meta: quoteFoldMeta(quoteBody), body: quoteBody })
      return { head: text.slice(0, quoteStart).trimEnd(), folds }
    }

    const quoteBody = text.slice(quoteStart, sigStart).trim()
    const sigBody = text.slice(sigStart).trim()
    if (sigBody && isBloatedSignature(sigBody)) {
      if (quoteBody) folds.push({ kind: "quote", label: "Earlier thread", meta: quoteFoldMeta(quoteBody), body: quoteBody })
      folds.push({ kind: "signature", label: "Signature", body: sigBody })
      return { head: text.slice(0, quoteStart).trimEnd(), folds }
    }
    const fullQuote = text.slice(quoteStart).trim()
    if (fullQuote) folds.push({ kind: "quote", label: "Earlier thread", meta: quoteFoldMeta(fullQuote), body: fullQuote })
    return { head: text.slice(0, quoteStart).trimEnd(), folds }
  }

  if (quoteStart >= 0) {
    const quoteBody = text.slice(quoteStart).trim()
    if (quoteBody) folds.push({ kind: "quote", label: "Earlier thread", meta: quoteFoldMeta(quoteBody), body: quoteBody })
    return { head: text.slice(0, quoteStart).trimEnd(), folds }
  }

  const sigBody = text.slice(sigStart).trim()
  if (!sigBody || !isBloatedSignature(sigBody)) return null
  folds.push({ kind: "signature", label: "Signature", body: sigBody })
  return { head: text.slice(0, sigStart).trimEnd(), folds }
}

function splitFoldedPlainEmail(text: string, boundaries?: EmailBoundaries | null): FoldedPlainEmail {
  const boundarySplit = splitFoldedPlainEmailByBoundaries(text, boundaries)
  if (boundarySplit) return boundarySplit

  const quoteStart = findQuoteStart(text)
  const visibleEnd = quoteStart >= 0 ? quoteStart : text.length
  const visibleText = text.slice(0, visibleEnd)
  const sigStart = findSignatureFoldStart(visibleText)
  const folds: PlainTextFold[] = []
  const headEnd = sigStart >= 0 ? sigStart : visibleEnd
  if (sigStart >= 0) {
    const sigBody = text.slice(sigStart, visibleEnd).trim()
    if (sigBody) folds.push({ kind: "signature", label: "Signature", body: sigBody })
  }
  if (quoteStart >= 0) {
    const quoteBody = text.slice(quoteStart).trim()
    if (quoteBody) folds.push({ kind: "quote", label: "Earlier thread", meta: quoteFoldMeta(quoteBody), body: quoteBody })
  }
  return { head: text.slice(0, headEnd).trimEnd(), folds }
}

function FoldedPlainEmailBody({ text, boundaries }: { text?: string; boundaries?: EmailBoundaries | null }) {
  const value = text || ""
  const folded = useMemo(() => splitFoldedPlainEmail(value, boundaries), [value, boundaries])
  if (!value || folded.folds.length === 0) {
    return <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-6 text-sm">{value || "(empty)"}</pre>
  }
  return (
    <div className="flex-1 overflow-auto p-6 text-sm">
      {folded.head && <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{folded.head}</pre>}
      <div className={cn("space-y-2", folded.head && "mt-4")}>
        {folded.folds.map((fold, index) => (
          <details key={`${fold.kind}-${index}`} className="group rounded-md border bg-muted/20">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground marker:hidden hover:bg-accent/60">
              <span>{fold.label}</span>
              {fold.meta && <span className="truncate font-normal">{fold.meta}</span>}
              <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t p-3 font-sans text-xs leading-relaxed text-muted-foreground">{fold.body}</pre>
          </details>
        ))}
      </div>
    </div>
  )
}

// Thread-turn meta from the backend parser looks like "Author <email> · date".
// Pull out a display author + date for the stacked card header. Falls back to
// the raw meta string when it doesn't match the expected shape.
function parseTurnMeta(meta?: string | null): { author: string; date: string } {
  const raw = (meta || "").trim()
  if (!raw) return { author: "", date: "" }
  const [left, ...rest] = raw.split("·")
  const date = rest.join("·").trim()
  let author = left.trim()
  const bracket = author.match(/^(.*?)\s*<[^>]+>\s*$/)
  if (bracket && bracket[1].trim()) author = bracket[1].trim()
  return { author: author || raw, date }
}

// Render parsed thread turns as stacked message cards. Level 0 (the current
// message) shows expanded; deeper, older turns collapse into <details> so the
// reader can drill into the history without it dominating the pane. Mirrors the
// legacy collapsible thread view (emailLibrary.js).
function ThreadedEmailView({
  turns,
  from,
  date,
}: {
  turns: ThreadTurn[]
  from: string
  date?: string
}) {
  const ordered = useMemo(() => turns.slice().sort((a, b) => a.level - b.level), [turns])
  return (
    <div className="flex-1 space-y-3 overflow-auto p-6">
      {ordered.map((turn, index) => {
        const meta = turn.level === 0
          ? { author: from || "Me", date: date ? new Date(date).toLocaleString() : "" }
          : parseTurnMeta(turn.meta)
        const html = transformEmailHtml(turn.body_html || "")
        const header = (
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">{meta.author || "Earlier reply"}</span>
            {meta.date && <span className="shrink-0 text-xs text-muted-foreground">{meta.date}</span>}
          </div>
        )
        if (turn.level === 0) {
          return (
            <div key={`turn-${index}`} className="overflow-hidden rounded-md border bg-card">
              <div className="border-b px-3 py-2">{header}</div>
              <iframe title={`thread-turn-${index}`} sandbox="" srcDoc={html} className="min-h-48 w-full bg-white" />
            </div>
          )
        }
        return (
          <details key={`turn-${index}`} className="group overflow-hidden rounded-md border bg-muted/20">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:hidden hover:bg-accent/60">
              {header}
              <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <iframe title={`thread-turn-${index}`} sandbox="" srcDoc={html} className="min-h-40 w-full border-t bg-white" />
          </details>
        )
      })}
    </div>
  )
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function htmlFragmentText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ")
  const el = document.createElement("div")
  el.innerHTML = html
  return el.textContent || el.innerText || ""
}

function foldSummaryHtml(label: string, meta?: string): string {
  const cleanMeta = (meta || "").trim()
  return `<summary><span>${escapeHtmlText(label)}</span>${cleanMeta ? `<span class="odys-email-fold-meta">${escapeHtmlText(cleanMeta)}</span>` : ""}</summary>`
}

function createHtmlFold(doc: Document, kind: PlainTextFoldKind, label: string, meta?: string): { details: HTMLDetailsElement; body: HTMLDivElement } {
  const details = doc.createElement("details")
  details.className = `odys-email-fold odys-email-${kind}-fold`
  const summary = doc.createElement("summary")
  const labelSpan = doc.createElement("span")
  labelSpan.textContent = label
  summary.appendChild(labelSpan)
  if (meta) {
    const metaSpan = doc.createElement("span")
    metaSpan.className = "odys-email-fold-meta"
    metaSpan.textContent = meta
    summary.appendChild(metaSpan)
  }
  const body = doc.createElement("div")
  body.className = "odys-email-fold-body"
  details.append(summary, body)
  return { details, body }
}

function htmlLooksLikeSignature(el: Element): boolean {
  const text = compactPlainText(el.textContent || "")
  if (!text) return false
  const sigTells = [
    /\bregistered\s+in\b/i,
    /\blimited\s+liability\s+partnership\b/i,
    /\b(Pte\.?\s*Ltd|GmbH|S\.A\.|S\.A\.S|LLC|LLP|Inc\.?)\b/,
    /\bintended\s+solely\s+for\b/i,
    /\bconfidential(?:ity)?\s+(?:notice|information)\b/i,
    /\b(?:disclaimer|please\s+(?:notify|delete))\b/i,
    /\bunsubscribe\b/i,
    /\b\+\d[\d\s().-]{6,}\b/,
  ]
  const priorTells = [/\bHi\s+[A-Z][a-z]+\b/, /\bDear\s+[A-Z][a-z]+\b/, /\bRegards\b/i, /\?\s*$/]
  const sigScore = sigTells.filter((re) => re.test(text)).length
  const priorScore = priorTells.filter((re) => re.test(text)).length
  return sigScore >= 3 && priorScore <= 1
}

function nearbyAttributionMeta(bq: Element): string {
  const parent = bq.parentNode
  if (!parent) return ""
  const nodes: ChildNode[] = []
  let cursor = bq.previousSibling
  let nonEmpty = 0
  while (cursor && nonEmpty < 3) {
    nodes.unshift(cursor)
    const text = (cursor.textContent || "").trim()
    if (text) nonEmpty += 1
    const collected = compactPlainText(nodes.map((node) => node.textContent || "").join("\n"))
    if (collected.length > 800) break
    cursor = cursor.previousSibling
  }
  const text = nodes.map((node) => node.textContent || "").join("\n").trim()
  if (!text) return ""
  const isAttribution = new RegExp(`\\bOn\\b.+\\b${WROTE_WORDS}\\s*:\\s*$`, "i").test(text)
    || /Original Message|Forwarded message|Previous message/i.test(text)
    || (/From\s*:/i.test(text) && /(Sent|Date)\s*:/i.test(text))
  if (!isAttribution) return ""
  const meta = quoteFoldMeta(text) || truncateFoldMeta(text, 80)
  if (text.length <= 320) {
    for (const node of nodes) {
      if (node.parentNode === parent) parent.removeChild(node)
    }
  }
  return meta
}

function foldHtmlQuotedBlocks(doc: Document): void {
  const root = doc.body
  const blockquotes = Array.from(root.querySelectorAll("blockquote")).filter((bq) =>
    !bq.parentElement?.closest("blockquote") && !bq.closest("details")
  )
  for (const bq of blockquotes) {
    const parent = bq.parentNode
    if (!parent) continue
    const meta = nearbyAttributionMeta(bq) || quoteFoldMeta(bq.textContent || "")
    const kind: PlainTextFoldKind = !meta && htmlLooksLikeSignature(bq) ? "signature" : "quote"
    const { details, body } = createHtmlFold(doc, kind, kind === "signature" ? "Signature" : "Earlier thread", meta)
    parent.insertBefore(details, bq)
    body.appendChild(bq)
  }
}

function foldHtmlExplicitSignatures(doc: Document): void {
  const selector = ".gmail_signature, [data-smartmail='gmail_signature'], #Signature, #signature, #divRplyFwdMsg"
  const candidates = Array.from(doc.body.querySelectorAll(selector)).filter((el) =>
    !el.closest("details") && !el.parentElement?.closest(selector)
  )
  for (const el of candidates) {
    if (!isBloatedSignature(el.textContent || "")) continue
    const parent = el.parentNode
    if (!parent) continue
    const { details, body } = createHtmlFold(doc, "signature", "Signature")
    parent.insertBefore(details, el)
    body.appendChild(el)
  }
}

function foldHtmlRegexQuote(html: string): string {
  if (html.includes("odys-email-quote-fold")) return html
  const outlookRe = /(<br\s*\/?>|<\/p>|<\/div>|<p[^>]*>|<div[^>]*>|\n)\s*((?:<[^>]+>\s*)*From\s*:\s*[\s\S]+?(?:Sent|Date)\s*:[\s\S]+?Subject\s*:[\s\S]+)$/i
  const match = html.match(outlookRe)
  if (!match) return html
  const idx = html.lastIndexOf(match[0])
  if (idx < 0) return html
  const quoteHtml = match[2]
  const meta = quoteFoldMeta(htmlFragmentText(quoteHtml))
  return `${html.slice(0, idx)}${match[1]}<details class="odys-email-fold odys-email-quote-fold">${foldSummaryHtml("Earlier thread", meta)}<div class="odys-email-fold-body">${quoteHtml}</div></details>`
}

function foldHtmlRegexSignature(html: string): string {
  const wrap = (idx: number, marker: string, tail: string) => {
    if (!isBloatedSignature(htmlFragmentText(tail))) return html
    if (/<blockquote\b/i.test(tail) || tail.includes("odys-email-quote-fold")) return html
    return `${html.slice(0, idx)}${marker}<details class="odys-email-fold odys-email-signature-fold">${foldSummaryHtml("Signature")}<div class="odys-email-fold-body">${tail}</div></details>`
  }
  let match = html.match(/(<br\s*\/?>|\n)\s*--\s*(<br\s*\/?>|\n)([\s\S]*)$/i)
  if (match) {
    const idx = html.lastIndexOf(match[0])
    if (idx >= 0) return wrap(idx, match[1], match[3])
  }
  const blockBoundary = "(?:<br\\s*/?>|<\\/p>|<\\/div>|<\\/li>|<p[^>]*>|<div[^>]*>|<span[^>]*>|\\n)"
  match = html.match(new RegExp(`(${blockBoundary})\\s*((?:Sent from my (?:iPhone|iPad|Android|Galaxy|Pixel|phone|mobile)|Get Outlook for (?:iOS|Android|Windows|Mac|mobile)|CONFIDENTIALITY NOTICE|DISCLAIMER|This e-?mail (?:is confidential|may contain confidential)|The information (?:contained )?in this e-?mail|This message and any attachments)[\\s\\S]*)$`, "i"))
  if (match) {
    const idx = html.lastIndexOf(match[0])
    if (idx >= 0) return wrap(idx, match[1], match[2])
  }
  return html
}

function transformEmailHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html
  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    foldHtmlQuotedBlocks(doc)
    doc.body.innerHTML = foldHtmlRegexQuote(doc.body.innerHTML)
    foldHtmlExplicitSignatures(doc)
    doc.body.innerHTML = foldHtmlRegexSignature(doc.body.innerHTML)
    doc.querySelectorAll("a[href]").forEach((link) => {
      link.setAttribute("target", "_blank")
      link.setAttribute("rel", "noopener noreferrer")
    })
    const base = doc.createElement("base")
    base.target = "_blank"
    doc.head.prepend(base)
    const style = doc.createElement("style")
    style.textContent = HTML_EMAIL_FOLD_CSS
    doc.head.appendChild(style)
    return `<!doctype html>\n${doc.documentElement.outerHTML}`
  } catch {
    return html
  }
}

function HtmlEmailFrame({ html }: { html: string }) {
  const srcDoc = useMemo(() => transformEmailHtml(html), [html])
  return <iframe title="email" sandbox="" srcDoc={srcDoc} className="min-h-0 w-full flex-1 bg-white" />
}

function currentHtmlMessageText(html: string): string {
  if (typeof DOMParser === "undefined") return htmlToText(html)
  try {
    const transformed = transformEmailHtml(html)
    const doc = new DOMParser().parseFromString(transformed, "text/html")
    doc.body.querySelectorAll(".odys-email-fold").forEach((el) => el.remove())
    return compactPlainText(doc.body.textContent || "") ? (doc.body.textContent || "").trim() : htmlToText(html).trim()
  } catch {
    return htmlToText(html).trim()
  }
}

function currentMessageText(text?: string, html?: string, boundaries?: EmailBoundaries | null): string {
  const raw = text || (html ? currentHtmlMessageText(html) : "")
  if (!raw.trim()) return ""
  const folded = splitFoldedPlainEmail(raw, boundaries)
  const head = folded.folds.length > 0 ? folded.head.trim() : raw.trim()
  return head || raw.trim()
}

function forwardedBody(data: { from?: string; from_name?: string; from_address?: string; date?: string; subject?: string; to?: string; cc?: string }, body: string): string {
  const from = data.from || (data.from_name && data.from_address ? `${data.from_name} <${data.from_address}>` : data.from_address) || ""
  const headers = [
    "---------- Forwarded message ----------",
    from ? `From: ${from}` : "",
    data.date ? `Date: ${data.date}` : "",
    data.subject ? `Subject: ${data.subject}` : "",
    data.to ? `To: ${data.to}` : "",
    data.cc ? `Cc: ${data.cc}` : "",
  ].filter(Boolean).join("\n")
  return `\n\n${headers}\n\n${body || ""}`
}

function shouldUseFastAiReply(subject: string, body: string, attachments: EmailAttachment[]): boolean {
  if (attachments.length > 0) return false
  const text = `${subject}\n${body}`.toLowerCase()
  if (/\b(attach(?:ed|ment)?|pdf|document|contract|invoice|receipt|quote|estimate|proposal|question|questions|details|schedule|booking|reservation|meeting|calendar|availability|confirm|confirmation|review|sign|signature)\b/.test(text)) {
    return false
  }
  return body.length < 2500
}

export function Reader({
  uid,
  folder,
  accountId,
  isSpam,
  ownAddresses,
  folders,
  onBack,
  onReply,
  onReplyDocument,
}: {
  uid: string
  folder: string
  accountId?: string
  isSpam?: boolean
  ownAddresses: string[]
  folders: string[]
  onBack: () => void
  onReply: (p: Prefill) => void
  onReplyDocument: (draft: { title: string; content: string }) => Promise<void>
}) {
  const { data, isLoading } = useEmail(uid, folder, accountId)
  const { markRead, markUnread, archive, remove, deletePermanent, flag, move, markAnswered, clearAnswered, unflagSpam } = useEmailActions(folder, accountId)
  const { create: createNote } = useNoteMutations()
  const confirm = useConfirm()
  const { data: attData } = useAttachments(uid, folder, accountId)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState("")
  const [actionBusy, setActionBusy] = useState("")
  const [actionNotice, setActionNotice] = useState("")
  const [actionErr, setActionErr] = useState("")
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderNotice, setReminderNotice] = useState("")
  const [reminderErr, setReminderErr] = useState("")
  const [summaryState, setSummaryState] = useState<{ key: string; open: boolean; text?: string; err?: string } | null>(null)
  const [summaryBusyKey, setSummaryBusyKey] = useState("")
  const [docBusy, setDocBusy] = useState(false)
  const [threadView, setThreadView] = useState(true)
  const html = data?.body_html || data?.html
  const text = data?.body_text || data?.body || data?.text
  const from = data?.from_name || data?.from_address || data?.from || data?.from_addr || data?.sender || ""
  const addr = data?.from_address || data?.from_addr || from
  const flagged = !!data?.is_flagged
  const answered = !!data?.is_answered
  const attachments = attData?.attachments || data?.attachments || []
  const bodyText = text || (html ? htmlToText(html) : "")
  const boundaries = data?.boundaries || null
  const threadTurns = useMemo(() => (data?.thread_turns || []).filter((t): t is ThreadTurn => !!t && typeof t.level === "number"), [data?.thread_turns])
  // Offer the stacked thread view only when the parser actually split the
  // message into multiple turns (i.e. there's earlier history to show).
  const hasThread = threadTurns.length >= 2
  const replySourceText = useMemo(() => currentMessageText(text, html, boundaries) || bodyText, [text, html, boundaries, bodyText])
  const subject = data?.subject || ""
  const messageKey = `${folder}:${uid}`
  const cachedSummary = cleanAiReply(data?.cached_summary || "")
  const summaryForMessage = summaryState?.key === messageKey ? summaryState : null
  const summaryText = summaryForMessage?.text ?? cachedSummary
  const summaryOpen = summaryForMessage?.open ?? !!cachedSummary
  const summaryErr = summaryForMessage?.err || ""
  const summaryBusy = summaryBusyKey === messageKey
  const replyMeta = {
    to: addr,
    subject: replySubject(subject),
    inReplyTo: data?.message_id,
    references: data?.message_id ? [data.references, data.message_id].filter(Boolean).join(" ") : data?.references,
    accountId: data?.account_id || accountId,
  }
  const openReply = (draftBody = `\n\n---\n${replySourceText}`) => {
    onReply({ ...replyMeta, body: draftBody })
  }
  const openReplyAll = () => {
    onReply({ ...replyMeta, cc: buildReplyAllCc(data, ownAddresses), body: `\n\n---\n${replySourceText}` })
  }
  const openForward = () => {
    if (!data) return
    onReply({
      to: "",
      subject: forwardSubject(subject),
      body: forwardedBody({ ...data, from }, bodyText),
      accountId: data.account_id || accountId,
    })
  }
  const openStandaloneTab = () => {
    if (typeof window === "undefined") return
    const href = `${window.location.origin}/v2/email#email=${encodeURIComponent(folder)}:${encodeURIComponent(uid)}`
    window.open(href, "_blank", "noopener,noreferrer")
  }
  const saveSender = async () => {
    if (!data || actionBusy) return
    const email = extractEmailAddress(data.from_address || data.from_addr || data.from || addr)
    if (!email) {
      setActionErr("No sender address to save.")
      return
    }
    const name = (data.from_name || from || email.split("@")[0]).replace(/<[^>]+>/g, "").trim()
    setActionBusy("contact"); setActionNotice(""); setActionErr("")
    try {
      const r = await saveEmailSenderContact({ name, email })
      setActionNotice(r.message === "Already exists" ? "Already in contacts." : "Saved sender to contacts.")
    } catch {
      setActionErr("Couldn't save sender to contacts.")
    } finally {
      setActionBusy("")
    }
  }
  const moveToSpam = async () => {
    if (actionBusy) return
    if (!(await confirm({ title: "Move this email to Spam?", confirmText: "Move to Spam", destructive: true }))) return
    setActionBusy("spam"); setActionNotice(""); setActionErr("")
    try {
      await move.mutateAsync({ uid, dest: "Junk" })
      onBack()
    } catch {
      setActionErr("Couldn't move the email to Spam.")
    } finally {
      setActionBusy("")
    }
  }
  const markNotSpam = async () => {
    if (actionBusy) return
    setActionBusy("not-spam"); setActionNotice(""); setActionErr("")
    try {
      await unflagSpam.mutateAsync(uid)
      setActionNotice("Marked as not spam.")
    } catch {
      setActionErr("Couldn't mark the email as not spam.")
    } finally {
      setActionBusy("")
    }
  }
  const permanentlyDelete = async () => {
    if (actionBusy) return
    if (!(await confirm({ title: `Permanently delete "${subject || "(no subject)"}"?`, description: "This cannot be undone.", destructive: true, confirmText: "Delete" }))) return
    setActionBusy("permanent"); setActionNotice(""); setActionErr("")
    try {
      await deletePermanent.mutateAsync(uid)
      onBack()
    } catch {
      setActionErr("Couldn't permanently delete the email.")
    } finally {
      setActionBusy("")
    }
  }
  const openDocumentReply = async () => {
    if (!data || docBusy) return
    setAiErr("")
    const body = `${quoteOriginal(replySourceText || "", from, data.date)}`
    const content = buildEmailDraft({
      to: addr,
      cc: "",
      bcc: "",
      subject: replyMeta.subject,
      inReplyTo: replyMeta.inReplyTo || "",
      references: replyMeta.references || "",
      sourceUid: uid,
      sourceFolder: folder,
      sourceAccount: data.account_id || accountId || "",
      attachments: [],
      body,
    })
    setDocBusy(true)
    try {
      await onReplyDocument({ title: replyMeta.subject, content })
    } catch {
      setAiErr("Couldn't create the reply document.")
    } finally {
      setDocBusy(false)
    }
  }
  const openAiReply = async () => {
    if (!data || aiBusy) return
    setAiErr("")
    const source = replySourceText.trim()
    if (!source) {
      setAiErr("No email body to draft from.")
      return
    }
    const cached = cleanAiReply(data.cached_ai_reply || "")
    if (cached) {
      onReply({ ...replyMeta, body: `${cached}${quoteOriginal(source, from, data.date)}` })
      return
    }
    setAiBusy(true)
    try {
      const r = await aiReply({
        uid,
        folder,
        to: addr,
        subject: replyMeta.subject,
        original_body: source,
        message_id: data.message_id,
        account_id: data.account_id || accountId,
        fast: shouldUseFastAiReply(subject, source, attachments),
      })
      if (r.success === false || !r.reply) {
        setAiErr(r.error || "AI reply could not be generated.")
        return
      }
      onReply({ ...replyMeta, body: `${cleanAiReply(r.reply)}${quoteOriginal(source, from, data.date)}` })
    } catch {
      setAiErr("AI reply failed.")
    } finally {
      setAiBusy(false)
    }
  }
  const toggleAnswered = async () => {
    if (answered) {
      clearAnswered.mutate(uid)
      return
    }
    try {
      await markAnswered.mutateAsync(uid)
      await markRead.mutateAsync(uid)
    } catch {
      setAiErr("Couldn't update the email.")
    }
  }
  const createReplyReminder = async (dueDate: Date) => {
    if (!data || reminderBusy) return
    setReminderBusy(true)
    setReminderErr("")
    setReminderNotice("")
    try {
      const who = firstNameFromSender(from || addr || "someone")
      const due = localDateTimeValue(dueDate)
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const link = origin ? `${origin}/v2/email#email=${encodeURIComponent(folder)}:${encodeURIComponent(uid)}` : ""
      await createNote.mutateAsync({
        title: `Reply: ${subject || "(no subject)"}`,
        note_type: "todo",
        items: [{ text: `Reply to ${who}: ${subject || "(no subject)"}`, checked: false }],
        content: link ? `Open email: ${link}` : "Remember to reply to this email.",
        label: "email reminder",
        due_date: due,
      })
      setReminderNotice(`Reminder set for ${dueDate.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`)
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        try { void Notification.requestPermission() } catch { /* ignore */ }
      }
    } catch {
      setReminderErr("Couldn't create the reminder.")
    } finally {
      setReminderBusy(false)
    }
  }
  const toggleSummary = () => {
    setSummaryState((current) => ({
      key: messageKey,
      open: !summaryOpen,
      text: current?.key === messageKey ? current.text : undefined,
      err: "",
    }))
  }
  const generateSummary = async () => {
    if (!data || summaryBusy) return
    setSummaryState((current) => ({
      key: messageKey,
      open: true,
      text: current?.key === messageKey ? current.text : undefined,
      err: "",
    }))
    const source = bodyText.trim()
    if (!source) {
      setSummaryState((current) => ({
        key: messageKey,
        open: true,
        text: current?.key === messageKey ? current.text : undefined,
        err: "No email body to summarize.",
      }))
      return
    }
    setSummaryBusyKey(messageKey)
    try {
      const r = await summarizeEmail({
        uid,
        folder,
        body: source,
        subject,
        from: data.from_name ? `${data.from_name} <${addr}>` : addr,
        message_id: data.message_id,
        account_id: data.account_id || accountId,
      })
      if (r.success === false || !r.summary) {
        setSummaryState((current) => ({
          key: messageKey,
          open: true,
          text: current?.key === messageKey ? current.text : undefined,
          err: r.error || "Summary could not be generated.",
        }))
        return
      }
      setSummaryState({ key: messageKey, open: true, text: cleanAiReply(r.summary), err: "" })
    } catch {
      setSummaryState((current) => ({
        key: messageKey,
        open: true,
        text: current?.key === messageKey ? current.text : undefined,
        err: "Summary failed.",
      }))
    } finally {
      setSummaryBusyKey((current) => current === messageKey ? "" : current)
    }
  }
  const after = (fn: () => void) => { fn(); onBack() }
  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 md:flex-nowrap md:py-0">
        <Button variant="ghost" size="icon" onClick={onBack} title="Back" aria-label="Back"><ArrowLeft className="size-4" /></Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{data?.subject || "(no subject)"}</div>
          <div className="truncate text-xs text-muted-foreground">{from}{data?.date ? ` · ${new Date(data.date).toLocaleString()}` : ""}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
          <IconButton icon={<Star className={cn(flagged && "fill-current")} />} label={flagged ? "Unflag" : "Flag"} onClick={() => flag.mutate({ uid, on: !flagged })} className={flagged ? "text-foreground" : "text-muted-foreground"} />
          <IconButton icon={<CheckCheck />} label={answered ? "Mark not done" : "Mark done"} onClick={toggleAnswered} className={answered ? "text-foreground" : "text-muted-foreground"} />
          {isSpam && (
            <IconButton icon={<ShieldCheck />} label="Not spam" onClick={markNotSpam} disabled={!!actionBusy} className="text-muted-foreground disabled:pointer-events-none disabled:opacity-50" />
          )}
          <ReminderMenu busy={reminderBusy} onPick={createReplyReminder} />
          <IconButton icon={<FileText className={cn(summaryText && "fill-current")} />} label={summaryOpen ? "Hide summary" : "Summary"} onClick={toggleSummary} className={summaryOpen || summaryText ? "text-foreground" : "text-muted-foreground"} />
          {hasThread && (
            <IconButton icon={<MessagesSquare />} label={threadView ? "Show full message" : "Show thread"} onClick={() => setThreadView((v) => !v)} className={threadView ? "text-foreground" : "text-muted-foreground"} />
          )}
          <IconButton icon={<Reply />} label="Reply" onClick={() => openReply()} className="text-muted-foreground" />
          <IconButton icon={<ReplyAll />} label="Reply all" onClick={openReplyAll} disabled={!data} className="hidden text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:inline-flex" />
          <IconButton icon={<Forward />} label="Forward" onClick={openForward} disabled={!data} className="hidden text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:inline-flex" />
          <IconButton icon={<PenSquare />} label="Draft reply in Library" onClick={openDocumentReply} disabled={docBusy || isLoading} className="hidden text-muted-foreground disabled:pointer-events-none disabled:opacity-50 md:inline-flex" />
          <IconButton icon={<Sparkles className={cn(data?.cached_ai_reply && "fill-current text-foreground")} />} label={data?.cached_ai_reply ? "AI reply (cached draft ready)" : "AI reply"} onClick={openAiReply} disabled={aiBusy || isLoading} className="text-muted-foreground disabled:pointer-events-none disabled:opacity-50" />
          <IconButton icon={<MailOpen />} label="Mark unread" onClick={() => after(() => markUnread.mutate(uid))} className="hidden text-muted-foreground md:inline-flex" />
          <MoveMenu folders={folders} current={folder} onMove={(dest) => after(() => move.mutate({ uid, dest }))} />
          <IconButton icon={<Archive />} label="Archive" onClick={() => after(() => archive.mutate(uid))} className="text-muted-foreground" />
          <IconButton icon={<Trash2 />} label="Delete" onClick={async () => { if (await confirm({ title: "Delete this email?", destructive: true })) after(() => remove.mutate(uid)) }} className="text-muted-foreground hover:text-destructive" />
          <ReaderMoreMenu
            disabled={isLoading}
            busy={actionBusy}
            onOpenTab={openStandaloneTab}
            onSaveSender={saveSender}
            onMoveSpam={moveToSpam}
            onDeletePermanent={permanentlyDelete}
          />
        </div>
      </header>
      {(actionNotice || actionErr) && <div className={cn("shrink-0 border-b px-4 py-2 text-xs", actionErr ? "text-destructive" : "text-muted-foreground")}>{actionErr || actionNotice}</div>}
      {(reminderNotice || reminderErr) && <div className={cn("shrink-0 border-b px-4 py-2 text-xs", reminderErr ? "text-destructive" : "text-muted-foreground")}>{reminderErr || reminderNotice}</div>}
      {summaryOpen && (
        <section className="shrink-0 border-b bg-muted/20 px-4 py-3 text-sm">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="size-3.5" />
            <span>Summary</span>
            <IconButton icon={<X />} label="Hide summary" onClick={() => setSummaryState((current) => ({ key: messageKey, open: false, text: current?.key === messageKey ? current.text : undefined, err: "" }))} className="ml-auto text-muted-foreground" />
          </div>
          {summaryText ? (
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">{summaryText}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>No AI summary generated.</span>
              <Button variant="outline" size="sm" disabled={summaryBusy} onClick={generateSummary}>{summaryBusy ? "Generating…" : "Generate now"}</Button>
            </div>
          )}
          {summaryErr && <p className="mt-2 text-xs text-destructive">{summaryErr}</p>}
        </section>
      )}
      {aiErr && <div className="shrink-0 border-b px-4 py-2 text-xs text-destructive">{aiErr}</div>}
      {attachments.length > 0 && (
        <div className="shrink-0 space-y-1.5 border-b px-4 py-3">
          {attachments.map((att) => <AttachmentRow key={att.index} uid={uid} folder={folder} accountId={accountId} att={att} />)}
        </div>
      )}
      {isLoading ? <SkeletonList rows={3} className="p-4" />
        : data?.error ? <div className="p-6 text-sm text-muted-foreground">Couldn't load this message.</div>
        : hasThread && threadView ? <ThreadedEmailView turns={threadTurns} from={from} date={data?.date} />
        : html ? <HtmlEmailFrame html={html} />
        : <FoldedPlainEmailBody text={text} boundaries={boundaries} />}
    </div>
  )
}

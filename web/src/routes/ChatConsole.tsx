import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { MoreHorizontal, Download, Copy, EyeOff, FileText, Users, ArrowDown } from "lucide-react"
import { useChat } from "@/lib/useChat"
import { useComposer } from "@/stores/composer"
import { useSessions } from "@/api/sessions"
import { useSessionDocuments } from "@/api/documents"
import { useAuthStatus } from "@/api/auth"
import { usePersonalization } from "@/api/prefs"
import { greeting } from "@/lib/personalization"
import { getPersistentPersonaName } from "@/lib/persistentPersona"
import { usePanel } from "@/stores/panel"
import { Message } from "@/components/chat/Message"
import { Composer } from "@/components/chat/Composer"
import { ContextPanel } from "@/components/chat/ContextPanel"
import { ShareMenu } from "@/components/chat/ShareMenu"
import { ProjectPicker } from "@/components/chat/ProjectPicker"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { Mascot } from "@/components/ui/Mascot"
import { IconButton } from "@/components/ui/IconButton"
import { apiJson } from "@/lib/api"
import { toast } from "@/stores/toast"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/types"

const LAST_CHAT_SESSION_KEY = "odysseus-last-chat-session"

// Background-completion notification (#11): when a stream finishes while the
// tab was hidden (the user switched away mid-response), surface an OS-level
// Notification so they know the answer is ready — toast fallback if
// notifications are unavailable/denied. Mirrors ResearchRoute's notifyComplete;
// permission is requested lazily on first fire.
function notifyChatComplete(title: string | undefined) {
  const name = title || "this chat"
  const fire = () => {
    try {
      const n = new Notification("Response ready", { body: `Finished: ${name}`, tag: "odysseus-chat" })
      n.onclick = () => { window.focus(); n.close() }
    } catch { toast("Response ready", "success") }
  }
  if (typeof Notification === "undefined") { toast("Response ready", "success"); return }
  if (Notification.permission === "granted") { fire(); return }
  if (Notification.permission === "denied") { toast("Response ready", "success"); return }
  Notification.requestPermission().then((p) => { if (p === "granted") fire(); else toast("Response ready", "success") }).catch(() => toast("Response ready", "success"))
}

function ExportMenu({ sid, messages }: { sid: string; messages: ChatMessage[] }) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
  const exp = (fmt: string) => { window.open(`/api/session/${sid}/export?fmt=${fmt}`, "_blank"); setOpen(false) }
  const copy = async () => { try { await navigator.clipboard.writeText(messages.map((m) => `${m.role === "user" ? "You" : "Assistant"}: ${m.content}`).join("\n\n")) } catch { /* ignore */ } setOpen(false) }
  return (
    <div className="relative">
      <IconButton icon={<MoreHorizontal />} label="Export / more" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="text-muted-foreground" />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 origin-top-right animate-pop-in rounded-xl border bg-popover p-1 shadow-lg">
            <button onClick={copy} className={item}><Copy className="size-4" />Copy transcript</button>
            <button onClick={() => exp("md")} className={item}><Download className="size-4" />Export Markdown</button>
            <button onClick={() => exp("txt")} className={item}><Download className="size-4" />Export Text</button>
            <button onClick={() => exp("html")} className={item}><Download className="size-4" />Export HTML</button>
            <button onClick={() => exp("json")} className={item}><Download className="size-4" />Export JSON</button>
          </div>
        </>
      )}
    </div>
  )
}

const SUGGESTIONS = [
  "What can you help me with?",
  "Summarize my recent notes",
  "What's on my calendar this week?",
  "Brainstorm ideas for a project",
]

// Stable, index-parameterized handlers for a message row. Built once per thread
// (all deps are stable useChat callbacks) so the memo below isn't broken by
// fresh closures on every render.
interface RowActions {
  regenerate: (index: number) => void
  respond: (text: string) => void
  edit: (index: number) => void
  remove: (index: number) => void
  fork: (index: number) => void
  rewrite: (index: number, instruction: string) => void
  editSubmit: (index: number, role: ChatMessage["role"], text: string) => void
  editCancel: () => void
}

// A single message row. Memo'd so that while tokens stream into the LAST message
// (useChat's patchAi replaces only that one object and keeps every earlier
// message's identity), the other rows skip re-rendering entirely — they'd
// otherwise each re-run parseArtifact/cleanRoundText/collectDeliverables per
// token. Props are all referentially stable mid-stream except the streaming
// row's `m`, so only it re-renders.
const MessageRow = memo(function MessageRow({ m, index, streaming, incognito, editing, actions }: {
  m: ChatMessage; index: number; streaming: boolean; incognito: boolean; editing: boolean; actions: RowActions
}) {
  const assistant = m.role === "assistant"
  return (
    <Message
      m={m}
      onRegenerate={assistant && !streaming ? () => actions.regenerate(index) : undefined}
      onRespond={assistant && !streaming ? actions.respond : undefined}
      editing={editing}
      onEdit={!streaming ? () => actions.edit(index) : undefined}
      onDelete={!streaming ? () => actions.remove(index) : undefined}
      onFork={!streaming && !incognito ? () => actions.fork(index) : undefined}
      onRewrite={assistant && !streaming ? (instruction) => actions.rewrite(index, instruction) : undefined}
      onEditSubmit={(text) => actions.editSubmit(index, m.role, text)}
      onEditCancel={actions.editCancel}
    />
  )
})

export function ChatConsole() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const requestedDocId = searchParams.get("doc")
  const { messages, streaming, send, stop, regenerate, editResend, editAssistant, deleteMessage, forkFrom, rewriteMessage, localReply, clearLocalMessages } = useChat(sessionId)
  const { data: sessions } = useSessions()
  const { data: auth } = useAuthStatus()
  const { data: personalization } = usePersonalization()
  const incognito = useComposer((s) => s.incognito)
  const { data: threadDocs } = useSessionDocuments(sessionId)
  const panelOpen = usePanel((s) => s.open)
  const panelKind = usePanel((s) => s.kind)
  const filesPanelOpen = panelOpen && panelKind === "files"
  const docCount = threadDocs?.length || 0
  const title = sessions?.find((s) => s.id === sessionId)?.name
  const persistentPersonaName = getPersistentPersonaName(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryDocOpenedRef = useRef<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  // Stick to the bottom as tokens stream in — but ONLY when the user is already
  // there. If they scrolled up to read, don't yank them back down every token.
  // Coalesced into a single rAF so a burst of tokens triggers one scroll/reflow
  // per frame instead of a synchronous scrollHeight read on every token.
  useEffect(() => {
    if (!atBottom) return
    const el = scrollRef.current
    if (!el) return
    const id = requestAnimationFrame(() => { el.scrollTo({ top: el.scrollHeight }) })
    return () => cancelAnimationFrame(id)
  }, [messages, atBottom])

  // The useChat handlers (regenerate/editResend/editAssistant/deleteMessage/
  // rewriteMessage) close over `messages`, so their identities change on every
  // streamed token. If `actions` depended on them it would be recreated each
  // token and defeat MessageRow's memo. Instead keep the latest messages and
  // handlers in refs (updated post-commit) and let a single stable `actions`
  // object — built once — delegate through them. Row handlers only fire from
  // user events, which run after commit, so the refs are always current by then.
  const messagesRef = useRef(messages)
  const handlersRef = useRef({ regenerate, send, deleteMessage, forkFrom, rewriteMessage, editAssistant, editResend })
  useEffect(() => { messagesRef.current = messages })
  useEffect(() => { handlersRef.current = { regenerate, send, deleteMessage, forkFrom, rewriteMessage, editAssistant, editResend } })
  const actions = useMemo<RowActions>(() => ({
    regenerate: (i) => { const msgs = messagesRef.current; for (let j = i - 1; j >= 0; j--) { if (msgs[j].role === "user") { handlersRef.current.regenerate(j); break } } },
    respond: (text) => handlersRef.current.send(text),
    edit: (i) => setEditingIndex(i),
    remove: (i) => handlersRef.current.deleteMessage(i),
    fork: (i) => handlersRef.current.forkFrom(i),
    rewrite: (i, instruction) => handlersRef.current.rewriteMessage(i, instruction),
    editSubmit: (i, role, text) => {
      if (role === "assistant") void handlersRef.current.editAssistant(i, text).then((saved) => { if (saved) setEditingIndex(null) })
      else { setEditingIndex(null); handlersRef.current.editResend(i, text) }
    },
    editCancel: () => setEditingIndex(null),
  }), [])
  const onScroll = () => { const el = scrollRef.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 160) }
  // Reset transient view state when switching threads.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on thread change
  useEffect(() => { setEditingIndex(null); setAtBottom(true) }, [sessionId])

  // Fire a background-completion notification when a stream finishes while the
  // tab was hidden. `hiddenDuring` accumulates across the stream (set either at
  // the start or via the visibilitychange listener below) and is reset on each
  // new stream start.
  const wasStreamingRef = useRef(false)
  const hiddenDuringRef = useRef(false)
  useEffect(() => {
    if (streaming && !wasStreamingRef.current) hiddenDuringRef.current = false
    if (streaming && document.hidden) hiddenDuringRef.current = true
    if (!streaming && wasStreamingRef.current && hiddenDuringRef.current) notifyChatComplete(title)
    wasStreamingRef.current = streaming
  }, [streaming, title])
  useEffect(() => {
    const onVis = () => { if (document.hidden && streaming) hiddenDuringRef.current = true }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [streaming])
  useEffect(() => {
    if (sessionId) window.localStorage.setItem(LAST_CHAT_SESSION_KEY, sessionId)
  }, [sessionId])

  // The panel is global; reset it when switching threads so a doc/files panel
  // from the previous thread doesn't linger over a different conversation.
  const prevSessionRef = useRef(sessionId)
  useEffect(() => {
    if (prevSessionRef.current === sessionId) return
    prevSessionRef.current = sessionId
    const p = usePanel.getState()
    if (p.open && (p.kind === "files" || p.kind === "doc")) p.close()
  }, [sessionId])

  // Auto-open the per-thread files panel once its files are known — but don't
  // clobber a panel the live stream opened.
  const autoOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!sessionId || docCount === 0) return
    if (autoOpenedRef.current === sessionId) return
    autoOpenedRef.current = sessionId
    if (!usePanel.getState().open) usePanel.getState().showFiles(threadDocs || [])
  }, [sessionId, docCount, threadDocs])

  // Library links use /chat/:sessionId?doc=:docId to mirror Original's
  // "open in original session" action and surface the selected file immediately.
  useEffect(() => {
    if (!sessionId || !requestedDocId || !threadDocs) return
    const key = `${sessionId}:${requestedDocId}`
    if (queryDocOpenedRef.current === key) return
    queryDocOpenedRef.current = key
    const linkedDoc = threadDocs.find((doc) => doc.id === requestedDocId)
    const panel = usePanel.getState()
    if (threadDocs.length > 0) panel.showFiles(threadDocs)
    panel.showDoc(linkedDoc?.title || linkedDoc?.name || "Document", linkedDoc?.language)
    panel.setDocId(requestedDocId)
    let cancelled = false
    void apiJson<{ title?: string; language?: string; current_content?: string }>(`/api/document/${requestedDocId}`)
      .then((full) => {
        if (cancelled || usePanel.getState().doc?.docId !== requestedDocId) return
        const p = usePanel.getState()
        p.showDoc(full.title || linkedDoc?.title || linkedDoc?.name || "Document", full.language || linkedDoc?.language)
        p.setDocId(requestedDocId)
        p.setDocContent(full.current_content || "")
      })
      .catch(() => {
        if (!cancelled && usePanel.getState().doc?.docId === requestedDocId) usePanel.getState().setDocError("Couldn't load this document.")
      })
    return () => { cancelled = true }
  }, [sessionId, requestedDocId, threadDocs])

  const toggleFiles = () => {
    if (filesPanelOpen) usePanel.getState().close()
    else usePanel.getState().showFiles(threadDocs || [])
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <RouteHeader
          data-tour="chat-header"
          title={(
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <span className="truncate">{incognito ? "Incognito chat" : (title || "New chat")}</span>
              {incognito && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">
                  <EyeOff className="size-3" /> Not saved
                </span>
              )}
              {persistentPersonaName && !incognito && (
                <span className="inline-flex max-w-40 shrink-0 items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">
                  <Users className="size-3" />
                  <span className="truncate">{persistentPersonaName}</span>
                </span>
              )}
            </span>
          )}
          actions={(
            <>
              {docCount > 0 && (
                <button
                  onClick={toggleFiles}
                  title={filesPanelOpen ? "Hide files panel" : "Show files in this thread"}
                  className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    filesPanelOpen ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                >
                  <FileText className="size-3.5" />{docCount} file{docCount === 1 ? "" : "s"}
                </button>
              )}
              {sessionId && messages.length > 0 && !incognito && <ProjectPicker sessionId={sessionId} />}
              {sessionId && messages.length > 0 && !incognito && <ShareMenu resourceType="session" resourceId={sessionId} />}
              {sessionId && messages.length > 0 && <ExportMenu sid={sessionId} messages={messages} />}
            </>
          )}
        />
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-[768px] text-center" data-tour="chat-welcome">
                <Mascot size={20} className="mx-auto mb-6 animate-pop-in" title="Odysseus" />
                <h1 className="text-2xl font-semibold tracking-tight">
                  {greeting(personalization.nickname || auth?.username || auth?.user)}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">How can I help?</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={streaming}
                      className="rounded-full border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[768px] space-y-6 px-4 py-6">{messages.map((m, i) => (
              <MessageRow key={i} m={m} index={i} streaming={streaming} incognito={incognito}
                editing={editingIndex === i} actions={actions} />
            ))}</div>
          )}
        </div>
        {!atBottom && messages.length > 0 && (
          <button onClick={() => { const el = scrollRef.current; if (el) { el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setAtBottom(true) } }}
            title="Jump to latest"
            aria-label="Jump to latest"
            className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 animate-fade-in rounded-full border bg-popover p-2 text-muted-foreground shadow-md transition-colors hover:text-foreground">
            <ArrowDown className="size-4" />
          </button>
        )}
        <Composer onSend={send} onLocalReply={localReply} onClearMessages={clearLocalMessages} onStop={stop} streaming={streaming} sessionId={sessionId} />
      </div>
      <ContextPanel />
    </div>
  )
}

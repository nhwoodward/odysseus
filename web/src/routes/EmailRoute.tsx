import { useEffect, useMemo, useRef, useState } from "react"
import { PenSquare, Send, X, Trash2, Search, Inbox, ChevronDown, CheckCheck, Paperclip, Clock, RefreshCw } from "lucide-react"
import { SkeletonList } from "@/components/ui/skeleton"
import { useEscapeClose } from "@/lib/useEscapeClose"
import {
  useInbox, useEmailActions, sendEmail, saveDraft,
  useFolders, useEmailSearch, useContacts,
  uploadComposeAttachment, deleteComposeAttachment, scheduleEmail, useScheduledEmails, useCancelScheduledEmail, saveEmailSenderContact,
  type ComposeUpload, type EmailContact, type EmailListFilter, type ScheduledEmail,
} from "@/api/email"
import { useEmailAccounts, type EmailAccount } from "@/api/accounts"
import { useDocMutations } from "@/api/documents"
import { useNoteMutations } from "@/api/notes"
import { EmailDraftEditor } from "@/components/email/EmailDraftEditor"
import { Reader } from "@/components/email/Reader"
import { AccountStrip } from "@/components/email/AccountStrip"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { EmailFilterPicker } from "@/components/email/EmailFilterPicker"
import { EmailBulkBar } from "@/components/email/EmailBulkBar"
import { EmailList } from "@/components/email/EmailList"
import { ScheduledEmailList } from "@/components/email/ScheduledEmailList"
import { EMAIL_FILTERS, emailIsRead, emailReminderPresets, emailSenderAddress, extractEmailAddress, firstNameFromSender, formatSize, localDateTimeValue } from "@/components/email/emailFormat"
import type { BulkAction, EmailListItem, EmailListRowAction, Prefill, SenderFilter } from "@/components/email/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ReplyDoc { id: string; title: string; content: string }

const SCHEDULED_FOLDER = "__scheduled__"

function filterLabel(value: EmailListFilter): string {
  return EMAIL_FILTERS.find((item) => item.value === value)?.label || "All"
}

function folderLabel(value: string): string {
  if (value === SCHEDULED_FOLDER) return "Scheduled"
  return value
}


function ownEmailAddresses(accounts: EmailAccount[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const account of accounts) {
    for (const addr of [account.from_address, account.smtp_user, account.imap_user]) {
      const key = extractEmailAddress(addr)
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(key)
    }
  }
  return result
}




function emailTimeMs(m: EmailListItem): number {
  if (m.date_epoch) return m.date_epoch * 1000
  if (!m.date) return 0
  const t = new Date(m.date).getTime()
  return Number.isNaN(t) ? 0 : t
}

function emailTags(m: EmailListItem): string[] {
  return (m.tags || []).map((tag) => String(tag).trim().toLowerCase().replace("_", "-"))
}

function matchesFilter(m: EmailListItem, filter: EmailListFilter): boolean {
  const read = emailIsRead(m)
  const answered = !!m.is_answered
  const tags = emailTags(m)
  const ageMs = Date.now() - emailTimeMs(m)
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  switch (filter) {
    case "all": return true
    case "unread": return !read
    case "favorites": return !!m.is_flagged
    case "undone": return !answered
    case "reminders": return /^Reminder \(Odysseus\):/i.test(m.subject || "")
    case "unanswered": return !read && !answered
    case "pending_30d": return !answered && ageMs >= 0 && ageMs <= thirtyDaysMs
    case "stale_30d": return !answered && ageMs > thirtyDaysMs
    case "tag:urgent": return tags.includes("urgent")
    case "tag:reply-soon": return tags.includes("reply-soon")
    case "tag:spam": return !!m.is_spam_verdict || tags.includes("spam")
    case "tag:newsletter": return tags.includes("newsletter")
    case "tag:marketing": return tags.includes("marketing") || tags.includes("promo")
    default: return true
  }
}

function matchesSender(m: EmailListItem, sender: SenderFilter | null): boolean {
  return !sender || emailSenderAddress(m) === sender.address.toLowerCase()
}

function applySearchFilters(emails: EmailListItem[], filter: EmailListFilter, hasAttachments: boolean, sender: SenderFilter | null): EmailListItem[] {
  return emails.filter((m) => matchesFilter(m, filter) && (!hasAttachments || !!m.has_attachments) && matchesSender(m, sender))
}

function emailEmptyLabel(folder: string, filter: EmailListFilter, hasAttachments: boolean, sender: SenderFilter | null) {
  if (sender) return `No mail from ${sender.label}.`
  if (filter !== "all" && hasAttachments) return `No ${filterLabel(filter).toLowerCase()} mail with attachments.`
  if (filter !== "all") return `No ${filterLabel(filter).toLowerCase()} mail.`
  if (hasAttachments) return "No mail with attachments."
  return `${folder} empty.`
}

function parseEmailHash(hash: string): { folder: string; uid: string } | null {
  const decoded = decodeURIComponent((hash || "").replace(/^#/, ""))
  if (!decoded.startsWith("email=")) return null
  const raw = decoded.slice("email=".length)
  const sep = raw.lastIndexOf(":")
  if (sep <= 0 || sep >= raw.length - 1) return null
  return { folder: raw.slice(0, sep), uid: raw.slice(sep + 1) }
}


function ContactSuggest({ query, onPick }: { query: string; onPick: (c: EmailContact) => void }) {
  const { data } = useContacts(query)
  const contacts = data || []
  if (contacts.length === 0) return null
  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 origin-top animate-pop-in overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-lg">
      {contacts.map((c) => (
        <button key={c.address} onMouseDown={(e) => { e.preventDefault(); onPick(c) }} className="block w-full px-3 py-1.5 text-left hover:bg-accent">
          <div className="truncate font-medium">{c.name}</div>
          <div className="truncate text-xs text-muted-foreground">{c.address}</div>
        </button>
      ))}
    </div>
  )
}

function Compose({ onClose, initial }: { onClose: () => void; initial?: Prefill }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [to, setTo] = useState(initial?.to || "")
  const [cc, setCc] = useState(initial?.cc || "")
  const [bcc, setBcc] = useState(initial?.bcc || "")
  const [subject, setSubject] = useState(initial?.subject || "")
  const [body, setBody] = useState(initial?.body || "")
  const [attachments, setAttachments] = useState<ComposeUpload[]>([])
  const [minSchedule] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 1000)))
  const [scheduleAt, setScheduleAt] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  const [toFocused, setToFocused] = useState(false)
  // The autocomplete query is the fragment after the last comma so it matches
  // the recipient currently being typed in a multi-address "To" field.
  const toQuery = to.split(",").pop()?.trim() || ""
  const pickContact = (c: EmailContact) => {
    const head = to.includes(",") ? to.slice(0, to.lastIndexOf(",") + 1) + " " : ""
    setTo(head + c.address + ", ")
  }

  const discardAndClose = () => {
    for (const att of attachments) {
      void deleteComposeAttachment(att.token).catch(() => undefined)
    }
    setAttachments([])
    onClose()
  }

  const uploadFiles = async (files: FileList | null) => {
    const list = Array.from(files || [])
    if (list.length === 0) return
    setBusy("upload"); setErr("")
    try {
      for (const file of list) {
        const uploaded = await uploadComposeAttachment(file)
        setAttachments((prev) => [...prev, uploaded])
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload attachment")
    } finally {
      setBusy("")
    }
  }

  const removeAttachment = async (att: ComposeUpload) => {
    setAttachments((prev) => prev.filter((item) => item.token !== att.token))
    try {
      await deleteComposeAttachment(att.token)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't remove attachment")
    }
  }

  const act = async (kind: "send" | "draft" | "schedule") => {
    if (!to.trim()) { setErr("Recipient required"); return }
    const attachmentTokens = attachments.map((att) => att.token)
    let sendAtIso: string | undefined
    if (kind === "schedule") {
      const parsed = new Date(scheduleAt)
      if (!scheduleAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setErr("Choose a future send time")
        return
      }
      sendAtIso = parsed.toISOString()
    }
    setBusy(kind); setErr("")
    try {
      const payload = {
        to,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body,
        in_reply_to: initial?.inReplyTo,
        references: initial?.references,
        attachments: attachmentTokens.length ? attachmentTokens : undefined,
        account_id: initial?.accountId,
      }
      const r = kind === "send" ? await sendEmail(payload) : kind === "draft" ? await saveDraft(payload) : await scheduleEmail({ ...payload, send_at: sendAtIso || "" })
      if (r && r.success === false) setErr(r.error || "Failed"); else onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed") } finally { setBusy("") }
  }
  const inp = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"
  return (
    <div className="absolute inset-0 z-10 flex animate-fade-in items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="flex max-h-[92vh] w-[min(96vw,36rem)] flex-col overflow-y-auto animate-pop-in rounded-xl border bg-popover p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">New message</div><button onClick={discardAndClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button></div>
        <div className="relative mb-2">
          <input value={to} onChange={(e) => setTo(e.target.value)} onFocus={() => setToFocused(true)} onBlur={() => setToFocused(false)} placeholder="To" className={inp} />
          {toFocused && toQuery.length >= 1 && <ContactSuggest query={toQuery} onPick={pickContact} />}
        </div>
        <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc" className={cn(inp, "mb-2")} />
        <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc" className={cn(inp, "mb-2")} />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={cn(inp, "mb-2")} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" rows={8} className="mb-3 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring" />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void uploadFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="size-4" />{busy === "upload" ? "Uploading…" : "Attach"}
          </Button>
          <label className="flex w-full min-w-0 flex-1 flex-col gap-2 rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground sm:w-auto sm:flex-row sm:items-center">
            <span className="flex shrink-0 items-center gap-2">
              <Clock className="size-4 shrink-0" />
              <span className="shrink-0">Send at</span>
            </span>
            <input
              type="datetime-local"
              min={minSchedule}
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
        </div>
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <span key={att.token} className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="max-w-48 truncate">{att.filename}</span>
                {att.size ? <span className="shrink-0 text-muted-foreground">{formatSize(att.size)}</span> : null}
                <button type="button" title="Remove attachment" aria-label="Remove attachment" onClick={() => void removeAttachment(att)} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {err && <p className="mb-2 text-xs text-destructive">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("draft")}>{busy === "draft" ? "Saving…" : "Save draft"}</Button>
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("schedule")}><Clock className="size-4" />{busy === "schedule" ? "Scheduling…" : "Schedule send"}</Button>
          <Button size="sm" disabled={!!busy} onClick={() => act("send")}><Send className="size-4" />{busy === "send" ? "Sending…" : "Send"}</Button>
        </div>
      </div>
    </div>
  )
}

function FolderMenu({ folders, current, onPick }: { folders: string[]; current: string; onPick: (f: string) => void }) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const baseFolders = folders.length ? folders : [current === SCHEDULED_FOLDER ? "INBOX" : current]
  const list = baseFolders.includes(SCHEDULED_FOLDER) ? baseFolders : [...baseFolders, SCHEDULED_FOLDER]
  const CurrentIcon = current === SCHEDULED_FOLDER ? Clock : Inbox
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold hover:bg-accent">
        <CurrentIcon className="size-4 text-muted-foreground" />
        <span>{folderLabel(current)}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 origin-top-left animate-pop-in overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-lg">
            {list.map((f) => (
              <button
                key={f}
                onClick={() => { onPick(f); setOpen(false) }}
                className={cn("block w-full truncate px-3 py-1.5 text-left hover:bg-accent", f === current && "font-medium", f === SCHEDULED_FOLDER && "mt-1 border-t pt-2")}
              >
                {folderLabel(f)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function EmailFilterBar({
  filter,
  hasAttachments,
  sender,
  selectMode,
  onFilter,
  onAttachments,
  onSelectMode,
  onClearSender,
  onClearAll,
}: {
  filter: EmailListFilter
  hasAttachments: boolean
  sender: SenderFilter | null
  selectMode: boolean
  onFilter: (value: EmailListFilter) => void
  onAttachments: () => void
  onSelectMode: () => void
  onClearSender: () => void
  onClearAll: () => void
}) {
  const hasActiveFilters = filter !== "all" || hasAttachments || !!sender
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <EmailFilterPicker value={filter} onChange={onFilter} />
      <button
        type="button"
        onClick={onAttachments}
        title={hasAttachments ? "Show all mail" : "Show mail with attachments"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          hasAttachments ? "border-foreground bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Paperclip className="size-3.5" />
        <span>Attachments</span>
      </button>
      <button
        type="button"
        onClick={onSelectMode}
        title={selectMode ? "Cancel selection" : "Select mail"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          selectMode ? "border-foreground bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {selectMode ? <X className="size-3.5" /> : <CheckCheck className="size-3.5" />}
        <span>{selectMode ? "Cancel" : "Select"}</span>
      </button>
      {sender && (
        <button
          type="button"
          onClick={onClearSender}
          title="Clear sender filter"
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border bg-accent px-2.5 text-xs text-foreground"
        >
          <span className="max-w-56 truncate">From: {sender.label}</span>
          <X className="size-3.5" />
        </button>
      )}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          title="Clear filters"
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
          <span>Clear</span>
        </button>
      )}
    </div>
  )
}

export function EmailRoute() {
  const [folder, setFolder] = useState("INBOX")
  const [accountId, setAccountId] = useState("")
  const [query, setQuery] = useState("")
  const [listFilter, setListFilter] = useState<EmailListFilter>("all")
  const [hasAttachments, setHasAttachments] = useState(false)
  const [senderFilter, setSenderFilter] = useState<SenderFilter | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState("")
  const [listActionBusy, setListActionBusy] = useState("")
  const [bulkError, setBulkError] = useState("")
  const [listNotice, setListNotice] = useState("")
  const [reader, setReader] = useState<{ uid: string; folder: string } | null>(null)
  const [replyDoc, setReplyDoc] = useState<ReplyDoc | null>(null)
  const [composing, setComposing] = useState(false)
  const [prefill, setPrefill] = useState<Prefill | undefined>(undefined)
  const { create: createDoc } = useDocMutations()
  const { create: createNote } = useNoteMutations()
  const { data: accounts } = useEmailAccounts()
  const accountList = useMemo(() => accounts || [], [accounts])
  const defaultAccount = accountList.find((account) => account.is_default) || accountList[0]
  const activeAccount = accountList.find((account) => account.id === accountId) || defaultAccount
  const activeAccountId = activeAccount?.id || ""
  const ownAddresses = useMemo(() => ownEmailAddresses(accountList), [accountList])
  const scheduledView = folder === SCHEDULED_FOLDER
  const { data: folderData } = useFolders(activeAccountId)
  const {
    data,
    refetch: refetchList,
    isFetching: listFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInbox(folder, { accountId: activeAccountId, filter: listFilter, from: senderFilter?.address, hasAttachments, enabled: !scheduledView })
  const inboxEmails = useMemo<EmailListItem[]>(
    () => (data?.pages || []).flatMap((page) => page.emails as EmailListItem[]),
    [data],
  )
  const inboxError = data?.pages?.[0]?.error
  const searching = query.trim().length >= 2
  const {
    data: searchData,
    isFetching: searchFetching,
    refetch: refetchSearch,
    hasNextPage: hasMoreSearch,
    isFetchingNextPage: fetchingMoreSearch,
    fetchNextPage: fetchMoreSearch,
  } = useEmailSearch(query, folder, activeAccountId, !scheduledView)
  const searchEmails = useMemo<EmailListItem[]>(
    () => (searchData?.pages || []).flatMap((page) => page.emails as EmailListItem[]),
    [searchData],
  )
  const searchError = searchData?.pages?.[0]?.error
  const { data: scheduledData, isFetching: scheduledFetching, refetch: refetchScheduled } = useScheduledEmails()
  const cancelScheduled = useCancelScheduledEmail()
  const bulkActions = useEmailActions(folder, activeAccountId)
  const folders = folderData?.folders || []
  const filteredSearchEmails = applySearchFilters(searchEmails, listFilter, hasAttachments, senderFilter)
  const displayedEmails = searching ? filteredSearchEmails : inboxEmails
  const displayedUids = displayedEmails.map((email) => email.uid)
  const selectedVisibleUids = displayedUids.filter((uid) => selectedUids.has(uid))
  const allSelected = displayedUids.length > 0 && selectedVisibleUids.length === displayedUids.length
  const emptyLabel = emailEmptyLabel(folder, listFilter, hasAttachments, senderFilter)
  const clearSelection = () => {
    setSelectMode(false)
    setSelectedUids(new Set())
    setBulkError("")
  }
  const clearFilters = () => {
    setListFilter("all")
    setHasAttachments(false)
    setSenderFilter(null)
    clearSelection()
  }
  const reply = (p: Prefill) => { setPrefill(p); setReplyDoc(null); setReader(null); setComposing(true) }
  const openEmail = (uid: string, f: string) => { setReplyDoc(null); setReader({ uid, folder: f }) }
  // The read endpoint doesn't echo a spam verdict, so derive the "Not spam"
  // affordance from the list row that was opened (its tags/verdict marker) or
  // from a spam-context folder/filter. The looked-up item also survives the
  // open because list pages stay cached while the reader is mounted.
  const readerSpamContext = useMemo(() => {
    if (!reader) return false
    const item = displayedEmails.find((m) => m.uid === reader.uid)
    if (item && (item.is_spam_verdict || emailTags(item).includes("spam"))) return true
    const f = reader.folder.toLowerCase()
    return listFilter === "tag:spam" || f.includes("junk") || f.includes("spam")
  }, [reader, displayedEmails, listFilter])
  useEffect(() => {
    const openHashEmail = () => {
      if (typeof window === "undefined") return
      const parsed = parseEmailHash(window.location.hash)
      if (!parsed) return
      setFolder(parsed.folder)
      setQuery("")
      setSenderFilter(null)
      setReplyDoc(null)
      setReader({ uid: parsed.uid, folder: parsed.folder })
    }
    openHashEmail()
    window.addEventListener("hashchange", openHashEmail)
    return () => window.removeEventListener("hashchange", openHashEmail)
  }, [])
  const createReplyDocument = async (draft: { title: string; content: string }) => {
    const doc = await createDoc.mutateAsync({ title: draft.title, content: draft.content, language: "email" })
    if (doc?.id) setReplyDoc({ id: doc.id, title: draft.title, content: draft.content })
  }
  const pickAccount = (id: string) => {
    setAccountId(id)
    setFolder("INBOX")
    setQuery("")
    clearFilters()
    clearSelection()
    setReader(null)
    setReplyDoc(null)
  }
  const compose = () => { setPrefill({ accountId: activeAccountId || undefined }); setComposing(true) }
  const refreshMail = async () => {
    setListNotice("")
    if (scheduledView) {
      await refetchScheduled()
      return
    }
    if (searching) await refetchSearch()
    await refetchList()
  }
  const cancelScheduledSend = async (item: ScheduledEmail) => {
    const subject = item.subject || "(no subject)"
    const action = item.status === "failed" ? "Remove" : "Cancel"
    if (!confirm(`${action} scheduled email "${subject}"?`)) return
    setListNotice("")
    try {
      await cancelScheduled.mutateAsync(item.id)
      setListNotice(item.status === "failed" ? "Removed failed scheduled email." : "Cancelled scheduled email.")
    } catch {
      setListNotice("Couldn't cancel scheduled email.")
    }
  }
  const clearReminderEmails = async () => {
    if (!confirm("Permanently delete all Odysseus reminder emails?")) return
    setListNotice("")
    try {
      const r = await bulkActions.deleteReminderEmails.mutateAsync({ permanent: true })
      setListNotice(`Deleted ${r.deleted || 0} reminder email${(r.deleted || 0) === 1 ? "" : "s"}.`)
    } catch {
      setListNotice("Couldn't clear reminder emails.")
    }
  }
  const toggleSelectMode = () => {
    setSelectMode((current) => !current)
    setSelectedUids(new Set())
    setBulkError("")
  }
  const pickFilter = (value: EmailListFilter) => {
    setListFilter(value)
    clearSelection()
  }
  const toggleAttachments = () => {
    setHasAttachments((current) => !current)
    clearSelection()
  }
  const pickSender = (sender: SenderFilter) => {
    setSenderFilter(sender)
    clearSelection()
  }
  const toggleSelected = (uid: string) => {
    setSelectedUids((current) => {
      const next = new Set(current)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }
  const toggleAll = () => {
    setSelectedUids((current) => {
      if (allSelected) return new Set()
      const next = new Set(current)
      displayedUids.forEach((uid) => next.add(uid))
      return next
    })
  }
  const runBulkAction = async (action: BulkAction) => {
    const uids = selectedVisibleUids
    if (uids.length === 0 || bulkBusy) return
    if (action === "delete" && !confirm(`Delete ${uids.length} selected email${uids.length === 1 ? "" : "s"}?`)) return
    const label = action === "done" ? "Marking done" : action === "read" ? "Marking read" : action === "unread" ? "Marking unread" : "Deleting"
    setBulkBusy(label)
    setBulkError("")
    try {
      for (const uid of uids) {
        if (action === "done") {
          await bulkActions.markAnswered.mutateAsync(uid)
          await bulkActions.markRead.mutateAsync(uid)
        } else if (action === "read") {
          await bulkActions.markRead.mutateAsync(uid)
        } else if (action === "unread") {
          await bulkActions.markUnread.mutateAsync(uid)
        } else {
          await bulkActions.remove.mutateAsync(uid)
        }
      }
      clearSelection()
    } catch {
      setBulkError("Some selected emails could not be updated.")
    } finally {
      setBulkBusy("")
    }
  }
  const createListReminder = async (m: EmailListItem, dueDate: Date) => {
    const itemFolder = m.folder || folder
    const sender = m.from_name || m.from_address || m.from || m.from_addr || m.sender || "someone"
    const who = firstNameFromSender(sender)
    const due = localDateTimeValue(dueDate)
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const link = origin ? `${origin}/v2/email#email=${encodeURIComponent(itemFolder)}:${encodeURIComponent(m.uid)}` : ""
    await createNote.mutateAsync({
      title: `Reply: ${m.subject || "(no subject)"}`,
      note_type: "todo",
      items: [{ text: `Reply to ${who}: ${m.subject || "(no subject)"}`, checked: false }],
      content: link ? `Open email: ${link}` : "Remember to reply to this email.",
      label: "email reminder",
      due_date: due,
    })
  }
  const runListRowAction = async (m: EmailListItem, action: EmailListRowAction) => {
    const uid = m.uid
    const itemFolder = m.folder || folder
    const subject = m.subject || "(no subject)"
    const senderAddress = extractEmailAddress(m.from_address || m.from_addr || m.from || m.sender)
    const senderName = (m.from_name || m.from || senderAddress.split("@")[0] || "").replace(/<[^>]+>/g, "").trim()
    const busyKey = `${uid}:${action}`
    setListNotice("")
    setBulkError("")
    try {
      switch (action) {
        case "open-tab": {
          if (typeof window !== "undefined") {
            window.open(`${window.location.origin}/v2/email#email=${encodeURIComponent(itemFolder)}:${encodeURIComponent(uid)}`, "_blank", "noopener,noreferrer")
          }
          return
        }
        case "remind-later": {
          setListActionBusy(busyKey)
          await createListReminder(m, emailReminderPresets()[0].date)
          setListNotice("Reminder set.")
          return
        }
        case "remind-tomorrow": {
          setListActionBusy(busyKey)
          await createListReminder(m, emailReminderPresets()[1].date)
          setListNotice("Reminder set for tomorrow.")
          return
        }
        case "read-toggle": {
          setListActionBusy(busyKey)
          if (emailIsRead(m)) await bulkActions.markUnread.mutateAsync(uid)
          else await bulkActions.markRead.mutateAsync(uid)
          return
        }
        case "favorite-toggle": {
          setListActionBusy(busyKey)
          await bulkActions.flag.mutateAsync({ uid, on: !m.is_flagged })
          return
        }
        case "done-toggle": {
          setListActionBusy(busyKey)
          if (m.is_answered) await bulkActions.clearAnswered.mutateAsync(uid)
          else {
            await bulkActions.markAnswered.mutateAsync(uid)
            await bulkActions.markRead.mutateAsync(uid)
          }
          return
        }
        case "archive": {
          setListActionBusy(busyKey)
          await bulkActions.archive.mutateAsync(uid)
          return
        }
        case "save-sender": {
          if (!senderAddress) {
            setListNotice("No sender address to save.")
            return
          }
          setListActionBusy(busyKey)
          const r = await saveEmailSenderContact({ name: senderName, email: senderAddress })
          setListNotice(r.message === "Already exists" ? "Already in contacts." : "Saved sender to contacts.")
          return
        }
        case "spam": {
          if (!confirm(`Move "${subject}" to Spam?`)) return
          setListActionBusy(busyKey)
          await bulkActions.move.mutateAsync({ uid, dest: "Junk" })
          return
        }
        case "trash": {
          if (!confirm(`Move "${subject}" to Trash?`)) return
          setListActionBusy(busyKey)
          await bulkActions.remove.mutateAsync(uid)
          return
        }
        case "permanent": {
          if (!confirm(`Permanently delete "${subject}"? This cannot be undone.`)) return
          setListActionBusy(busyKey)
          await bulkActions.deletePermanent.mutateAsync(uid)
          return
        }
      }
    } catch {
      setListNotice("Couldn't update this email.")
    } finally {
      setListActionBusy("")
    }
  }
  return (
    <div className={cn("relative mx-auto flex h-full w-full flex-col", reader && replyDoc ? "max-w-6xl" : "max-w-3xl")}>
      {composing && <Compose initial={prefill} onClose={() => { setComposing(false); setPrefill(undefined) }} />}
      {reader ? (
        replyDoc ? (
          <div className="flex h-full min-h-0 flex-col md:flex-row">
            <div className="min-h-0 min-w-0 flex-1 border-b md:border-b-0 md:border-r">
              <Reader uid={reader.uid} folder={reader.folder} accountId={activeAccountId} isSpam={readerSpamContext} ownAddresses={ownAddresses} folders={folders} onBack={() => { setReader(null); setReplyDoc(null) }} onReply={reply} onReplyDocument={createReplyDocument} />
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              <EmailDraftEditor key={replyDoc.id} docId={replyDoc.id} title={replyDoc.title} content={replyDoc.content} onClose={() => setReplyDoc(null)} />
            </div>
          </div>
        ) : (
          <Reader uid={reader.uid} folder={reader.folder} accountId={activeAccountId} isSpam={readerSpamContext} ownAddresses={ownAddresses} folders={folders} onBack={() => setReader(null)} onReply={reply} onReplyDocument={createReplyDocument} />
        )
      ) : (
        <>
          <RouteHeader
            title={<FolderMenu folders={folders} current={folder} onPick={(f) => { setFolder(f); setQuery(""); setListFilter("all"); setHasAttachments(false); setSenderFilter(null); clearSelection() }} />}
            actions={(
              <>
                <button
                  type="button"
                  onClick={refreshMail}
                  disabled={scheduledView ? scheduledFetching : (listFetching || searchFetching)}
                  title="Refresh mail"
                  aria-label="Refresh mail"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-4", (scheduledView ? scheduledFetching : (listFetching || searchFetching)) && "animate-spin")} />
                </button>
                {listFilter === "reminders" && (
                  <button
                    type="button"
                    onClick={clearReminderEmails}
                    disabled={bulkActions.deleteReminderEmails.isPending}
                    title="Permanently delete Odysseus reminder emails"
                    aria-label="Permanently delete Odysseus reminder emails"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <Button size="sm" onClick={compose}><PenSquare className="size-4" />Compose</Button>
              </>
            )}
          />
          <AccountStrip accounts={accountList} current={activeAccountId} onPick={pickAccount} />
          {listNotice && <div className={cn("shrink-0 border-b px-4 py-2 text-xs", listNotice.startsWith("Couldn't") ? "text-destructive" : "text-muted-foreground")}>{listNotice}</div>}
          {scheduledView ? (
            <ScheduledEmailList
              items={scheduledData?.scheduled || []}
              error={scheduledData?.error}
              isLoading={scheduledFetching && !scheduledData}
              cancellingId={cancelScheduled.isPending ? cancelScheduled.variables : undefined}
              onCancel={cancelScheduledSend}
            />
          ) : (
            <>
              <div className="shrink-0 border-b px-4 py-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); clearSelection() }}
                    placeholder="Search mail…"
                    className="h-9 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none focus-visible:border-ring"
                  />
                  {query && <button onClick={() => setQuery("")} title="Clear" aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
                </div>
                <EmailFilterBar
                  filter={listFilter}
                  hasAttachments={hasAttachments}
                  sender={senderFilter}
                  selectMode={selectMode}
                  onFilter={pickFilter}
                  onAttachments={toggleAttachments}
                  onSelectMode={toggleSelectMode}
                  onClearSender={() => { setSenderFilter(null); clearSelection() }}
                  onClearAll={clearFilters}
                />
              </div>
              {selectMode && (
                <EmailBulkBar
                  selectedCount={selectedVisibleUids.length}
                  allSelected={allSelected}
                  busy={bulkBusy}
                  onToggleAll={toggleAll}
                  onAction={runBulkAction}
                  onCancel={clearSelection}
                />
              )}
              {bulkError && <div className="shrink-0 border-b px-4 py-2 text-xs text-destructive">{bulkError}</div>}
              {searching ? (
                searchFetching && !searchData ? <SkeletonList rows={5} className="p-4" />
                  : <EmailList emails={filteredSearchEmails} error={searchError} folder={folder} emptyLabel={filteredSearchEmails.length === 0 && (listFilter !== "all" || hasAttachments || senderFilter) ? emptyLabel : "No matches."} selectMode={selectMode} selectedUids={selectedUids} actionBusy={listActionBusy} onOpen={openEmail} onSender={pickSender} onToggleSelected={toggleSelected} onAction={runListRowAction}
                      footer={hasMoreSearch ? (
                        <div className="p-3 text-center">
                          <Button variant="outline" size="sm" disabled={fetchingMoreSearch} onClick={() => { void fetchMoreSearch() }}>
                            {fetchingMoreSearch ? "Loading…" : "Load more"}
                          </Button>
                        </div>
                      ) : undefined} />
              ) : listFetching && !data ? (
                <SkeletonList rows={6} className="p-4" />
              ) : (
                <EmailList
                  emails={inboxEmails}
                  error={inboxError}
                  folder={folder}
                  emptyLabel={emptyLabel}
                  selectMode={selectMode}
                  selectedUids={selectedUids}
                  actionBusy={listActionBusy}
                  onOpen={openEmail}
                  onSender={pickSender}
                  onToggleSelected={toggleSelected}
                  onAction={runListRowAction}
                  footer={hasNextPage ? (
                    <div className="p-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isFetchingNextPage}
                        onClick={() => { void fetchNextPage() }}
                      >
                        {isFetchingNextPage ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  ) : undefined}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

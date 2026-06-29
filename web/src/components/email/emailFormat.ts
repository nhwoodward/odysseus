import { Inbox, MailOpen, Star, CheckCheck, Bell, Reply, Clock, AlertCircle, Sparkles, Filter, Newspaper, Megaphone } from "lucide-react"
import type { EmailListItem, EmailFilterOption } from "@/components/email/types"

export const EMAIL_FILTERS: EmailFilterOption[] = [
  { value: "all", label: "All", icon: Inbox },
  { value: "unread", label: "Unread", icon: MailOpen },
  { value: "favorites", label: "Favorites", icon: Star },
  { value: "undone", label: "Undone", icon: CheckCheck },
  { value: "reminders", label: "Reminders", icon: Bell },
  { value: "unanswered", label: "Unanswered", icon: Reply },
  { value: "pending_30d", label: "Pending 30d", icon: Clock },
  { value: "stale_30d", label: "Stale >30d", icon: Clock },
  { value: "tag:urgent", label: "Urgent", icon: AlertCircle },
  { value: "tag:reply-soon", label: "Reply soon", icon: Sparkles },
  { value: "tag:spam", label: "Spam", icon: Filter },
  { value: "tag:newsletter", label: "Newsletter", icon: Newspaper },
  { value: "tag:marketing", label: "Marketing", icon: Megaphone },
]

function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface ReminderPreset { label: string; detail: string; date: Date }
function emailReminderPresets(now = new Date()): ReminderPreset[] {
  const sixPm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0)
  const laterToday = new Date(sixPm.getTime() - now.getTime() < 60 * 60 * 1000 ? now.getTime() + 3 * 60 * 60 * 1000 : sixPm.getTime())
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(8, 0, 0, 0)
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  const nextWeek = new Date(now)
  nextWeek.setDate(now.getDate() + daysUntilMonday)
  nextWeek.setHours(8, 0, 0, 0)
  return [
    { label: "Later today", detail: laterToday.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), date: laterToday },
    { label: "Tomorrow", detail: tomorrow.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), date: tomorrow },
    { label: "Next week", detail: `${nextWeek.toLocaleDateString([], { weekday: "short" })} ${nextWeek.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, date: nextWeek },
  ]
}

function formatSize(bytes?: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatScheduledDate(value?: string): string {
  if (!value) return "Unknown time"
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const DOC_EXTS = [".pdf", ".docx", ".txt", ".md", ".markdown"]
function canOpenAsDoc(filename: string): boolean {
  const lower = filename.toLowerCase()
  return DOC_EXTS.some((e) => lower.endsWith(e))
}

function extractEmailAddress(value?: string): string {
  const raw = (value || "").trim()
  const bracket = raw.match(/<([^>]+)>/)
  return (bracket?.[1] || raw).trim().toLowerCase()
}

function emailSenderAddress(m: EmailListItem): string {
  return extractEmailAddress(m.from_address || m.from_addr || m.from || m.sender)
}

function emailIsRead(m: EmailListItem): boolean {
  if (typeof m.is_read === "boolean") return m.is_read
  if (typeof m.seen === "boolean") return m.seen
  if (typeof m.unread === "boolean") return !m.unread
  return true
}

function firstNameFromSender(value: string): string {
  const namePart = (value.match(/^"?([^"<,@]+(?:\s+[^"<,@]+)*)"?\s*</)?.[1] || value.split("@")[0] || "").trim()
  const first = namePart.replace(/^["']|["']$/g, "").split(/[\s,]+/)[0] || "someone"
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Someone"
}

export {
  localDateTimeValue,
  emailReminderPresets,
  formatSize,
  formatScheduledDate,
  canOpenAsDoc,
  extractEmailAddress,
  emailSenderAddress,
  emailIsRead,
  firstNameFromSender,
}
export type { ReminderPreset }

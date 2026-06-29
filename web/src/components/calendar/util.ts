import { type CSSProperties } from "react"
import { type CalEvent } from "@/api/calendar"

export const inp = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"

export const EVENT_TYPES = [
  { label: "Work", value: "work" },
  { label: "Personal", value: "personal" },
  { label: "Health", value: "health" },
  { label: "Travel", value: "travel" },
  { label: "Meal", value: "meal" },
  { label: "Social", value: "social" },
  { label: "Admin", value: "admin" },
  { label: "Other", value: "other" },
]

export const IMPORTANCE_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
]

// Quick "Remind me" presets, measured in minutes before the event start.
export const QUICK_REMINDER_PRESETS: { label: string; minutes: number }[] = [
  { label: "At event time", minutes: 0 },
  { label: "10 minutes before", minutes: 10 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
]

export const RECUR_OPTIONS: { label: string; value: string }[] = [
  { label: "Does not repeat", value: "" },
  { label: "Daily", value: "FREQ=DAILY" },
  { label: "Weekly", value: "FREQ=WEEKLY" },
  { label: "Every weekday (Mon-Fri)", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Monthly", value: "FREQ=MONTHLY" },
  { label: "Yearly", value: "FREQ=YEARLY" },
]

export interface FormState {
  summary: string
  allDay: boolean
  start: string
  end: string
  location: string
  description: string
  recur: string
  customRrule: string
  calendarHref: string
  color: string
  eventType: string
  importance: string
  reminder: string
  reminderCustom: string
}

export function pad(n: number): string {
  return String(n).padStart(2, "0")
}

export function parseDate(value?: string): Date | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isCalBgImage(color?: string): boolean {
  return typeof color === "string" && color.startsWith("bg:")
}

export function calBgImageUrl(color?: string): string {
  return isCalBgImage(color) ? (color || "").slice(3) : ""
}

export function solidEventColor(color?: string, fallback = "var(--muted-foreground)"): string {
  return color && !isCalBgImage(color) ? color : fallback
}

export function calBgImageStyle(color?: string, overlay = "70%"): CSSProperties | undefined {
  const url = calBgImageUrl(color)
  if (!url) return undefined
  return {
    backgroundImage: `linear-gradient(color-mix(in srgb, var(--card) ${overlay}, transparent), color-mix(in srgb, var(--card) ${overlay}, transparent)), url(${JSON.stringify(url)})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  }
}

export function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
}

export function eventStart(ev: CalEvent): Date | null {
  return parseDate(ev.dtstart)
}

export function eventEnd(ev: CalEvent): Date | null {
  return parseDate(ev.dtend) || eventStart(ev)
}

export function eventTypeLabel(value?: string): string {
  return EVENT_TYPES.find((t) => t.value === value)?.label || value || ""
}

export function importanceLabel(value?: string): string {
  return IMPORTANCE_OPTIONS.find((i) => i.value === value)?.label || value || "Normal"
}

export function timeLabel(ev: CalEvent): string {
  if (ev.all_day) return "All day"
  const start = eventStart(ev)
  if (!start) return ""
  const end = eventEnd(ev)
  const fmt = { hour: "numeric", minute: "2-digit" } as const
  if (end && !sameDay(start, end)) return start.toLocaleString([], { month: "short", day: "numeric", ...fmt })
  if (end && end > start) return `${start.toLocaleTimeString([], fmt)} - ${end.toLocaleTimeString([], fmt)}`
  return start.toLocaleTimeString([], fmt)
}

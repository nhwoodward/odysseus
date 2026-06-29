import { useEffect, useRef, useState } from "react"
import { Bell, MoreVertical } from "lucide-react"
import { createCalendarReminder, type CalEvent } from "@/api/calendar"
import { cn } from "@/lib/utils"
import { IconButton } from "@/components/ui/IconButton"
import { QUICK_REMINDER_PRESETS, eventStart, isCalBgImage } from "@/components/calendar/util"

function quickReminderDue(ev: CalEvent, minutes: number): string | null {
  const start = eventStart(ev)
  if (!start) return null
  const due = new Date(start)
  due.setMinutes(due.getMinutes() - minutes)
  return due.toISOString()
}

// Compact ⋮ menu on event tiles for setting a reminder without opening the
// full editor. Reuses createCalendarReminder with a handful of preset offsets.
export function QuickReminderMenu({
  ev,
  align = "right",
  className,
  onResult,
}: {
  ev: CalEvent
  align?: "left" | "right"
  className?: string
  onResult: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const start = eventStart(ev)
  const title = ev.summary || ev.title || "(untitled)"

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const remind = async (minutes: number, label: string) => {
    const dueDate = quickReminderDue(ev, minutes)
    if (!dueDate) { onResult("Can't set a reminder without an event time."); setOpen(false); return }
    setBusy(true)
    try {
      await createCalendarReminder({
        title: `Reminder: ${title}`,
        content: ev.location ? `${title} at ${ev.location}` : title,
        dueDate,
        eventStart: start ? start.toISOString() : undefined,
        color: ev.color && !isCalBgImage(ev.color) ? ev.color : undefined,
      })
      onResult(`Reminder set ${label.toLowerCase()}.`)
    } catch (e) {
      onResult(e instanceof Error ? e.message : "Couldn't create reminder")
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <IconButton
        icon={<MoreVertical />}
        label="Set a reminder"
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground"
      />
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-full z-30 mt-1 w-44 overflow-hidden rounded-md border bg-popover py-1 text-sm shadow-md",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center gap-1.5 px-3 py-1 text-label font-medium uppercase tracking-wider text-muted-foreground">
            <Bell className="size-3" />Remind me
          </div>
          {QUICK_REMINDER_PRESETS.map((p) => (
            <button
              key={p.minutes}
              role="menuitem"
              type="button"
              disabled={busy || !start}
              onClick={() => void remind(p.minutes, p.label)}
              className="block w-full px-3 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
          {!start && <p className="px-3 py-1 text-label text-muted-foreground">No event time</p>}
        </div>
      )}
    </div>
  )
}

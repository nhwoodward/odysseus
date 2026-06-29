import { AlertTriangle, Pencil, RefreshCw, Tag, Trash2 } from "lucide-react"
import { type CalEvent } from "@/api/calendar"
import { cn } from "@/lib/utils"
import { IconButton } from "@/components/ui/IconButton"
import { calBgImageStyle, eventTypeLabel, importanceLabel, solidEventColor, timeLabel } from "@/components/calendar/util"
import { CookbookTaskLink } from "@/components/calendar/CookbookTaskLink"
import { QuickReminderMenu } from "@/components/calendar/QuickReminderMenu"

export function EventCard({ ev, compact, onEdit, onDelete, onReminder }: { ev: CalEvent; compact?: boolean; onEdit: () => void; onDelete: () => void; onReminder: (message: string) => void }) {
  const importance = (ev.importance || "normal").toLowerCase()
  const isImportant = importance === "high" || importance === "critical"
  const title = ev.summary || ev.title || "(untitled)"
  return (
    <div className={cn("group flex min-w-0 gap-2 rounded-md border bg-card p-2", compact ? "text-xs" : "p-3")} style={calBgImageStyle(ev.color)}>
      <span className={cn("w-1 shrink-0 rounded-full", compact ? "h-auto" : "h-10")} style={{ background: solidEventColor(ev.color) }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{title}</span>
          {(ev.is_recurrence || ev.rrule) && <RefreshCw className="size-3 shrink-0 text-muted-foreground" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-label text-muted-foreground">
          <span>{timeLabel(ev)}</span>
          {ev.event_type && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <Tag className="size-3" />
              {eventTypeLabel(ev.event_type)}
            </span>
          )}
          {isImportant && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
              <AlertTriangle className="size-3" />
              {importanceLabel(importance)}
            </span>
          )}
          <CookbookTaskLink ev={ev} compact={compact} />
        </div>
        {!compact && ev.location && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(ev.location)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {ev.location}
          </a>
        )}
        {!compact && ev.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ev.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
        {!compact && <QuickReminderMenu ev={ev} onResult={onReminder} />}
        <IconButton icon={<Pencil />} label="Edit" onClick={onEdit} className="text-muted-foreground" />
        <IconButton icon={<Trash2 />} label="Delete" onClick={onDelete} className="text-muted-foreground hover:text-destructive" />
      </div>
    </div>
  )
}

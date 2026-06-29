import { useState } from "react"
import { Download, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type Calendar as CalendarInfo } from "@/api/calendar"

export function CalendarRow({
  calendar,
  active,
  deleteDisabled,
  pending,
  onFilter,
  onSave,
  onDelete,
  onExport,
}: {
  calendar: CalendarInfo
  active: boolean
  deleteDisabled: boolean
  pending: boolean
  onFilter: () => void
  onSave: (name: string, color: string) => void
  onDelete: () => void
  onExport: () => void
}) {
  const [name, setName] = useState(calendar.name)
  const [color, setColor] = useState(calendar.color || "#5b8abf")
  const changed = name.trim() !== calendar.name || color !== (calendar.color || "#5b8abf")

  return (
    <div className="grid gap-2 rounded-md border bg-background p-2 text-sm md:grid-cols-[1fr_8rem_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label={`${calendar.name} name`} className="h-8 min-w-0 flex-1 rounded-md border bg-card px-2 text-sm outline-none focus-visible:border-ring" />
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={`${calendar.name} color`} className="h-8 w-10 shrink-0 cursor-pointer rounded-md border bg-card" />
        <span className="truncate text-xs text-muted-foreground">{calendar.source || "local"}</span>
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant={active ? "secondary" : "ghost"} onClick={onFilter}>{active ? "Showing" : "Filter"}</Button>
        <Button size="sm" variant="ghost" disabled={pending || !changed || !name.trim()} onClick={() => onSave(name.trim(), color)}>Save</Button>
        <button onClick={onExport} title="Export .ics" aria-label="Export .ics" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Download className="size-4" />
        </button>
        <button disabled={deleteDisabled || pending} onClick={onDelete} title="Delete calendar" aria-label="Delete calendar" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-50">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
}

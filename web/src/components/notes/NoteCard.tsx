import { useRef, useState } from "react"
import {
  Archive,
  Bell,
  Bot,
  Brush,
  Check,
  ExternalLink,
  ImagePlus,
  ListChecks,
  Palette,
  Pencil,
  Pin,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import { uploadNoteImage } from "@/api/notes"
import { IconButton } from "@/components/ui/IconButton"
import { cn } from "@/lib/utils"
import type { Note } from "@/types"
import {
  NOTE_COLORS,
  backgroundStyle,
  bgImageUrl,
  colorClasses,
  goalProgress,
  isOverdue,
  itemDone,
  noteItems,
  noteLabels,
} from "@/components/notes/util"

function isChecklistType(type?: string): boolean {
  return type === "todo" || type === "goal" || type === "checklist"
}

function dueLabel(value?: string): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function NoteCard({
  note,
  selected,
  selectMode,
  archiveView,
  solving,
  onToggleSelect,
  onEdit,
  onPin,
  onArchive,
  onDelete,
  onToggleItem,
  onDeleteItem,
  onAddItem,
  onColor,
  onLabel,
  onSolveAgent,
  onOpenAgent,
}: {
  note: Note
  selected: boolean
  selectMode: boolean
  archiveView: boolean
  solving: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onPin: () => void
  onArchive: () => void
  onDelete: () => void
  onToggleItem: (index: number) => void
  onDeleteItem: (index: number) => void
  onAddItem: (text: string) => void
  onColor: (color: string) => void
  onLabel: (label: string) => void
  onSolveAgent: () => void
  onOpenAgent: () => void
}) {
  const [quickItem, setQuickItem] = useState("")
  const [uploadingBg, setUploadingBg] = useState(false)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const items = noteItems(note)
  const labels = noteLabels(note)
  const overdue = isOverdue(note.due_date)
  const isGoal = note.note_type === "goal"
  const isDraw = note.note_type === "draw"
  const cardBg = backgroundStyle(note.color)
  const muted = cardBg ? "text-white/80" : "text-muted-foreground"
  const iconButton = cardBg
    ? "text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-60"
    : "text-muted-foreground disabled:opacity-60"
  const submitQuickItem = () => {
    const text = quickItem.trim()
    if (!text) return
    onAddItem(text)
    setQuickItem("")
  }
  const chooseCardBackground = async (file?: File) => {
    if (!file) return
    setUploadingBg(true)
    try {
      const url = await uploadNoteImage(file)
      onColor(`bg:${url}`)
    } catch {
      // Keep the card stable; full image/background upload errors are still handled in edit mode.
    } finally {
      setUploadingBg(false)
      if (bgFileRef.current) bgFileRef.current.value = ""
    }
  }
  return (
    <article
      className={cn("group relative min-w-0 rounded-lg border p-3", cardBg ? "border-white/25 bg-card text-white shadow-sm" : colorClasses(note.color), selected && "ring-2 ring-primary")}
      style={cardBg}
      data-testid={`note-card-${note.id}`}
    >
      {selectMode && (
        <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select ${note.title || "note"}`} className="absolute left-2 top-2 z-10 size-4" />
      )}
      <div className={cn("flex items-start gap-2", selectMode && "pl-6")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 pr-24">
            {note.pinned && <Pin className={cn("size-3.5 shrink-0 fill-current", muted)} />}
            {isGoal ? <Target className={cn("size-3.5 shrink-0", muted)} /> : isDraw ? <Brush className={cn("size-3.5 shrink-0", muted)} /> : isChecklistType(note.note_type) ? <ListChecks className={cn("size-3.5 shrink-0", muted)} /> : null}
            <h2 className="truncate text-sm font-semibold">{note.title || "(untitled)"}</h2>
            {isGoal && <span className={cn("rounded-full border px-1.5 py-0.5 text-label", cardBg ? "border-white/30 bg-white/15 text-white/85" : "bg-muted text-muted-foreground")}>Goal{goalProgress(note)}</span>}
          </div>
          {note.image_url && <img src={note.image_url} alt="" className="mt-2 max-h-56 w-full rounded-md object-cover" />}
          {isGoal && note.content && <p className={cn("mt-2 whitespace-pre-wrap break-words text-sm", muted)}>{note.content}</p>}
          {items.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {items.slice(0, 10).map((item, index) => {
                const done = itemDone(item)
                return (
                  <div key={`${item.id || index}-${item.text || ""}`} className="group/item flex min-w-0 items-start gap-1 text-sm" style={{ paddingLeft: `${Math.min(item.indent || 0, 3) * 12}px` }}>
                    <label className="flex min-w-0 flex-1 items-start gap-2">
                      <input type="checkbox" checked={done} onChange={() => onToggleItem(index)} className="mt-0.5 size-4 shrink-0" />
                      <span className={cn("min-w-0 flex-1 break-words", done && (cardBg ? "text-white/55 line-through" : "text-muted-foreground line-through"))}>{item.text || "(blank)"}</span>
                    </label>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onDeleteItem(index) }}
                      title="Delete item"
                      aria-label="Delete item"
                      className={cn("shrink-0 rounded p-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover/item:opacity-100", cardBg ? "text-white/60 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-destructive")}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )
              })}
              {items.length > 10 && <div className={cn("text-xs", muted)}>+{items.length - 10} more</div>}
              <label className="mt-2 flex items-center gap-2">
                <input
                  value={quickItem}
                  onChange={(event) => setQuickItem(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === "Enter") {
                      event.preventDefault()
                      submitQuickItem()
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                  placeholder="+ Add item"
                  className={cn("h-8 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:border-ring", cardBg ? "border-white/25 bg-white/10 text-white placeholder:text-white/55" : "bg-background")}
                />
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); submitQuickItem() }}
                  title="Add item"
                  aria-label="Add item"
                  className={cn("rounded-md border p-1.5", cardBg ? "border-white/25 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                >
                  <Check className="size-3.5" />
                </button>
              </label>
            </div>
          ) : !isGoal && note.content ? (
            <p className={cn("mt-2 whitespace-pre-wrap break-words text-sm", muted)}>{note.content}</p>
          ) : null}
          {note.due_date && (
            <div className={cn("mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs", overdue ? "border-destructive/30 bg-destructive/10 text-destructive" : cardBg ? "border-white/30 bg-white/15 text-white/85" : "text-muted-foreground")}>
              <Bell className="size-3" />
              {dueLabel(note.due_date)}
              {note.repeat && note.repeat !== "none" && <span>· {note.repeat}</span>}
            </div>
          )}
          {labels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <button key={label} onClick={() => onLabel(label)} className={cn("rounded px-1.5 py-0.5 text-xs", cardBg ? "bg-white/15 text-white/80 hover:text-white" : "bg-muted text-muted-foreground hover:text-foreground")}>
                  #{label}
                </button>
              ))}
            </div>
          )}
          {note.agent_session_id && (
            <button onClick={onOpenAgent} className={cn("mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", cardBg ? "border-white/30 bg-white/15 text-white/85 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
              <Bot className="size-3.5" />Agent <ExternalLink className="size-3" />
            </button>
          )}
        </div>
      </div>
      <div className={cn("mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2", cardBg ? "border-white/20" : "border-border/70")} aria-label="Card color">
        <Palette className={cn("size-3.5", muted)} />
        {NOTE_COLORS.map((color) => (
          <button
            key={color.value || "none"}
            type="button"
            onClick={(event) => { event.stopPropagation(); onColor(color.value) }}
            title={`${color.label} color`}
            aria-label={`${color.label} color`}
            className={cn("size-5 rounded-full border", color.value === "" && "bg-background", note.color === color.value && "ring-2 ring-ring ring-offset-1 ring-offset-background")}
            style={{ background: color.bg }}
          />
        ))}
        <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void chooseCardBackground(event.target.files?.[0])} />
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); bgFileRef.current?.click() }}
          title="Background image"
          aria-label="Background image"
          disabled={uploadingBg}
          className={cn("grid size-5 place-items-center rounded-full border", bgImageUrl(note.color) && "ring-2 ring-ring ring-offset-1 ring-offset-background")}
          style={{ background: bgImageUrl(note.color) ? `center / cover url("${bgImageUrl(note.color).replace(/"/g, "%22")}")` : "conic-gradient(from 0deg, #e06c75, #d19a66, #e5c07b, #98c379, #61afef, #c678dd, #e06c75)" }}
        >
          {uploadingBg && <ImagePlus className="size-3 text-white drop-shadow" />}
        </button>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
        <IconButton
          icon={solving ? <Sparkles className="animate-pulse" /> : <Bot />}
          label={note.agent_session_id ? "Re-run agent" : "Agent: solve this"}
          onClick={onSolveAgent}
          disabled={solving}
          className={iconButton}
        />
        <IconButton icon={<Pin />} label={note.pinned ? "Unpin" : "Pin"} onClick={onPin} className={cn(iconButton, note.pinned && "text-foreground")} />
        <IconButton icon={<Pencil />} label="Edit" onClick={onEdit} className={iconButton} />
        <IconButton icon={archiveView ? <Undo2 /> : <Archive />} label={archiveView ? "Unarchive" : "Archive"} onClick={onArchive} className={iconButton} />
        <IconButton icon={<Trash2 />} label="Delete" onClick={onDelete} className={cn(iconButton, cardBg ? "hover:text-white" : "hover:text-destructive")} />
      </div>
    </article>
  )
}

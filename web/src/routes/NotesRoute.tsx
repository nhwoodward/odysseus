import {
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useNavigate } from "react-router-dom"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCards } from "@/components/ui/skeleton"
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  Clipboard,
  Search,
  StickyNote,
  Target,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import { useNoteMutations, useNotes } from "@/api/notes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { hasActiveNoteReminder, hasReminderTime, useNoteReminders } from "@/stores/noteReminders"
import type { Note, NoteItem } from "@/types"
import { NoteCard } from "@/components/notes/NoteCard"
import { NoteForm } from "@/components/notes/NoteForm"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { goalProgress, isOverdue, itemDone, noteItems, noteLabels } from "@/components/notes/util"

const EMPTY_NOTES: Note[] = []

type NoteFilter = "all" | "default" | "reminders" | "no-reminders" | "goals" | "today"

const NOTES_FIRST_OPEN_HINT_KEY = "odysseus-notes-first-open-hint-v1"

function newNoteItem(text: string): NoteItem {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { id: randomId, text, done: false }
}

function serializeNote(note: Note): string {
  const lines: string[] = []
  if (note.title) lines.push(note.title)
  if (note.content) lines.push(note.content)
  const items = noteItems(note)
  if (items.length) {
    if (lines.length) lines.push("")
    for (const item of items) {
      const text = (item.text || "").trim()
      if (text) lines.push(`- [${itemDone(item) ? "x" : " "}] ${text}`)
    }
  }
  return lines.join("\n").trim()
}

function noteMatches(note: Note, q: string): boolean {
  if (!q) return true
  const items = noteItems(note).map((item) => item.text || "").join(" ")
  const haystack = [note.title, note.content, note.label, items].join(" ").toLowerCase()
  return haystack.includes(q)
}

function isPastReminder(note: Note): boolean {
  return !!note.due_date && hasReminderTime(note.due_date) && isOverdue(note.due_date)
}

function noteTime(value?: string | null): number {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortNotesForReminderPriority(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    const aActive = hasActiveNoteReminder(a)
    const bActive = hasActiveNoteReminder(b)
    if (aActive !== bActive) return aActive ? -1 : 1
    const sortDelta = (a.sort_order || 0) - (b.sort_order || 0)
    if (sortDelta !== 0) return sortDelta
    return noteTime(b.updated_at) - noteTime(a.updated_at)
  })
}

function isMobileNotesMode(): boolean {
  if (typeof window === "undefined") return false
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? true
  return coarse && window.innerWidth <= 768
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return !!(target instanceof HTMLElement && target.closest("button,input,a,label,textarea,select,[role='button']"))
}

function nextGoalStep(note: Note): { item: NoteItem; index: number } | null {
  const items = noteItems(note)
  const index = items.findIndex((item) => !itemDone(item))
  return index >= 0 ? { item: items[index], index } : null
}

export function NotesRoute() {
  const navigate = useNavigate()
  const [archiveView, setArchiveView] = useState(false)
  const { data: notes, isLoading } = useNotes({ archived: archiveView })
  const { create, update, remove, pin, archive, toggleItem, reorder, solveAgent } = useNoteMutations()
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [q, setQ] = useState("")
  const [labelFilter, setLabelFilter] = useState("")
  const [filter, setFilter] = useState<NoteFilter>("all")
  const [nextReminderFilter, setNextReminderFilter] = useState<"reminders" | "no-reminders">("reminders")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState("")
  const [dragId, setDragId] = useState("")
  const [dragOverId, setDragOverId] = useState("")
  const [mobileDragId, setMobileDragId] = useState("")
  const [showFirstOpenHint, setShowFirstOpenHint] = useState(false)
  const activeHighlightIds = useNoteReminders((s) => s.activeHighlightIds)
  const longPressTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ id: string; x: number; y: number; armed: boolean; dragging: boolean } | null>(null)
  const suppressMobileClickRef = useRef(false)
  const scrolledReminderRef = useRef<Set<string>>(new Set())

  const allNotes = notes || EMPTY_NOTES
  const activeHighlightSet = useMemo(() => new Set(activeHighlightIds), [activeHighlightIds])

  useEffect(() => {
    if (typeof localStorage === "undefined") return
    let timer: number | null = null
    try {
      if (localStorage.getItem(NOTES_FIRST_OPEN_HINT_KEY)) return
      localStorage.setItem(NOTES_FIRST_OPEN_HINT_KEY, "1")
      timer = window.setTimeout(() => setShowFirstOpenHint(true), 0)
    } catch {
      // Ignore unavailable localStorage; the rest of Notes still works.
    }
    return () => {
      if (timer != null) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!showFirstOpenHint) return
    const timer = window.setTimeout(() => setShowFirstOpenHint(false), 6500)
    return () => window.clearTimeout(timer)
  }, [showFirstOpenHint])

  useEffect(() => {
    if (archiveView || !notes) return
    const reminders = useNoteReminders.getState()
    const newlyHighlighted = reminders.flushHighlights(notes)
    reminders.dismissFired(notes)
    const firstId = newlyHighlighted[0] || useNoteReminders.getState().activeHighlightIds.find((id) => notes.some((note) => note.id === id && hasActiveNoteReminder(note)))
    if (!firstId) return
    if (scrolledReminderRef.current.has(firstId)) return
    scrolledReminderRef.current.add(firstId)
    window.setTimeout(() => {
      const card = document.querySelector(`[data-note-id="${CSS.escape(firstId)}"]`)
      card?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 80)
  }, [archiveView, notes])

  const labels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of allNotes) for (const label of noteLabels(note)) counts.set(label, (counts.get(label) || 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [allNotes])

  const counts = useMemo(() => {
    const active = allNotes.filter((note) => !note.archived)
    return {
      default: active.filter((note) => noteLabels(note).length === 0).length,
      reminders: active.filter((note) => !!note.due_date && hasReminderTime(note.due_date)).length,
      pastReminders: active.filter(isPastReminder).length,
      goals: active.filter((note) => note.note_type === "goal").length,
      today: active.filter((note) => note.note_type === "goal" && !!nextGoalStep(note)).length,
    }
  }, [allNotes])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = allNotes.filter((note) => {
      if (!noteMatches(note, query)) return false
      if (labelFilter && !noteLabels(note).includes(labelFilter)) return false
      if (filter === "default" && noteLabels(note).length > 0) return false
      if (filter === "reminders" && !(note.due_date && hasReminderTime(note.due_date))) return false
      if (filter === "no-reminders" && note.due_date && hasReminderTime(note.due_date)) return false
      if (filter === "goals" && note.note_type !== "goal") return false
      if (filter === "today" && (note.note_type !== "goal" || !nextGoalStep(note))) return false
      return true
    })
    if (filter === "reminders") {
      return [...base].sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())
    }
    if (!archiveView) return sortNotesForReminderPriority(base)
    return base
  }, [allNotes, archiveView, filter, labelFilter, q])

  const selectedCount = selected.size
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false) }
  const selectAll = () => setSelected(new Set(filtered.map((note) => note.id)))

  const bulkArchive = () => {
    for (const id of selected) archive.mutate(id)
    clearSelect()
  }
  const bulkDelete = () => {
    if (!confirm(`Delete ${selected.size} note${selected.size === 1 ? "" : "s"}?`)) return
    for (const id of selected) remove.mutate(id)
    clearSelect()
  }
  const clearPastReminders = () => {
    const targets = allNotes.filter(isPastReminder)
    if (!targets.length) return
    if (!confirm(`Delete ${targets.length} past reminder${targets.length === 1 ? "" : "s"}?`)) return
    for (const note of targets) remove.mutate(note.id)
  }
  const copyNote = async (note: Note) => {
    const text = serializeNote(note)
    if (!text) return
    await navigator.clipboard?.writeText(text)
    setCopied(note.id)
    window.setTimeout(() => setCopied((id) => id === note.id ? "" : id), 1200)
  }
  const toggleReminderFilter = () => {
    setLabelFilter("")
    if (filter === "reminders" || filter === "no-reminders") {
      setFilter("all")
      return
    }
    setFilter(nextReminderFilter)
    setNextReminderFilter((next) => next === "reminders" ? "no-reminders" : "reminders")
  }
  const moveNoteById = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return
    const ids = filtered.map((note) => note.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    reorder.mutate(ids)
  }
  const moveVisibleNotes = (targetId: string) => {
    moveNoteById(dragId, targetId)
    setDragId("")
    setDragOverId("")
  }
  const clearLongPress = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }
  const resetTouchDrag = () => {
    clearLongPress()
    touchStartRef.current = null
    setMobileDragId("")
    setDragId("")
    setDragOverId("")
  }
  const startTouchPress = (note: Note, event: ReactTouchEvent<HTMLDivElement>) => {
    if (archiveView || selectMode || !isMobileNotesMode() || isInteractiveTarget(event.target)) return
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    clearLongPress()
    touchStartRef.current = { id: note.id, x: touch.clientX, y: touch.clientY, armed: true, dragging: false }
    longPressTimerRef.current = window.setTimeout(() => {
      const state = touchStartRef.current
      if (!state?.armed) return
      state.dragging = true
      state.armed = false
      suppressMobileClickRef.current = true
      setMobileDragId(note.id)
      setDragId(note.id)
      setDragOverId(note.id)
      window.navigator.vibrate?.(15)
    }, 450)
  }
  const moveTouchPress = (event: ReactTouchEvent<HTMLDivElement>) => {
    const state = touchStartRef.current
    if (!state || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = Math.abs(touch.clientX - state.x)
    const dy = Math.abs(touch.clientY - state.y)
    if (!state.dragging && (dx > 8 || dy > 8)) {
      resetTouchDrag()
      return
    }
    if (!state.dragging) return
    event.preventDefault()
    const under = document.elementFromPoint(touch.clientX, touch.clientY)
    const target = under instanceof HTMLElement ? under.closest<HTMLElement>("[data-note-id]") : null
    const targetId = target?.dataset.noteId || ""
    if (targetId && targetId !== dragOverId) setDragOverId(targetId)
  }
  const endTouchPress = () => {
    const state = touchStartRef.current
    const targetId = dragOverId
    if (state?.dragging) {
      suppressMobileClickRef.current = true
      window.setTimeout(() => { suppressMobileClickRef.current = false }, 350)
      if (targetId && targetId !== state.id) moveNoteById(state.id, targetId)
    }
    resetTouchDrag()
  }
  const openMobileEdit = (note: Note, event: ReactTouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (suppressMobileClickRef.current) {
      suppressMobileClickRef.current = false
      return
    }
    if (!isMobileNotesMode() || archiveView || selectMode || mobileDragId || isInteractiveTarget(event.target)) return
    setEditNote(note)
  }

  const hasActiveFilter = !!q || !!labelFilter || filter !== "all"

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
      <RouteHeader
        title={(
          <div className="min-w-0">
            <span className="text-sm font-semibold">Notes</span>
            <span className="ml-2 text-sm text-muted-foreground">{archiveView ? "Archive" : `${allNotes.length} active`}</span>
          </div>
        )}
        actions={(
          <>
            <Button size="sm" variant={archiveView ? "secondary" : "outline"} onClick={() => { setArchiveView((v) => !v); clearSelect(); setEditNote(null); setFilter("all") }}>
              <Archive className="size-4" />Archive
            </Button>
            <Button size="sm" variant={selectMode ? "secondary" : "outline"} onClick={() => { setSelectMode((v) => !v); setSelected(new Set()) }}>
              <Check className="size-4" />Select
            </Button>
          </>
        )}
      />

      {showFirstOpenHint && (
        <div
          id="notes-first-open-hint"
          data-testid="notes-first-open-hint"
          className="fixed right-4 top-16 z-50 w-[260px] rounded-lg border bg-popover px-3 py-3 text-sm text-popover-foreground shadow-lg animate-pop-in"
        >
          <div className="flex items-start gap-2">
            <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 leading-5"><b>Notes</b> is your basic todo list, and also where reminders are managed.</p>
          </div>
          <button type="button" onClick={() => setShowFirstOpenHint(false)} className="ml-auto mt-2 block rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent">
            OK
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!archiveView && !editNote && (
          <NoteForm
            mode="create"
            busy={create.isPending}
            onSubmit={(payload) => create.mutate(payload)}
          />
        )}
        {editNote && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-3 md:static md:z-auto md:mb-4 md:overflow-visible md:bg-transparent md:p-0">
            <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
              <button onClick={() => setEditNote(null)} title="Back" aria-label="Back" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                <Undo2 className="size-4" />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{editNote.title || "Edit note"}</span>
            </div>
            <NoteForm
              key={editNote.id}
              mode="edit"
              initial={editNote}
              busy={update.isPending}
              onCancel={() => setEditNote(null)}
              onSubmit={(payload) => update.mutate({ id: editNote.id, ...payload }, { onSuccess: () => setEditNote(null) })}
            />
          </div>
        )}

        <div className="mt-4 space-y-2">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes..." className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring" />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={!labelFilter && filter === "all" ? "secondary" : "outline"} onClick={() => { setLabelFilter(""); setFilter("all") }}>All</Button>
              <Button size="sm" variant={filter === "default" ? "secondary" : "outline"} onClick={() => { setLabelFilter(""); setFilter(filter === "default" ? "all" : "default") }}>
                Default <span className="text-muted-foreground">{counts.default}</span>
              </Button>
              {counts.today > 0 && (
                <Button size="sm" variant={filter === "today" ? "secondary" : "outline"} onClick={() => { setLabelFilter(""); setFilter(filter === "today" ? "all" : "today") }}>
                  <CalendarDays className="size-4" />Today <span className="text-muted-foreground">{counts.today}</span>
                </Button>
              )}
              {counts.goals > 0 && (
                <Button size="sm" variant={filter === "goals" ? "secondary" : "outline"} onClick={() => { setLabelFilter(""); setFilter(filter === "goals" ? "all" : "goals") }}>
                  <Target className="size-4" />Goals <span className="text-muted-foreground">{counts.goals}</span>
                </Button>
              )}
              <Button size="sm" variant={filter === "reminders" || filter === "no-reminders" ? "secondary" : "outline"} onClick={toggleReminderFilter}>
                <Bell className="size-4" />{filter === "no-reminders" ? "No reminders" : "Reminders"} <span className="text-muted-foreground">{counts.reminders}</span>
              </Button>
              {filter === "reminders" && counts.pastReminders > 0 && (
                <Button size="sm" variant="outline" onClick={clearPastReminders}>
                  <Trash2 className="size-4" />Clear past <span className="text-muted-foreground">{counts.pastReminders}</span>
                </Button>
              )}
              {labels.map(([label, count]) => (
                <Button key={label} size="sm" variant={labelFilter === label ? "secondary" : "outline"} onClick={() => { setFilter("all"); setLabelFilter(labelFilter === label ? "" : label) }}>
                  #{label} <span className="text-muted-foreground">{count}</span>
                </Button>
              ))}
            </div>
          </div>

          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{selectedCount} selected</span>
              <Button size="sm" variant="outline" onClick={selectAll} data-testid="notes-bulk-select-all">All</Button>
              <Button size="sm" variant="outline" disabled={!selectedCount} onClick={bulkArchive} data-testid="notes-bulk-archive">
                {archiveView ? <Undo2 className="size-4" /> : <Archive className="size-4" />}{archiveView ? "Unarchive" : "Archive"}
              </Button>
              <Button size="sm" variant="outline" disabled={!selectedCount} onClick={bulkDelete} data-testid="notes-bulk-delete">
                <Trash2 className="size-4" />Delete
              </Button>
              <button onClick={clearSelect} title="Cancel select" aria-label="Cancel select" className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>

        {filter === "today" ? (
          <div className="mt-4 overflow-hidden rounded-lg border bg-card" data-testid="notes-today-view">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <CalendarDays className="size-4 text-muted-foreground" />Today
            </div>
            {filtered.map((note) => {
              const next = nextGoalStep(note)
              if (!next) return null
              return (
                <div key={note.id} className="grid gap-2 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <input type="checkbox" checked={false} onChange={() => toggleItem.mutate({ id: note.id, index: next.index })} title="Mark step done" className="size-4" />
                  <button onClick={() => setEditNote(note)} className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium">{note.title || "(untitled goal)"}</span>
                    <span className="block break-words text-sm text-muted-foreground">{next.item.text || "(blank)"}</span>
                  </button>
                  <span className="text-xs text-muted-foreground">{goalProgress(note).trim()}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((note) => {
              const reminderGlow = activeHighlightSet.has(note.id) && hasActiveNoteReminder(note)
              return (
                <div
                  key={note.id}
                  className={cn(
                    "group relative touch-pan-y",
                    dragOverId === note.id && "rounded-lg ring-2 ring-ring",
                    mobileDragId === note.id && "scale-[.98] opacity-80",
                    reminderGlow && "note-reminder-fired-sticky rounded-lg",
                  )}
                  data-note-id={note.id}
                  data-testid={`note-wrap-${note.id}`}
                  draggable={!archiveView && !selectMode}
                  onClickCapture={() => {
                    if (reminderGlow) useNoteReminders.getState().dismissHighlight(note.id)
                  }}
                  onClick={(event) => openMobileEdit(note, event)}
                  onTouchStart={(event) => startTouchPress(note, event)}
                  onTouchMove={moveTouchPress}
                  onTouchEnd={endTouchPress}
                  onTouchCancel={resetTouchDrag}
                  onDragStart={(event) => {
                    if ((event.target as HTMLElement).closest("button,input,a,label,textarea,select")) {
                      event.preventDefault()
                      return
                    }
                    setDragId(note.id)
                    event.dataTransfer.effectAllowed = "move"
                  }}
                  onDragOver={(event) => {
                    if (!dragId || dragId === note.id) return
                    event.preventDefault()
                    setDragOverId(note.id)
                  }}
                  onDragLeave={() => setDragOverId((id) => id === note.id ? "" : id)}
                  onDrop={(event) => {
                    event.preventDefault()
                    moveVisibleNotes(note.id)
                  }}
                  onDragEnd={() => { setDragId(""); setDragOverId("") }}
                >
                  <NoteCard
                    note={note}
                    selected={selected.has(note.id)}
                    selectMode={selectMode}
                    archiveView={archiveView}
                    solving={solveAgent.isPending && solveAgent.variables?.id === note.id}
                    onToggleSelect={() => toggleSelected(note.id)}
                    onEdit={() => setEditNote(note)}
                    onPin={() => pin.mutate(note.id)}
                    onArchive={() => archive.mutate(note.id)}
                    onDelete={() => { if (confirm("Delete this note?")) remove.mutate(note.id) }}
                    onToggleItem={(index) => toggleItem.mutate({ id: note.id, index })}
                    onDeleteItem={(index) => update.mutate({ id: note.id, items: noteItems(note).filter((_, itemIndex) => itemIndex !== index) })}
                    onAddItem={(text) => update.mutate({ id: note.id, items: [...noteItems(note), newNoteItem(text)] })}
                    onColor={(color) => update.mutate({ id: note.id, color })}
                    onLabel={(label) => { setFilter("all"); setLabelFilter(label) }}
                    onSolveAgent={() => solveAgent.mutate(note)}
                    onOpenAgent={() => { if (note.agent_session_id) navigate(`/chat/${note.agent_session_id}`) }}
                  />
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <button onClick={() => void copyNote(note)} title="Copy" aria-label="Copy" className="grid size-8 place-items-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:size-auto md:p-1.5">
                      {copied === note.id ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {isLoading && <SkeletonCards count={6} className="mt-1" />}
        {!isLoading && filtered.length === 0 && (
          <EmptyState
            icon={StickyNote}
            title={hasActiveFilter ? "No matching notes" : archiveView ? "No archived notes" : "No notes yet"}
            description={hasActiveFilter || archiveView ? undefined : "Capture quick notes, checklists, and reminders here."}
          />
        )}
      </div>
    </div>
  )
}

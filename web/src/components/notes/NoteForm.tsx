import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { Brush, Image, ImagePlus, ListChecks, Palette, StickyNote, Target, X } from "lucide-react"
import { uploadNoteImage, type NotePayload } from "@/api/notes"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/IconButton"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "@/stores/toast"
import type { Note, NoteItem } from "@/types"
import { DrawingPad } from "@/components/notes/DrawingPad"
import {
  NOTE_COLORS,
  backgroundStyle,
  bgImageUrl,
  colorClasses,
  itemDone,
  noteItems,
} from "@/components/notes/util"

const input = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"
const area = "w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"

type NoteFormType = "note" | "todo" | "draw" | "goal"

const REPEATS = [
  { label: "Doesn't repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
]

const NOTE_DRAFT_PREFIX = "odysseus-note-draft-"

interface FormState {
  title: string
  content: string
  noteType: NoteFormType
  itemsText: string
  color: string
  label: string
  dueDate: string
  repeat: string
  imageUrl: string
}

interface SavedNoteDraft {
  _ts?: number
  note_type?: string
  title?: string
  content?: string
  items?: NoteItem[] | null
  color?: string
  label?: string
  due_date?: string | null
  repeat?: string
  image_url?: string
}

function noteFormType(note?: Note): NoteFormType {
  if (note?.note_type === "draw") return "draw"
  if (note?.note_type === "goal") return "goal"
  if (note?.note_type === "todo" || note?.note_type === "checklist") return "todo"
  return "note"
}

function itemsFromText(value: string, previous: NoteItem[] = []): NoteItem[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => {
      const old = previous[index]
      const same = old && (old.text || "").trim() === text
      return {
        text,
        done: same ? itemDone(old) : false,
        indent: same ? old.indent || 0 : 0,
        id: same ? old.id : undefined,
      }
    })
}

function itemsToText(items: NoteItem[] | null | undefined): string {
  return Array.isArray(items) ? items.map((item) => item.text || "").filter(Boolean).join("\n") : ""
}

function draftKey(id?: string): string {
  return `${NOTE_DRAFT_PREFIX}${id || "__new__"}`
}

function isFormDraftEmpty(form: FormState): boolean {
  if (form.title.trim()) return false
  if (form.content.trim()) return false
  if (form.itemsText.split("\n").some((item) => item.trim())) return false
  if (form.imageUrl.trim()) return false
  return true
}

function sameFormDraft(a: FormState, b: FormState): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.noteType === b.noteType &&
    a.itemsText === b.itemsText &&
    a.color === b.color &&
    a.label === b.label &&
    a.dueDate === b.dueDate &&
    a.repeat === b.repeat &&
    a.imageUrl === b.imageUrl
  )
}

function savedDraftFromForm(form: FormState): SavedNoteDraft {
  const isChecklist = form.noteType === "todo" || form.noteType === "goal"
  return {
    _ts: Date.now(),
    note_type: form.noteType,
    title: form.title,
    label: form.label,
    due_date: form.dueDate || null,
    repeat: form.repeat || "none",
    color: form.color,
    image_url: form.imageUrl,
    content: form.noteType === "note" || form.noteType === "goal" ? form.content : "",
    items: isChecklist ? itemsFromText(form.itemsText) : [],
  }
}

function formFromDraft(base: FormState, draft: SavedNoteDraft | null): FormState {
  if (!draft) return base
  const has = (key: keyof SavedNoteDraft) => Object.prototype.hasOwnProperty.call(draft, key)
  const noteType = noteFormType({ note_type: draft.note_type } as Note)
  const items = Array.isArray(draft.items) ? draft.items : []
  return {
    ...base,
    title: typeof draft.title === "string" ? draft.title : base.title,
    content: typeof draft.content === "string" ? draft.content : base.content,
    noteType,
    itemsText: has("items") ? itemsToText(items) : base.itemsText,
    color: has("color") && typeof draft.color === "string" ? draft.color : base.color,
    label: typeof draft.label === "string" ? draft.label : base.label,
    dueDate: has("due_date") ? (typeof draft.due_date === "string" && draft.due_date ? isoToLocal(draft.due_date) : "") : base.dueDate,
    repeat: typeof draft.repeat === "string" ? draft.repeat : base.repeat,
    imageUrl: has("image_url") && typeof draft.image_url === "string" ? draft.image_url : base.imageUrl,
  }
}

function loadNoteDraft(id: string | undefined, base: FormState): { form: FormState; restored: boolean } {
  if (typeof localStorage === "undefined") return { form: base, restored: false }
  try {
    const raw = localStorage.getItem(draftKey(id))
    if (!raw) return { form: base, restored: false }
    const draft = JSON.parse(raw) as SavedNoteDraft | null
    const form = formFromDraft(base, draft)
    return isFormDraftEmpty(form) ? { form: base, restored: false } : { form, restored: true }
  } catch {
    return { form: base, restored: false }
  }
}

function saveNoteDraft(id: string | undefined, form: FormState): void {
  if (typeof localStorage === "undefined") return
  try {
    const key = draftKey(id)
    if (isFormDraftEmpty(form)) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(savedDraftFromForm(form)))
  } catch {
    /* localStorage may be unavailable or full */
  }
}

function clearNoteDraft(id: string | undefined): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.removeItem(draftKey(id))
  } catch {
    /* ignore */
  }
}

function formFromNote(note?: Note): FormState {
  return {
    title: note?.title || "",
    content: note?.content || "",
    noteType: noteFormType(note),
    itemsText: itemsToText(noteItems(note || ({} as Note))),
    color: note?.color || "",
    label: note?.label || "",
    dueDate: note?.due_date ? isoToLocal(note.due_date) : "",
    repeat: note?.repeat || "none",
    imageUrl: note?.image_url || "",
  }
}

function payloadFromForm(form: FormState, previousItems: NoteItem[] = []): NotePayload {
  const isChecklist = form.noteType === "todo" || form.noteType === "goal"
  return {
    title: form.title.trim(),
    content: form.noteType === "note" || form.noteType === "goal" ? form.content : "",
    items: isChecklist ? itemsFromText(form.itemsText, previousItems) : [],
    note_type: form.noteType,
    color: form.color || undefined,
    label: normalizeLabel(form.label),
    due_date: form.dueDate || undefined,
    repeat: form.dueDate ? form.repeat || "none" : "none",
    image_url: form.imageUrl || undefined,
  }
}

function normalizeLabel(label: string): string | undefined {
  const cleaned = label
    .split(/\s+/)
    .map((part) => part.trim().replace(/^#/, ""))
    .filter(Boolean)
    .join(" ")
  return cleaned || undefined
}

function isoToLocal(value: string): string {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Drawing export failed"))
    }, "image/png")
  })
}

export function NoteForm({
  mode,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit"
  initial?: Note
  busy?: boolean
  onSubmit: (payload: NotePayload) => void
  onCancel?: () => void
}) {
  const draftId = initial?.id
  const [loadedDraft] = useState(() => loadNoteDraft(draftId, formFromNote(initial)))
  const [form, setForm] = useState<FormState>(() => loadedDraft.form)
  const [draftRestored, setDraftRestored] = useState(loadedDraft.restored)
  const [uploading, setUploading] = useState(false)
  const [savingDrawing, setSavingDrawing] = useState(false)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestFormRef = useRef(form)
  const skipDraftSaveRef = useRef(false)
  const discardedFormRef = useRef<FormState | null>(null)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const formBg = backgroundStyle(form.color)

  useEffect(() => {
    latestFormRef.current = form
  }, [form])

  useEffect(() => {
    if (!draftRestored) return
    toast(mode === "create" ? "Restored unsaved note" : "Restored unsaved changes", "info")
  }, [draftRestored, mode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (discardedFormRef.current) {
        if (sameFormDraft(discardedFormRef.current, form)) {
          clearNoteDraft(draftId)
          return
        }
        discardedFormRef.current = null
      }
      if (!skipDraftSaveRef.current) saveNoteDraft(draftId, form)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [draftId, form])

  useEffect(() => {
    return () => {
      if (discardedFormRef.current && sameFormDraft(discardedFormRef.current, latestFormRef.current)) {
        clearNoteDraft(draftId)
        return
      }
      if (!skipDraftSaveRef.current) saveNoteDraft(draftId, latestFormRef.current)
    }
  }, [draftId])

  const discardDraft = () => {
    clearNoteDraft(draftId)
    const restored = formFromNote(initial)
    discardedFormRef.current = restored
    latestFormRef.current = restored
    setForm(restored)
    setDraftRestored(false)
  }

  const cancel = () => {
    skipDraftSaveRef.current = true
    clearNoteDraft(draftId)
    setDraftRestored(false)
    onCancel?.()
  }

  const chooseImage = async (file?: File) => {
    if (!file) return
    setError("")
    setUploading(true)
    try {
      const url = await uploadNoteImage(file)
      set("imageUrl", url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const chooseBackground = async (file?: File) => {
    if (!file) return
    setError("")
    setUploading(true)
    try {
      const url = await uploadNoteImage(file)
      set("color", `bg:${url}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Background upload failed")
    } finally {
      setUploading(false)
      if (bgFileRef.current) bgFileRef.current.value = ""
    }
  }

  const submit = async () => {
    let payload = payloadFromForm(form, noteItems(initial || ({} as Note)))
    if (form.noteType === "draw") {
      const canvas = canvasRef.current
      if (canvas) {
        setSavingDrawing(true)
        try {
          const blob = await canvasBlob(canvas)
          const url = await uploadNoteImage(blob, "drawing.png")
          payload = { ...payload, content: "", items: [], image_url: url, note_type: "draw" }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Drawing upload failed")
          setSavingDrawing(false)
          return
        } finally {
          setSavingDrawing(false)
        }
      }
    }
    if (!payload.title && !payload.content && (!payload.items || payload.items.length === 0) && !payload.image_url) return
    skipDraftSaveRef.current = true
    clearNoteDraft(draftId)
    setDraftRestored(false)
    onSubmit(payload)
    if (mode === "create") {
      const next = formFromNote()
      latestFormRef.current = next
      setForm(next)
      skipDraftSaveRef.current = false
    }
  }

  const busyNow = !!busy || uploading || savingDrawing
  const typeBtn = (type: NoteFormType, label: string, icon: ReactNode) => (
    <button
      className={cn("inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs", form.noteType === type ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}
      onClick={() => set("noteType", type)}
      type="button"
    >
      {icon}{label}
    </button>
  )

  return (
    <div
      className={cn("space-y-3 rounded-lg border p-3", formBg ? "border-white/20 bg-card shadow-sm" : colorClasses(form.color))}
      style={formBg}
      data-testid={mode === "create" ? "note-create-form" : "note-edit-form"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-md border bg-background p-0.5" aria-label="Note type">
          {typeBtn("note", "Note", <StickyNote className="size-3.5" />)}
          {typeBtn("todo", "Todo", <ListChecks className="size-3.5" />)}
          {typeBtn("draw", "Draw", <Brush className="size-3.5" />)}
          {typeBtn("goal", "Goal", <Target className="size-3.5" />)}
        </div>
        {onCancel && (
          <IconButton icon={<X />} label="Cancel" onClick={cancel} className="bg-background/80 text-muted-foreground" />
        )}
      </div>
      {draftRestored && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
          <span>{mode === "create" ? "Restored unsaved note" : "Restored unsaved changes"}</span>
          <button type="button" onClick={discardDraft} className="rounded px-2 py-1 font-medium hover:bg-amber-500/15">
            Discard
          </button>
        </div>
      )}
      <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Title" className={input} />
      {form.imageUrl && form.noteType !== "draw" && (
        <div className="relative overflow-hidden rounded-md border">
          <img src={form.imageUrl} alt="" className="max-h-48 w-full object-cover" />
          <button onClick={() => set("imageUrl", "")} title="Remove image" aria-label="Remove image" className="absolute right-2 top-2 rounded-md bg-background/90 p-1.5 shadow hover:bg-background">
            <X className="size-4" />
          </button>
        </div>
      )}
      {form.noteType === "draw" ? (
        <DrawingPad canvasRef={canvasRef} initialImageUrl={form.imageUrl} />
      ) : form.noteType === "todo" ? (
        <textarea value={form.itemsText} onChange={(e) => set("itemsText", e.target.value)} placeholder="One checklist item per line" rows={4} className={area} />
      ) : form.noteType === "goal" ? (
        <div className="grid gap-2">
          <textarea value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Describe the goal..." rows={3} className={area} />
          <textarea value={form.itemsText} onChange={(e) => set("itemsText", e.target.value)} placeholder="One next step per line" rows={4} className={area} />
        </div>
      ) : (
        <textarea value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Take a note..." rows={4} className={area} />
      )}
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
        <div>
          <label htmlFor={`${mode}-note-reminder`} className="mb-1 block text-xs text-muted-foreground">Reminder</label>
          <input id={`${mode}-note-reminder`} type="datetime-local" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`${mode}-note-repeat`} className="mb-1 block text-xs text-muted-foreground">Repeat</label>
          <Select value={form.repeat} onValueChange={(v) => set("repeat", v)} disabled={!form.dueDate}>
            <SelectTrigger id={`${mode}-note-repeat`} className={input}><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPEATS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={`${mode}-note-tags`} className="mb-1 block text-xs text-muted-foreground">Tags</label>
          <input id={`${mode}-note-tags`} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="#home #work" className={input} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5" aria-label="Note color">
          <Palette className="size-4 text-muted-foreground" />
          {NOTE_COLORS.map((c) => (
            <button
              key={c.value || "none"}
              type="button"
              onClick={() => set("color", c.value)}
              title={c.label}
              aria-label={`${c.label} color`}
              className={cn("size-6 rounded-full border", form.color === c.value && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
              style={{ background: c.bg }}
            />
          ))}
          {bgImageUrl(form.color) && (
            <button type="button" onClick={() => set("color", "")} title="Remove background" aria-label="Remove background" className="rounded-full border bg-background p-1 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void chooseImage(e.target.files?.[0])} />
        <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void chooseBackground(e.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={busyNow} onClick={() => fileRef.current?.click()}>
          <Image className="size-4" />{form.noteType === "draw" ? "Base" : "Image"}
        </Button>
        <Button size="sm" variant="outline" disabled={busyNow} onClick={() => bgFileRef.current?.click()}>
          <ImagePlus className="size-4" />Background
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button size="sm" disabled={busyNow} onClick={() => void submit()}>
            {busyNow ? "Saving..." : mode === "create" ? "Add note" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}

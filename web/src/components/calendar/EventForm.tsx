import { useRef, useState } from "react"
import { Image, RefreshCw, X } from "lucide-react"
import { uploadCalendarBackgroundImage, type Calendar as CalendarInfo } from "@/api/calendar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  EVENT_TYPES,
  IMPORTANCE_OPTIONS,
  RECUR_OPTIONS,
  calBgImageStyle,
  inp,
  isCalBgImage,
  type FormState,
} from "@/components/calendar/util"

const REMINDER_OPTIONS = [
  { label: "No reminder", value: "" },
  { label: "At event time", value: "0" },
  { label: "5 minutes before", value: "5" },
  { label: "10 minutes before", value: "10" },
  { label: "15 minutes before", value: "15" },
  { label: "30 minutes before", value: "30" },
  { label: "1 hour before", value: "60" },
  { label: "2 hours before", value: "120" },
  { label: "1 day before", value: "1440" },
  { label: "Custom minutes", value: "custom" },
]

function colorInputValue(color?: string): string {
  return color && !isCalBgImage(color) && /^#[0-9a-f]{6}$/i.test(color) ? color : "#5b8abf"
}

export function EventForm({
  mode,
  initial,
  calendars,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit"
  initial: FormState
  calendars: CalendarInfo[]
  pending: boolean
  error?: string
  onCancel: () => void
  onSubmit: (f: FormState) => void | Promise<void>
}) {
  const [f, setF] = useState<FormState>(initial)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState("")
  const imageInputRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  const chooseImage = async (file?: File) => {
    if (!file) return
    setImageError("")
    setUploadingImage(true)
    try {
      const url = await uploadCalendarBackgroundImage(file)
      set("color", `bg:${url}`)
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Couldn't upload image")
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3" style={calBgImageStyle(f.color, "68%")}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{mode === "create" ? "New event" : "Edit event"}</span>
        <button onClick={onCancel} title="Close" aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <input value={f.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Title" className={inp} />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} className="size-4" />
        All day
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Start</label>
          <input type={f.allDay ? "date" : "datetime-local"} value={f.start} onChange={(e) => set("start", e.target.value)} className={inp} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">End</label>
          <input type={f.allDay ? "date" : "datetime-local"} value={f.end} onChange={(e) => set("end", e.target.value)} className={inp} />
        </div>
      </div>
      <input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Location (optional)" className={inp} />
      <textarea
        value={f.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Description (optional)"
        rows={3}
        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
      />
      <div className="grid gap-2 md:grid-cols-3">
        {mode === "create" && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Calendar</label>
            <select value={f.calendarHref} onChange={(e) => set("calendarHref", e.target.value)} className={inp}>
              {calendars.map((c) => (
                <option key={c.href} value={c.href}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Repeat</label>
          <select value={f.recur} onChange={(e) => set("recur", e.target.value)} className={inp}>
            {RECUR_OPTIONS.map((o) => <option key={o.value || "none"} value={o.value}>{o.label}</option>)}
            {f.recur === "custom" && <option value="custom">Custom RRULE</option>}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Type</label>
          <select value={f.eventType} onChange={(e) => set("eventType", e.target.value)} className={inp}>
            <option value="">No type</option>
            {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Importance</label>
          <select value={f.importance} onChange={(e) => set("importance", e.target.value)} className={inp}>
            {IMPORTANCE_OPTIONS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
      </div>
      {f.recur === "custom" && (
        <input value={f.customRrule} onChange={(e) => set("customRrule", e.target.value)} placeholder="FREQ=WEEKLY;INTERVAL=2" className={inp} />
      )}
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Reminder</label>
          <select value={f.reminder} onChange={(e) => set("reminder", e.target.value)} className={inp}>
            {REMINDER_OPTIONS.map((r) => <option key={r.value || "none"} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Color</label>
          <div className="flex gap-1.5">
            <input
              type="color"
              value={colorInputValue(f.color)}
              onChange={(e) => set("color", e.target.value)}
              aria-label="Event color"
              title="Event color"
              className="h-9 min-w-0 flex-1 cursor-pointer rounded-md border bg-background"
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void chooseImage(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage}
              title="Set event background image"
              aria-label="Set event background image"
              className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground", isCalBgImage(f.color) && "border-primary text-primary")}
            >
              {uploadingImage ? <RefreshCw className="size-4 animate-spin" /> : <Image className="size-4" />}
            </button>
            {isCalBgImage(f.color) && (
              <button
                type="button"
                onClick={() => set("color", "")}
                title="Remove event background image"
                aria-label="Remove event background image"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        {f.reminder === "custom" && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Minutes before</label>
            <input type="number" min={0} value={f.reminderCustom} onChange={(e) => set("reminderCustom", e.target.value)} className={inp} />
          </div>
        )}
      </div>
      {(error || imageError) && <p className="text-xs text-destructive">{error || imageError}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={pending || uploadingImage} onClick={() => void onSubmit(f)}>
          {pending ? "Saving..." : mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </div>
  )
}

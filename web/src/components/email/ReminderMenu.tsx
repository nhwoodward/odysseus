import { useState } from "react"
import { BellPlus } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { emailReminderPresets, localDateTimeValue } from "@/components/email/emailFormat"

export function ReminderMenu({
  busy,
  onPick,
}: {
  busy: boolean
  onPick: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const [custom, setCustom] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(8, 0, 0, 0)
    return localDateTimeValue(tomorrow)
  })
  const presets = emailReminderPresets()
  const pick = (date: Date) => {
    onPick(date)
    setOpen(false)
  }
  return (
    <div className="relative">
      <IconButton icon={<BellPlus />} label="Remind to reply" onClick={() => setOpen((o) => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={open} className="text-muted-foreground disabled:pointer-events-none disabled:opacity-50" />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 origin-top-right animate-pop-in rounded-md border bg-popover py-1 text-sm shadow-lg">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remind me</div>
            {presets.map((preset) => (
              <button key={preset.label} onClick={() => pick(preset.date)} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent">
                <span>{preset.label}</span>
                <span className="text-xs text-muted-foreground">{preset.detail}</span>
              </button>
            ))}
            <div className="my-1 border-t" />
            <div className="px-3 pb-2 pt-1">
              <label className="mb-1 block text-xs text-muted-foreground">Pick date and time</label>
              <div className="flex gap-2">
                <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-ring" />
                <button type="button" onClick={() => custom && pick(new Date(custom))} className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">Set</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { inp } from "@/components/calendar/util"

export function NewCalendar({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (name: string, color: string) => void }) {
  const [name, setName] = useState("")
  const [color, setColor] = useState("#5b8abf")
  return (
    <div className="mb-3 space-y-2 border-b pb-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">New calendar</span>
        <button onClick={onCancel} title="Close" aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Calendar name" className={inp} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Color" className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={pending || !name.trim()} onClick={() => onSubmit(name.trim(), color)}>
          {pending ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  )
}

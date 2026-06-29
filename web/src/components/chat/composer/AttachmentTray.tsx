import { X } from "lucide-react"
import type { ComposerController } from "./useComposerController"

export function AttachmentTray({ ctl }: { ctl: ComposerController }) {
  const { atts, setAtts } = ctl
  if (atts.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {atts.map((a) => (
        <span key={a.id} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
          {a.name}
          <button onClick={() => setAtts((p) => p.filter((x) => x.id !== a.id))} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
        </span>
      ))}
    </div>
  )
}

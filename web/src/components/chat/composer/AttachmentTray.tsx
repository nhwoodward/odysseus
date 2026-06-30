import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/IconButton"
import type { ComposerController } from "./useComposerController"

export function AttachmentTray({ ctl }: { ctl: ComposerController }) {
  const { atts, setAtts } = ctl
  if (atts.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {atts.map((a) => (
        <Badge key={a.id} variant="secondary" className="gap-1 py-1 font-normal">
          <span className="max-w-[12rem] truncate">{a.name}</span>
          <IconButton label={`Remove ${a.name}`} icon={<X className="size-3" />} variant="ghost" size="iconSm" className="-mr-1 size-5 p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setAtts((p) => p.filter((x) => x.id !== a.id))} />
        </Badge>
      ))}
    </div>
  )
}

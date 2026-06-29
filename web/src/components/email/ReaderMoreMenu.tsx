import { useState } from "react"
import { MoreVertical, ExternalLink, UserPlus, Ban, Trash2 } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"

export function ReaderMoreMenu({
  onOpenTab,
  onSaveSender,
  onMoveSpam,
  onDeletePermanent,
  disabled,
  busy,
}: {
  onOpenTab: () => void
  onSaveSender: () => void
  onMoveSpam: () => void
  onDeletePermanent: () => void
  disabled?: boolean
  busy?: string
}) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const itemClass = "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
  const pick = (fn: () => void) => {
    fn()
    setOpen(false)
  }
  return (
    <div className="relative">
      <IconButton
        icon={<MoreVertical />}
        label="More actions"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 origin-top-right animate-pop-in rounded-md border bg-popover py-1 text-sm shadow-lg">
            <button type="button" disabled={!!busy} onClick={() => pick(onOpenTab)} className={itemClass}>
              <ExternalLink className="size-3.5 text-muted-foreground" />
              <span>Open in new tab</span>
            </button>
            <button type="button" disabled={!!busy} onClick={() => pick(onSaveSender)} className={itemClass}>
              <UserPlus className="size-3.5 text-muted-foreground" />
              <span>{busy === "contact" ? "Saving..." : "Save sender to contacts"}</span>
            </button>
            <div className="my-1 border-t" />
            <button type="button" disabled={!!busy} onClick={() => pick(onMoveSpam)} className={itemClass}>
              <Ban className="size-3.5 text-muted-foreground" />
              <span>{busy === "spam" ? "Moving..." : "Move to Spam"}</span>
            </button>
            <button type="button" disabled={!!busy} onClick={() => pick(onDeletePermanent)} className={cn(itemClass, "text-destructive hover:bg-destructive/10")}>
              <Trash2 className="size-3.5" />
              <span>{busy === "permanent" ? "Deleting..." : "Delete Permanently"}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

import { useState } from "react"
import { CheckCheck, ChevronDown, MailOpen, Trash2, X } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { useEscapeClose } from "@/lib/useEscapeClose"
import type { BulkAction } from "@/components/email/types"

export function EmailBulkBar({
  selectedCount,
  allSelected,
  busy,
  onToggleAll,
  onAction,
  onCancel,
}: {
  selectedCount: number
  allSelected: boolean
  busy: string
  onToggleAll: () => void
  onAction: (action: BulkAction) => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const disabled = selectedCount === 0 || !!busy
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2 text-xs">
      <label className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-muted-foreground">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} disabled={!!busy} className="size-3.5 accent-current" />
        <span>All</span>
      </label>
      <span className="text-muted-foreground">{busy ? `${busy}...` : `${selectedCount} selected`}</span>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck className="size-3.5" />
          <span>Actions</span>
          <ChevronDown className="size-3.5" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 w-40 origin-top-left animate-pop-in rounded-md border bg-popover py-1 text-sm shadow-lg">
              <button type="button" onClick={() => { setOpen(false); onAction("done") }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"><CheckCheck className="size-3.5 text-muted-foreground" />Done</button>
              <button type="button" onClick={() => { setOpen(false); onAction("read") }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"><MailOpen className="size-3.5 text-muted-foreground" />Mark Read</button>
              <button type="button" onClick={() => { setOpen(false); onAction("unread") }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"><MailOpen className="size-3.5 text-muted-foreground" />Mark Unread</button>
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("delete")}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
        <span>Delete</span>
      </button>
      <IconButton icon={<X />} label="Cancel selection" type="button" onClick={onCancel} disabled={!!busy} className="ml-auto text-muted-foreground disabled:opacity-50" />
    </div>
  )
}

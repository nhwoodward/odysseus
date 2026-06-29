import { useRef, useState } from "react"
import { Star, Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { emailIsRead, emailSenderAddress } from "@/components/email/emailFormat"
import type { EmailListItem, EmailListRowAction, SenderFilter } from "@/components/email/types"
import { EmailListRowMenu } from "@/components/email/EmailListRowMenu"

export function EmailListRow({
  item,
  folder,
  selectMode,
  selected,
  actionBusy,
  onOpen,
  onSender,
  onToggleSelected,
  onAction,
}: {
  item: EmailListItem
  folder: string
  selectMode: boolean
  selected: boolean
  actionBusy?: string
  onOpen: (uid: string, folder: string) => void
  onSender: (sender: SenderFilter) => void
  onToggleSelected: (uid: string) => void
  onAction: (item: EmailListItem, action: EmailListRowAction) => void
}) {
  const holdTimer = useRef<number | null>(null)
  const holdStart = useRef<{ x: number; y: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const from = item.from_name || item.from_address || item.from || item.from_addr || item.sender || "Unknown"
  const fromAddress = emailSenderAddress(item)
  const unread = !emailIsRead(item)
  const itemFolder = item.folder || folder
  const rowAction = () => {
    if (selectMode) onToggleSelected(item.uid)
    else onOpen(item.uid, itemFolder)
  }
  const cancelHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    holdStart.current = null
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={rowAction}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          rowAction()
        }
      }}
      onPointerDown={(e) => {
        if (selectMode || e.target instanceof Element && e.target.closest("button,input,a")) return
        holdStart.current = { x: e.clientX, y: e.clientY }
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null
          setMenuOpen(true)
        }, 500)
      }}
      onPointerMove={(e) => {
        const start = holdStart.current
        if (!start) return
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancelHold()
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      className={cn("flex w-full cursor-pointer items-baseline gap-3 px-4 py-3 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/50", selected && "bg-accent/60")}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelected(item.uid)}
          className="mt-0.5 size-3.5 shrink-0 accent-current"
          aria-label={`Select ${item.subject || "email"}`}
        />
      )}
      {fromAddress && !selectMode ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSender({ address: fromAddress, label: from }) }}
          title={`Show mail from ${from}`}
          className={cn("w-24 shrink-0 truncate text-left text-sm hover:underline sm:w-44", unread ? "font-semibold text-foreground" : "text-muted-foreground")}
        >
          {from}
        </button>
      ) : (
        <div className={cn("w-24 shrink-0 truncate text-sm sm:w-44", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>{from}</div>
      )}
      <div className="min-w-0 flex-1">
        <span className={cn("text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>{item.subject || "(no subject)"}</span>
        {(item.snippet || item.preview) && <span className="ml-2 text-sm text-muted-foreground">- {item.snippet || item.preview}</span>}
      </div>
      {item.is_flagged && <Star className="size-3.5 shrink-0 fill-current text-foreground" />}
      {item.has_attachments && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
      {item.date && <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">{new Date(item.date).toLocaleDateString()}</div>}
      {!selectMode && (
        <EmailListRowMenu item={item} busy={actionBusy} open={menuOpen} onOpenChange={setMenuOpen} onAction={onAction} />
      )}
    </div>
  )
}

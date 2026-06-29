import { MoreVertical, ExternalLink, BellPlus, Clock, MailOpen, Star, CheckCheck, Archive, UserPlus, Ban, Trash2 } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"
import { emailIsRead } from "@/components/email/emailFormat"
import type { EmailListItem, EmailListRowAction } from "@/components/email/types"

export function EmailListRowMenu({
  item,
  busy,
  open,
  onOpenChange,
  onAction,
}: {
  item: EmailListItem
  busy?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (item: EmailListItem, action: EmailListRowAction) => void
}) {
  useEscapeClose(open, () => onOpenChange(false))
  const read = emailIsRead(item)
  const disabled = !!busy
  const itemClass = "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
  const pick = (action: EmailListRowAction) => {
    onAction(item, action)
    onOpenChange(false)
  }
  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <IconButton
        icon={<MoreVertical />}
        label="Email actions"
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => onOpenChange(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 origin-top-right animate-pop-in rounded-md border bg-popover py-1 text-sm shadow-lg">
            <button type="button" disabled={disabled} onClick={() => pick("open-tab")} className={itemClass}>
              <ExternalLink className="size-3.5 text-muted-foreground" />
              <span>Open in new tab</span>
            </button>
            <div className="px-3 py-1 text-micro font-semibold uppercase tracking-wider text-muted-foreground">Remind to reply</div>
            <button type="button" disabled={disabled} onClick={() => pick("remind-later")} className={itemClass}>
              <BellPlus className="size-3.5 text-muted-foreground" />
              <span>Later today</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("remind-tomorrow")} className={itemClass}>
              <Clock className="size-3.5 text-muted-foreground" />
              <span>Tomorrow</span>
            </button>
            <div className="my-1 border-t" />
            <button type="button" disabled={disabled} onClick={() => pick("read-toggle")} className={itemClass}>
              <MailOpen className="size-3.5 text-muted-foreground" />
              <span>{read ? "Mark as Unread" : "Mark as Read"}</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("favorite-toggle")} className={itemClass}>
              <Star className={cn("size-3.5 text-muted-foreground", item.is_flagged && "fill-current text-foreground")} />
              <span>{item.is_flagged ? "Unfavorite" : "Favorite"}</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("done-toggle")} className={itemClass}>
              <CheckCheck className="size-3.5 text-muted-foreground" />
              <span>{item.is_answered ? "Mark as Not Done" : "Mark as Done"}</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("archive")} className={itemClass}>
              <Archive className="size-3.5 text-muted-foreground" />
              <span>Move to Archive</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("save-sender")} className={itemClass}>
              <UserPlus className="size-3.5 text-muted-foreground" />
              <span>Save sender to contacts</span>
            </button>
            <div className="my-1 border-t" />
            <button type="button" disabled={disabled} onClick={() => pick("spam")} className={itemClass}>
              <Ban className="size-3.5 text-muted-foreground" />
              <span>Move to Spam</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("trash")} className={itemClass}>
              <Trash2 className="size-3.5 text-muted-foreground" />
              <span>Move to Trash</span>
            </button>
            <button type="button" disabled={disabled} onClick={() => pick("permanent")} className={cn(itemClass, "text-destructive hover:bg-destructive/10")}>
              <Trash2 className="size-3.5" />
              <span>Delete Permanently</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

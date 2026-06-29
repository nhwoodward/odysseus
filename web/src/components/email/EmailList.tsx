import { type ReactNode } from "react"
import { Inbox } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import type { EmailListItem, EmailListRowAction, SenderFilter } from "@/components/email/types"
import { EmailListRow } from "@/components/email/EmailListRow"

export function EmailList({
  emails,
  error,
  folder,
  emptyLabel,
  selectMode,
  selectedUids,
  onOpen,
  onSender,
  onToggleSelected,
  onAction,
  actionBusy,
  footer,
}: {
  emails: EmailListItem[]
  error?: string
  folder: string
  emptyLabel: string
  selectMode: boolean
  selectedUids: Set<string>
  onOpen: (uid: string, folder: string) => void
  onSender: (sender: SenderFilter) => void
  onToggleSelected: (uid: string) => void
  onAction: (item: EmailListItem, action: EmailListRowAction) => void
  actionBusy?: string
  footer?: ReactNode
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {error && <p className="p-4 text-sm text-muted-foreground">No mail account connected (or unavailable).</p>}
      <div className="divide-y">
        {emails.map((m) => {
          const selected = selectedUids.has(m.uid)
          return (
            <EmailListRow
              key={m.uid}
              item={m}
              folder={folder}
              selectMode={selectMode}
              selected={selected}
              actionBusy={actionBusy}
              onOpen={onOpen}
              onSender={onSender}
              onToggleSelected={onToggleSelected}
              onAction={onAction}
            />
          )
        })}
      </div>
      {!error && emails.length === 0 && <EmptyState icon={Inbox} title={emptyLabel} />}
      {footer}
    </div>
  )
}

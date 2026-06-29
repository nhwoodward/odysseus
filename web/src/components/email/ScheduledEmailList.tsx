import { AlertCircle, Clock, X } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { SkeletonList } from "@/components/ui/skeleton"
import { type ScheduledEmail } from "@/api/email"
import { cn } from "@/lib/utils"
import { formatScheduledDate } from "@/components/email/emailFormat"

export function ScheduledEmailList({
  items,
  error,
  isLoading,
  cancellingId,
  onCancel,
}: {
  items: ScheduledEmail[]
  error?: string
  isLoading: boolean
  cancellingId?: string
  onCancel: (item: ScheduledEmail) => void
}) {
  if (isLoading) return <SkeletonList rows={4} className="p-4" />
  if (error) return <p className="p-8 text-center text-sm text-muted-foreground">Couldn't load scheduled mail.</p>
  if (items.length === 0) return <p className="p-8 text-center text-sm text-muted-foreground">No scheduled emails.</p>
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="divide-y">
        {items.map((item) => {
          const failed = item.status === "failed"
          const subject = item.subject || "(no subject)"
          const to = item.to || "(no recipient)"
          const cancelling = cancellingId === item.id
          return (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3">
              <div className={cn("mt-0.5 rounded-md border p-1.5", failed ? "border-destructive/30 text-destructive" : "text-muted-foreground")}>
                {failed ? <AlertCircle className="size-4" /> : <Clock className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-medium">{subject}</div>
                  <span className={cn("rounded border px-1.5 py-0.5 text-micro uppercase", failed ? "border-destructive/40 text-destructive" : "text-muted-foreground")}>
                    {failed ? "Failed" : "Pending"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">To: {to} · Sends {formatScheduledDate(item.send_at)}</div>
                {item.cc && <div className="mt-0.5 text-xs text-muted-foreground">Cc: {item.cc}</div>}
                {item.error && <div className="mt-1 text-xs text-destructive">{item.error}</div>}
              </div>
              <IconButton
                icon={<X />}
                label={failed ? "Remove failed scheduled email" : "Cancel scheduled send"}
                type="button"
                disabled={cancelling}
                onClick={() => onCancel(item)}
                className="shrink-0 text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

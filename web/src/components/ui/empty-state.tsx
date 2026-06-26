import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

// The "no data / get started" pattern (Mobbin gold standard: icon + heading +
// supporting text + CTA). Replaces the ~50% of routes that render blank. Also
// covers error/empty-search by varying icon + copy. role="status" for AT.
export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void; icon?: LucideIcon }
  className?: string
}) {
  const ActionIcon = action?.icon
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/40 px-6 py-12 text-center", className)}
    >
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {ActionIcon && <ActionIcon />}
          {action.label}
        </Button>
      )}
    </div>
  )
}

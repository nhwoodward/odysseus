import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty"

// The "no data / get started" pattern (Mobbin gold standard: icon + heading +
// supporting text + CTA). Built on the shadcn Empty primitive; keeps the dashed
// card surface + role="status" for AT. Also covers error/empty-search by varying
// icon + copy. The {icon,title,description,action} API is unchanged for callers.
export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void; icon?: LucideIcon }
  className?: string
}) {
  const ActionIcon = action?.icon
  return (
    <Empty role="status" className={cn("border bg-card/40", className)}>
      <EmptyHeader>
        {Icon && <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && (
        <EmptyContent>
          <Button onClick={action.onClick}>
            {ActionIcon && <ActionIcon />}
            {action.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

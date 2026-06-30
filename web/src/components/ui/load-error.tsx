import { AlertTriangle } from "lucide-react"
import { EmptyState } from "./empty-state"

// Shared inline "couldn't load" surface — same dashed-card treatment as
// EmptyState, but with an alert icon and an optional Retry action. Use it on a
// query's `isError` branch so a failed fetch doesn't fall through to the empty
// state (which would mask the failure).
export function LoadError({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Couldn't load"
      description={message || "Something went wrong."}
      action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
      className={className}
    />
  )
}

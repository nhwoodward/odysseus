import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Loading placeholder. Use instead of a bare spinner / blank flash while data
// loads (e.g. <Skeleton className="h-4 w-2/3" />).
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

// A list of placeholder rows that mirrors a typical loaded list (icon + two
// lines of text). Replaces the bare "Loading…" text most data routes flash.
// `role=status` + the sr-only label announce the loading state to AT.
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-2", className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

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

// A responsive grid of card placeholders — mirrors the note/event/document card
// grids (`grid sm:grid-cols-2 xl:grid-cols-3`). Pass `className` to override the
// grid columns when a surface uses a different layout.
export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border bg-card p-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}

// A grid of square tiles — mirrors the Gallery image grid.
export function SkeletonGrid({ count = 12, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-lg" />
      ))}
    </div>
  )
}

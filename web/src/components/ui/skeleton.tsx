import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

// A list of placeholder rows that mirrors a typical loaded list (icon + two
// lines of text). `role=status` + the sr-only label announce loading to AT.
function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
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

// A responsive grid of card placeholders — mirrors the note/event/document
// card grids. Pass `className` to override the columns for a different layout.
function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
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
function SkeletonGrid({ count = 12, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-lg" />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonList, SkeletonCards, SkeletonGrid }

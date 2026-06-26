import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Loading placeholder. Use instead of a bare spinner / blank flash while data
// loads (e.g. <Skeleton className="h-4 w-2/3" />).
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// The one shared route header. Every route renders this so heights, padding,
// and title typography stay identical as you navigate (previously each route
// hand-rolled its own <header> and they all disagreed — the most visible
// "unfinished" tell). Fixed h-13, px-4 lg:px-6, title text-sm font-semibold.
//   - `title` accepts a string (default h1) or a node (e.g. title + subtitle).
//   - `tabs` renders an inline segmented control after the title.
//   - `actions` is pushed to the right.
export function RouteHeader({ title, icon: Icon, tabs, actions, className, titleClassName, ...rest }: {
  title: ReactNode
  icon?: LucideIcon
  tabs?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
} & Omit<React.ComponentProps<"header">, "title">) {
  return (
    <header className={cn("flex h-13 shrink-0 items-center gap-2 border-b px-4 lg:px-6", className)} {...rest}>
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {typeof title === "string"
        ? <h1 className={cn("truncate text-sm font-semibold", titleClassName)}>{title}</h1>
        : title}
      {tabs && <div className="ml-1 flex min-w-0 items-center overflow-x-auto sm:ml-2">{tabs}</div>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}

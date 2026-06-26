import { cva } from "class-variance-authority"

// In its own module so badge.tsx exports only components (react-refresh).
// Every variant pairs a tint with readable text — status should never be
// conveyed by color alone (pass a label/icon as children).
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        destructive: "bg-destructive/15 text-destructive",
        outline: "border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Canonical text input — one source of truth for the height/padding/focus that
// was previously inlined as `inp`/`inpCls`/`selectCls` strings across routes.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

// Canonical text-field class — one source of truth for the height/padding/focus
// that was previously inlined as identical `inp`/`inpCls` strings across routes.
// Exported so those routes can reference it instead of re-declaring the string.
export const inputClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputClass, "transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  ),
)
Input.displayName = "Input"

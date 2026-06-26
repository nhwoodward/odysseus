import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const FOCUSABLE = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'

// Accessible modal — replaces the 15+ hand-rolled overlays. Gives focus-trap,
// Escape-to-close, focus-return on close, body scroll-lock, backdrop click, and
// `role="dialog" aria-modal`. Compose with DialogHeader/DialogBody/DialogFooter.
export function Dialog({ open, onClose, children, className, label }: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  label?: string // accessible name (aria-label)
}) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    const focusables = () => {
      const el = ref.current
      if (!el) return [] as HTMLElement[]
      return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((f) => !f.hasAttribute("disabled"))
    }
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return }
      if (e.key !== "Tab") return
      const f = focusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      restoreFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn("flex max-h-[85vh] w-full max-w-lg flex-col animate-pop-in rounded-xl border bg-popover shadow-lg", className)}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ title, onClose, className }: { title: ReactNode; onClose?: () => void; className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {onClose && (
        <button onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", className)} {...props} />
}
export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3", className)} {...props} />
}

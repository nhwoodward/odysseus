import { useEffect, useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { MoreHorizontal, Pin, ChevronDown } from "lucide-react"
import type { NavItem } from "./nav"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"

const STORE_KEY = "odysseus-more-tools-open"

const rowCls = (active: boolean) =>
  cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")

// "More tools" — the long tail of nav destinations the sidebar doesn't pin.
//  - row variant (expanded sidebar): an INLINE disclosure (child menu) that
//    expands within the sidebar flow, like a settings sub-menu. Default state is
//    persisted to localStorage.
//  - icon variant (collapsed w-14 rail): a popover flyout, since there's no room
//    to expand a labelled child menu inline.
// Either way each row navigates and a hover Pin promotes it to a favorite.
export function MoreToolsMenu({ items, onTogglePin, reminderTos, reminderText, variant = "row" }: {
  items: NavItem[]
  onTogglePin: (to: string) => void
  reminderTos?: Set<string> // tos with an active reminder (e.g. "/notes")
  reminderText?: string // badge label, e.g. "99+"
  variant?: "row" | "icon"
}) {
  const inline = variant === "row"
  const [open, setOpen] = useState(() => {
    if (!inline) return false
    try { return window.localStorage.getItem(STORE_KEY) === "1" } catch { return false }
  })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = (refocus = false) => { setOpen(false); if (refocus) triggerRef.current?.focus() }
  // Escape dismisses only the popover (icon) variant; the inline disclosure stays
  // in the document flow so Escape-to-collapse would be surprising.
  useEscapeClose(open && !inline, () => close(true))
  useEffect(() => {
    if (!inline) return
    try { window.localStorage.setItem(STORE_KEY, open ? "1" : "0") } catch { /* ignore */ }
  }, [open, inline])

  const { pathname } = useLocation()
  const activeInMenu = items.some((i) => pathname === i.to || pathname.startsWith(i.to + "/"))
  const hasReminder = !!reminderTos && items.some((i) => reminderTos.has(i.to))

  const toolRows = items.map(({ to, icon: Icon, label }) => (
    <div key={to} className="group/mt relative">
      <NavLink to={to} onClick={() => { if (!inline) close() }} className={({ isActive }) => cn(rowCls(isActive), "pr-8")}>
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {reminderTos?.has(to) && reminderText && <span className="notes-nav-reminder-badge" aria-label={`${reminderText} reminders`}>{reminderText}</span>}
      </NavLink>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(to) }}
        title="Pin to sidebar"
        aria-label={`Pin ${label} to sidebar`}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/mt:opacity-100"
      >
        <Pin className="size-3.5" />
      </button>
    </div>
  ))

  // Inline child-menu disclosure (expanded sidebar).
  if (inline) {
    return (
      <div>
        <button ref={triggerRef} onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(rowCls(activeInMenu && !open), "w-full")}>
          <MoreHorizontal className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">More tools</span>
          {!open && hasReminder && reminderText && <span className="notes-nav-reminder-badge" aria-label={`${reminderText} reminders`}>{reminderText}</span>}
          {!open && activeInMenu && !hasReminder && <span className="size-1.5 shrink-0 rounded-full bg-foreground/70" aria-hidden />}
          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
        {open && <div className="ml-3 mt-0.5 animate-fade-in space-y-0.5 border-l pl-2">{toolRows}</div>}
      </div>
    )
  }

  // Popover flyout (collapsed icon rail).
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        title="More tools"
        aria-label={hasReminder && reminderText ? `More tools, ${reminderText} reminders` : "More tools"}
        aria-expanded={open}
        className={cn("relative flex size-10 items-center justify-center rounded-md transition-colors",
          activeInMenu ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
      >
        <MoreHorizontal className="size-5" />
        {hasReminder && <span className="absolute right-1 top-1 size-2 rounded-full bg-foreground" aria-hidden />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => close(true)} />
          <div className="absolute left-full top-1/2 z-20 ml-2 max-h-[70vh] w-56 -translate-y-1/2 origin-top animate-pop-in overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
            {toolRows}
          </div>
        </>
      )}
    </div>
  )
}

import { useRef, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { MoreHorizontal, Pin } from "lucide-react"
import type { NavItem } from "./nav"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"

const rowCls = (active: boolean) =>
  cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")

// "More tools" disclosure — the long tail of nav destinations the sidebar
// doesn't pin. A popover (not an inline expand) so it never steals height from
// the chat history. It's a disclosure of navigation links (not an ARIA menu —
// menu role requires roving-focus menuitems we don't implement), so the trigger
// uses aria-expanded only. Each row navigates; a hover Pin promotes it to a
// sidebar favorite. Closing via Escape/outside-click returns focus to the
// trigger.
export function MoreToolsMenu({ items, onTogglePin, reminderTos, reminderText, variant = "row" }: {
  items: NavItem[]
  onTogglePin: (to: string) => void
  reminderTos?: Set<string> // tos with an active reminder (e.g. "/notes")
  reminderText?: string // badge label, e.g. "99+"
  variant?: "row" | "icon"
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = (refocus = false) => { setOpen(false); if (refocus) triggerRef.current?.focus() }
  useEscapeClose(open, () => close(true))
  const { pathname } = useLocation()
  const activeInMenu = items.some((i) => pathname === i.to || pathname.startsWith(i.to + "/"))
  const hasReminder = !!reminderTos && items.some((i) => reminderTos.has(i.to))

  const panel = open && (
    <>
      <div className="fixed inset-0 z-10" onClick={() => close(true)} />
      <div
        className={cn(
          "absolute z-20 max-h-[70vh] origin-top animate-pop-in overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg",
          variant === "icon" ? "left-full top-1/2 ml-2 w-56 -translate-y-1/2" : "left-2 right-2 mt-1",
        )}
      >
        {items.map(({ to, icon: Icon, label }) => (
          <div key={to} className="group/mt relative">
            <NavLink to={to} onClick={() => close()} className={({ isActive }) => cn(rowCls(isActive), "pr-8")}>
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
        ))}
      </div>
    </>
  )

  if (variant === "icon") {
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
        {panel}
      </div>
    )
  }
  return (
    <div className="relative">
      <button ref={triggerRef} onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(rowCls(activeInMenu), "w-full")}>
        <MoreHorizontal className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">More tools</span>
        {hasReminder && reminderText && <span className="notes-nav-reminder-badge" aria-label={`${reminderText} reminders`}>{reminderText}</span>}
        {activeInMenu && <span className="size-1.5 shrink-0 rounded-full bg-foreground/70" aria-hidden />}
      </button>
      {panel}
    </div>
  )
}

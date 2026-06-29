import { useEffect, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { Plus, Search, PanelLeft, Settings, Trash2, Moon, Sun, LogOut, EyeOff, Keyboard, ChevronsUpDown, Pencil, Pin, Check, Users, Archive, ArchiveRestore, CheckSquare, Square, X } from "lucide-react"
import { useUi } from "@/stores/ui"
import { useComposer } from "@/stores/composer"
import { useSessions, useSessionMutations, useArchivedSessions } from "@/api/sessions"
import { useAuthStatus, logout } from "@/api/auth"
import { usePrefs } from "@/api/prefs"
import { ALL_NAV, DEFAULT_PINNED } from "./nav"
import { MoreToolsMenu } from "./MoreToolsMenu"
import { IconButton } from "@/components/ui/IconButton"
import type { Session } from "@/types"
import { removePersistentPersonaSession } from "@/lib/persistentPersona"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"
import { useNoteReminders } from "@/stores/noteReminders"

const navRow = (active: boolean) =>
  cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
const iconBtn = (active: boolean) =>
  cn("flex size-10 items-center justify-center rounded-md transition-colors",
    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")
const tourNav = (to: string) => `nav-${to.replace(/^\//, "") || "chat"}`
const reminderCountLabel = (count: number) => count > 99 ? "99+" : String(count)

function Account({ collapsed }: { collapsed: boolean }) {
  const { data: status } = useAuthStatus()
  const { theme, toggleTheme } = useUi()
  const incognito = useComposer((s) => s.incognito)
  const toggle = useComposer((s) => s.toggle)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const name = status?.username || status?.user || "Account"
  const item = "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
  return (
    <div className="relative mt-auto border-t p-2">
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-2 right-2 z-20 mb-1 origin-bottom animate-pop-in overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
            <NavLink to="/settings" onClick={() => setOpen(false)} className={item}><Settings className="size-4" />Settings</NavLink>
            <button onClick={() => { toggleTheme() }} className={item}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}{theme === "dark" ? "Light mode" : "Dark mode"}</button>
            <button onClick={() => { toggle("incognito"); navigate("/chat"); setOpen(false) }} className={cn(item, incognito && "text-foreground")}><EyeOff className="size-4" />Incognito {incognito ? "on" : "off"}</button>
            <button onClick={() => { window.dispatchEvent(new CustomEvent("odysseus:open-shortcuts")); setOpen(false) }} className={item}><Keyboard className="size-4" />Keyboard shortcuts</button>
            <button onClick={logout} className={item}><LogOut className="size-4" />Log out</button>
          </div>
        </>
      )}
      {collapsed ? (
        <button onClick={() => setOpen((o) => !o)} title={name} aria-expanded={open} className="mx-auto flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase">{name[0]}</button>
      ) : (
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">{name[0]}</span>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{name}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const mobileNavOpen = useUi((s) => s.mobileNavOpen)
  const setMobileNav = useUi((s) => s.setMobileNav)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const sessionId = /^\/chat\/([^/]+)/.exec(pathname)?.[1]
  const { data: sessions } = useSessions()
  const { data: prefs } = usePrefs()
  const hidden = new Set((prefs?.hidden_nav as string[] | undefined) || [])
  // Every destination the user hasn't hidden (Chat can never be hidden).
  const visibleNav = ALL_NAV.filter((i) => i.to === "/chat" || !hidden.has(i.to))
  const firedNoteReminders = useNoteReminders((s) => s.firedCount)
  const { remove, rename, setImportant, archive, unarchive, bulkDelete, bulkArchive } = useSessionMutations()
  const [q, setQ] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  // Pinned nav favorites shown as direct sidebar rows. "/chat" is always pinned;
  // everything else lives behind the "More tools" flyout until pinned. Persisted
  // like the other sidebar prefs in this file.
  const [pinnedNav, setPinnedNav] = useState<string[]>(() => {
    try { const v = JSON.parse(window.localStorage.getItem("odysseus-pinned-nav") || "null"); return Array.isArray(v) ? v as string[] : DEFAULT_PINNED } catch { return DEFAULT_PINNED }
  })
  useEffect(() => { window.localStorage.setItem("odysseus-pinned-nav", JSON.stringify(pinnedNav)) }, [pinnedNav])
  // One-time cleanup of prefs the sidebar rework retired (folder ordering + the
  // collapsible Workspace group) so they don't linger in localStorage.
  useEffect(() => {
    try { window.localStorage.removeItem("odysseus-folder-order"); window.localStorage.removeItem("odysseus-nav-workspace-collapsed") } catch { /* ignore */ }
  }, [])
  const togglePin = (to: string) => setPinnedNav((prev) => prev.includes(to) ? prev.filter((t) => t !== to) : [...prev, to])
  const pinnedSet = new Set(["/chat", ...pinnedNav])
  const favorites = visibleNav.filter((i) => pinnedSet.has(i.to))
  const moreItems = visibleNav.filter((i) => !pinnedSet.has(i.to))
  const moreReminderTos = firedNoteReminders > 0 ? new Set(["/notes"]) : undefined
  const [view, setView] = useState<"active" | "archived">("active")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const commitRename = () => { if (editId && editName.trim()) rename.mutate({ id: editId, name: editName.trim() }); setEditId(null) }

  const archivedView = view === "archived"
  const { data: archivedData } = useArchivedSessions(archivedView)
  const archivedList = (archivedData?.sessions || []).filter((s) => !q || (s.name || "").toLowerCase().includes(q.toLowerCase()))

  const list = (sessions || []).filter((s) => !s.archived).filter((s) => !q || (s.name || "").toLowerCase().includes(q.toLowerCase()))
  // Pinned (important) chats float to the top in every sort mode, in their own
  // section above the time/sort buckets. They are excluded from those buckets
  // below so they never appear twice.
  const pinned = list
    .filter((s) => s.is_important)
    .sort((x, y) => new Date(y.last_message_at || y.updated_at || 0).getTime() - new Date(x.last_message_at || x.updated_at || 0).getTime())
  // Every non-pinned chat falls into the time/sort buckets (the sidebar no
  // longer groups by project folder — projects are managed on the Projects page
  // and the chat-header picker).
  // Simple flat recents: every non-pinned chat, most-recent first. No date
  // buckets, no sort modes — pinned still floats to its own section above.
  const rest = list
    .filter((s) => !s.is_important)
    .sort((x, y) => new Date(y.last_message_at || y.updated_at || 0).getTime() - new Date(x.last_message_at || x.updated_at || 0).getTime())

  // All visible session ids in the active view drive Select-All. Archived rows
  // are not selectable (their actions are Restore/Delete, handled per-row).
  const visibleIds = [...pinned, ...rest].map((s) => s.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const toggleSelected = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }
  const enterSelectMode = () => { setView("active"); setSelectMode(true); setSelected(new Set()) }
  // Selected ids by pinned-state. The backend blocks deleting pinned chats, so
  // bulk delete only sends unpinned ids and we surface how many were skipped.
  const selectedSessions = list.filter((s) => selected.has(s.id))
  const selectedUnpinnedIds = selectedSessions.filter((s) => !s.is_important).map((s) => s.id)
  const runBulkDelete = () => {
    const skipped = selected.size - selectedUnpinnedIds.length
    if (!selectedUnpinnedIds.length) { alert("Pinned chats can't be deleted. Unpin them first."); return }
    const msg = skipped > 0
      ? `Delete ${selectedUnpinnedIds.length} chat(s)? ${skipped} pinned chat(s) will be skipped.`
      : `Delete ${selectedUnpinnedIds.length} chat(s)?`
    if (!confirm(msg)) return
    selectedUnpinnedIds.forEach((id) => removePersistentPersonaSession(id))
    bulkDelete.mutate(selectedUnpinnedIds)
    if (sessionId && selectedUnpinnedIds.includes(sessionId)) navigate("/chat")
    exitSelectMode()
  }
  const runBulkArchive = () => {
    const ids = [...selected]
    if (!ids.length) return
    bulkArchive.mutate(ids)
    if (sessionId && ids.includes(sessionId)) navigate("/chat")
    exitSelectMode()
  }

  const deleteRow = (s: Session) => {
    // Mirror the backend guard: pinned/important chats can't be deleted until
    // they're unpinned.
    if (s.is_important) { alert("Unpin this chat before deleting it."); return }
    if (!confirm("Delete this chat?")) return
    removePersistentPersonaSession(s.id)
    remove.mutate(s.id)
    if (s.id === sessionId) navigate("/chat")
  }

  const renderRow = (s: Session) => editId === s.id ? (
    <div key={s.id} className="flex items-center gap-1 px-2 py-1">
      <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditId(null) }}
        onBlur={commitRename}
        className="h-7 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring" />
      <button onClick={commitRename} aria-label="Save name" className="text-muted-foreground hover:text-foreground"><Check className="size-3.5" /></button>
    </div>
  ) : (
    <div key={s.id}
      onClick={() => { if (selectMode) toggleSelected(s.id); else navigate(`/chat/${s.id}`) }}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (selectMode) toggleSelected(s.id); else navigate(`/chat/${s.id}`) } }}
      className={cn("group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
        s.id === sessionId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
      {selectMode && (
        selected.has(s.id)
          ? <CheckSquare className="size-3.5 shrink-0 text-foreground" />
          : <Square className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      {s.is_important && <Pin className="size-3 shrink-0 fill-current text-muted-foreground" />}
      {(s.name || "").startsWith("[GRP]") && <Users className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="flex-1 truncate">{s.name || "Untitled"}</span>
      {!selectMode && (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); setImportant.mutate({ id: s.id, important: !s.is_important }) }} title={s.is_important ? "Unpin" : "Pin"} aria-label={s.is_important ? "Unpin" : "Pin"} className={cn("hover:text-foreground", s.is_important && "text-foreground")}><Pin className="size-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); setEditId(s.id); setEditName(s.name || "") }} title="Rename" aria-label="Rename" className="hover:text-foreground"><Pencil className="size-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); archive.mutate(s.id); if (s.id === sessionId) navigate("/chat") }} title="Archive" aria-label="Archive" className="hover:text-foreground"><Archive className="size-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); deleteRow(s) }} title="Delete" aria-label="Delete" className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
        </span>
      )}
    </div>
  )

  const renderArchivedRow = (s: { id: string; name: string; is_important?: boolean }) => (
    <div key={s.id}
      className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
      {s.is_important && <Pin className="size-3 shrink-0 fill-current text-muted-foreground" />}
      <span className="flex-1 truncate">{s.name || "Untitled"}</span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => unarchive.mutate(s.id)} title="Restore" aria-label="Restore" className="hover:text-foreground"><ArchiveRestore className="size-3.5" /></button>
        <button onClick={() => deleteRow(s as Session)} title="Delete" aria-label="Delete" className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
      </span>
    </div>
  )

  // Below lg the sidebar is an off-canvas drawer (always the full nav, slid in
  // by mobileNavOpen); at lg+ it's in-flow and respects `collapsed`. The
  // desktop collapsed icon-strip only exists at lg+.
  const drawerShell = cn(
    "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:transition-none lg:shadow-none",
    mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
  )
  const backdrop = mobileNavOpen ? (
    <div onClick={() => setMobileNav(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-hidden />
  ) : null

  return (
    <>
      {backdrop}
      {/* Desktop-only collapsed icon strip */}
      {collapsed && (
        <aside className="hidden h-full w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3 lg:flex" data-tour="sidebar">
        <button onClick={toggleSidebar} title="Expand sidebar (⌘B)" aria-label="Expand sidebar (⌘B)" className={iconBtn(false)}><PanelLeft className="size-5" /></button>
        <button data-tour="new-chat" onClick={() => navigate("/chat")} title="New chat (⌘⌥N)" aria-label="New chat (⌘⌥N)" className={iconBtn(false)}><Plus className="size-5" /></button>
        <button data-tour="search-conversations" onClick={() => window.dispatchEvent(new CustomEvent("odysseus:open-search"))} title="Search conversations (⌘K)" aria-label="Search conversations (⌘K)" className={iconBtn(false)}><Search className="size-5" /></button>
        <div className="my-1 h-px w-6 bg-border" />
        <div className="flex flex-col items-center gap-1" data-tour="primary-nav">
          {favorites.map(({ to, icon: Icon, label }) => {
            const showReminderBadge = to === "/notes" && firedNoteReminders > 0
            return (
              <NavLink key={to} to={to} title={label} aria-label={label} data-tour={tourNav(to)} className={({ isActive }) => iconBtn(isActive)}>
                <span className="relative grid place-items-center">
                  <Icon className="size-5" />
                  {showReminderBadge && <span className="notes-nav-reminder-badge notes-nav-reminder-badge-icon" aria-label={`${reminderCountLabel(firedNoteReminders)} reminders`}>{reminderCountLabel(firedNoteReminders)}</span>}
                </span>
              </NavLink>
            )
          })}
          {moreItems.length > 0 && (
            <MoreToolsMenu variant="icon" items={moreItems} onTogglePin={togglePin} reminderTos={moreReminderTos} reminderText={reminderCountLabel(firedNoteReminders)} />
          )}
        </div>
        <Account collapsed />
        </aside>
      )}
      {/* Expanded sidebar: off-canvas drawer below lg, in-flow at lg (hidden at lg when collapsed) */}
      <aside className={cn("flex h-full w-[264px] shrink-0 flex-col border-r bg-sidebar", drawerShell, collapsed ? "lg:hidden" : "lg:flex")} data-tour="sidebar">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <div className="text-sm font-semibold">Odysseus <span className="font-normal text-muted-foreground">/ v2</span></div>
        <div className="flex items-center gap-1">
          <IconButton icon={<X />} label="Close menu" onClick={() => setMobileNav(false)} className="text-muted-foreground lg:hidden" />
          <IconButton icon={<PanelLeft />} label="Collapse sidebar (⌘B)" onClick={toggleSidebar} className="hidden text-muted-foreground lg:block" />
        </div>
      </div>
      <div className="space-y-2 px-2 pb-2">
        <button data-tour="new-chat" onClick={() => navigate("/chat")} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Plus className="size-4" /> New chat</button>
        <div className="flex gap-1.5" data-tour="search-conversations">
          <button onClick={() => window.dispatchEvent(new CustomEvent("odysseus:open-search"))} title="Search conversations (⌘K)" aria-label="Search conversations (⌘K)" className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground">
            <Search className="size-3.5" />
          </button>
          <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter chat titles..." className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring" />
          </div>
        </div>
      </div>
      {/* One scroll region: the nav (favorites + More tools) and the Chats list
          scroll together, so a long chat list never hides the tools. The header
          / new-chat stay pinned above and Settings / Account below. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <nav className="space-y-0.5 px-2" data-tour="primary-nav">
        {favorites.map(({ to, icon: Icon, label }) => {
          const showReminderBadge = to === "/notes" && firedNoteReminders > 0
          const unpinnable = to !== "/chat"
          return (
            <div key={to} className="group/fav relative">
              <NavLink to={to} data-tour={tourNav(to)} className={({ isActive }) => cn(navRow(isActive), unpinnable && "pr-8")}>
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {showReminderBadge && <span className="notes-nav-reminder-badge" aria-label={`${reminderCountLabel(firedNoteReminders)} reminders`}>{reminderCountLabel(firedNoteReminders)}</span>}
              </NavLink>
              {unpinnable && (
                <button onClick={() => togglePin(to)} title="Unpin from sidebar" aria-label={`Unpin ${label} from sidebar`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/fav:opacity-100">
                  <Pin className="size-3.5 fill-current" />
                </button>
              )}
            </div>
          )
        })}
        {moreItems.length > 0 && (
          <MoreToolsMenu variant="row" items={moreItems} onTogglePin={togglePin} reminderTos={moreReminderTos} reminderText={reminderCountLabel(firedNoteReminders)} />
        )}
      </nav>
      <div className="mt-3 flex items-center justify-between px-3 pb-1">
        <div className="flex items-center gap-2">
          <button onClick={() => { setView("active"); exitSelectMode() }}
            className={cn("text-xs font-semibold uppercase tracking-wider", archivedView ? "text-muted-foreground/60 hover:text-muted-foreground" : "text-muted-foreground")}>Chats</button>
          <button onClick={() => { setView("archived"); exitSelectMode() }}
            className={cn("text-xs font-semibold uppercase tracking-wider", archivedView ? "text-muted-foreground" : "text-muted-foreground/60 hover:text-muted-foreground")}>Archived</button>
        </div>
        {archivedView ? null : selectMode ? (
          <button onClick={exitSelectMode} title="Cancel selection" aria-label="Cancel selection" className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
        ) : (
          <button onClick={enterSelectMode} title="Select chats" aria-label="Select chats" className="text-muted-foreground hover:text-foreground"><CheckSquare className="size-3.5" /></button>
        )}
      </div>
      {selectMode && !archivedView && (
        <div className="mb-1 flex items-center gap-2 px-3 pb-1">
          <button onClick={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {allSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
            <span>{allSelected ? "Clear" : "All"}</span>
          </button>
          <span className="flex-1 text-xs text-muted-foreground">{selected.size} selected</span>
          <button onClick={runBulkArchive} disabled={!selected.size} title="Archive selected" aria-label="Archive selected" className="text-muted-foreground hover:text-foreground disabled:opacity-40"><Archive className="size-3.5" /></button>
          <button onClick={runBulkDelete} disabled={!selected.size} title="Delete selected" aria-label="Delete selected" className="text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="size-3.5" /></button>
        </div>
      )}
      <div className="px-2 pb-2">
        {archivedView ? (
          <>
            {archivedList.map(renderArchivedRow)}
            {archivedList.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">{q ? "No matches." : "No archived chats."}</p>}
          </>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground/80">
                  <Pin className="size-3 shrink-0 fill-current" />
                  <span>Pinned</span>
                </div>
                {pinned.map(renderRow)}
              </div>
            )}
            {rest.map(renderRow)}
            {list.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">{q ? "No matches." : "No chats yet."}</p>}
          </>
        )}
      </div>
      </div>
      {/* Account stays pinned at the bottom (its own mt-auto / border-t) below the
          single scroll region above. Settings lives inside the account popover. */}
      <Account collapsed={false} />
      </aside>
    </>
  )
}

import { useEffect, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { Plus, Search, Settings, Trash2, Moon, Sun, LogOut, EyeOff, Keyboard, ChevronsUpDown, Pencil, Pin, Check, Users, Archive, ArchiveRestore, CheckSquare, Square, X } from "lucide-react"
import { useUi } from "@/stores/ui"
import { useComposer } from "@/stores/composer"
import { useSessions, useSessionMutations, useArchivedSessions } from "@/api/sessions"
import { useAuthStatus, logout } from "@/api/auth"
import { usePrefs } from "@/api/prefs"
import { ALL_NAV, DEFAULT_PINNED } from "./nav"
import { MoreToolsMenu } from "./MoreToolsMenu"
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarRail, useSidebar,
} from "@/components/ui/sidebar"
import type { Session } from "@/types"
import { removePersistentPersonaSession } from "@/lib/persistentPersona"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"
import { useNoteReminders } from "@/stores/noteReminders"

const tourNav = (to: string) => `nav-${to.replace(/^\//, "") || "chat"}`
const reminderCountLabel = (count: number) => count > 99 ? "99+" : String(count)

function Account() {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"
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
    <div className="relative">
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-1 w-56 origin-bottom animate-pop-in overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
            <NavLink to="/settings" onClick={() => setOpen(false)} className={item}><Settings className="size-4" />Settings</NavLink>
            <button onClick={() => { toggleTheme() }} className={item}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}{theme === "dark" ? "Light mode" : "Dark mode"}</button>
            <button onClick={() => { toggle("incognito"); navigate("/chat"); setOpen(false) }} className={cn(item, incognito && "text-foreground")}><EyeOff className="size-4" />Incognito {incognito ? "on" : "off"}</button>
            <button onClick={() => { window.dispatchEvent(new CustomEvent("odysseus:open-shortcuts")); setOpen(false) }} className={item}><Keyboard className="size-4" />Keyboard shortcuts</button>
            <button onClick={logout} className={item}><LogOut className="size-4" />Log out</button>
          </div>
        </>
      )}
      <SidebarMenuButton onClick={() => setOpen((o) => !o)} aria-expanded={open} size="lg" tooltip={name}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">{name[0]}</span>
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{name}</span>}
        {!collapsed && <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />}
      </SidebarMenuButton>
    </div>
  )
}

export function AppSidebar() {
  const { setOpenMobile, state } = useSidebar()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const sessionId = /^\/chat\/([^/]+)/.exec(pathname)?.[1]
  // Close the mobile drawer whenever the route changes (e.g. tapping a link).
  useEffect(() => { setOpenMobile(false) }, [pathname, setOpenMobile])

  const { data: sessions } = useSessions()
  const { data: prefs } = usePrefs()
  const hidden = new Set((prefs?.hidden_nav as string[] | undefined) || [])
  const visibleNav = ALL_NAV.filter((i) => i.to === "/chat" || !hidden.has(i.to))
  const firedNoteReminders = useNoteReminders((s) => s.firedCount)
  const { remove, rename, setImportant, archive, unarchive, bulkDelete, bulkArchive } = useSessionMutations()
  const [q, setQ] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  // Pinned nav favorites shown as direct sidebar rows. "/chat" is always pinned;
  // everything else lives behind the "More tools" flyout until pinned.
  const [pinnedNav, setPinnedNav] = useState<string[]>(() => {
    try { const v = JSON.parse(window.localStorage.getItem("odysseus-pinned-nav") || "null"); return Array.isArray(v) ? v as string[] : DEFAULT_PINNED } catch { return DEFAULT_PINNED }
  })
  useEffect(() => { window.localStorage.setItem("odysseus-pinned-nav", JSON.stringify(pinnedNav)) }, [pinnedNav])
  const togglePin = (to: string) => setPinnedNav((prev) => prev.includes(to) ? prev.filter((t) => t !== to) : [...prev, to])
  const pinnedSet = new Set(["/chat", ...pinnedNav])
  const favorites = visibleNav.filter((i) => pinnedSet.has(i.to))
  const moreItems = visibleNav.filter((i) => !pinnedSet.has(i.to))
  const moreReminderTos = firedNoteReminders > 0 ? new Set(["/notes"]) : undefined
  const [view, setView] = useState<"active" | "archived">("active")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const commitRename = () => { if (editId && editName.trim()) rename.mutate({ id: editId, name: editName.trim() }); setEditId(null) }

  const navActive = (to: string) => to === "/chat"
    ? (pathname === "/chat" || pathname.startsWith("/chat/"))
    : (pathname === to || pathname.startsWith(to + "/"))

  const archivedView = view === "archived"
  const { data: archivedData } = useArchivedSessions(archivedView)
  const archivedList = (archivedData?.sessions || []).filter((s) => !q || (s.name || "").toLowerCase().includes(q.toLowerCase()))

  const list = (sessions || []).filter((s) => !s.archived).filter((s) => !q || (s.name || "").toLowerCase().includes(q.toLowerCase()))
  const pinned = list
    .filter((s) => s.is_important)
    .sort((x, y) => new Date(y.last_message_at || y.updated_at || 0).getTime() - new Date(x.last_message_at || x.updated_at || 0).getTime())
  const rest = list
    .filter((s) => !s.is_important)
    .sort((x, y) => new Date(y.last_message_at || y.updated_at || 0).getTime() - new Date(x.last_message_at || x.updated_at || 0).getTime())

  const visibleIds = [...pinned, ...rest].map((s) => s.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const toggleSelected = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }
  const enterSelectMode = () => { setView("active"); setSelectMode(true); setSelected(new Set()) }
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
        s.id === sessionId ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}>
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
      className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
      {s.is_important && <Pin className="size-3 shrink-0 fill-current text-muted-foreground" />}
      <span className="flex-1 truncate">{s.name || "Untitled"}</span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => unarchive.mutate(s.id)} title="Restore" aria-label="Restore" className="hover:text-foreground"><ArchiveRestore className="size-3.5" /></button>
        <button onClick={() => deleteRow(s as Session)} title="Delete" aria-label="Delete" className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
      </span>
    </div>
  )

  return (
    <Sidebar collapsible="icon" data-tour="sidebar">
      <SidebarHeader className="gap-2">
        <div className="px-1 pt-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">Odysseus <span className="font-normal text-muted-foreground">/ v2</span></div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="new-chat" tooltip="New chat (⌘⌥N)" onClick={() => navigate("/chat")} className="border font-medium">
              <Plus /><span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton data-tour="search-conversations" tooltip="Search conversations (⌘K)" onClick={() => window.dispatchEvent(new CustomEvent("odysseus:open-search"))}>
              <Search /><span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="relative px-1 group-data-[collapsible=icon]:hidden">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter chat titles..." className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu data-tour="primary-nav">
              {favorites.map(({ to, icon: Icon, label }) => {
                const showReminderBadge = to === "/notes" && firedNoteReminders > 0
                const unpinnable = to !== "/chat"
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild isActive={navActive(to)} tooltip={label} data-tour={tourNav(to)}>
                      <NavLink to={to}>
                        <Icon />
                        <span>{label}</span>
                        {showReminderBadge && <span className="notes-nav-reminder-badge ml-auto" aria-label={`${reminderCountLabel(firedNoteReminders)} reminders`}>{reminderCountLabel(firedNoteReminders)}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                    {unpinnable && (
                      <SidebarMenuAction onClick={() => togglePin(to)} title="Unpin from sidebar" aria-label={`Unpin ${label} from sidebar`} showOnHover>
                        <Pin className="fill-current" />
                      </SidebarMenuAction>
                    )}
                  </SidebarMenuItem>
                )
              })}
              {moreItems.length > 0 && (
                <SidebarMenuItem>
                  <MoreToolsMenu variant={state === "collapsed" ? "icon" : "row"} items={moreItems} onTogglePin={togglePin} reminderTos={moreReminderTos} reminderText={reminderCountLabel(firedNoteReminders)} />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Chat history — hidden when the rail is collapsed to icons. */}
        <SidebarGroup className="min-h-0 flex-1 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between px-1 pb-1">
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
            <div className="mb-1 flex items-center gap-2 px-1 pb-1">
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
          <SidebarGroupContent className="overflow-y-auto">
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Account />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

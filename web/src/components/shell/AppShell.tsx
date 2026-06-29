import { type ReactNode } from "react"
import { AppSidebar } from "./AppSidebar"
import { ShortcutsOverlay } from "./ShortcutsOverlay"
import { ConversationSearch } from "./ConversationSearch"
import { GuidedTourOverlay } from "./GuidedTourOverlay"
import { TaskNotificationPoller } from "./TaskNotificationPoller"
import { NoteReminderPoller } from "./NoteReminderPoller"
import { InboxPoller } from "./InboxPoller"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { useHotkeys } from "@/lib/useHotkeys"
import { useAnchorRouting } from "@/lib/useAnchorRouting"
import { useUi } from "@/stores/ui"

export function AppShell({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useHotkeys()
  useAnchorRouting()
  // Drive the shadcn sidebar from the existing ui store so the ⌘B / [ hotkeys
  // (useHotkeys) and the persisted collapse state keep working. open = !collapsed.
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setSidebar = useUi((s) => s.setSidebar)
  return (
    <SidebarProvider open={!collapsed} onOpenChange={(o) => setSidebar(!o)} className="h-full min-h-0">
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        {/* Mobile/tablet top bar — desktop uses the in-flow sidebar instead. */}
        <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2 md:hidden">
          <SidebarTrigger aria-label="Open navigation menu" />
          <span className="text-sm font-semibold">Odysseus <span className="font-normal text-muted-foreground">/ v2</span></span>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </SidebarInset>
      <ConversationSearch />
      <GuidedTourOverlay />
      <TaskNotificationPoller />
      <NoteReminderPoller />
      <InboxPoller />
      {helpOpen && <ShortcutsOverlay onClose={() => setHelpOpen(false)} />}
    </SidebarProvider>
  )
}

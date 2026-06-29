import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, Moon, Sun, EyeOff, Keyboard, Settings, LogOut, MessageSquare } from "lucide-react"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { ALL_NAV } from "./nav"
import { useSessions } from "@/api/sessions"
import { useUi } from "@/stores/ui"
import { useComposer } from "@/stores/composer"
import { logout } from "@/api/auth"

// Global ⌘K launcher (cmdk). Run a command, jump to any page, or open a recent
// chat. Deep message-content search lives behind the "Search message history"
// action (the bespoke <ConversationSearch> overlay). Opened via the
// "odysseus:open-command" event (the ⌘K hotkey + the sidebar Search button).
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useUi()
  const incognito = useComposer((s) => s.incognito)
  const toggleComposer = useComposer((s) => s.toggle)
  const { data: sessions } = useSessions()

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener("odysseus:open-command", handler)
    return () => window.removeEventListener("odysseus:open-command", handler)
  }, [])

  const run = (fn: () => void) => { setOpen(false); fn() }
  const fire = (name: string) => window.dispatchEvent(new CustomEvent(name))

  const recents = (sessions || [])
    .filter((s) => !s.archived)
    .sort((a, b) => new Date(b.last_message_at || b.updated_at || 0).getTime() - new Date(a.last_message_at || a.updated_at || 0).getTime())
    .slice(0, 8)

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Run a command, jump to a page, or open a recent chat.">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="new chat conversation" onSelect={() => run(() => navigate("/chat"))}><Plus />New chat</CommandItem>
          <CommandItem value="search message history find messages" onSelect={() => run(() => fire("odysseus:open-search"))}><Search />Search message history…</CommandItem>
          <CommandItem value="theme toggle dark light mode appearance" onSelect={() => run(() => toggleTheme())}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</CommandItem>
          <CommandItem value="incognito private temporary chat" onSelect={() => run(() => { toggleComposer("incognito"); navigate("/chat") })}><EyeOff />Turn incognito {incognito ? "off" : "on"}</CommandItem>
          <CommandItem value="keyboard shortcuts hotkeys help" onSelect={() => run(() => fire("odysseus:open-shortcuts"))}><Keyboard />Keyboard shortcuts</CommandItem>
          <CommandItem value="settings preferences" onSelect={() => run(() => navigate("/settings"))}><Settings />Settings</CommandItem>
          <CommandItem value="log out logout sign out" onSelect={() => run(() => logout())}><LogOut />Log out</CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Go to">
          {ALL_NAV.map(({ to, icon: Icon, label }) => (
            <CommandItem key={to} value={`go to ${label} ${to}`} onSelect={() => run(() => navigate(to))}>
              <Icon />{label}
            </CommandItem>
          ))}
        </CommandGroup>

        {recents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent chats">
              {recents.map((s) => (
                <CommandItem key={s.id} value={`${s.name || "Untitled"} ${s.id}`} onSelect={() => run(() => navigate(`/chat/${s.id}`))}>
                  <MessageSquare />{s.name || "Untitled"}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

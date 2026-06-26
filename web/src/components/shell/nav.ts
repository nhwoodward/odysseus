import {
  MessageSquare, GitCompareArrows, Image, Brain, Telescope,
  Calendar, Mail, StickyNote, ListChecks, FileText, FolderOpen, Database, FlaskConical, Sparkles, FolderKanban, Plug,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Sidebar navigation entries. Shared by the Sidebar (renders them, honoring the
// per-user `hidden_nav` pref) and Settings → "Sidebar items" (show/hide toggles).
export interface NavItem { to: string; icon: LucideIcon; label: string }

export const PRIMARY: NavItem[] = [
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/compare", icon: GitCompareArrows, label: "Compare" },
  { to: "/research", icon: Telescope, label: "Research" },
  { to: "/gallery", icon: Image, label: "Gallery" },
  { to: "/memory", icon: Brain, label: "Memory" },
]
export const WORKSPACE: NavItem[] = [
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/email", icon: Mail, label: "Email" },
  { to: "/notes", icon: StickyNote, label: "Notes" },
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/library", icon: FileText, label: "Library" },
  { to: "/personal", icon: FolderOpen, label: "Personal files" },
  { to: "/knowledge", icon: Database, label: "Knowledge" },
  { to: "/cookbook", icon: FlaskConical, label: "Cookbook" },
  { to: "/skills", icon: Sparkles, label: "Skills" },
  { to: "/connectors", icon: Plug, label: "Connectors" },
]

// Flat list of every destination, in display order. The sidebar shows a small
// pinned subset as direct rows and tucks the rest behind a "More tools" flyout
// (leaders like ChatGPT/Claude keep ~5 nav items so the chat history dominates).
export const ALL_NAV: NavItem[] = [...PRIMARY, ...WORKSPACE]

// Default favorites shown directly in the sidebar, in addition to "/chat" which
// the sidebar always force-pins (and renders first). User-curatable via
// pin/unpin (persisted to localStorage `odysseus-pinned-nav`); all entries still
// honor `hidden_nav`.
export const DEFAULT_PINNED = ["/projects", "/research"]

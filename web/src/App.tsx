import { lazy, Suspense, useEffect, type ComponentType } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/queryClient"
import { AppShell } from "@/components/shell/AppShell"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Toaster } from "@/components/ui/Toaster"
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog"
import { ChatConsole } from "@/routes/ChatConsole" // eager — the default landing route
import { useUi } from "@/stores/ui"

// Code-split every non-landing route so the initial chunk stays small (the app
// previously bundled all ~18 routes — and katex/highlight.js/framer-motion —
// into one ~1.9 MB chunk). Routes are named exports, so adapt each to the
// default-export shape React.lazy expects.
function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(factory: () => Promise<M>, key: K) {
  return lazy(() => factory().then((m) => ({ default: m[key] as ComponentType })))
}
const ProjectsRoute = lazyNamed(() => import("@/routes/ProjectsRoute"), "ProjectsRoute")
const CompareRoute = lazyNamed(() => import("@/routes/CompareRoute"), "CompareRoute")
const ResearchRoute = lazyNamed(() => import("@/routes/ResearchRoute"), "ResearchRoute")
const MemoryRoute = lazyNamed(() => import("@/routes/MemoryRoute"), "MemoryRoute")
const GalleryRoute = lazyNamed(() => import("@/routes/GalleryRoute"), "GalleryRoute")
const CalendarRoute = lazyNamed(() => import("@/routes/CalendarRoute"), "CalendarRoute")
const EmailRoute = lazyNamed(() => import("@/routes/EmailRoute"), "EmailRoute")
const DocumentsRoute = lazyNamed(() => import("@/routes/DocumentsRoute"), "DocumentsRoute")
const PersonalRoute = lazyNamed(() => import("@/routes/PersonalRoute"), "PersonalRoute")
const RagRoute = lazyNamed(() => import("@/routes/RagRoute"), "RagRoute")
const NotesRoute = lazyNamed(() => import("@/routes/NotesRoute"), "NotesRoute")
const TasksRoute = lazyNamed(() => import("@/routes/TasksRoute"), "TasksRoute")
const CookbookRoute = lazyNamed(() => import("@/routes/CookbookRoute"), "CookbookRoute")
const SkillsRoute = lazyNamed(() => import("@/routes/SkillsRoute"), "SkillsRoute")
const ConnectorsRoute = lazyNamed(() => import("@/routes/ConnectorsRoute"), "ConnectorsRoute")
const SettingsRoute = lazyNamed(() => import("@/routes/SettingsRoute"), "SettingsRoute")

const FONT_STACKS: Record<string, string> = {
  sans: "",
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
}
const DENSITY_PX: Record<string, string> = { compact: "14px", comfortable: "16px", spacious: "17px" }

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function ThemedApp() {
  const theme = useUi((s) => s.theme)
  const accent = useUi((s) => s.accent)
  const font = useUi((s) => s.font)
  const density = useUi((s) => s.density)
  const { pathname } = useLocation()
  // Key the error boundary by the top-level route segment, NOT the full path.
  // `/chat/:sessionId?` matches both `/chat` and `/chat/{id}`, so React Router
  // keeps ChatConsole mounted across a new-chat navigation — but keying by the
  // full pathname would change the key and force-remount it, orphaning the
  // in-flight stream (reply only reappears on manual refresh). Switching to a
  // different feature still changes the segment and resets the boundary.
  const routeKey = pathname.split("/")[1] || "home"
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark") }, [theme])
  useEffect(() => {
    const root = document.documentElement
    if (accent) { root.style.setProperty("--primary", accent); root.style.setProperty("--ring", accent); root.style.setProperty("--primary-foreground", "#ffffff"); root.style.setProperty("--sidebar-primary", accent) }
    else { for (const v of ["--primary", "--ring", "--primary-foreground", "--sidebar-primary"]) root.style.removeProperty(v) }
    root.style.fontFamily = FONT_STACKS[font] || ""
    root.style.fontSize = DENSITY_PX[density] || "16px"
  }, [accent, font, density])
  return (
    <AppShell>
      <ErrorBoundary key={routeKey}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat/:sessionId?" element={<ChatConsole />} />
            <Route path="/projects" element={<ProjectsRoute />} />
            <Route path="/compare" element={<CompareRoute />} />
            <Route path="/research" element={<ResearchRoute />} />
            <Route path="/memory" element={<MemoryRoute />} />
            <Route path="/gallery" element={<GalleryRoute />} />
            <Route path="/calendar" element={<CalendarRoute />} />
            <Route path="/email" element={<EmailRoute />} />
            <Route path="/library" element={<DocumentsRoute />} />
            <Route path="/personal" element={<PersonalRoute />} />
            <Route path="/knowledge" element={<RagRoute />} />
            <Route path="/notes" element={<NotesRoute />} />
            <Route path="/tasks" element={<TasksRoute />} />
            <Route path="/cookbook" element={<CookbookRoute />} />
            <Route path="/skills" element={<SkillsRoute />} />
            <Route path="/connectors" element={<ConnectorsRoute />} />
            <Route path="/settings" element={<SettingsRoute />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <OnboardingDialog />
    </AppShell>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/v2">
        <ThemedApp />
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

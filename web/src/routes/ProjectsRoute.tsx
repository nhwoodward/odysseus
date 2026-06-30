import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FolderKanban, Plus, Pencil, Trash2, X, MessageSquare, Check } from "lucide-react"
import { useSessions } from "@/api/sessions"
import { useProjects, useProjectActions, sessionsInProject } from "@/api/projects"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/IconButton"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { useConfirm } from "@/components/ui/confirm"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadError } from "@/components/ui/load-error"
import { SkeletonList } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function ProjectsRoute() {
  const navigate = useNavigate()
  const sessionsQuery = useSessions()
  const { data: sessions } = sessionsQuery
  const { projects } = useProjects()
  const actions = useProjectActions()
  const confirm = useConfirm()

  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [savedInstr, setSavedInstr] = useState(false)

  // Default selection + re-seed the instructions draft when the selected
  // project changes (render-time, no setState-in-effect).
  const effective = selected && projects.some((p) => p.name === selected) ? selected : (projects[0]?.name ?? null)
  const current = projects.find((p) => p.name === effective) || null
  const lastSel = useRef<string | null>(null)
  if (effective !== lastSel.current) {
    lastSel.current = effective
    setDraft(current?.instructions || "")
    setAdding(false)
    setSavedInstr(false)
  }

  const members = sessionsInProject(sessions, effective || "")
  const unfiled = (sessions || []).filter((s) => !s.archived && s.folder !== effective)

  const doCreate = async () => {
    const n = newName.trim()
    if (!n) return
    await actions.create(n)
    setNewName(""); setCreating(false); setSelected(n)
  }
  const saveInstr = async () => { if (!effective) return; await actions.setInstructions(effective, draft); setSavedInstr(true) }
  const doRename = async () => {
    if (!effective) return
    const n = prompt("Rename project", effective)
    if (n && n.trim() && n.trim() !== effective) { await actions.rename(effective, n.trim(), members); setSelected(n.trim()) }
  }
  const doDelete = async () => {
    if (!effective) return
    if (!(await confirm({ title: `Delete project "${effective}"?`, description: `Its ${members.length} chat${members.length === 1 ? "" : "s"} will be unfiled (not deleted).`, destructive: true }))) return
    await actions.remove(effective, members)
    setSelected(null)
  }

  return (
    <div className="flex h-full w-full">
      <aside className="flex w-[240px] shrink-0 flex-col border-r">
        <RouteHeader
          title="Projects"
          actions={<IconButton onClick={() => setCreating(true)} label="New project" className="text-muted-foreground" icon={<Plus />} />}
        />
        <div className="flex-1 overflow-y-auto p-2">
          {creating && (
            <div className="mb-1.5 flex items-center gap-1 px-1">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doCreate(); if (e.key === "Escape") { setCreating(false); setNewName("") } }}
                placeholder="Project name" className="h-8 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring" />
              <button onClick={doCreate} aria-label="Create project" className="text-muted-foreground hover:text-foreground"><Check className="size-4" /></button>
            </div>
          )}
          {sessionsQuery.isLoading ? (
            <SkeletonList rows={5} className="p-1" />
          ) : sessionsQuery.isError ? (
            <LoadError onRetry={() => sessionsQuery.refetch()} className="m-1" />
          ) : (
            <>
              {projects.map((p) => (
                <button key={p.name} onClick={() => setSelected(p.name)}
                  className={cn("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    p.name === effective ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                  <FolderKanban className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.count}</span>
                </button>
              ))}
              {projects.length === 0 && !creating && (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description="Create one to group chats and give them shared instructions."
                  className="mt-2"
                />
              )}
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!current ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <FolderKanban className="size-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Projects keep related chats together</p>
              <p className="mt-1 text-sm text-muted-foreground">Group chats and give them shared instructions the assistant applies to every conversation inside.</p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" />New project</Button>
          </div>
        ) : (
          <>
            <header className="flex h-13 shrink-0 items-center justify-between gap-2 border-b px-4">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><FolderKanban className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{current.name}</span></span>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton onClick={doRename} label="Rename project" className="text-muted-foreground" icon={<Pencil />} />
                <IconButton onClick={doDelete} label="Delete project" className="text-muted-foreground hover:text-destructive" icon={<Trash2 />} />
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project instructions</h2>
                  <p className="mb-2 text-sm text-muted-foreground">Context and instructions applied to every chat in this project (skipped in incognito).</p>
                  <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setSavedInstr(false) }} rows={6} maxLength={6000}
                    placeholder="e.g. This project is about migrating our API to v2. Always assume TypeScript. Reference the auth spec when relevant."
                    className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring" />
                  <div className="mt-2 flex items-center justify-end gap-3">
                    {savedInstr && <span className="text-xs text-muted-foreground">Saved.</span>}
                    <Button size="sm" disabled={actions.isSaving} onClick={saveInstr}>{actions.isSaving ? "Saving…" : "Save instructions"}</Button>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chats · {members.length}</h2>
                    <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}><Plus className="size-4" />Add chats</Button>
                  </div>
                  {adding && (
                    <div className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border bg-card p-2">
                      {unfiled.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted-foreground">No other chats to add.</p>}
                      {unfiled.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
                          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{s.name || "Untitled"}{s.folder && <span className="ml-1.5 text-xs text-muted-foreground">· in {s.folder}</span>}</span>
                          <button onClick={() => actions.assign(s.id, effective)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">Add</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {members.map((s) => (
                      <div key={s.id} className="group flex items-center gap-2 rounded-lg border bg-card p-2.5">
                        <button onClick={() => navigate(`/chat/${s.id}`)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm">{s.name || "Untitled"}</span>
                        </button>
                        <button onClick={() => actions.assign(s.id, null)} title="Remove from project" aria-label="Remove from project" className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><X className="size-4" /></button>
                      </div>
                    ))}
                    {members.length === 0 && !adding && <p className="py-3 text-sm text-muted-foreground">No chats in this project yet. Use “Add chats” to include some.</p>}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

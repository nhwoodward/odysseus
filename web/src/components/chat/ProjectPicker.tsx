import { FolderKanban, Plus, X } from "lucide-react"
import { useSessions } from "@/api/sessions"
import { useProjects, useProjectActions } from "@/api/projects"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Assign the current chat to a project (folder) from the chat header.
export function ProjectPicker({ sessionId }: { sessionId: string }) {
  const { data: sessions } = useSessions()
  const { projects } = useProjects()
  const actions = useProjectActions()
  const current = sessions?.find((s) => s.id === sessionId)?.folder || null

  const assign = (name: string | null) => actions.assign(sessionId, name)
  const createAndAssign = async () => {
    const n = prompt("New project name")?.trim()
    if (!n) return
    await actions.create(n)
    await actions.assign(sessionId, n)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button title="Add this chat to a project" aria-label="Add this chat to a project"
          className={cn("flex max-w-[160px] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            current ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
          <FolderKanban className="size-3.5 shrink-0" />
          <span className="truncate">{current || "Add to project"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,14rem)] rounded-xl">
        <div className="max-h-64 overflow-y-auto">
          {projects.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No projects yet.</p>}
          <DropdownMenuRadioGroup value={current ?? ""} onValueChange={(v) => assign(v || null)}>
            {projects.map((p) => (
              <DropdownMenuRadioItem key={p.name} value={p.name} className="text-sm">
                <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
        <DropdownMenuSeparator />
        {current && <DropdownMenuItem className="text-sm text-muted-foreground" onClick={() => assign(null)}><X className="size-4" />Remove from project</DropdownMenuItem>}
        <DropdownMenuItem className="text-sm text-muted-foreground" onClick={createAndAssign}><Plus className="size-4" />New project…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
import { useNavigate } from "react-router-dom"
import { ExternalLink } from "lucide-react"
import { cookbookTaskId, type CalEvent } from "@/api/calendar"
import { cn } from "@/lib/utils"

export function CookbookTaskLink({ ev, compact }: { ev: CalEvent; compact?: boolean }) {
  const navigate = useNavigate()
  const taskId = cookbookTaskId(ev.description)
  if (!taskId) return null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigate("/tasks") }}
      title="Open in Tasks"
      className={cn(
        "inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground hover:text-foreground",
        compact ? "text-label" : "text-xs",
      )}
    >
      <ExternalLink className="size-3" />Open in Tasks
    </button>
  )
}

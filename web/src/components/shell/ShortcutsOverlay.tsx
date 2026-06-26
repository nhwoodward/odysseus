import { X } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"

const GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: "General", rows: [["⌘/Ctrl K", "Search conversations"], ["⌘/Ctrl Alt N", "New chat"], ["⌘/Ctrl B", "Toggle sidebar"], ["⌘/Ctrl J", "Toggle theme"], ["?", "Show this help"], ["Esc", "Close"]] },
  { title: "Go to (press g, then…)", rows: [["g c", "Chat"], ["g k", "Compare"], ["g r", "Research"], ["g i", "Gallery"], ["g m", "Memory"], ["g a", "Calendar"], ["g e", "Email"], ["g n", "Notes"], ["g t", "Tasks"], ["g l", "Library"], ["g p", "Personal files"], ["g d", "Knowledge"], ["g b", "Cookbook"], ["g s", "Skills"], ["g ,", "Settings"]] },
]

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} label="Keyboard shortcuts" className="max-h-[88vh] max-w-[min(92vw,28rem)] overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Keyboard shortcuts</div>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</div>
            <div className="space-y-1">
              {g.rows.map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

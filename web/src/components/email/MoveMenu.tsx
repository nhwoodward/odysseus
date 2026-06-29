import { useState } from "react"
import { FolderInput } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { useEscapeClose } from "@/lib/useEscapeClose"

export function MoveMenu({ folders, current, onMove }: { folders: string[]; current: string; onMove: (dest: string) => void }) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const targets = folders.filter((f) => f !== current)
  return (
    <div className="relative">
      <IconButton icon={<FolderInput />} label="Move to folder" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="text-muted-foreground" />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-56 origin-top-right animate-pop-in overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-lg">
            {targets.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No other folders</div>}
            {targets.map((f) => (
              <button key={f} onClick={() => { onMove(f); setOpen(false) }} className="block w-full truncate px-3 py-1.5 text-left hover:bg-accent">{f}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

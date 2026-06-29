import { Slash } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ComposerController } from "./useComposerController"

export function SlashMenu({ ctl }: { ctl: ComposerController }) {
  const { slashOpen, slashMatches, pickSlash, setSlashSel, sel } = ctl
  if (!slashOpen) return null
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 origin-bottom animate-pop-in overflow-hidden rounded-xl border bg-popover shadow-lg">
      <div className="border-b px-3 py-1.5 text-label font-medium uppercase tracking-wider text-muted-foreground">Commands</div>
      <div className="max-h-64 overflow-y-auto py-1">
        {slashMatches.map((c, i) => (
          <button
            key={`${c.kind}-${c.token}`}
            onMouseDown={(e) => { e.preventDefault(); pickSlash(c.name) }}
            onMouseEnter={() => setSlashSel(i)}
            className={cn("flex w-full items-start gap-2 px-3 py-1.5 text-left", i === sel ? "bg-accent" : "hover:bg-accent/50")}
          >
            <Slash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="text-sm font-medium">{c.token}</span>
              {c.help && <span className="ml-2 text-xs text-muted-foreground">{c.help}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

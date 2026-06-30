import { Slash } from "lucide-react"
import { Command, CommandList, CommandGroup, CommandItem } from "@/components/ui/command"
import type { ComposerController } from "./useComposerController"

export function SlashMenu({ ctl }: { ctl: ComposerController }) {
  const { slashOpen, slashMatches, pickSlash, setSlashSel, sel } = ctl
  if (!slashOpen) return null
  // cmdk renders the list + selection styling; the controller already filtered
  // (shouldFilter=false) and the textarea's onKeyDown owns navigation, so we
  // just mirror `sel` into cmdk's controlled `value` for the highlight. cmdk's
  // own keydown lives on its root, not the document, and the textarea is a
  // sibling — so there's no double-handling.
  const selValue = slashMatches[sel] ? `${slashMatches[sel].kind}-${slashMatches[sel].token}` : ""
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 origin-bottom animate-pop-in overflow-hidden rounded-xl border bg-popover shadow-lg">
      <Command value={selValue} shouldFilter={false} className="bg-popover">
        <CommandList className="max-h-64">
          <CommandGroup heading="Commands">
            {slashMatches.map((c, i) => (
              <CommandItem
                key={`${c.kind}-${c.token}`}
                value={`${c.kind}-${c.token}`}
                onMouseDown={(e) => { e.preventDefault(); pickSlash(c.name) }}
                onMouseEnter={() => setSlashSel(i)}
                onSelect={() => pickSlash(c.name)}
                className="items-start gap-2"
              >
                <Slash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="text-sm font-medium">{c.token}</span>
                  {c.help && <span className="ml-2 text-xs text-muted-foreground">{c.help}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

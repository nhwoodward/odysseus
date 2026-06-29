import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { type EmailListFilter } from "@/api/email"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"
import { EMAIL_FILTERS } from "@/components/email/emailFormat"

export function EmailFilterPicker({ value, onChange }: { value: EmailListFilter; onChange: (value: EmailListFilter) => void }) {
  const [open, setOpen] = useState(false)
  useEscapeClose(open, () => setOpen(false))
  const current = EMAIL_FILTERS.find((item) => item.value === value) || EMAIL_FILTERS[0]
  const Icon = current.icon
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter mail"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Icon className="size-3.5" />
        <span>{current.label}</span>
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-48 origin-top-left animate-pop-in overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-lg">
            {EMAIL_FILTERS.map((item) => {
              const ItemIcon = item.icon
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => { onChange(item.value); setOpen(false) }}
                  className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent", item.value === value && "font-medium")}
                >
                  <ItemIcon className="size-3.5 text-muted-foreground" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

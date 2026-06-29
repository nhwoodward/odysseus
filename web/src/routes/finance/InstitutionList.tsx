import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PlaidItemInfo } from "@/api/finance"
import { Monogram } from "./Monogram"

// Shared connected-institutions list, reused by the onboarding success screen and
// the dashboard so their spacing/typography never drift.
//
// HONEST STATUS: there is no per-item live-sync field — items[].status is only
// active/inactive — so "Syncing" is derived ONCE from the GLOBAL summary.pending
// and every active institution shows it together (list-level, not per-row
// progress) until Plaid finishes preparing data. "Needs attention" is defensive
// only: no backend path currently sets items[].error, but we render it honestly
// if one ever does (e.g. a future ITEM_LOGIN_REQUIRED).
//
// `pending` is tri-state: undefined means the summary query hasn't resolved yet,
// so we show a neutral "Checking…" rather than over-claiming a green "Synced"
// that would flip to "Syncing" the moment summary lands.
type DerivedStatus = { variant: "success" | "warning" | "destructive" | "secondary"; label: string; title?: string; pulse?: boolean; dot: boolean }

function statusOf(item: PlaidItemInfo, pending?: boolean): DerivedStatus {
  if (item.error) return { variant: "destructive", label: "Needs attention", title: item.error, dot: true }
  if (pending === true) return { variant: "warning", label: "Syncing", pulse: true, dot: true }
  if (pending === undefined) return { variant: "secondary", label: "Checking…", dot: false }
  return { variant: "success", label: "Synced", dot: true }
}

export function InstitutionRow({ item, pending, trailing }: {
  item: PlaidItemInfo; pending?: boolean; trailing?: ReactNode
}) {
  const s = statusOf(item, pending)
  const accounts = item.accounts?.length || 0
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Monogram name={item.institution_name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.institution_name || "Institution"}</div>
        <div className="truncate text-xs text-muted-foreground">{accounts} account{accounts === 1 ? "" : "s"}</div>
      </div>
      <Badge variant={s.variant} title={s.title}>
        {/* bg-current tints the dot to the badge's own variant colour; pulse only
            animates for users who haven't asked for reduced motion. No dot in the
            neutral "Checking…" state. */}
        {s.dot && <span className={cn("size-1.5 rounded-full bg-current", s.pulse && "motion-safe:animate-pulse")} aria-hidden="true" />}
        {s.label}
      </Badge>
      {trailing}
    </div>
  )
}

export function InstitutionList({ items, pending, renderTrailing, showHeader = false, className }: {
  items: PlaidItemInfo[]
  pending?: boolean
  renderTrailing?: (item: PlaidItemInfo) => ReactNode
  showHeader?: boolean
  className?: string
}) {
  if (!items.length) return null
  return (
    <div className={cn("space-y-2", className)}>
      {showHeader && (
        <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Institution</span>
          <span>Status</span>
        </div>
      )}
      <div className="grid gap-2">
        {items.map((it) => (
          <InstitutionRow key={it.id} item={it} pending={pending} trailing={renderTrailing?.(it)} />
        ))}
      </div>
      {pending && (
        <p className="px-1 text-xs text-muted-foreground">Analyzing accounts can take several minutes — refresh in a moment.</p>
      )}
    </div>
  )
}

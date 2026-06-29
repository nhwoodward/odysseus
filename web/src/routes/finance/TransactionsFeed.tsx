import { useMemo, useState } from "react"
import { Search, Receipt } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { money, type Txn } from "@/api/finance"
import { prettyCat, fmtDay } from "./util"
import { cn } from "@/lib/utils"

const CAP = 80

// Searchable, filterable transaction feed with color-coded amounts (green inflow,
// plain outflow) — the Copilot pattern. Filtering is client-side over the existing
// 90-day window. Display flips Plaid's sign so debits read negative / credits positive.
export function TransactionsFeed({ transactions }: { transactions: Txn[] }) {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<string | null>(null)

  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of transactions) { const c = t.category || "OTHER"; m[c] = (m[c] || 0) + 1 }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
  }, [transactions])

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return transactions.filter((t) =>
      (!cat || (t.category || "OTHER") === cat) &&
      (!needle || `${t.name || ""} ${prettyCat(t.category)} ${t.amount ?? ""}`.toLowerCase().includes(needle)),
    )
  }, [transactions, q, cat])
  const shown = matched.slice(0, CAP)

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")

  // A genuinely empty account (connected but quiet, or Plaid still syncing) is
  // NOT a failed search — don't show the search box + "No matching transactions".
  if (!transactions.length) {
    return (
      <Card className="p-0">
        <EmptyState icon={Receipt} title="No transactions yet"
          description="Transactions from your connected accounts will show up here once Plaid finishes syncing — usually within a few minutes of connecting." />
      </Card>
    )
  }

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions…" aria-label="Search transactions" className="h-8 pl-8" />
        </div>
        <button onClick={() => setCat(null)} aria-pressed={!cat} className={chip(!cat)}>All</button>
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={chip(cat === c)}>{prettyCat(c)}</button>
        ))}
      </div>
      <div className="divide-y">
        {shown.map((t, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtDay(t.date)}</span>
            <span className="min-w-0 flex-1 truncate">{t.name || "—"}</span>
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">{prettyCat(t.category)}</Badge>
            <span className={cn("w-24 shrink-0 text-right font-medium tabular-nums", (t.amount || 0) < 0 && "text-emerald-600 dark:text-emerald-400")}>
              {money(t.amount != null ? -t.amount : null)}
            </span>
          </div>
        ))}
        {!matched.length && <p className="p-6 text-center text-sm text-muted-foreground">No matching transactions.</p>}
      </div>
      {matched.length > shown.length && (
        <div className="border-t p-3 text-center text-xs text-muted-foreground">
          Showing {shown.length} of {matched.length} — refine your search to see more
        </div>
      )}
    </Card>
  )
}

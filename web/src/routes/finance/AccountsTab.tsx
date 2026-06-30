import { Landmark } from "lucide-react"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { money, type Balances } from "@/api/finance"
import { Monogram } from "./Monogram"
import { cn } from "@/lib/utils"

const GROUPS: { key: string; label: string; match: (t: string) => boolean; asset: boolean }[] = [
  { key: "cash", label: "Cash", match: (t) => t === "depository", asset: true },
  { key: "investment", label: "Investments", match: (t) => t === "investment" || t === "brokerage", asset: true },
  { key: "credit", label: "Credit", match: (t) => t === "credit", asset: false },
  { key: "loan", label: "Loans", match: (t) => t === "loan", asset: false },
]

// Accounts grouped by type (Cash / Investments / Credit / Loans) with per-group
// total and % of assets — the Copilot/Monarch pattern. `kind`/`type` already on
// each account from /accounts.
export function AccountsTab({ balances }: { balances: Balances }) {
  const accounts = balances.accounts || []
  if (!accounts.length) {
    return <EmptyState icon={Landmark} title="No accounts" description="Connected accounts and their balances will appear here." />
  }
  const assets = balances.assets || 0
  const used = new Set<typeof accounts[number]>()
  const grouped: { key: string; label: string; asset: boolean; items: typeof accounts; total: number }[] = []
  for (const g of GROUPS) {
    const items = accounts.filter((a) => g.match((a.type || "").toLowerCase()))
    if (!items.length) continue
    items.forEach((a) => used.add(a))
    grouped.push({ key: g.key, label: g.label, asset: g.asset, items, total: items.reduce((s, a) => s + (a.current || 0), 0) })
  }
  // "Other" = types outside the asset/liability groups (Plaid kind "other"), which
  // aren't in balances.assets — so don't show a "% of assets" that wouldn't add up.
  const other = accounts.filter((a) => !used.has(a))
  if (other.length) grouped.push({ key: "other", label: "Other", asset: false, items: other, total: other.reduce((s, a) => s + (a.current || 0), 0) })

  return (
    <Card className="p-4">
      {grouped.map((g) => (
        <section key={g.key} className="mt-4 first:mt-0">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{g.label}</span>
            <span className="tabular-nums">
              {money(g.total)}
              {g.asset && assets > 0 && <span className="ml-2 font-normal normal-case">· {Math.round((g.total / assets) * 100)}% of assets</span>}
            </span>
          </div>
          <div className="space-y-1.5">
            {g.items.map((a, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <Monogram name={a.institution || a.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.name || a.subtype || "Account"}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.institution}{a.mask ? ` ····${a.mask}` : ""}</div>
                </div>
                <div className={cn("text-sm font-semibold tabular-nums", a.kind === "liability" && "text-destructive")}>{money(a.current)}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Card>
  )
}

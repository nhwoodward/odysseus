import { Card } from "@/components/ui/card"
import { money, type CashflowCategory } from "@/api/finance"
import { PALETTE, prettyCat } from "./util"
import { cn } from "@/lib/utils"

// Stacked category bar + ranked list with MoM deltas — replaces the single-period
// donut (YNAB / Copilot pattern). `categories` come from /cashflow (this month vs last).
export function SpendingBreakdown({ categories, className }: { categories: CashflowCategory[]; className?: string }) {
  const top = categories.slice(0, 6)
  const total = categories.reduce((s, c) => s + c.amount, 0)
  const otherAmt = total - top.reduce((s, c) => s + c.amount, 0)
  const otherCount = categories.length - top.length

  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-1 text-sm font-medium">Spending · this month</div>
      {!total ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No spending yet this month.</p>
      ) : (
        <>
          <div className="text-2xl font-semibold tabular-nums">{money(total)} <span className="text-sm font-normal text-muted-foreground">spent</span></div>
          <div className="my-3 flex h-3.5 overflow-hidden rounded-full bg-muted">
            {top.map((c, i) => (
              <span key={c.category} style={{ width: `${(c.amount / total) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
            ))}
            {otherAmt > 0.005 && <span className="bg-muted-foreground/40" style={{ width: `${(otherAmt / total) * 100}%` }} />}
          </div>
          <div>
            {top.map((c, i) => (
              <div key={c.category} className="flex items-center gap-2 border-t border-border py-1.5 text-sm first:border-t-0">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{prettyCat(c.category)}</span>
                <span className="tabular-nums">{money(c.amount)}</span>
                {c.delta_pct != null && (
                  c.delta_pct === 0
                    ? <span className="ml-1 w-16 shrink-0 whitespace-nowrap text-right text-xs font-semibold text-muted-foreground">0%</span>
                    : <span className={cn("ml-1 w-16 shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums", c.delta_pct > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                        {c.delta_pct > 0 ? "▲" : "▼"}{Math.abs(c.delta_pct)}%
                      </span>
                )}
              </div>
            ))}
            {otherAmt > 0.005 && (
              <div className="flex items-center gap-2 border-t border-border py-1.5 text-sm">
                <span className="size-2.5 shrink-0 rounded-[3px] bg-muted-foreground/40" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">Other · {otherCount} more</span>
                <span className="tabular-nums">{money(otherAmt)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

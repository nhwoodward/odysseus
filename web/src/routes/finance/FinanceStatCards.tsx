import { TrendingUp, TrendingDown } from "lucide-react"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { money, type FinanceSummary, type FinanceCashflow, type NetWorthHistory } from "@/api/finance"

type Dir = "up" | "down" | null

// One dashboard-01 KPI tile: label + big tabular figure + an outline trend badge
// (signed %), and a footer headline (with the trend icon) over a muted sub-line.
function StatCard({ label, value, pct, dir, footerHead, footerSub }: {
  label: string; value: string; pct?: number | null; dir: Dir; footerHead: string; footerSub: string
}) {
  const Icon = dir === "down" ? TrendingDown : TrendingUp
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {pct != null && dir && (
          <CardAction>
            <Badge variant="outline"><Icon className="size-3.5" />{pct >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(1)}%</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex items-center gap-2 font-medium">{footerHead}{dir && <Icon className="size-4" />}</div>
        <div className="text-muted-foreground">{footerSub}</div>
      </CardFooter>
    </Card>
  )
}

// The dashboard-01 KPI row for Finance Overview. All figures come from data the
// Overview already loads (summary + cashflow + networth) — pure presentation.
// income_mom / expense_mom are DOLLAR deltas (this month vs last, MTD); the badge
// shows a derived % (mom / prev) and the footer shows the dollar change.
export function FinanceStatCards({ summary, cashflow, networth }: {
  summary: FinanceSummary; cashflow?: FinanceCashflow; networth?: NetWorthHistory
}) {
  // Net-worth trend from accumulated daily snapshots — often <2 points early, in
  // which case we show the figure with no trend badge (never fabricate a trend).
  const pts = networth?.points || []
  const nwFirst = pts[0]?.net_worth
  const nwLast = pts[pts.length - 1]?.net_worth
  const nwPct = pts.length >= 2 && nwFirst && Math.abs(nwFirst) > 1 ? ((nwLast! - nwFirst) / Math.abs(nwFirst)) * 100 : null
  const nwDir: Dir = nwPct == null ? null : nwPct >= 0 ? "up" : "down"

  const tm = cashflow?.this_month
  const incMom = cashflow?.income_mom
  const expMom = cashflow?.expense_mom
  const pctOf = (current?: number, mom?: number) => {
    if (current == null || mom == null) return null
    const prev = current - mom
    // Require a POSITIVE prior base — a MoM % against a zero/negative base
    // (possible when refunds exceeded spend last month) is meaningless and would
    // flip the badge sign against the trend icon.
    return prev > 1 ? (mom / prev) * 100 : null
  }
  const dirOf = (v?: number): Dir => v == null || Math.abs(v) < 1 ? null : v >= 0 ? "up" : "down"
  const incDir = dirOf(incMom)
  const expDir = dirOf(expMom)
  const netDir = dirOf(tm?.net)
  const momLine = (mom?: number) =>
    mom == null ? "—" : Math.abs(mom) < 1 ? "About the same as last month" : `${money(Math.abs(mom))} ${mom >= 0 ? "more" : "less"} than last month`

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <StatCard
        label="Net Worth" value={money(summary.net_worth)} pct={nwPct} dir={nwDir}
        footerHead={nwDir == null ? "Building history" : nwDir === "up" ? "Trending up" : "Trending down"}
        footerSub={`Assets ${money(summary.assets)} · Liabilities ${money(summary.liabilities)}`}
      />
      <StatCard
        label="Income · this month" value={tm ? money(tm.income) : "—"} pct={pctOf(tm?.income, incMom)} dir={incDir}
        footerHead={momLine(incMom)} footerSub="Money in this month"
      />
      <StatCard
        label="Spending · this month" value={tm ? money(tm.expenses) : "—"} pct={pctOf(tm?.expenses, expMom)} dir={expDir}
        footerHead={momLine(expMom)} footerSub="Money out this month"
      />
      <StatCard
        label="Net Cash Flow" value={tm ? money(tm.net) : "—"} dir={netDir}
        footerHead={tm == null ? "—" : tm.net > 0 ? "Positive this month" : tm.net < 0 ? "Negative this month" : "Break-even this month"}
        footerSub="Income minus spending"
      />
    </div>
  )
}

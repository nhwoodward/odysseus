import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from "recharts"
import { Landmark, Loader2, Plus, Trash2, TrendingUp, CreditCard, Repeat, PiggyBank, Wallet } from "lucide-react"
import {
  useFinanceStatus, useFinanceItems, useFinanceSummary, useFinanceTransactions,
  useFinanceInvestments, useFinanceMutations, money, type FinanceSummary,
} from "@/api/finance"
import { useAuthStatus } from "@/api/auth"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonList } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { FinanceOnboarding } from "./finance/FinanceOnboarding"

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
const prettyCat = (s?: string) => (s || "OTHER").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  )
}

function CategoryDonut({ data, total, centerLabel }: { data: { name: string; value: number }[]; total: number; centerLabel: string }) {
  const pie = data.slice(0, 6).map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length] }))
  if (!pie.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
  return (
    <ChartContainer config={{}} className="mx-auto aspect-square max-h-[220px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={pie} dataKey="value" nameKey="name" innerRadius={56} strokeWidth={4} />
        <text x="50%" y="47%" textAnchor="middle" className="fill-foreground text-lg font-semibold">{money(total)}</text>
        <text x="50%" y="56%" textAnchor="middle" className="fill-muted-foreground text-[11px]">{centerLabel}</text>
      </PieChart>
    </ChartContainer>
  )
}

function Legend({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="space-y-1">
      {data.slice(0, 6).map((d, i) => (
        <div key={d.name} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PALETTE[i % PALETTE.length] }} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{prettyCat(d.name)}</span>
          <span className="tabular-nums">{money(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Overview({ summary }: { summary: FinanceSummary }) {
  const spend = summary.spending_by_category.map((c) => ({ name: c.category, value: c.amount }))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Wallet} label="Net worth" value={money(summary.net_worth)} sub={`${summary.accounts_count} account${summary.accounts_count === 1 ? "" : "s"}`} />
        <Stat icon={CreditCard} label="Spent (30d)" value={money(summary.spending_30d_total)} />
        <Stat icon={Repeat} label="Subscriptions" value={money(summary.subscriptions_monthly)} sub={`${summary.subscriptions_count}/mo recurring`} />
        <Stat icon={PiggyBank} label="Investments" value={money(summary.investments_value)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Spending by category · last 30 days</div>
          <div className="grid items-center gap-2 sm:grid-cols-2">
            <CategoryDonut data={spend} total={summary.spending_30d_total} centerLabel="spent" />
            <Legend data={spend} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Assets vs. liabilities</div>
          <div className="space-y-2 pt-1">
            <Bar2 label="Assets" value={summary.assets} max={Math.max(summary.assets, summary.liabilities, 1)} tone="bg-emerald-500" />
            <Bar2 label="Liabilities" value={summary.liabilities} max={Math.max(summary.assets, summary.liabilities, 1)} tone="bg-destructive" />
            <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
              <span>Net worth</span><span className="tabular-nums">{money(summary.net_worth)}</span>
            </div>
          </div>
        </Card>
      </div>
      {summary.pending && <p className="text-xs text-muted-foreground">Plaid is still preparing some data — refresh in a moment.</p>}
    </div>
  )
}

function Bar2({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{money(value)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>
    </div>
  )
}

function SpendingTab() {
  const { data, isLoading } = useFinanceTransactions(90)
  const txns = useMemo(() => data?.transactions || [], [data])
  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of txns) { const a = t.amount || 0; if (a > 0) m[t.category || "OTHER"] = (m[t.category || "OTHER"] || 0) + a }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name: prettyCat(name), value: Math.round(value) }))
  }, [txns])
  if (isLoading) return <SkeletonList rows={5} />
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-2 text-sm font-medium">Top categories · last 90 days</div>
        {byCat.length ? (
          <ChartContainer config={{}} className="h-[240px] w-full">
            <BarChart data={byCat} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--chart-1)" />
            </BarChart>
          </ChartContainer>
        ) : <p className="py-8 text-center text-sm text-muted-foreground">No spending in this window.</p>}
      </Card>
      <Card className="p-0">
        <div className="border-b p-3 text-sm font-medium">Recent transactions</div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Merchant</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {txns.slice(0, 40).map((t, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground tabular-nums">{t.date}</TableCell>
                <TableCell className="max-w-[220px] truncate">{t.name || "—"}</TableCell>
                <TableCell><Badge variant="secondary">{prettyCat(t.category)}</Badge></TableCell>
                <TableCell className={cn("text-right tabular-nums", (t.amount || 0) < 0 && "text-emerald-600 dark:text-emerald-400")}>{money(t.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!txns.length && <p className="p-4 text-center text-sm text-muted-foreground">No transactions.</p>}
      </Card>
    </div>
  )
}

function InvestmentsTab() {
  const { data, isLoading } = useFinanceInvestments()
  const alloc = useMemo(() => Object.entries(data?.allocation || {}).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), [data])
  if (isLoading) return <SkeletonList rows={5} />
  if (!data || !data.holdings.length) return <EmptyState icon={PiggyBank} title="No investment holdings" description="Connect a brokerage account to see your portfolio and allocation." />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Allocation</div>
          <div className="grid items-center gap-2 sm:grid-cols-2">
            <CategoryDonut data={alloc} total={data.total_value} centerLabel="value" />
            <Legend data={alloc} />
          </div>
        </Card>
        <Stat icon={TrendingUp} label="Portfolio value" value={money(data.total_value)} sub={`${data.holdings.length} holdings`} />
      </div>
      <Card className="p-0">
        <div className="border-b p-3 text-sm font-medium">Holdings</div>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Ticker</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.holdings.slice(0, 40).map((h, i) => (
              <TableRow key={i}>
                <TableCell className="max-w-[260px] truncate">{h.name}</TableCell>
                <TableCell className="text-muted-foreground">{h.ticker || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{h.quantity ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{money(h.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

const TABS = [["overview", "Overview"], ["spending", "Spending"], ["investments", "Investments"]] as const

export function FinanceRoute() {
  const { data: status, isLoading: statusLoading } = useFinanceStatus()
  const { data: auth } = useAuthStatus()
  const isAdmin = !!auth?.is_admin
  const connected = (status?.item_count || 0) > 0
  const { data: items } = useFinanceItems(connected)
  const { data: summary } = useFinanceSummary(connected)
  const { connect, removeItem } = useFinanceMutations()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview")

  // Hold the onboarding "You're connected" beat briefly after a successful
  // connect, so it's seen before the dashboard swaps in (status refetches fast).
  // `celebrate` is derived; the effect only schedules the dismissal timer
  // (async setState) — no synchronous setState in the effect body.
  const justConnected = connect.isSuccess && connect.data?.connected === true
  const [beatDone, setBeatDone] = useState(false)
  const connectReset = connect.reset
  useEffect(() => {
    if (!justConnected) return
    const t = setTimeout(() => { setBeatDone(true); connectReset() }, 1800)
    return () => clearTimeout(t)
  }, [justConnected, connectReset])
  const celebrate = justConnected && !beatDone
  const showOnboarding = !connected || celebrate

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
      <Landmark className="size-5 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Finance</h1>
      {status?.env && <Badge variant="secondary">{status.env}</Badge>}
      {connected && (
        <Button size="sm" className="ml-auto" disabled={connect.isPending} onClick={() => connect.mutate()}>
          {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Connect another
        </Button>
      )}
    </header>
  )

  let body: React.ReactNode
  if (statusLoading) {
    body = <div className="p-4 lg:p-6"><SkeletonList rows={4} /></div>
  } else if (showOnboarding) {
    body = <FinanceOnboarding isAdmin={isAdmin} status={status} connect={connect} celebrate={celebrate} />
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mb-4 flex gap-1.5">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                tab === id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        {tab === "overview" && (summary ? <Overview summary={summary} /> : <SkeletonList rows={4} />)}
        {tab === "spending" && <SpendingTab />}
        {tab === "investments" && <InvestmentsTab />}

        {!!items?.length && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected institutions</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Landmark className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.institution_name || "Institution"}</div>
                    <div className="truncate text-xs text-muted-foreground">{(it.accounts?.length || 0)} account{(it.accounts?.length || 0) === 1 ? "" : "s"}{it.error ? ` · ${it.error}` : ""}</div>
                  </div>
                  <button onClick={() => { if (confirm("Disconnect this institution?")) removeItem.mutate(it.id) }} title="Disconnect" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  return <div className="flex h-full min-h-0 flex-col">{header}{body}</div>
}

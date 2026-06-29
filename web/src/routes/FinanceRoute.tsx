import { useMemo, useState } from "react"
import { Pie, PieChart } from "recharts"
import { Landmark, Loader2, Plus, RefreshCw, Trash2, TrendingUp, PiggyBank, Sparkles, MessageCircle, type LucideIcon } from "lucide-react"
import {
  useFinanceStatus, useFinanceItems, useFinanceSummary, useFinanceCashflow, useFinanceNetworth,
  useFinanceTransactions, useFinanceRecurring, useFinanceAccounts, useFinanceInvestments,
  useFinanceMutations, useFinanceRefresh, money, type FinanceSummary, type FinanceCashflow, type NetWorthHistory, type PlaidItemInfo,
} from "@/api/finance"
import { useAuthStatus } from "@/api/auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonList } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog"
import { useAskAssistant } from "@/lib/composerHandoff"
import { cn } from "@/lib/utils"
import { FinanceOnboarding, EnvBadge } from "./finance/FinanceOnboarding"
import { InstitutionList } from "./finance/InstitutionList"
import { FinanceDisclaimer } from "./finance/FinanceDisclaimer"
import { CashFlowCard } from "./finance/CashFlowCard"
import { NetWorthCard } from "./finance/NetWorthCard"
import { SpendingBreakdown } from "./finance/SpendingBreakdown"
import { BillsTab } from "./finance/BillsTab"
import { AccountsTab } from "./finance/AccountsTab"
import { TransactionsFeed } from "./finance/TransactionsFeed"
import { PALETTE, prettyCat, relTime } from "./finance/util"

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
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

function CashflowError() {
  return <Card className="p-4"><p className="py-8 text-center text-sm text-muted-foreground">Couldn't load this right now — refresh the page to retry.</p></Card>
}

// Overview: net-worth summary (the trend chart is P1 — needs balance snapshots),
// then the cash-flow + spending-breakdown pair.
function Overview({ summary, cashflow, cashflowError, networth, networthError }: { summary: FinanceSummary; cashflow?: FinanceCashflow; cashflowError?: boolean; networth?: NetWorthHistory; networthError?: boolean }) {
  return (
    <div className="space-y-4">
      <NetWorthCard summary={summary} history={networth} error={networthError} />
      <div className="grid gap-3 lg:grid-cols-2">
        {cashflow ? <CashFlowCard data={cashflow} /> : cashflowError ? <CashflowError /> : <Card className="p-4"><SkeletonList rows={3} /></Card>}
        {cashflow ? <SpendingBreakdown categories={cashflow.categories} /> : cashflowError ? <CashflowError /> : <Card className="p-4"><SkeletonList rows={3} /></Card>}
      </div>
      {summary.pending && <p className="text-xs text-muted-foreground">Plaid is still preparing some data — refresh in a moment.</p>}
    </div>
  )
}

function SpendingTab({ cashflow, cashflowError }: { cashflow?: FinanceCashflow; cashflowError?: boolean }) {
  const { data, isLoading } = useFinanceTransactions(90)
  return (
    <div className="space-y-4">
      {cashflow ? <SpendingBreakdown categories={cashflow.categories} /> : cashflowError ? <CashflowError /> : <Card className="p-4"><SkeletonList rows={4} /></Card>}
      {isLoading ? <SkeletonList rows={6} /> : <TransactionsFeed transactions={data?.transactions || []} />}
    </div>
  )
}

function BillsTabWrap() {
  const { data, isLoading } = useFinanceRecurring()
  if (isLoading) return <SkeletonList rows={6} />
  return <BillsTab subscriptions={data?.subscriptions || []} monthlyTotal={data?.monthly_total || 0} />
}

function AccountsTabWrap() {
  const { data, isLoading } = useFinanceAccounts()
  if (isLoading || !data) return <SkeletonList rows={6} />
  return <AccountsTab balances={data} />
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
        {data.holdings.length > 40 && (
          <div className="border-t p-3 text-center text-xs text-muted-foreground">
            Showing the top 40 of {data.holdings.length} holdings by value
          </div>
        )}
      </Card>
    </div>
  )
}

const TABS = [["overview", "Overview"], ["spending", "Spending"], ["bills", "Bills"], ["accounts", "Accounts"], ["investments", "Investments"]] as const
type TabId = (typeof TABS)[number][0]

// Context-relevant starter the inline "Ask about this" hands to the assistant per tab.
const TAB_QUESTION: Record<TabId, string> = {
  overview: "Give me a summary of my finances right now.",
  spending: "Where did I spend the most this month?",
  bills: "Which subscriptions or recurring bills could I cancel to save money?",
  accounts: "What's my net worth and how is it split across my accounts?",
  investments: "How is my investment portfolio allocated?",
}

export function FinanceRoute() {
  const { data: status, isLoading: statusLoading } = useFinanceStatus()
  const { data: auth } = useAuthStatus()
  const isAdmin = !!auth?.is_admin
  const connected = (status?.item_count || 0) > 0
  const { data: items } = useFinanceItems(connected)
  const summaryQuery = useFinanceSummary(connected)
  const summary = summaryQuery.data
  const { data: cashflow, isError: cashflowError } = useFinanceCashflow(connected)
  const { data: networth, isError: networthError } = useFinanceNetworth(connected)
  const { connect, removeItem } = useFinanceMutations()
  const { refresh, fetching } = useFinanceRefresh()
  const [tab, setTab] = useState<TabId>("overview")
  const [toDisconnect, setToDisconnect] = useState<PlaidItemInfo | null>(null)
  const ask = useAskAssistant()

  // `celebrate` shows the success hub while the last connect succeeded, until the
  // user clicks "View dashboard" (connect.reset()). The connect mutation
  // optimistically bumps item_count on success (api/finance.ts), so `connected`
  // is already true here. Gating on connect.isPending keeps "Add more"/"Connect
  // another" on the onboarding connecting screen rather than collapsing mid-popup.
  const justConnected = connect.isSuccess && connect.data?.connected === true
  const celebrate = justConnected
  const showOnboarding = !connected || celebrate || connect.isPending

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
      <Landmark className="size-5 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Finance</h1>
      <EnvBadge env={status?.env} />
      {connected && (
        <div className="ml-auto flex items-center gap-2">
          {summaryQuery.dataUpdatedAt > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
              {fetching ? "Syncing…" : `Updated ${relTime(summaryQuery.dataUpdatedAt)}`}
            </span>
          )}
          <Button variant="ghost" size="iconSm" onClick={refresh} disabled={fetching} title="Refresh data" aria-label="Refresh finance data">
            <RefreshCw className={cn("size-4", fetching && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => ask()}>
            <MessageCircle className="size-4" />Ask your assistant
          </Button>
          <Button size="sm" disabled={connect.isPending} onClick={() => connect.mutate()}>
            {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Connect another
          </Button>
        </div>
      )}
    </header>
  )

  let body: React.ReactNode
  if (statusLoading) {
    body = <div className="p-4 lg:p-6"><SkeletonList rows={4} /></div>
  } else if (showOnboarding) {
    body = <FinanceOnboarding isAdmin={isAdmin} status={status} connect={connect} celebrate={celebrate} items={items} pending={summary?.pending} />
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                tab === id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {label}
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => ask(TAB_QUESTION[tab])}>
            <Sparkles className="size-4" />Ask about this
          </Button>
        </div>

        {tab === "overview" && (summary ? <Overview summary={summary} cashflow={cashflow} cashflowError={cashflowError} networth={networth} networthError={networthError} /> : <SkeletonList rows={4} />)}
        {tab === "spending" && <SpendingTab cashflow={cashflow} cashflowError={cashflowError} />}
        {tab === "bills" && <BillsTabWrap />}
        {tab === "accounts" && (
          <div className="space-y-6">
            <AccountsTabWrap />
            {!!items?.length && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected institutions</h2>
                <InstitutionList
                  items={items}
                  pending={summary?.pending}
                  renderTrailing={(it) => (
                    <button onClick={() => setToDisconnect(it)} title="Disconnect" aria-label={`Disconnect ${it.institution_name || "institution"}`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                />
              </section>
            )}
          </div>
        )}
        {tab === "investments" && <InvestmentsTab />}

        <FinanceDisclaimer />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {body}
      <Dialog open={!!toDisconnect} onClose={() => setToDisconnect(null)} label="Disconnect institution" className="max-w-sm">
        <DialogHeader title={`Disconnect ${toDisconnect?.institution_name || "institution"}?`} onClose={() => setToDisconnect(null)} />
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            This removes the connection and deletes its stored data from Odysseus. Your bank login and accounts are not affected — you can reconnect any time.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setToDisconnect(null)}>Cancel</Button>
          <Button variant="destructive" disabled={removeItem.isPending}
            onClick={() => { if (toDisconnect) removeItem.mutate(toDisconnect.id, { onSuccess: () => setToDisconnect(null) }) }}>
            {removeItem.isPending && <Loader2 className="size-4 animate-spin" />}Disconnect
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

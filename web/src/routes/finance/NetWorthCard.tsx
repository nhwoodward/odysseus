import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card } from "@/components/ui/card"
import { money, type FinanceSummary, type NetWorthHistory } from "@/api/finance"
import { cn } from "@/lib/utils"

// Net-worth over time (Phase 1) — the signature pattern from Monarch / Copilot /
// Rocket Money. Plaid only returns *current* balances, so the series is the daily
// snapshots accumulated forward (see src/finance_service.record_snapshot); with
// <2 points we show the live figure + an honest "accumulating" hint.

const RANGES = [
  { key: "1M", days: 30 }, { key: "3M", days: 90 }, { key: "6M", days: 180 },
  { key: "YTD", days: 0 }, { key: "1Y", days: 365 }, { key: "ALL", days: Infinity },
] as const
type RangeKey = (typeof RANGES)[number]["key"]

const chartConfig = { net_worth: { label: "Net worth", color: "var(--chart-1)" } } satisfies ChartConfig

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const fmtAxis = (day: string) => {
  const [y, m, dd] = day.split("-")
  const d = new Date(Number(y), Number(m) - 1, Number(dd))
  return isNaN(d.getTime()) ? day : d.toLocaleString("en-US", { month: "short", day: "numeric" })
}

export function NetWorthCard({ summary, history, error }: { summary: FinanceSummary; history?: NetWorthHistory; error?: boolean }) {
  const [range, setRange] = useState<RangeKey>("3M")
  const current = summary.net_worth

  // Merge the live current net worth in as today's point so the hero + chart are
  // always present even before today's snapshot is persisted (summary() writes it,
  // but the /networth read can race ahead of that write on the very first load).
  const series = useMemo(() => {
    const pts = (history?.points ?? []).map((p) => ({ day: p.day, net_worth: p.net_worth }))
    const todayKey = localDayKey(new Date())
    const last = pts[pts.length - 1]
    if (last && last.day === todayKey) last.net_worth = current
    else pts.push({ day: todayKey, net_worth: current })
    return pts
  }, [history, current])

  const filtered = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!
    if (r.days === Infinity) return series
    const cutoff =
      r.key === "YTD" ? `${new Date().getFullYear()}-01-01` : (() => { const c = new Date(); c.setDate(c.getDate() - r.days); return localDayKey(c) })()
    const inRange = series.filter((p) => p.day >= cutoff)
    return inRange.length ? inRange : series.slice(-1) // never empty
  }, [series, range])

  const first = filtered[0]?.net_worth ?? current
  const lastV = filtered[filtered.length - 1]?.net_worth ?? current
  const delta = lastV - first
  const pct = first !== 0 ? (delta / Math.abs(first)) * 100 : null
  const noChart = error || series.length < 2

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Net worth</div>
          <div className="text-3xl font-semibold tabular-nums">{money(current)}</div>
          {!noChart && (
            <div className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm font-medium tabular-nums",
              delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              <span className="whitespace-nowrap">{delta >= 0 ? "▲" : "▼"} {money(Math.abs(delta))}</span>
              {pct != null && <span className="whitespace-nowrap text-muted-foreground">({delta >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(1)}%)</span>}
              <span className="text-muted-foreground">· {range}</span>
            </div>
          )}
        </div>
        {!noChart && (
          <div className="flex rounded-lg bg-muted p-0.5 text-xs">
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={range === r.key}
                className={cn("rounded-md px-2 py-1 font-medium transition-colors",
                  range === r.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {r.key}
              </button>
            ))}
          </div>
        )}
      </div>

      {noChart ? (
        <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {error
            ? "Couldn't load your net-worth history right now."
            : "Building your net-worth history — check back tomorrow. We capture a point each day you open Finance."}
        </p>
      ) : (
        <ChartContainer config={chartConfig} className="mt-3 h-[200px] w-full">
          <AreaChart data={filtered} margin={{ left: 4, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-net_worth)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-net_worth)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="day" tickFormatter={fmtAxis} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} minTickGap={32} />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => fmtAxis(String(v))} formatter={(val) => <span className="font-medium tabular-nums">{money(Number(val))}</span>} />} />
            <Area dataKey="net_worth" type="monotone" stroke="var(--color-net_worth)" strokeWidth={2} fill="url(#nwfill)" baseValue="dataMin" />
          </AreaChart>
        </ChartContainer>
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
        <span>Assets <span className="font-medium tabular-nums text-foreground">{money(summary.assets)}</span></span>
        <span>Liabilities <span className="font-medium tabular-nums text-foreground">{money(summary.liabilities)}</span></span>
        <span>Investments <span className="font-medium tabular-nums text-foreground">{money(summary.investments_value)}</span></span>
      </div>
    </Card>
  )
}

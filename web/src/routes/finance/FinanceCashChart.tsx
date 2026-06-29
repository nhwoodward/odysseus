import { useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { money, type FinanceCashflow } from "@/api/finance"

const chartConfig = {
  income: { label: "Income", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-1)" },
} satisfies ChartConfig

const fmtMonth = (ym: string, withYear: boolean) => {
  const [y, m] = ym.split("-")
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleString("en-US", withYear ? { month: "short", year: "2-digit" } : { month: "short" })
}

const RANGES = [{ key: "6", label: "6M" }, { key: "12", label: "12M" }, { key: "all", label: "All" }] as const
type RangeKey = (typeof RANGES)[number]["key"]

// The dashboard-01 interactive area chart, on the monthly cash-flow series:
// income vs. spending as gradient areas, with a 6M / 12M / All time-range toggle.
export function FinanceCashChart({ data }: { data: FinanceCashflow }) {
  const [range, setRange] = useState<RangeKey>("12")
  const months = range === "all" ? data.months : data.months.slice(-Number(range))
  // Disambiguate the month labels with a year only when the window spans >1 year.
  const multiYear = new Set(months.map((m) => m.month.slice(0, 4))).size > 1
  const rows = months.map((m) => ({ month: fmtMonth(m.month, multiYear), income: Math.round(m.income), expenses: Math.round(m.expenses) }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash flow</CardTitle>
        <CardDescription>Income vs. spending over time</CardDescription>
        <CardAction>
          <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as RangeKey)} variant="outline" size="sm">
            {RANGES.map((r) => <ToggleGroupItem key={r.key} value={r.key} aria-label={`Last ${r.label}`}>{r.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No cash-flow history yet.</div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={rows} margin={{ left: 12, right: 12 }}>
              <defs>
                <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-income)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-income)" stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-expenses)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--color-expenses)" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
                <div className="flex w-full items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--color-${name})` }} />
                  <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
                  <span className="ml-auto font-medium tabular-nums text-foreground">{money(Number(value))}</span>
                </div>
              )} />} />
              <Area dataKey="income" type="natural" fill="url(#fillIncome)" stroke="var(--color-income)" strokeWidth={2} />
              <Area dataKey="expenses" type="natural" fill="url(#fillExpenses)" stroke="var(--color-expenses)" strokeWidth={2} />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

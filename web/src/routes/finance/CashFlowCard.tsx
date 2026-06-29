import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart"
import { Card } from "@/components/ui/card"
import { money, type FinanceCashflow } from "@/api/finance"
import { cn } from "@/lib/utils"

const chartConfig = {
  Income: { label: "Income", color: "var(--chart-2)" },
  Expenses: { label: "Expenses", color: "var(--chart-1)" },
} satisfies ChartConfig

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "short" })
}

// Income / Expenses / Left triad + 3-month bars + a plain-language MoM line —
// the cash-flow pattern from Rocket Money / Buddy, on the existing transactions.
export function CashFlowCard({ data }: { data: FinanceCashflow }) {
  const tm = data.this_month
  const bars = data.months.map((m) => ({ month: fmtMonth(m.month), Income: Math.round(m.income), Expenses: Math.round(m.expenses) }))
  const parts: string[] = []
  if (Math.abs(data.income_mom) >= 1) parts.push(`earned ${money(Math.abs(data.income_mom))} ${data.income_mom >= 0 ? "more" : "less"}`)
  if (Math.abs(data.expense_mom) >= 1) parts.push(`spent ${money(Math.abs(data.expense_mom))} ${data.expense_mom >= 0 ? "more" : "less"}`)

  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-medium">Cash flow · this month</div>
      <div className="grid grid-cols-3 gap-3 pt-1">
        <div>
          <div className="text-xs text-muted-foreground">Income</div>
          <div className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(tm.income)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Expenses</div>
          <div className="text-xl font-semibold tabular-nums">{money(tm.expenses)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Left</div>
          <div className={cn("text-xl font-semibold tabular-nums", tm.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {tm.net >= 0 ? "+" : ""}{money(tm.net)}
          </div>
        </div>
      </div>
      {bars.length > 0 && (
        <ChartContainer config={chartConfig} className="mt-3 h-[170px] w-full">
          <BarChart data={bars} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="Income" radius={[3, 3, 0, 0]} fill="var(--color-Income)" />
            <Bar dataKey="Expenses" radius={[3, 3, 0, 0]} fill="var(--color-Expenses)" />
          </BarChart>
        </ChartContainer>
      )}
      {parts.length > 0 && <p className="mt-2 text-sm text-muted-foreground">This month you {parts.join(" and ")} than last month.</p>}
      {data.pending && <p className="mt-2 text-xs text-muted-foreground">Plaid is still preparing some transactions — numbers will fill in shortly.</p>}
    </Card>
  )
}

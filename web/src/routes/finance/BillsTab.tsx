import { useMemo } from "react"
import { CalendarClock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { money, type Subscription } from "@/api/finance"
import { prettyCat, annualize } from "./util"
import { Monogram } from "./Monogram"
import { cn } from "@/lib/utils"

const MS_DAY = 86_400_000
const parseDate = (s?: string) => (s ? new Date(s + "T00:00:00") : null)
const DOW = ["S", "M", "T", "W", "T", "F", "S"]

// Rocket-Money-style recurring surface: an upcoming-charges calendar, a countdown
// list, and everything grouped by category with annualized totals — all from the
// existing Plaid recurring data (predicted_next_date / frequency / average_amount).
export function BillsTab({ subscriptions, monthlyTotal }: { subscriptions: Subscription[]; monthlyTotal: number }) {
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])

  const { calendar, dueThisMonth, upcoming, groups, monthName } = useMemo(() => {
    const year = today.getFullYear(), month = today.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const chargeDays = new Set<number>()
    let due = 0
    for (const s of subscriptions) {
      const d = parseDate(s.predicted_next_date)
      // Only count charges still ahead this month, so the "due" total + dots match
      // the "Coming later" list (both forward-looking) and stale past dates don't count.
      if (d && d.getFullYear() === year && d.getMonth() === month && d.getTime() >= today.getTime()) {
        chargeDays.add(d.getDate()); due += s.average_amount || 0
      }
    }
    const cells: { day: number | null; charge: boolean; isToday: boolean }[] = []
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, charge: false, isToday: false })
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, charge: chargeDays.has(d), isToday: d === today.getDate() })

    const up = subscriptions
      .map((s) => ({ s, d: parseDate(s.predicted_next_date) }))
      .filter((x): x is { s: Subscription; d: Date } => !!x.d && x.d.getTime() >= today.getTime())
      .sort((a, b) => a.d.getTime() - b.d.getTime())
      .slice(0, 6)
      .map(({ s, d }) => ({ s, days: Math.round((d.getTime() - today.getTime()) / MS_DAY), date: d }))

    const byCat: Record<string, { items: Subscription[]; annual: number }> = {}
    for (const s of subscriptions) {
      const k = prettyCat(s.category) || "Other"
      const g = byCat[k] || (byCat[k] = { items: [], annual: 0 })
      g.items.push(s); g.annual += annualize(s.average_amount, s.frequency)
    }
    return {
      calendar: cells, dueThisMonth: due, upcoming: up,
      groups: Object.entries(byCat).sort((a, b) => b[1].annual - a[1].annual),
      monthName: today.toLocaleString("en-US", { month: "long" }),
    }
  }, [subscriptions, today])

  if (!subscriptions.length) {
    return <EmptyState icon={CalendarClock} title="No recurring charges yet"
      description="Once Plaid detects your subscriptions and bills, they'll appear here with a calendar of what's coming up." />
  }

  const fmtDate = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric" })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Coming up · {monthName}</div>
            <div className="text-xs text-muted-foreground">{money(dueThisMonth)} due</div>
          </div>
          {/* Decorative: the same charge data is exposed accessibly in the
              "Coming later" + "All recurring" lists below. */}
          <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden="true">
            {DOW.map((d, i) => <div key={i} className="text-center text-[10px] uppercase text-muted-foreground">{d}</div>)}
            {calendar.map((c, i) => (
              <div key={i} className={cn(
                "relative flex aspect-square items-center justify-center rounded-md text-xs",
                c.day == null ? "" : "border border-border bg-card",
                c.charge ? "text-foreground" : "text-muted-foreground",
                c.isToday && "border-foreground font-semibold text-foreground")}>
                {c.day}
                {c.charge && <span className="absolute bottom-1 size-1.5 rounded-full bg-amber-500" />}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium">Coming later</div>
          <div className="mt-3 space-y-2">
            {upcoming.length ? upcoming.map(({ s, days, date }, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <Monogram name={s.description} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.description || "Recurring"}</div>
                  <div className="text-xs text-muted-foreground">{days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} · {fmtDate(date)}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{money(s.average_amount)}</div>
              </div>
            )) : <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">All recurring</div>
          <Badge variant="secondary">{money(monthlyTotal)}/mo</Badge>
        </div>
        {groups.map(([cat, g]) => (
          <section key={cat} className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{cat}</span><span>{money(g.annual)}/yr</span>
            </div>
            <div className="space-y-1.5">
              {g.items.map((s, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <Monogram name={s.description} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.description || "Recurring"}</div>
                    <div className="text-xs capitalize text-muted-foreground">{(s.frequency || "").toLowerCase().replace(/_/g, " ") || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">{money(s.average_amount)}</div>
                    <div className="text-[11px] text-muted-foreground">{money(annualize(s.average_amount, s.frequency))}/yr</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </Card>
    </div>
  )
}

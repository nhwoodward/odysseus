// Shared finance presentation helpers (kept out of FinanceRoute so the new
// Phase-0 surfaces and the route agree on category colours + labels).
export const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export const prettyCat = (s?: string) =>
  (s || "OTHER").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

// Format a Plaid date ("YYYY-MM-DD") or ISO date as a short "Jun 20". YYYY-MM-DD
// is parsed as a LOCAL date (not UTC) so the day doesn't shift back one in
// negative-offset timezones. Falls back to the raw string if unparseable.
// One shared DateTimeFormat — fmtDay is called per transaction row and the feed
// re-renders on every search keystroke, so don't rebuild a formatter each call.
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
export const fmtDay = (s?: string | null): string => {
  if (!s) return "—"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s)
  return isNaN(d.getTime()) ? s : dayFmt.format(d)
}

// Short relative-time label ("just now" / "5m ago") for the dashboard's
// last-synced indicator. Derived from a React Query `dataUpdatedAt` timestamp.
export const relTime = (ms?: number): string => {
  if (!ms) return ""
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

// Recurring-stream frequency → charges per year, for annualized totals.
export const FREQ_PER_YEAR: Record<string, number> = {
  WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12, ANNUALLY: 1,
}
export const annualize = (amount?: number | null, frequency?: string) =>
  (amount || 0) * (FREQ_PER_YEAR[(frequency || "MONTHLY").toUpperCase()] ?? 12)

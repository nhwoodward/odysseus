import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { NetWorthCard } from "./NetWorthCard"
import type { FinanceSummary, NetWorthHistory } from "@/api/finance"

afterEach(cleanup)

const summary: FinanceSummary = {
  net_worth: -77748, assets: 112924, liabilities: 190673, accounts_count: 5,
  spending_30d_total: 0, spending_by_category: [], subscriptions_count: 0,
  subscriptions_monthly: 0, investments_value: 8456, investments_allocation: {}, pending: false,
}

// Build a local YYYY-MM-DD for N days ago (mirrors the component's localDayKey).
const pad = (n: number) => String(n).padStart(2, "0")
const dayAgo = (n: number) => {
  const x = new Date(); x.setDate(x.getDate() - n)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
const pt = (day: string, net_worth: number) => ({ day, net_worth, assets: 0, liabilities: 0 })

describe("NetWorthCard", () => {
  it("shows the live figure + 'building' hint and no range tabs with <2 points", () => {
    render(<NetWorthCard summary={summary} history={{ points: [] }} />)
    expect(screen.getByText("-$77,748")).toBeInTheDocument()
    expect(screen.getByText(/Building your net-worth history/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "ALL" })).toBeNull()
    // assets/liabilities/investments footer is always present
    expect(screen.getByText("$112,924")).toBeInTheDocument()
  })

  it("shows the error hint when the history failed to load", () => {
    render(<NetWorthCard summary={summary} history={undefined} error />)
    expect(screen.getByText(/Couldn't load your net-worth history/i)).toBeInTheDocument()
  })

  it("renders the trend + delta vs the range start, and re-filters on range change", () => {
    const history: NetWorthHistory = { points: [pt(dayAgo(40), -90000), pt(dayAgo(10), -85000)] }
    render(<NetWorthCard summary={summary} history={history} />)
    // default 3M includes both stored points + today's live point:
    // delta = -77748 − (−90000) = +12,252
    expect(screen.getByText(/\$12,252/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "ALL" })).toBeInTheDocument()

    // 1M (30d) drops the 40-day-old point → delta = -77748 − (−85000) = +7,252
    fireEvent.click(screen.getByRole("button", { name: "1M" }))
    expect(screen.getByText(/\$7,252/)).toBeInTheDocument()
  })
})

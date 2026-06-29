import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { CashFlowCard } from "./CashFlowCard"
import type { FinanceCashflow } from "@/api/finance"

afterEach(cleanup)

const cf: FinanceCashflow = {
  months: [
    { month: "2026-04", income: 8000, expenses: 9000, net: -1000 },
    { month: "2026-05", income: 10000, expenses: 11000, net: -1000 },
    { month: "2026-06", income: 11000, expenses: 11900, net: -900 },
  ],
  categories: [],
  this_month: { income: 11000, expenses: 11900, net: -900 },
  income_mom: 1000, expense_mom: 900, pending: false,
}

describe("CashFlowCard", () => {
  it("shows the income / expenses / left triad and the MoM narrative", () => {
    render(<CashFlowCard data={cf} />)
    expect(screen.getByText("$11,000")).toBeInTheDocument() // income
    expect(screen.getByText("$11,900")).toBeInTheDocument() // expenses
    expect(screen.getByText("-$900")).toBeInTheDocument() // left (net negative)
    expect(screen.getByText(/earned .*more and spent .*more than last month/i)).toBeInTheDocument()
  })
})

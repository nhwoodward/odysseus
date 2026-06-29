import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { FinanceTransactionsTable } from "./FinanceTransactionsTable"
import type { Txn } from "@/api/finance"

afterEach(cleanup)

const txns: Txn[] = [
  { date: "2026-06-20", name: "Apple Store", amount: 129, category: "GENERAL_MERCHANDISE" },
  { date: "2026-06-19", name: "Payroll", amount: -4120, category: "INCOME" },
  { date: "2026-06-18", name: "Whole Foods", amount: 86.4, category: "FOOD_AND_DRINK" },
]

describe("FinanceTransactionsTable", () => {
  it("flips Plaid's sign — outflows read negative, inflows positive", () => {
    render(<FinanceTransactionsTable transactions={txns} />)
    expect(screen.getByText("Apple Store")).toBeInTheDocument()
    expect(screen.getByText("-$129")).toBeInTheDocument() // outflow (Plaid +129) shown negative
    expect(screen.getByText("+$4,120")).toBeInTheDocument() // inflow (Plaid -4120) shown +green
  })

  it("filters by search query", () => {
    render(<FinanceTransactionsTable transactions={txns} />)
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "apple" } })
    expect(screen.getByText("Apple Store")).toBeInTheDocument()
    expect(screen.queryByText("Whole Foods")).toBeNull()
  })

  it("filters by category chip", () => {
    render(<FinanceTransactionsTable transactions={txns} />)
    fireEvent.click(screen.getByRole("button", { name: "Income" }))
    expect(screen.getByText("Payroll")).toBeInTheDocument()
    expect(screen.queryByText("Apple Store")).toBeNull()
  })

  it("shows an empty message when nothing matches", () => {
    render(<FinanceTransactionsTable transactions={txns} />)
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "zzzzz" } })
    expect(screen.getByText(/No matching transactions/i)).toBeInTheDocument()
  })

  it("formats dates as 'Jun 20', not raw ISO", () => {
    render(<FinanceTransactionsTable transactions={txns} />)
    expect(screen.getByText("Jun 20")).toBeInTheDocument()
    expect(screen.queryByText("2026-06-20")).toBeNull()
  })

  it("paginates at 25 rows per page", () => {
    const many: Txn[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`, name: `Txn ${i}`, amount: 10 + i, category: "FOOD_AND_DRINK",
    }))
    render(<FinanceTransactionsTable transactions={many} />)
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()
    expect(screen.getByText(/30 transactions/)).toBeInTheDocument()
    expect(screen.getByLabelText("Next page")).not.toBeDisabled()
    expect(screen.getByLabelText("Previous page")).toBeDisabled()
  })
})

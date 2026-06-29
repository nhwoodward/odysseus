import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { TransactionsFeed } from "./TransactionsFeed"
import type { Txn } from "@/api/finance"

afterEach(cleanup)

const txns: Txn[] = [
  { date: "2026-06-20", name: "Apple Store", amount: 129, category: "GENERAL_MERCHANDISE" },
  { date: "2026-06-19", name: "Payroll", amount: -4120, category: "INCOME" },
  { date: "2026-06-18", name: "Whole Foods", amount: 86.4, category: "FOOD_AND_DRINK" },
]

describe("TransactionsFeed", () => {
  it("flips Plaid's sign — outflows read negative, inflows positive", () => {
    render(<TransactionsFeed transactions={txns} />)
    expect(screen.getByText("Apple Store")).toBeInTheDocument()
    expect(screen.getByText("-$129")).toBeInTheDocument() // outflow (amount 129) shown negative
    expect(screen.getByText("$4,120")).toBeInTheDocument() // inflow (amount -4120) shown positive
  })

  it("filters by search query", () => {
    render(<TransactionsFeed transactions={txns} />)
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "apple" } })
    expect(screen.getByText("Apple Store")).toBeInTheDocument()
    expect(screen.queryByText("Whole Foods")).toBeNull()
  })

  it("filters by category chip", () => {
    render(<TransactionsFeed transactions={txns} />)
    fireEvent.click(screen.getByRole("button", { name: "Income" }))
    expect(screen.getByText("Payroll")).toBeInTheDocument()
    expect(screen.queryByText("Apple Store")).toBeNull()
  })

  it("shows an empty message when nothing matches", () => {
    render(<TransactionsFeed transactions={txns} />)
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "zzzzz" } })
    expect(screen.getByText(/No matching transactions/i)).toBeInTheDocument()
  })

  it("formats dates as 'Jun 20', not raw ISO", () => {
    render(<TransactionsFeed transactions={txns} />)
    expect(screen.getByText("Jun 20")).toBeInTheDocument()
    expect(screen.queryByText("2026-06-20")).toBeNull()
  })
})

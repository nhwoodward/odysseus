import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { BillsTab } from "./BillsTab"
import type { Subscription } from "@/api/finance"

afterEach(cleanup)

// Far-future dates so they're always "upcoming" regardless of when tests run.
const subs: Subscription[] = [
  { description: "Netflix", frequency: "MONTHLY", average_amount: 15.49, predicted_next_date: "2099-01-15", category: "ENTERTAINMENT" },
  { description: "USAA Insurance", frequency: "MONTHLY", average_amount: 142, predicted_next_date: "2099-01-20", category: "INSURANCE" },
]

describe("BillsTab", () => {
  it("groups recurring by category with the monthly total badge", () => {
    render(<BillsTab subscriptions={subs} monthlyTotal={157.49} />)
    expect(screen.getAllByText("Netflix").length).toBeGreaterThan(0)
    expect(screen.getAllByText("USAA Insurance").length).toBeGreaterThan(0)
    // category group headers (prettified)
    expect(screen.getByText("Entertainment")).toBeInTheDocument()
    expect(screen.getByText("Insurance")).toBeInTheDocument()
    // monthly total badge ($157/mo) — money() rounds to whole dollars
    expect(screen.getByText("$157/mo")).toBeInTheDocument()
  })

  it("shows an empty state with no subscriptions", () => {
    render(<BillsTab subscriptions={[]} monthlyTotal={0} />)
    expect(screen.getByText(/No recurring charges yet/i)).toBeInTheDocument()
  })
})

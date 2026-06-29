import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { AccountsTab } from "./AccountsTab"
import type { Balances } from "@/api/finance"

afterEach(cleanup)

const balances: Balances = {
  accounts: [
    { account_id: "1", name: "USAA Checking", type: "depository", subtype: "checking", kind: "asset", current: 3420, mask: "3420", institution: "USAA" },
    { account_id: "2", name: "Fidelity Brokerage", type: "investment", kind: "asset", current: 98200, institution: "Fidelity" },
    { account_id: "3", name: "Capital One Venture", type: "credit", kind: "liability", current: 1240, mask: "5512", institution: "Capital One" },
  ],
  assets: 101620, liabilities: 1240, net_worth: 100380, errors: [],
}

describe("AccountsTab", () => {
  it("groups accounts by type and shows % of assets for asset groups", () => {
    render(<AccountsTab balances={balances} />)
    expect(screen.getByText("Cash")).toBeInTheDocument()
    expect(screen.getByText("Investments")).toBeInTheDocument()
    expect(screen.getByText("Credit")).toBeInTheDocument()
    expect(screen.getByText("USAA Checking")).toBeInTheDocument()
    expect(screen.getByText("Fidelity Brokerage")).toBeInTheDocument()
    expect(screen.getByText("Capital One Venture")).toBeInTheDocument()
    expect(screen.getAllByText(/% of assets/).length).toBeGreaterThan(0)
  })

  it("renders an empty state with no accounts", () => {
    render(<AccountsTab balances={{ accounts: [], assets: 0, liabilities: 0, net_worth: 0, errors: [] }} />)
    expect(screen.getByText(/No accounts/i)).toBeInTheDocument()
  })
})

import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { InstitutionList } from "./InstitutionList"
import type { PlaidItemInfo } from "@/api/finance"

afterEach(cleanup)

const item = (over: Partial<PlaidItemInfo> = {}): PlaidItemInfo => ({
  id: "1", item_id: "it_1", institution_name: "Chase", accounts: [{}, {}], status: "active", ...over,
})

describe("InstitutionList", () => {
  it("renders a monogram, name and account count", () => {
    render(<InstitutionList items={[item()]} />)
    expect(screen.getByText("Chase")).toBeInTheDocument()
    expect(screen.getByText("2 accounts")).toBeInTheDocument()
    expect(screen.getByText("C")).toBeInTheDocument() // first-letter monogram
  })

  it("singularizes a one-account institution", () => {
    render(<InstitutionList items={[item({ accounts: [{}] })]} />)
    expect(screen.getByText("1 account")).toBeInTheDocument()
  })

  it("shows Synced when not pending and no error", () => {
    render(<InstitutionList items={[item()]} pending={false} />)
    expect(screen.getByText("Synced")).toBeInTheDocument()
    expect(screen.queryByText("Syncing")).toBeNull()
  })

  it("shows a neutral Checking… (not a definitive Synced) while the global pending flag is unknown", () => {
    render(<InstitutionList items={[item()]} />) // pending undefined: summary query not resolved yet
    expect(screen.getByText("Checking…")).toBeInTheDocument()
    expect(screen.queryByText("Synced")).toBeNull()
  })

  it("derives list-level Syncing from the global pending flag and shows the analyzing note", () => {
    render(<InstitutionList items={[item(), item({ id: "2", institution_name: "Amex" })]} pending />)
    expect(screen.getAllByText("Syncing")).toHaveLength(2) // every active row flips together
    expect(screen.getByText(/Analyzing accounts can take several minutes/i)).toBeInTheDocument()
  })

  it("renders the defensive Needs attention state when an item carries an error", () => {
    render(<InstitutionList items={[item({ error: "ITEM_LOGIN_REQUIRED" })]} pending />)
    expect(screen.getByText("Needs attention")).toBeInTheDocument()
    expect(screen.queryByText("Syncing")).toBeNull() // error wins over pending
  })

  it("renders nothing for an empty list", () => {
    const { container } = render(<InstitutionList items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders a trailing slot when provided", () => {
    render(<InstitutionList items={[item()]} renderTrailing={() => <button>Disconnect</button>} />)
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument()
  })
})

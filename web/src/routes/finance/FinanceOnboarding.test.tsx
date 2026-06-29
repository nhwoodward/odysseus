import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ComponentProps } from "react"
import { afterEach, describe, it, expect, vi } from "vitest"

// FinanceOnboarding is now purely consumer (no key entry); it takes `connect` as
// a prop, so we only need PopupBlockedError + a stub useFinanceMutations.
vi.mock("@/api/finance", () => {
  class PopupBlockedError extends Error {
    constructor() { super("Your browser blocked the Plaid window."); this.name = "PopupBlockedError" }
  }
  return {
    PopupBlockedError,
    useFinanceMutations: () => ({ connect: {}, removeItem: { mutate: vi.fn(), isPending: false } }),
  }
})

import { FinanceOnboarding, EnvBadge } from "./FinanceOnboarding"
import type { FinanceStatus, PlaidItemInfo } from "@/api/finance"

type Props = ComponentProps<typeof FinanceOnboarding>

afterEach(cleanup)

const idleConnect = (over: Record<string, unknown> = {}): Props["connect"] =>
  ({ isPending: false, isSuccess: false, isError: false, data: undefined, error: null, mutate: vi.fn(), reset: vi.fn(), ...over }) as unknown as Props["connect"]

const status = (over: Partial<FinanceStatus> = {}): FinanceStatus =>
  ({ configured: true, env: "production", item_count: 0, ...over })

function renderOnboarding(props: Partial<Props>) {
  const merged: Props = { isAdmin: false, status: status(), connect: idleConnect(), celebrate: false, ...props }
  return render(<MemoryRouter><FinanceOnboarding {...merged} /></MemoryRouter>)
}

describe("FinanceOnboarding — Get started intro", () => {
  it("shows the benefit-led intro, the disclaimer, and no key/env fields", () => {
    renderOnboarding({ status: status({ configured: true }) })
    expect(screen.getByRole("heading", { name: /personalized financial insights/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Get started/i })).toBeInTheDocument()
    expect(screen.getByText(/not a licensed investment/i)).toBeInTheDocument()
    expect(screen.queryByText(/Client ID/i)).toBeNull() // no developer key entry in the consumer flow
  })

  it("advances to the Connect Finances step with the three disclosures on Get started", async () => {
    renderOnboarding({ status: status({ configured: true }) })
    fireEvent.click(screen.getByRole("button", { name: /Get started/i }))
    expect(await screen.findByRole("button", { name: /Connect with Plaid/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Connect your accounts/i })).toBeInTheDocument()
    expect(screen.getByText(/Private and secure/)).toBeInTheDocument()
    expect(screen.getByText(/You're in control of your data/)).toBeInTheDocument()
    expect(screen.getByText(/Information only/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", expect.stringContaining("plaid.com/legal"))
  })
})

describe("FinanceOnboarding — not set up", () => {
  it("admin gets a one-tap jump to Settings", () => {
    renderOnboarding({ isAdmin: true, status: status({ configured: false }) })
    expect(screen.getByRole("heading", { name: /isn.t set up yet/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open Settings/i })).toBeInTheDocument()
  })

  it("non-admin is told to ask their administrator (no Settings button)", () => {
    renderOnboarding({ isAdmin: false, status: status({ configured: false }) })
    expect(screen.getByText(/administrator needs to connect Plaid/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Open Settings/i })).toBeNull()
  })
})

describe("FinanceOnboarding — success hub", () => {
  const items: PlaidItemInfo[] = [{ id: "1", item_id: "it1", institution_name: "Chase", accounts: [{}], status: "active" }]

  it("shows connected institutions, starter questions and actions", () => {
    renderOnboarding({ celebrate: true, status: status({ item_count: 1 }), items, pending: false })
    expect(screen.getByRole("heading", { name: /your accounts are connected/i })).toBeInTheDocument()
    expect(screen.getByText("Chase")).toBeInTheDocument()
    expect(screen.getByText(/net worth/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /View dashboard/i })).toBeInTheDocument()
  })

  it("View dashboard resets the mutation; Add more re-triggers connect", () => {
    const connect = idleConnect()
    renderOnboarding({ celebrate: true, status: status({ item_count: 1 }), items, connect })
    fireEvent.click(screen.getByRole("button", { name: /View dashboard/i }))
    expect((connect as unknown as { reset: ReturnType<typeof vi.fn> }).reset).toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Add more/i }))
    expect((connect as unknown as { mutate: ReturnType<typeof vi.fn> }).mutate).toHaveBeenCalled()
  })
})

describe("EnvBadge", () => {
  it("hides entirely in production", () => {
    const { container } = render(<EnvBadge env="production" />)
    expect(container).toBeEmptyDOMElement()
  })
  it("shows an amber test hint in sandbox", () => {
    render(<EnvBadge env="sandbox" />)
    expect(screen.getByText("Sandbox · test")).toBeInTheDocument()
  })
  it("renders nothing when env is absent", () => {
    const { container } = render(<EnvBadge />)
    expect(container).toBeEmptyDOMElement()
  })
})

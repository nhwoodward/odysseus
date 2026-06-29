import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"

// Mutable mock state via vi.hoisted so the (hoisted) vi.mock factories can read it.
const h = vi.hoisted(() => ({
  isAdmin: true,
  saveMutate: vi.fn(),
  cfg: { configured: false, env: "production", client_id: "", has_secret: false, source: "none" } as Record<string, unknown>,
}))

vi.mock("@/api/auth", () => ({ useAuthStatus: () => ({ data: { is_admin: h.isAdmin } }) }))
vi.mock("@/api/finance", () => ({
  useFinanceConfig: () => ({ data: h.cfg }),
  useSaveFinanceConfig: () => ({ mutate: h.saveMutate, isPending: false, isSuccess: false, isError: false, error: null }),
}))

import { FinancePlaidSection } from "./FinancePlaidSection"

afterEach(() => { cleanup(); h.saveMutate.mockClear(); h.isAdmin = true })

describe("FinancePlaidSection", () => {
  it("renders the admin Plaid key form (production by default, sandbox hidden)", () => {
    render(<FinancePlaidSection />)
    expect(screen.getByText(/Finance \(Plaid\)/i)).toBeInTheDocument()
    expect(screen.getByText("Client ID")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Get free keys/i })).toBeInTheDocument()
    // Sandbox is tucked behind an advanced reveal, not shown by default.
    expect(screen.queryByText("Sandbox · test")).toBeNull()
    expect(screen.getByText(/Use sandbox \(test mode\) instead/i)).toBeInTheDocument()
  })

  it("renders nothing for non-admins", () => {
    h.isAdmin = false
    const { container } = render(<FinancePlaidSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it("saves entered keys with the default production env", () => {
    render(<FinancePlaidSection />)
    fireEvent.change(screen.getByPlaceholderText(/5f9a2b/), { target: { value: "cid123" } })
    fireEvent.change(screen.getByPlaceholderText(/Your Plaid secret/i), { target: { value: "sec123" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(h.saveMutate).toHaveBeenCalledWith({ client_id: "cid123", env: "production", secret: "sec123" })
  })

  it("reveals the sandbox toggle on demand", () => {
    render(<FinancePlaidSection />)
    fireEvent.click(screen.getByText(/Use sandbox \(test mode\) instead/i))
    expect(screen.getByRole("radio", { name: /Sandbox/i })).toBeInTheDocument()
    expect(screen.getByText(/user_good/)).toBeInTheDocument()
  })
})

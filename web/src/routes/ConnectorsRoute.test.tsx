import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"

vi.mock("@/api/connectors", () => ({
  useConnectorCatalog: () => ({
    data: {
      connectors: [
        { id: "notion", name: "Notion", description: "Notion pages", category: "Productivity", icon: "FileText", brand: "notion", featured: true, capabilities: ["read", "write"], kind: "remote", auth_type: "oauth" },
        { id: "brave", name: "Brave Search", description: "Web search", category: "Search", icon: "Search", capabilities: ["read"], kind: "local", auth_type: "api_key", fields: [{ key: "BRAVE_API_KEY", label: "Brave API key", secret: true }] },
      ],
      categories: ["Productivity", "Search"],
    },
    isLoading: false,
  }),
  useConnections: () => ({
    data: [{ id: "abc", name: "Notion", catalog_id: "notion", transport: "http", status: "connected", tool_count: 5, needs_auth: false }],
  }),
  useConnectorTools: () => ({ data: [{ server_id: "abc", name: "search_pages", is_disabled: false }] }),
  useConnectorMutations: () => ({
    connect: { mutateAsync: vi.fn(), isPending: false },
    connectCustom: { mutateAsync: vi.fn(), isPending: false },
    disconnect: { mutate: vi.fn(), isPending: false },
    setTools: { mutate: vi.fn() },
    setAvailability: { mutate: vi.fn() },
  }),
}))

import { ConnectorsRoute } from "./ConnectorsRoute"

afterEach(cleanup)

describe("ConnectorsRoute", () => {
  it("shows the directory: search, Featured-by-default, your connections", () => {
    render(<ConnectorsRoute />)
    expect(screen.getByRole("heading", { name: "Connectors" })).toBeInTheDocument()
    expect(screen.getByLabelText("Search connectors")).toBeInTheDocument()
    expect(screen.getByText("Your connections")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
    // Featured tab is the default → the featured Notion card shows (plus its
    // connection row), but the non-featured Brave Search card is hidden.
    expect(screen.getAllByText("Notion").length).toBeGreaterThan(1)
    expect(screen.queryByText("Brave Search")).toBeNull()
    expect(screen.getByRole("button", { name: "Featured" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument()
  })

  it("switches to All and groups by category", () => {
    render(<ConnectorsRoute />)
    fireEvent.click(screen.getByRole("button", { name: "All" }))
    expect(screen.getByText("Brave Search")).toBeInTheDocument()
    expect(screen.getByText("local")).toBeInTheDocument()
    expect(screen.getAllByText("Productivity").length).toBeGreaterThan(0)
  })

  it("search filters the catalog and shows matches only", () => {
    render(<ConnectorsRoute />)
    fireEvent.change(screen.getByLabelText("Search connectors"), { target: { value: "brave" } })
    expect(screen.getByText("Brave Search")).toBeInTheDocument()
    // Notion no longer has a catalog card — its card description is gone (the
    // connection row + its logo title still mention the name, which is fine).
    expect(screen.queryByText("Notion pages")).toBeNull()
  })

  it("expands a connected source to per-tool toggles", () => {
    render(<ConnectorsRoute />)
    fireEvent.click(screen.getByTitle("Manage tools"))
    expect(screen.getByText("search_pages")).toBeInTheDocument()
    expect(screen.getByRole("switch")).toBeInTheDocument()
  })
})

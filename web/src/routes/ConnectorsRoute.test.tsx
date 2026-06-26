import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"

vi.mock("@/api/connectors", () => ({
  useConnectorCatalog: () => ({
    data: {
      connectors: [
        { id: "notion", name: "Notion", description: "Notion pages", category: "Productivity", icon: "FileText", capabilities: ["read", "write"], kind: "remote", auth_type: "oauth" },
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
  it("renders the catalog gallery grouped by category + the user's connections", () => {
    render(<ConnectorsRoute />)
    expect(screen.getByRole("heading", { name: "Connectors" })).toBeInTheDocument()
    expect(screen.getByText("Your connections")).toBeInTheDocument()
    expect(screen.getByText("Productivity")).toBeInTheDocument()
    expect(screen.getByText("Brave Search")).toBeInTheDocument()
    // Notion appears both as a connection row and a catalog card
    expect(screen.getAllByText("Notion").length).toBeGreaterThan(1)
    expect(screen.getByText("Connected")).toBeInTheDocument()
    // a local connector shows the "local" badge
    expect(screen.getByText("local")).toBeInTheDocument()
  })

  it("expands a connected source to per-tool toggles", () => {
    render(<ConnectorsRoute />)
    fireEvent.click(screen.getByTitle("Manage tools"))
    expect(screen.getByText("search_pages")).toBeInTheDocument()
    expect(screen.getByRole("switch")).toBeInTheDocument()
  })
})

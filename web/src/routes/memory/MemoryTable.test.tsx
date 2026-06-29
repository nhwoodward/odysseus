import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { MemoryTable } from "./MemoryTable"
import type { Memory } from "@/types"

const stub = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false })
vi.mock("@/api/memory", () => ({
  useMemoryMutations: () => ({ add: stub(), update: stub(), remove: stub(), bulkRemove: stub(), pin: stub() }),
}))
vi.mock("@/stores/toast", () => ({ toast: vi.fn() }))

afterEach(cleanup)

const now = Math.floor(Date.now() / 1000)
const mems: Memory[] = [
  { id: "1", text: "Likes concise replies", category: "preference", source: "manual", timestamp: now - 100, uses: 5 },
  { id: "2", text: "Works at Acme", category: "fact", source: "auto", timestamp: now - 50, uses: 0, pinned: true },
  { id: "3", text: "Project Odyssey deadline", category: "project", source: "manual", timestamp: now - 10, uses: 2 },
]

describe("MemoryTable", () => {
  it("renders each memory's text", () => {
    render(<MemoryTable memories={mems} />)
    expect(screen.getByText("Likes concise replies")).toBeInTheDocument()
    expect(screen.getByText("Works at Acme")).toBeInTheDocument()
    expect(screen.getByText("Project Odyssey deadline")).toBeInTheDocument()
  })

  it("orders pinned memories first by default (even when newer rows exist)", () => {
    render(<MemoryTable memories={mems} />)
    const rows = screen.getAllByRole("row")
    // rows[0] is the header; the first data row should be the pinned memory,
    // not the newer unpinned "Project Odyssey deadline".
    expect(within(rows[1]).getByText("Works at Acme")).toBeInTheDocument()
  })

  it("filters by search query", () => {
    render(<MemoryTable memories={mems} />)
    fireEvent.change(screen.getByLabelText("Search memories"), { target: { value: "acme" } })
    expect(screen.getByText("Works at Acme")).toBeInTheDocument()
    expect(screen.queryByText("Likes concise replies")).toBeNull()
  })

  it("filters by category chip", () => {
    render(<MemoryTable memories={mems} />)
    fireEvent.click(screen.getByRole("button", { name: "project" }))
    expect(screen.getByText("Project Odyssey deadline")).toBeInTheDocument()
    expect(screen.queryByText("Works at Acme")).toBeNull()
  })

  it("shows the empty state when there are no memories", () => {
    render(<MemoryTable memories={[]} />)
    expect(screen.getByText("No memories yet")).toBeInTheDocument()
  })

  it("shows a no-match row when the filter matches nothing", () => {
    render(<MemoryTable memories={mems} />)
    fireEvent.change(screen.getByLabelText("Search memories"), { target: { value: "zzzzz" } })
    expect(screen.getByText(/No matching memories/i)).toBeInTheDocument()
  })

  it("reveals a bulk-delete bar once rows are selected", () => {
    render(<MemoryTable memories={mems} />)
    fireEvent.click(screen.getByLabelText("Select all"))
    expect(screen.getByText("3 selected")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
    // the search box yields to the selection toolbar
    expect(screen.queryByLabelText("Search memories")).toBeNull()
  })

  it("prunes the selection when a selected memory leaves the data", () => {
    const { rerender } = render(<MemoryTable memories={mems} />)
    fireEvent.click(screen.getByLabelText("Select all"))
    expect(screen.getByText("3 selected")).toBeInTheDocument()
    // A selected memory is deleted elsewhere → the data shrinks. The stale id
    // must drop out of the selection so a later bulk-delete can't 404 on it.
    rerender(<MemoryTable memories={mems.slice(0, 2)} />)
    expect(screen.getByText("2 selected")).toBeInTheDocument()
  })

  it("paginates at 25 rows per page", () => {
    const many: Memory[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i), text: `Memory ${i}`, category: "fact", source: "manual", timestamp: now - i, uses: i,
    }))
    render(<MemoryTable memories={many} />)
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()
    expect(screen.getByText(/30 memories/)).toBeInTheDocument()
    expect(screen.getByLabelText("Next page")).not.toBeDisabled()
    expect(screen.getByLabelText("Previous page")).toBeDisabled()
  })
})

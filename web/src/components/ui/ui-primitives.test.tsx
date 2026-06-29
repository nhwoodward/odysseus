import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { FolderOpen, Plus } from "lucide-react"
import { Card, CardContent, CardTitle } from "./card"
import { Input } from "./input"
import { Badge } from "./badge"
import { Skeleton, SkeletonList } from "./skeleton"
import { EmptyState } from "./empty-state"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog"

afterEach(cleanup)

describe("ui primitives", () => {
  it("Card composes header/title/content", () => {
    render(<Card><CardTitle>Hi</CardTitle><CardContent>Body</CardContent></Card>)
    expect(screen.getByText("Hi")).toBeInTheDocument()
    expect(screen.getByText("Body")).toBeInTheDocument()
  })

  it("Input forwards value + is a textbox", () => {
    render(<Input placeholder="name" defaultValue="x" />)
    expect(screen.getByPlaceholderText("name")).toHaveValue("x")
  })

  it("Badge renders text with a variant class", () => {
    render(<Badge variant="success">Connected</Badge>)
    const b = screen.getByText("Connected")
    expect(b).toBeInTheDocument()
    expect(b.className).toMatch(/emerald/)
  })

  it("Skeleton has the pulse class", () => {
    render(<Skeleton className="h-4 w-10" />)
    expect(document.querySelector(".animate-pulse")).toBeTruthy()
  })

  it("SkeletonList renders N rows under a status region", () => {
    render(<SkeletonList rows={3} />)
    const region = screen.getByRole("status")
    expect(region).toHaveAttribute("aria-busy", "true")
    expect(region.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(3)
  })

  it("EmptyState shows icon/title/description + CTA, role=status", () => {
    const onClick = vi.fn()
    render(<EmptyState icon={FolderOpen} title="No items" description="Add one" action={{ label: "Add", icon: Plus, onClick }} />)
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByText("No items")).toBeInTheDocument()
    expect(screen.getByText("Add one")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /add/i }))
    expect(onClick).toHaveBeenCalled()
  })

  it("Dialog is a labelled modal that closes on Escape", () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Test dialog</DialogTitle></DialogHeader>
          <p>content</p>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument()
    expect(screen.getByText("content")).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Dialog renders nothing when closed", () => {
    render(
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined}><DialogTitle>hidden</DialogTitle></DialogContent>
      </Dialog>,
    )
    expect(screen.queryByText("hidden")).not.toBeInTheDocument()
  })
})

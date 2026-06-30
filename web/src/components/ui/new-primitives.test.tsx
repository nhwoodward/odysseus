import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { Settings2 } from "lucide-react"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { LoadError } from "@/components/ui/load-error"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"

afterEach(cleanup)

describe("RouteHeader", () => {
  it("renders a string title as a heading + icon + actions", () => {
    render(<RouteHeader title="Memory" icon={Settings2} actions={<button>Tidy</button>} />)
    expect(screen.getByRole("heading", { name: "Memory" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tidy" })).toBeInTheDocument()
  })
  it("forwards extra props (e.g. data-tour) onto the header element", () => {
    render(<RouteHeader title="Chat" data-tour="chat-header" />)
    expect(screen.getByRole("heading", { name: "Chat" }).closest("header")).toHaveAttribute("data-tour", "chat-header")
  })
  it("renders a ReactNode title verbatim (title + subtitle)", () => {
    render(<RouteHeader title={<div><span>Library</span><span>3 documents</span></div>} />)
    expect(screen.getByText("Library")).toBeInTheDocument()
    expect(screen.getByText("3 documents")).toBeInTheDocument()
  })
})

describe("LoadError", () => {
  it("shows the failure copy + message and fires onRetry", () => {
    const onRetry = vi.fn()
    render(<LoadError message="Network down" onRetry={onRetry} />)
    expect(screen.getByText(/Couldn't load/i)).toBeInTheDocument()
    expect(screen.getByText("Network down")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it("omits the retry button when no onRetry given", () => {
    render(<LoadError />)
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull()
  })
})

describe("Field", () => {
  it("associates the label with its control via htmlFor/id", () => {
    render(
      <Field>
        <FieldLabel htmlFor="x">Name</FieldLabel>
        <input id="x" />
        <FieldDescription>Your full name</FieldDescription>
      </Field>,
    )
    expect(screen.getByText("Your full name")).toBeInTheDocument()
    // label is associated with the control via htmlFor → id (jsdom doesn't
    // implement label-click focus, so assert the association directly).
    expect(screen.getByText("Name")).toHaveAttribute("for", "x")
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "x")
  })
})

describe("Checkbox / Switch", () => {
  it("Checkbox fires onCheckedChange and reflects checked", () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} onCheckedChange={onChange} aria-label="agree" />)
    fireEvent.click(screen.getByRole("checkbox", { name: "agree" }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it("Switch fires onCheckedChange", () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onChange} aria-label="enable" />)
    fireEvent.click(screen.getByRole("switch", { name: "enable" }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it("disabled Checkbox does not fire", () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} disabled onCheckedChange={onChange} aria-label="locked" />)
    fireEvent.click(screen.getByRole("checkbox", { name: "locked" }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

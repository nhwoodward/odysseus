import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"
import { Calendar, Mail } from "lucide-react"
import { MoreToolsMenu } from "./MoreToolsMenu"

afterEach(() => { cleanup(); window.localStorage.clear() })

const items = [
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/email", icon: Mail, label: "Email" },
]

describe("MoreToolsMenu", () => {
  it("row variant toggles an inline child menu and pins a tool to the sidebar", () => {
    const onTogglePin = vi.fn()
    render(<MemoryRouter><MoreToolsMenu items={items} onTogglePin={onTogglePin} /></MemoryRouter>)
    const trigger = screen.getByRole("button", { name: /more tools/i })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Pin Email to sidebar" }))
    expect(onTogglePin).toHaveBeenCalledWith("/email")
  })

  it("icon variant opens a popover and closes on Escape", () => {
    render(<MemoryRouter><MoreToolsMenu variant="icon" items={items} onTogglePin={() => {}} /></MemoryRouter>)
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /more tools/i }))
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull()
  })

  it("surfaces a reminder badge on the collapsed trigger", () => {
    render(
      <MemoryRouter>
        <MoreToolsMenu items={items} onTogglePin={() => {}} reminderTos={new Set(["/email"])} reminderText="3" />
      </MemoryRouter>,
    )
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})

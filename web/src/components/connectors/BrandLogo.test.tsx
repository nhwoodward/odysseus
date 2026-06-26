import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { FolderOpen } from "lucide-react"
import { BrandLogo } from "./BrandLogo"

afterEach(cleanup)

describe("BrandLogo", () => {
  it("renders the colored brand mark for a known slug", () => {
    const { container } = render(<BrandLogo brand="notion" />)
    expect(screen.getByRole("img", { name: "Notion" })).toBeInTheDocument()
    // colored with the brand hex, on a light tile
    const svg = container.querySelector("svg[role=img]")
    expect(svg?.getAttribute("fill")).toMatch(/^#/)
    expect(container.querySelector("span.bg-white")).toBeTruthy()
  })

  it("falls back to the lucide glyph when there is no brand slug", () => {
    const { container } = render(<BrandLogo brand={null} fallback={FolderOpen} />)
    expect(container.querySelector("svg.lucide")).toBeTruthy()
    expect(screen.queryByRole("img")).toBeNull()
    // generic connectors keep the muted tile, not the white logo tile
    expect(container.querySelector("span.bg-muted")).toBeTruthy()
  })

  it("mono variant uses currentColor with no tile", () => {
    const { container } = render(<BrandLogo brand="github" variant="mono" />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("fill")).toBe("currentColor")
    expect(container.querySelector("span")).toBeNull()
  })
})

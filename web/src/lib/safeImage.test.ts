import { describe, expect, it } from "vitest"
import { safeImageSrc, safeHref } from "./safeImage"

describe("safeImageSrc — mirrors OG safeDisplayImageSrc", () => {
  it("allows http(s) URLs", () => {
    expect(safeImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png")
    expect(safeImageSrc("http://example.com/a.png")).toBe("http://example.com/a.png")
  })

  it("allows data:image base64 (png/jpg/gif/webp/svg)", () => {
    const png = "data:image/png;base64,iVBORw0KGgo="
    expect(safeImageSrc(png)).toBe(png)
    const svg = "data:image/svg+xml;base64,PHN2Zz4="
    expect(safeImageSrc(svg)).toBe(svg)
  })

  it("rejects javascript: URLs (no script execution via img src)", () => {
    expect(safeImageSrc("javascript:alert(1)")).toBe("")
  })

  it("rejects malformed/empty input and non-http schemes", () => {
    expect(safeImageSrc("")).toBe("")
    expect(safeImageSrc(null)).toBe("")
    expect(safeImageSrc(undefined)).toBe("")
    expect(safeImageSrc("ftp://example.com/a.png")).toBe("")
  })

  it("allows relative paths (resolve to http via the page origin, like OG)", () => {
    expect(safeImageSrc("/images/a.png")).toMatch(/^https?:\/\//)
  })
})

describe("safeHref — anchor href scheme guard (sources box)", () => {
  it("allows http/https/mailto", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a")
    expect(safeHref("mailto:foo@bar.com")).toBe("mailto:foo@bar.com")
  })
  it("rejects javascript: (would execute on anchor click)", () => {
    expect(safeHref("javascript:alert(1)")).toBe("")
  })
  it("rejects data: URLs", () => {
    expect(safeHref("data:text/html,<script>1</script>")).toBe("")
  })
  it("rejects empty / non-url / unknown schemes", () => {
    expect(safeHref("")).toBe("")
    expect(safeHref(null)).toBe("")
    expect(safeHref("ftp://x/y")).toBe("")
  })

  it("rejects non-image data URIs", () => {
    expect(safeImageSrc("data:text/html;base64,PHN2Zz4=")).toBe("")
  })
})
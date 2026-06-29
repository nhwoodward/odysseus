import { describe, it, expect } from "vitest"
import { normalizeAccent, accentForeground } from "./accent"

describe("normalizeAccent", () => {
  it("accepts 6-digit hex (with or without #) and lowercases it", () => {
    expect(normalizeAccent("#2563EB")).toBe("#2563eb")
    expect(normalizeAccent("059669")).toBe("#059669")
  })
  it("expands 3-digit shorthand", () => {
    expect(normalizeAccent("#abc")).toBe("#aabbcc")
  })
  it("rejects everything the picker can't emit → null (falls back to theme tokens)", () => {
    for (const bad of ["", "  ", null, undefined, "white", "rgb(230,230,230)", "#eeeeeeff", "#12345", "#nothex"]) {
      expect(normalizeAccent(bad as string)).toBeNull()
    }
  })
})

describe("accentForeground", () => {
  it("picks near-white text on a dark accent and near-black on a light accent", () => {
    expect(accentForeground("#18181b")).toBe("#fafafa") // dark accent → light text
    expect(accentForeground("#e4e4e7")).toBe("#09090b") // light accent → dark text
    expect(accentForeground("#2563eb")).toBe("#fafafa") // saturated blue → light text
  })
  it("never returns a light foreground for a light accent (the bug we fixed)", () => {
    // A light accent must never get white text → light-on-light.
    expect(accentForeground("#ffffff")).toBe("#09090b")
    expect(accentForeground("#f5f5f5")).toBe("#09090b")
  })
})

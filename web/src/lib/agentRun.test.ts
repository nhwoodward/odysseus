import { describe, it, expect } from "vitest"
import { buildRunSummary, toolLabel, collectDeliverables } from "./agentRun"
import type { ChatMessage } from "@/types"

describe("buildRunSummary", () => {
  it("counts settled steps and flags a running one", () => {
    const s = buildRunSummary([{ tools: [
      { name: "web_search", exitCode: 0 },
      { name: "bash", running: true },
    ] }])
    expect(s).toEqual({ total: 2, done: 1, running: true, error: false })
  })

  it("flags error on a non-zero exit code (still counted as done)", () => {
    const s = buildRunSummary([{ tools: [{ name: "bash", exitCode: 1 }] }])
    expect(s).toEqual({ total: 1, done: 1, running: false, error: true })
  })

  it("aggregates across multiple rounds", () => {
    const s = buildRunSummary([
      { tools: [{ name: "web_search", exitCode: 0 }] },
      { tools: [{ name: "edit_document", exitCode: 0 }, { name: "bash", running: true }] },
    ])
    expect(s.total).toBe(3)
    expect(s.done).toBe(2)
    expect(s.running).toBe(true)
  })
})

describe("toolLabel", () => {
  it("maps known tool names to friendly labels", () => {
    expect(toolLabel("web_search")).toBe("Web Search")
    expect(toolLabel("edit_document")).toBe("Edit Document")
  })
  it("title-cases unknown tool names", () => {
    expect(toolLabel("custom_thing")).toBe("Custom Thing")
  })
  it("unwraps mcp-namespaced names", () => {
    expect(toolLabel("mcp__email__send_email")).toBe("Send Email")
  })
})

describe("collectDeliverables", () => {
  it("dedupes docs + images, adds a sources entry, and excludes the streamed artifact", () => {
    const m: ChatMessage = {
      role: "assistant",
      content: "",
      rounds: [{ text: "", tools: [
        { name: "edit_document", docId: "d1", docTitle: "Report" },
        { name: "edit_document", docId: "d1", docTitle: "Report" },
        { name: "generate_image", imageUrl: "/api/x.png", imagePrompt: "a cat" },
      ] }],
      artifact: { title: "Live Doc", content: "...", closed: false },
      sources: [{ url: "https://a" }, { url: "https://b" }],
    }
    const d = collectDeliverables(m)
    expect(d.filter((x) => x.kind === "doc")).toHaveLength(1)
    expect(d.find((x) => x.kind === "doc")?.docId).toBe("d1")
    expect(d.find((x) => x.kind === "image")?.url).toBe("/api/x.png")
    expect(d.find((x) => x.kind === "sources")?.count).toBe(2)
    // the live create_document artifact keeps its own ArtifactCard, not a chip
    expect(d.some((x) => x.title === "Live Doc")).toBe(false)
  })

  it("returns nothing for a plain reply", () => {
    expect(collectDeliverables({ role: "assistant", content: "hi" })).toEqual([])
  })
})

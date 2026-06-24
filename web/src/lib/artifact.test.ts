import { describe, expect, it } from "vitest"
import { cleanRoundText, stripSourcesFence, parseArtifact } from "./artifact"

describe("cleanRoundText — tool-fence stripping (Gap #1 / P1)", () => {
  it("strips a ```web_search fence the model emitted instead of using the tool protocol", () => {
    const raw = "Let me look that up.\n```web_search\n{\"query\": \"latest claude 2026\"}\n```\nNow I have the answer."
    const { display } = cleanRoundText(raw)
    expect(display).not.toContain("```web_search")
    expect(display).not.toContain("latest claude 2026")
    expect(display).toContain("Let me look that up.")
    expect(display).toContain("Now I have the answer.")
  })

  it("strips read_file / write_file fences but keeps ```python code examples", () => {
    const raw = "Here is code:\n```python\nprint('hi')\n```\nAnd a read:\n```read_file\npath.txt\n```"
    const { display } = cleanRoundText(raw)
    expect(display).toContain("```python")
    expect(display).toContain("print('hi')")
    expect(display).not.toContain("```read_file")
  })

  it("still strips edit_document / update_document / suggest_document fences", () => {
    const raw = "Editing.\n```edit_document\ntitle.md\n<<<FIND>>>\nold\n<<<REPLACE>>>\nnew\n<<<END>>>\n```"
    const { display } = cleanRoundText(raw)
    expect(display).not.toContain("<<<FIND>>>")
    expect(display).not.toContain("```edit_document")
  })
})

describe("cleanRoundText — bare tool-call prose leak (shared leak #2)", () => {
  it("strips bare `web_search {…}` prose when the JSON has web-search arg keys", () => {
    const raw = "Let me do the web search part now.web_search {\"query\": \"Anthropic most recent Claude model 2026\", \"time_filter\": \"month\"}\nDone."
    const { display } = cleanRoundText(raw)
    expect(display).not.toContain("web_search {")
    expect(display).not.toContain("time_filter")
    expect(display).toContain("Let me do the web search part now.")
    expect(display).toContain("Done.")
  })

  it("does NOT strip a sentence that merely mentions web_search with no following JSON", () => {
    const raw = "I'll use web_search to find the answer and then summarize."
    const { display } = cleanRoundText(raw)
    expect(display).toContain("web_search")
  })

  it("does NOT strip JSON whose keys are not web-search args", () => {
    const raw = "web_search {\"command\": \"ls -la\", \"cwd\": \"/tmp\"}"
    const { display } = cleanRoundText(raw)
    // keys are not in {query,queries,time_filter,freshness,max_pages} → kept
    expect(display).toContain("command")
  })

  it("leaves incomplete streaming JSON in place (mid-token)", () => {
    const raw = "Searching web_search {\"query\": \"partial"
    const { display } = cleanRoundText(raw)
    expect(display).toContain("partial") // not stripped — fence/JSON incomplete
  })
})

describe("cleanRoundText — ```sources fence (shared leak #1)", () => {
  const sourcesFence = "Here is the answer.\n```sources\n[1] https://example.com/a — Foo\n[2] https://example.com/b — Bar\n```"

  it("strips the ```sources fence when structured sources are present (hasSources)", () => {
    const { display } = cleanRoundText(sourcesFence, { hasSources: true })
    expect(display).not.toContain("```sources")
    expect(display).not.toContain("example.com/a")
    expect(display).toContain("Here is the answer.")
  })

  it("keeps the ```sources fence when no structured sources (don't lose citations)", () => {
    const { display } = cleanRoundText(sourcesFence, { hasSources: false })
    expect(display).toContain("```sources")
    expect(display).toContain("example.com/a")
  })
})

describe("stripSourcesFence — flat reply path", () => {
  it("strips a ```sources fence from arbitrary text", () => {
    const text = "Answer.\n```sources\n[1] https://x.com\n```"
    expect(stripSourcesFence(text)).not.toContain("```sources")
    expect(stripSourcesFence(text)).toContain("Answer.")
  })

  it("is a no-op when there is no fence", () => {
    expect(stripSourcesFence("just text")).toBe("just text")
  })
})

describe("parseArtifact — create_document still extracted", () => {
  it("extracts a create_document artifact and removes the fence from display", () => {
    const raw = "Here.\n```create_document\nPage Title\nhtml\n<h1>hi</h1>\n```\nAfter."
    const { display, artifact } = parseArtifact(raw)
    expect(artifact?.title).toBe("Page Title")
    expect(artifact?.language).toBe("html")
    expect(display).not.toContain("```create_document")
    expect(display).toContain("Here.")
    expect(display).toContain("After.")
  })
})
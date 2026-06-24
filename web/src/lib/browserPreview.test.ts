import { describe, expect, it } from "vitest"
import { extractBrowserSite, extractHtmlFromCommand } from "./browserPreview"
import type { ToolEvent } from "@/types"

// A realistic browser_evaluate command mirroring the real "build me a website"
// session (3f0802a0…): JSON-encoded args, `\n`/`\"` JSON escapes inside, an
// em-dash written as `—` (the model's JS unicode escape), a <title>, a
// <style>, and a <script> that uses single quotes (no nested backticks).
const SITE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NOAH — Creative Developer</title>
<style>
  body { margin: 0; font-family: 'Syne', sans-serif; background: #0a0a0f; color: #f0f0f5; }
  .hero { display: grid; place-items: center; height: 100vh; }
</style>
</head>
<body>
  <main class="hero"><h1>NOAH</h1><p>Creative Developer</p></main>
  <script>
    document.querySelectorAll('h1').forEach(el => {
      el.addEventListener('click', () => el.classList.add('hover'));
    });
  </script>
</body>
</html>`

function evalCmd(html: string): string {
  // The command is JSON; the function source's newlines/quotes are JSON-escaped.
  const fn = `() => {\n  document.documentElement.innerHTML = \`${html}\`;\n  return 'done';\n}`
  return JSON.stringify({ function: fn })
}

function tool(name: string, command: string, output = ""): ToolEvent {
  return { name, command, output, round: 1, running: false, exitCode: 0 } as ToolEvent
}

describe("extractHtmlFromCommand", () => {
  it("extracts the HTML from a browser_evaluate innerHTML template literal", () => {
    const html = extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", evalCmd(SITE_HTML))
    expect(html).not.toBeNull()
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<title>NOAH — Creative Developer</title>") // — → em-dash
    expect(html).toContain("</body>")
    expect(html).toContain("</html>")
    // Real newlines, not literal backslash-n.
    expect(html).toContain("\n")
    expect(html).not.toContain("\\n")
  })

  it("ignores a tiny injection but extracts a document-sized string literal", () => {
    // Below the size gate (no <body>, <200 chars) → not a website.
    const tiny = JSON.stringify({ function: `() => { document.body.innerHTML = "<div><h1>Hi</h1></div>"; }` })
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", tiny)).toBeNull()
    // A real document injected via a double-quoted string literal.
    const big = `<body><h1>Hi</h1>${"x".repeat(220)}</body>`
    const fn = JSON.stringify({ function: `() => { document.body.innerHTML = ${JSON.stringify(big)}; }` })
    const html = extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", fn)
    expect(html).not.toBeNull()
    expect(html).toContain("<body>")
  })

  it("decodes a data:text/html navigation URL", () => {
    const html = "<body><h1>Data URL site</h1></body>"
    const cmd = JSON.stringify({ url: "data:text/html," + encodeURIComponent(html) })
    const got = extractHtmlFromCommand("mcp__builtin_browser__browser_navigate", cmd)
    expect(got).toContain("<h1>Data URL site</h1>")
  })

  it("returns null for non-injection calls (about:blank, probing)", () => {
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate",
      JSON.stringify({ function: "() => document.title" }))).toBeNull()
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_navigate",
      JSON.stringify({ url: "about:blank" }))).toBeNull()
  })

  it("returns null for malformed/truncated JSON", () => {
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", "{not json")).toBeNull()
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", undefined)).toBeNull()
  })

  it("recognizes outerHTML injection (documentElement and body)", () => {
    const a = JSON.stringify({ function: `() => { document.documentElement.outerHTML = \`${SITE_HTML}\`; }` })
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", a)).toContain("<!DOCTYPE html>")
    const b = JSON.stringify({ function: `() => { document.body.outerHTML = \`${SITE_HTML}\`; }` })
    expect(extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", b)).toContain("<title>")
  })

  it("extracts the HTML from insertAdjacentHTML's SECOND argument", () => {
    const fn = `() => { document.body.insertAdjacentHTML('beforeend', \`${SITE_HTML}\`); }`
    const html = extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", JSON.stringify({ function: fn }))
    expect(html).not.toBeNull()
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).not.toBe("beforeend") // not the position arg
  })

  it("recovers HTML even when the page contains an unescaped backtick (script template literal)", () => {
    // A <script> in the page that uses its own template literal — the model
    // emitted it with raw backticks, truncating a naive scanner.
    const pageWithBacktick = `<!DOCTYPE html>\n<html><head><title>Tick</title></head>\n<body><h1>Hi</h1>\n<script>const f = (x) => \`val: ` + "${x}" + `\`; console.log(f(1));</script>\n${"x".repeat(220)}</body></html>`
    const fn = `() => { document.documentElement.innerHTML = \`${pageWithBacktick}\`; return 'done'; }`
    const html = extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", JSON.stringify({ function: fn }))
    expect(html).not.toBeNull()
    expect(html).toContain("<title>Tick</title>")
    expect(html).toContain("</html>")
  })

  it("picks the LARGEST full document when several are injected", () => {
    const big = SITE_HTML
    const small = `<body><h1>oops</h1>${"x".repeat(210)}</body>`
    // big first, smaller full-document re-render second — big must still win.
    const fn = `() => {
      document.documentElement.innerHTML = \`${big}\`;
      document.body.innerHTML = \`${small}\`;
    }`
    const html = extractHtmlFromCommand("mcp__builtin_browser__browser_evaluate", JSON.stringify({ function: fn }))
    expect(html).toContain("NOAH — Creative Developer")
  })
})

describe("extractBrowserSite", () => {
  it("picks the last full-document injection and labels it from <title>", () => {
    // The agent iterates: a first small innerHTML, then the finished site.
    const firstCmd = evalCmd("<body><h1>draft</h1></body>")
    const finalCmd = evalCmd(SITE_HTML)
    const tools: ToolEvent[] = [
      tool("mcp__builtin_browser__browser_evaluate", firstCmd),
      tool("mcp__builtin_browser__browser_evaluate", finalCmd),
    ]
    const site = extractBrowserSite(tools)
    expect(site).not.toBeNull()
    expect(site!.title).toBe("NOAH — Creative Developer")
    expect(site!.html).toContain("<!DOCTYPE html>")
  })

  it("falls back to a snapshot Page Title when the HTML has no <title>", () => {
    const cmd = evalCmd("<body><h1>untitled</h1>" + "x".repeat(200) + "</body>")
    const tools: ToolEvent[] = [
      tool("mcp__builtin_browser__browser_evaluate", cmd),
      tool("mcp__builtin_browser__browser_snapshot", "", "### Page - Page Title: Snapshot Site ###"),
    ]
    const site = extractBrowserSite(tools)
    expect(site!.title).toBe("Snapshot Site")
  })

  it("keeps the full site when a later tool injects a fragment containing '<body'", () => {
    // Tool 1: the finished site. Tool 2: a docs fragment whose text mentions
    // '<body' — must NOT clobber the real site.
    const fragment = `<pre>example: &lt;body class="x"&gt;…&lt;/body&gt;</pre>${"y".repeat(210)}`
    const tools: ToolEvent[] = [
      tool("mcp__builtin_browser__browser_evaluate", evalCmd(SITE_HTML)),
      tool("mcp__builtin_browser__browser_evaluate", evalCmd(fragment)),
    ]
    const site = extractBrowserSite(tools)
    expect(site!.title).toBe("NOAH — Creative Developer")
    expect(site!.html).toContain("<!DOCTYPE html>")
  })

  it("ignores non-browser tools", () => {
    const tools: ToolEvent[] = [
      tool("create_document", JSON.stringify({ content: "<html>…</html>" })),
      tool("web_search", JSON.stringify({ query: "x" })),
    ]
    expect(extractBrowserSite(tools)).toBeNull()
  })

  it("returns null for empty/undefined tools", () => {
    expect(extractBrowserSite(undefined)).toBeNull()
    expect(extractBrowserSite([])).toBeNull()
  })
})
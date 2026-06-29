import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, it, expect, vi } from "vitest"
import { useAskAssistant, PENDING_COMPOSER_KEY } from "./composerHandoff"

// jsdom's sessionStorage can throw on opaque origins; back it with a Map so the
// durable-handoff contract is exercised deterministically (mirrors setup.ts's
// localStorage mock).
const store = new Map<string, string>()
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size },
  },
})

function Harness({ q }: { q?: string }) {
  const ask = useAskAssistant()
  return <button onClick={() => ask(q)}>go</button>
}

afterEach(() => { cleanup(); store.clear() })

describe("useAskAssistant", () => {
  it("stashes the question durably AND dispatches set-composer for an already-mounted composer", () => {
    const spy = vi.spyOn(window, "dispatchEvent")
    render(<MemoryRouter><Harness q="What's my net worth?" /></MemoryRouter>)
    fireEvent.click(screen.getByText("go"))
    expect(sessionStorage.getItem(PENDING_COMPOSER_KEY)).toBe("What's my net worth?")
    const types = spy.mock.calls.map(([e]) => (e as Event).type)
    expect(types).toContain("odysseus:set-composer")
    spy.mockRestore()
  })

  it("only focuses (no stash) when called with no question", () => {
    const spy = vi.spyOn(window, "dispatchEvent")
    render(<MemoryRouter><Harness /></MemoryRouter>)
    fireEvent.click(screen.getByText("go"))
    expect(sessionStorage.getItem(PENDING_COMPOSER_KEY)).toBeNull()
    const types = spy.mock.calls.map(([e]) => (e as Event).type)
    expect(types).toContain("odysseus:focus-composer")
    expect(types).not.toContain("odysseus:set-composer")
    spy.mockRestore()
  })
})

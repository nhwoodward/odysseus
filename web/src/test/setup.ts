import '@testing-library/jest-dom/vitest'

const storage = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() { return storage.size },
  },
})

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly scrollMargin = ''
  readonly thresholds = [0]
  disconnect() {}
  observe() {}
  takeRecords() { return [] }
  unobserve() {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: MockIntersectionObserver,
})

// recharts' ResponsiveContainer observes size via ResizeObserver, which jsdom lacks.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: MockResizeObserver,
})

// Radix overlays (Popover/DropdownMenu/Tooltip/Collapsible via @floating-ui /
// pointer-capture focus management) use pointer APIs + scrollIntoView that
// jsdom doesn't implement. user-event dispatches the full pointer sequence,
// but these no-op polyfills keep Radix from throwing mid-interaction.
if (typeof globalThis.PointerEvent === "undefined") {
  // jsdom lacks PointerEvent; MouseEvent is a close-enough stand-in for tests.
  globalThis.PointerEvent = globalThis.MouseEvent as unknown as typeof PointerEvent
}
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

// jsdom has no matchMedia; framer-motion (and reduced-motion checks) probe it.
if (!globalThis.matchMedia) {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList,
  })
}

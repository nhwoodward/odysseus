import { renderHook, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useNow, formatElapsed } from "./useNow"

describe("useNow", () => {
  afterEach(() => vi.useRealTimers())

  it("ticks forward while active", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNow(true, 1000))
    const t0 = result.current
    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current).toBeGreaterThan(t0)
  })

  it("stays frozen while inactive (no idle churn)", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNow(false, 1000))
    const t0 = result.current
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current).toBe(t0)
  })
})

describe("formatElapsed", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsed(0)).toBe("0s")
    expect(formatElapsed(4000)).toBe("4s")
    expect(formatElapsed(65000)).toBe("1m 05s")
  })
})
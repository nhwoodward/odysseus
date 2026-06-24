import { useEffect, useState } from "react"

// A clock that ticks every `intervalMs` while `active` and freezes otherwise,
// so a live elapsed-time display only re-renders while something is actually
// running (no idle 1Hz churn across every settled message/step). Returns a
// Date.now() ms timestamp. (Date.now() is fine in app code — the no-Date
// restriction is for workflow scripts only.) Pair with formatElapsed().
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return now
}

// "4s" / "1m 05s" — accepts milliseconds. Mirrors the ResearchRoute shape.
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`
}
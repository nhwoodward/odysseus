// Shared Memory presentation helpers — kept out of MemoryRoute so the route
// (add form / extract / review) and the MemoryTable agree on categories,
// labels, and ordering.
import type { Memory } from "@/types"

export const CATS = ["fact", "preference", "identity", "project", "goal", "task", "contact"]

export function memoryCategory(m: Memory) {
  return m.category || (m.categories || [])[0] || "fact"
}

export function memoryTimestamp(m: Memory) {
  return typeof m.timestamp === "number" ? m.timestamp : 0
}

export function memoryUses(m: Memory) {
  return typeof m.uses === "number" ? m.uses : 0
}

export function sourceLabel(source?: string) {
  return source === "auto" ? "auto" : "manual"
}

export function relativeTime(timestamp?: number) {
  if (!timestamp) return ""
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestamp)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`
  return `${Math.floor(diff / 31536000)}y ago`
}

// Default table order when no column sort is active: pinned first, then newest.
// (TanStack column sorting takes over once a header is clicked.)
export function defaultMemoryOrder(items: Memory[]) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return memoryTimestamp(b) - memoryTimestamp(a)
  })
}

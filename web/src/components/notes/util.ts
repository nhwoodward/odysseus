import type { CSSProperties } from "react"
import type { Note, NoteItem } from "@/types"

export const NOTE_COLORS = [
  { label: "None", value: "", bg: "transparent" },
  { label: "Red", value: "red", bg: "#fee2e2" },
  { label: "Orange", value: "orange", bg: "#ffedd5" },
  { label: "Yellow", value: "yellow", bg: "#fef9c3" },
  { label: "Green", value: "green", bg: "#dcfce7" },
  { label: "Blue", value: "blue", bg: "#dbeafe" },
  { label: "Purple", value: "purple", bg: "#ede9fe" },
] as const

export function noteItems(note: Note): NoteItem[] {
  return Array.isArray(note.items) ? note.items : []
}

export function itemDone(item: NoteItem): boolean {
  return !!(item.done || item.checked)
}

export function noteLabels(note: Note): string[] {
  return (note.label || "").split(/\s+/).map((part) => part.trim().replace(/^#/, "")).filter(Boolean)
}

export function isOverdue(value?: string): boolean {
  if (!value) return false
  const d = new Date(value)
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now()
}

export function colorClasses(color?: string): string {
  switch (color) {
    case "red": return "border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/25"
    case "orange": return "border-orange-200 bg-orange-50 dark:border-orange-950 dark:bg-orange-950/25"
    case "yellow": return "border-yellow-200 bg-yellow-50 dark:border-yellow-950 dark:bg-yellow-950/20"
    case "green": return "border-green-200 bg-green-50 dark:border-green-950 dark:bg-green-950/25"
    case "blue": return "border-blue-200 bg-blue-50 dark:border-blue-950 dark:bg-blue-950/25"
    case "purple": return "border-purple-200 bg-purple-50 dark:border-purple-950 dark:bg-purple-950/25"
    default: return "bg-card"
  }
}

export function bgImageUrl(color?: string): string {
  return color?.startsWith("bg:") ? color.slice(3) : ""
}

export function backgroundStyle(color?: string): CSSProperties | undefined {
  const url = bgImageUrl(color)
  if (!url) return undefined
  const escaped = url.replace(/"/g, "%22")
  return {
    backgroundImage: `linear-gradient(rgba(0,0,0,.34), rgba(0,0,0,.34)), url("${escaped}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  }
}

export function goalProgress(note: Note): string {
  const items = noteItems(note)
  if (!items.length) return ""
  const done = items.filter(itemDone).length
  return ` ${done}/${items.length}`
}

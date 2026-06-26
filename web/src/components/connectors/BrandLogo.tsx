import type { LucideIcon } from "lucide-react"
import { brandIcon } from "./brandIcons"
import { cn } from "@/lib/utils"

// A connector's brand mark. Two variants:
//  - "chip" (default): the colored brand logo on a light, theme-independent tile
//    so dark/black marks (Notion, GitHub, Vercel = #000) read in both themes —
//    the same logo-tile treatment Claude's & mcpservers' directories use. A
//    connector with no brand slug (Filesystem, Memory) falls back to its lucide
//    glyph on the existing muted tile.
//  - "mono": the mark in currentColor, no tile — for dense spots like the
//    composer's connected-source pills.
export function BrandLogo({
  brand,
  fallback: Fallback,
  size = 36,
  iconSize = 18,
  variant = "chip",
  className,
}: {
  brand?: string | null
  fallback?: LucideIcon
  size?: number
  iconSize?: number
  variant?: "chip" | "mono"
  className?: string
}) {
  const icon = brandIcon(brand)

  if (variant === "mono") {
    if (icon) {
      return (
        <svg viewBox="0 0 24 24" width={iconSize} height={iconSize} fill="currentColor" className={className} aria-hidden="true">
          <path d={icon.path} />
        </svg>
      )
    }
    if (Fallback) return <Fallback width={iconSize} height={iconSize} className={className} aria-hidden="true" />
    return null
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg ring-1 ring-border",
        icon ? "bg-white" : "bg-muted text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {icon ? (
        <svg viewBox="0 0 24 24" width={iconSize} height={iconSize} fill={`#${icon.hex}`} role="img" aria-label={icon.title}>
          <title>{icon.title}</title>
          <path d={icon.path} />
        </svg>
      ) : Fallback ? (
        <Fallback width={iconSize} height={iconSize} aria-hidden="true" />
      ) : null}
    </span>
  )
}

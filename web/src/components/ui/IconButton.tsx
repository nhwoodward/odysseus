import type { ReactNode } from "react"
import { Button, type ButtonProps } from "./button"

// Icon-only button that REQUIRES an accessible name. Wraps the design-system
// Button so every icon control gets a consistent focus ring, hover/disabled
// state, and a screen-reader name (aria-label) + hover tooltip (title) — instead
// of the ad-hoc raw `<button>` + `title`-only pattern that left ~150 controls
// unnamed to assistive tech. Defaults to the ghost / 28px `iconSm` look that
// matches the existing `rounded-md p-1.5` toolbar buttons; pass `size="icon"`
// for larger affordances. The `iconSm` variant auto-sizes the svg, so callers
// don't need a per-icon size class.
type IconButtonProps = Omit<ButtonProps, "children"> & {
  icon: ReactNode
  label: string
}

export function IconButton({ icon, label, variant = "ghost", size = "iconSm", ...props }: IconButtonProps) {
  return (
    <Button aria-label={label} title={label} variant={variant} size={size} {...props}>
      {icon}
    </Button>
  )
}

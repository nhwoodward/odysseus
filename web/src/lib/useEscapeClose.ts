import { useEffect } from "react"

// Close a dropdown/popover on Escape while it's open. Pairs with the existing
// `fixed inset-0` click-catcher (which handles outside-click) to bring anchored
// menus up to the same dismiss-ergonomics as the Dialog primitive, without
// restructuring each hand-rolled popover. Add `aria-haspopup`/`aria-expanded`
// to the trigger button alongside this for full menu-button semantics.
export function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose() }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])
}

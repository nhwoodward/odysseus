// Accent-colour helpers for the custom-accent override in App.tsx.
//
// The `default` Button is `bg-primary text-primary-foreground`. When a user sets
// a custom accent we point `--primary` at it and must pick a readable foreground.
// A bad/edge accent value must NEVER yield a light-on-light button, so the parse
// is strict: anything that isn't a real hex colour is rejected and the caller
// falls back to the guaranteed-contrast theme tokens.

// Parse a user accent into a canonical `#rrggbb`, or null if it isn't a valid
// hex colour. Accepts `#abc` / `#aabbcc` (with or without the leading `#`).
// Rejects empty, named colours, rgb()/hsl() strings, and 8-digit alpha hex —
// all of which the override path treats as "no accent".
export function normalizeAccent(hex: string | null | undefined): string | null {
  const m = (hex || "").trim().replace(/^#/, "")
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null
  return `#${full.toLowerCase()}`
}

// Foreground for an (already-validated) accent: whichever of near-white /
// near-black has the higher WCAG contrast against the accent. Hardcoded white
// reads badly on a light accent, so this is computed rather than fixed.
export function accentForeground(hex: string): string {
  const norm = normalizeAccent(hex)
  if (!norm) return "#fafafa" // defensive; callers pass a normalized value
  const full = norm.slice(1)
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L =
    0.2126 * lin(parseInt(full.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(full.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(full.slice(4, 6), 16))
  // contrast(white) = 1.05/(L+0.05); contrast(black) = (L+0.05)/0.05
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? "#fafafa" : "#09090b"
}

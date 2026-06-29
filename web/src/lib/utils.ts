import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The app ships a custom micro-type scale as Tailwind v4 `@utility` font-size
// utilities (text-micro/label/note/subhead — see src/index.css). Teach
// tailwind-merge they belong to the font-size group so they correctly override a
// base text-* size in a cn() merge (otherwise e.g. `text-sm` from a shadcn
// primitive's base and a `text-subhead` override BOTH survive, and which wins is
// left to compiled-CSS order — a latent, non-deterministic font-size bug).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["micro", "label", "note", "subhead"] }] } },
})

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

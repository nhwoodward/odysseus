// Shared first-letter avatar used across the finance surfaces (institutions,
// accounts, recurring) so visually-identical rows stay identical.
export function Monogram({ name }: { name?: string | null }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?"
  return (
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
      {letter}
    </span>
  )
}

import { cn } from "@/lib/utils"

// Shared "not a licensed adviser" disclaimer. Rendered on the user-facing
// onboarding steps (connect / ask-admin / success — NOT the admin key-entry
// setup step) and pinned at the bottom of the finance dashboard, mirroring the
// reference, which keeps the disclaimer on the screen where users actually read
// balances and act. No icon, no accent — quiet but always present where money is
// shown.
export function FinanceDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("mx-auto mt-8 max-w-md text-center text-xs text-muted-foreground", className)}>
      For information only — Odysseus can make mistakes and is not a licensed investment
      adviser or tax preparer. Use your own judgment before making financial decisions.
    </p>
  )
}

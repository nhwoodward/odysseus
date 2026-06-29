import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { SpendingBreakdown } from "./SpendingBreakdown"
import type { CashflowCategory } from "@/api/finance"

afterEach(cleanup)

const cats: CashflowCategory[] = [
  { category: "TRAVEL", amount: 3244, prev: 2313, delta_pct: 40.2 },
  { category: "FOOD_AND_DRINK", amount: 1253, prev: 1859, delta_pct: -32.6 },
]

describe("SpendingBreakdown", () => {
  it("renders prettified categories with MoM deltas", () => {
    render(<SpendingBreakdown categories={cats} />)
    expect(screen.getByText("Travel")).toBeInTheDocument()
    expect(screen.getByText("Food And Drink")).toBeInTheDocument()
    expect(screen.getByText(/40\.2%/)).toBeInTheDocument()
    expect(screen.getByText(/32\.6%/)).toBeInTheDocument()
  })

  it("renders an empty state when nothing is spent", () => {
    render(<SpendingBreakdown categories={[]} />)
    expect(screen.getByText(/No spending yet/i)).toBeInTheDocument()
  })
})

import { useMemo } from "react"
import { type CompareMode, type EvalPrompt } from "@/components/compare/util"

const EVAL_PROMPTS: Record<CompareMode, EvalPrompt[]> = {
  chat: [
    { sub: "Featured", label: "Sum digits 2^100", answer: "115", prompt: "Compute the sum of the decimal digits of 2^100. Do NOT use code execution - work it out by reasoning about the number. Show every step, then end with the final number on its own line." },
    { sub: "Featured", label: "Three jugs", answer: "2 pours: 7->5, 7->3", prompt: "You have three jugs of capacities 7, 5, and 3 liters. The 7-liter jug starts full; the others empty. Using only pouring (no markings), produce the shortest sequence of pours that leaves exactly 2 liters in the 3-liter jug. Output each step as `pour A -> B` on its own line. Then state the total number of pours on a final line." },
    { sub: "Visual", label: "Draw SVG", prompt: "Output a complete self-contained HTML file (```html block, no explanation, no other text) that centers a single SVG illustration on a simple background. The SVG must use only inline shapes - no <img>, no external assets, no JavaScript. Make it expressive and detailed. The SVG should depict: a friendly robot" },
    { sub: "Visual explain", label: "Black hole HTML", prompt: "Output a complete HTML file (```html block, no explanation outside the code) that visually explains how a black hole forms. Use four labeled \"frames\" laid out left-to-right (or stacked on small screens) showing: 1) a glowing massive star, 2) the star going supernova with shockwave rings, 3) collapse into a singularity, 4) the final black hole with a curved accretion disk and bent light around it. Use only vanilla HTML, CSS, and inline SVG - no JavaScript, no images. Each frame should have a one-sentence caption." },
    { sub: "Visual explain", label: "Butterfly ASCII", prompt: "Explain the butterfly lifecycle using ASCII art. Produce four separate frames in fenced code blocks, in order: egg, caterpillar, chrysalis, adult butterfly. Each frame must be drawn with monospace ASCII characters only and be visually recognizable as the creature/stage. Below each frame add one playful one-line caption (no longer than 15 words) describing what is happening at that stage." },
  ],
  agent: [
    { sub: "Web tasks", label: "Multi-step", prompt: "Search the web for the current population of the 3 largest cities in the world, then calculate what percentage of the world's total population lives in those cities." },
    { sub: "Web tasks", label: "Fact check", prompt: "Fact-check these claims: 1) The Great Wall of China is visible from space. 2) Humans only use 10% of their brains. 3) Lightning never strikes the same place twice. Cite sources." },
    { sub: "Web tasks", label: "Compare prices", prompt: "Find and compare the pricing, features, and limitations of the top 3 cloud GPU providers for machine learning training. Create a markdown comparison table." },
    { sub: "Code tasks", label: "Script + run", prompt: "Write a Python script that generates a bar chart of the 5 most common programming languages in 2025 and save it as chart.png. Then run it." },
    { sub: "Math", label: "Proof + verify", prompt: "Prove that the square root of 2 is irrational. Then write a Python program that approximates it using Newton's method to 50 decimal places and verify." },
  ],
  search: [
    { sub: "Factual", label: "Current events", prompt: "latest AI regulation news 2026" },
    { sub: "Technical", label: "Programming", prompt: "Rust vs Go performance benchmarks 2026" },
    { sub: "Comparison", label: "GPU providers", prompt: "cloud GPU providers pricing comparison 2026" },
    { sub: "Science", label: "CRISPR therapy", prompt: "CRISPR gene therapy breakthroughs" },
    { sub: "Market", label: "Laptop deals", prompt: "best lightweight laptops for developers 2026" },
  ],
  research: [
    { sub: "Factual", label: "Current events", prompt: "latest AI regulation news 2025" },
    { sub: "Technical", label: "Programming", prompt: "Rust vs Go performance benchmarks 2025" },
    { sub: "Research", label: "Academic", prompt: "transformer architecture improvements since attention is all you need" },
    { sub: "Comparison", label: "GPU providers", prompt: "cloud GPU providers pricing comparison 2025" },
    { sub: "Factual", label: "Science", prompt: "CRISPR gene therapy breakthroughs" },
  ],
}

function groupedEvalPrompts(mode: CompareMode) {
  const groups: Array<{ sub: string; items: Array<EvalPrompt & { index: number }> }> = []
  EVAL_PROMPTS[mode].forEach((prompt, index) => {
    let group = groups.find((item) => item.sub === prompt.sub)
    if (!group) {
      group = { sub: prompt.sub, items: [] }
      groups.push(group)
    }
    group.items.push({ ...prompt, index })
  })
  return groups
}

export function EvalPromptSelect({ mode, disabled, onPick }: { mode: CompareMode; disabled: boolean; onPick: (prompt: EvalPrompt) => void }) {
  const groups = useMemo(() => groupedEvalPrompts(mode), [mode])
  return (
    <select
      aria-label="Eval prompts"
      value=""
      disabled={disabled}
      onChange={(e) => {
        const index = Number(e.target.value)
        const item = Number.isFinite(index) ? EVAL_PROMPTS[mode][index] : undefined
        if (item) onPick(item)
      }}
      className="h-9 w-full rounded-md border bg-background px-2 text-sm text-muted-foreground outline-none focus-visible:border-ring disabled:opacity-50 md:w-44"
    >
      <option value="">Eval prompts</option>
      {groups.map((group) => (
        <optgroup key={group.sub} label={group.sub}>
          {group.items.map((item) => (
            <option key={`${item.sub}-${item.label}`} value={item.index}>
              {item.label}{item.answer ? " ✓" : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

import { useMemo } from "react"
import { History, Trophy } from "lucide-react"
import { type CompareHistoryItem } from "@/api/compare"
import { shortName } from "@/components/compare/util"

function winnerModel(item: CompareHistoryItem) {
  if (!item.winner) return ""
  if (item.winner === "tie") return "tie"
  if (item.winner === "a") return item.model_a
  if (item.winner === "b") return item.model_b
  return item.winner
}

export function Scoreboard({ items }: { items: CompareHistoryItem[] }) {
  const rows = useMemo(() => {
    const byModel = new Map<string, { model: string; wins: number; losses: number; ties: number; games: number }>()
    const ensure = (model: string) => {
      if (!byModel.has(model)) byModel.set(model, { model, wins: 0, losses: 0, ties: 0, games: 0 })
      return byModel.get(model)!
    }

    items.filter((item) => item.winner).forEach((item) => {
      const a = ensure(item.model_a)
      const b = ensure(item.model_b)
      a.games += 1
      b.games += 1
      const winner = winnerModel(item)
      if (winner === "tie") {
        a.ties += 1
        b.ties += 1
      } else if (winner === item.model_a) {
        a.wins += 1
        b.losses += 1
      } else if (winner === item.model_b) {
        b.wins += 1
        a.losses += 1
      }
    })

    return [...byModel.values()].sort((x, y) => (y.wins / Math.max(1, y.games)) - (x.wins / Math.max(1, x.games)) || y.games - x.games).slice(0, 8)
  }, [items])
  const recent = items.filter((item) => item.winner).slice(0, 6)

  return (
    <div className="grid max-h-64 shrink-0 gap-3 overflow-hidden rounded-md border bg-card p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="min-w-0 overflow-hidden">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Trophy className="size-3.5" />Scoreboard</div>
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="pb-1 font-medium">Model</th><th className="pb-1 font-medium">W</th><th className="pb-1 font-medium">L</th><th className="pb-1 font-medium">T</th><th className="pb-1 font-medium">Win</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td className="py-3 text-muted-foreground" colSpan={5}>No votes yet.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.model} className="border-t">
                  <td className="max-w-44 truncate py-1.5 pr-2" title={row.model}>{shortName(row.model)}</td>
                  <td className="py-1.5">{row.wins}</td>
                  <td className="py-1.5">{row.losses}</td>
                  <td className="py-1.5">{row.ties}</td>
                  <td className="py-1.5">{Math.round((row.wins / Math.max(1, row.games)) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="min-w-0 overflow-hidden">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><History className="size-3.5" />Recent Votes</div>
        <div className="max-h-48 space-y-1.5 overflow-auto pr-1">
          {recent.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No completed comparisons.</div>
          ) : recent.map((item) => {
            const winner = winnerModel(item)
            return (
              <div key={item.id} className="rounded-md border bg-background px-2.5 py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium" title={`${item.model_a} vs ${item.model_b}`}>{shortName(item.model_a)} vs {shortName(item.model_b)}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{winner === "tie" ? "Tie" : shortName(winner)}</span>
                </div>
                <div className="mt-1 truncate text-muted-foreground" title={item.prompt}>{item.prompt}</div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

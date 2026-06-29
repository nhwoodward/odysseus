import { useMemo, useState } from "react"
import { Search, Receipt, ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontal, Copy } from "lucide-react"
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { money, type Txn } from "@/api/finance"
import { prettyCat, fmtDay } from "./util"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

// Display flips Plaid's sign (debits positive → reads negative; credits → +green).
const displayAmount = (a?: number) => (a == null ? null : -a)

const columns: ColumnDef<Txn>[] = [
  {
    accessorKey: "date",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Date <ArrowUpDown className="ml-1 size-3.5" />
      </Button>
    ),
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{fmtDay(row.original.date)}</span>,
    sortingFn: (a, b) => (a.original.date || "").localeCompare(b.original.date || ""),
  },
  {
    accessorKey: "name", header: "Description", enableSorting: false,
    cell: ({ row }) => <span className="font-medium">{row.original.name || "—"}</span>,
  },
  {
    accessorKey: "category", header: "Category", enableSorting: false,
    cell: ({ row }) => row.original.category
      ? <Badge variant="outline" className="font-normal">{prettyCat(row.original.category)}</Badge>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: "institution", header: "Account", enableSorting: false,
    cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.institution || "—"}</span>,
  },
  {
    accessorKey: "pending", header: "Status", enableSorting: false,
    cell: ({ row }) => row.original.pending
      ? <Badge variant="secondary" className="font-normal">Pending</Badge>
      : <Badge variant="outline" className="font-normal text-muted-foreground">Posted</Badge>,
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <div className="text-right">
        <Button variant="ghost" size="sm" className="-mr-2 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Amount <ArrowUpDown className="ml-1 size-3.5" />
        </Button>
      </div>
    ),
    cell: ({ row }) => {
      const disp = displayAmount(row.original.amount)
      return <div className={cn("text-right font-medium tabular-nums", disp != null && disp > 0 && "text-emerald-600 dark:text-emerald-400")}>{disp == null ? "—" : `${disp > 0 ? "+" : ""}${money(disp)}`}</div>
    },
    // Sort on the DISPLAYED (sign-flipped) value so the visible order tracks
    // the header arrow — ascending = biggest expense first, not biggest income.
    sortingFn: (a, b) => (displayAmount(a.original.amount) ?? 0) - (displayAmount(b.original.amount) ?? 0),
  },
  {
    id: "actions", enableSorting: false,
    cell: ({ row }) => {
      const t = row.original
      const copy = () => navigator.clipboard?.writeText([fmtDay(t.date), t.name, t.category ? prettyCat(t.category) : "", t.amount != null ? money(displayAmount(t.amount)!) : ""].filter(Boolean).join(" · "))
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Transaction actions" className="text-muted-foreground"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={copy}><Copy />Copy details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

// dashboard-01 data-table for transactions: sortable (date/amount) + paginated
// TanStack table over the shadcn Table primitive, with category/status badges,
// sign-flipped colored amounts, a search box + category chips, and a per-row ⋮.
export function FinanceTransactionsTable({ transactions }: { transactions: Txn[] }) {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }])

  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of transactions) { const c = t.category || "OTHER"; m[c] = (m[c] || 0) + 1 }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
  }, [transactions])

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return transactions.filter((t) =>
      (!cat || (t.category || "OTHER") === cat) &&
      (!needle || `${t.name || ""} ${prettyCat(t.category)} ${t.amount ?? ""}`.toLowerCase().includes(needle)),
    )
  }, [transactions, q, cat])

  const table = useReactTable({
    data: matched, columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  })

  if (!transactions.length) {
    return (
      <Card className="p-0">
        <EmptyState icon={Receipt} title="No transactions yet"
          description="Transactions from your connected accounts will show up here once Plaid finishes syncing — usually within a few minutes of connecting." />
      </Card>
    )
  }

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions…" aria-label="Search transactions" className="h-8 pl-8" />
        </div>
        <button onClick={() => setCat(null)} aria-pressed={!cat} className={chip(!cat)}>All</button>
        {cats.map((c) => <button key={c} onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={chip(cat === c)}>{prettyCat(c)}</button>)}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">No matching transactions.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{matched.length} transaction{matched.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
          <Button variant="outline" size="iconSm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="iconSm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </Card>
  )
}

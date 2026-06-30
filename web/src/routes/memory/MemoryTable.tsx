import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, Sparkles, Pin, Pencil, Trash2, Copy, MoreHorizontal, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type Column, type ColumnDef, type SortingState, type RowSelectionState,
} from "@tanstack/react-table"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { useMemoryMutations } from "@/api/memory"
import type { Memory } from "@/types"
import { CATS, memoryCategory, memoryTimestamp, memoryUses, relativeTime, sourceLabel, defaultMemoryOrder } from "./util"
import { cn } from "@/lib/utils"
import { toast } from "@/stores/toast"

const PAGE_SIZE = 25

// Row actions are threaded to the (module-scope, stable) column cells via the
// table's `meta`, so the columns don't have to close over the mutation hooks.
interface MemoryMeta {
  onPin: (m: Memory) => void
  onEdit: (m: Memory) => void
  onDelete: (m: Memory) => void
  onCopy: (m: Memory) => void
}

function sortHeader(column: Column<Memory, unknown>, label: string, align: "left" | "right" = "left") {
  const btn = (
    <Button variant="ghost" size="sm" className={cn("h-8", align === "right" ? "-mr-2" : "-ml-2")} onClick={column.getToggleSortingHandler()}>
      {label} <ArrowUpDown className="ml-1 size-3.5" />
    </Button>
  )
  return align === "right" ? <div className="text-right">{btn}</div> : btn
}

const columns: ColumnDef<Memory>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select memory" />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "text",
    header: ({ column }) => sortHeader(column, "Memory"),
    cell: ({ row, table }) => {
      const m = row.original
      const meta = table.options.meta as MemoryMeta
      return (
        <div className="flex max-w-[28rem] items-start gap-1.5" onDoubleClick={() => meta.onEdit(m)} title={m.text}>
          {m.pinned && <Pin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
          <span className="line-clamp-2 font-medium">{m.text || "—"}</span>
        </div>
      )
    },
    sortingFn: (a, b) => (a.original.text || "").localeCompare(b.original.text || ""),
  },
  {
    id: "category", accessorFn: (m) => memoryCategory(m),
    header: ({ column }) => sortHeader(column, "Category"),
    cell: ({ row }) => <Badge variant="outline" className="font-normal capitalize">{memoryCategory(row.original)}</Badge>,
    sortingFn: (a, b) => memoryCategory(a.original).localeCompare(memoryCategory(b.original)),
  },
  {
    accessorKey: "source",
    header: ({ column }) => sortHeader(column, "Source"),
    cell: ({ row }) => {
      const auto = row.original.source === "auto"
      return <Badge variant={auto ? "secondary" : "outline"} className="font-normal text-muted-foreground">{sourceLabel(row.original.source)}</Badge>
    },
    sortingFn: (a, b) => (a.original.source || "").localeCompare(b.original.source || ""),
  },
  {
    id: "uses", accessorFn: (m) => memoryUses(m),
    header: ({ column }) => sortHeader(column, "Uses", "right"),
    cell: ({ row }) => {
      const u = memoryUses(row.original)
      return <div className="text-right tabular-nums text-muted-foreground" title={u ? `Injected into chat context ${u} ${u === 1 ? "time" : "times"}` : undefined}>{u || "—"}</div>
    },
    sortingFn: (a, b) => memoryUses(a.original) - memoryUses(b.original),
  },
  {
    id: "updated", accessorFn: (m) => memoryTimestamp(m),
    header: ({ column }) => sortHeader(column, "Updated"),
    cell: ({ row }) => {
      const ts = memoryTimestamp(row.original)
      return <span className="whitespace-nowrap text-muted-foreground" title={ts ? new Date(ts * 1000).toLocaleString() : undefined}>{relativeTime(ts) || "—"}</span>
    },
    sortingFn: (a, b) => memoryTimestamp(a.original) - memoryTimestamp(b.original),
  },
  {
    id: "actions", enableSorting: false,
    cell: ({ row, table }) => {
      const m = row.original
      const meta = table.options.meta as MemoryMeta
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Memory actions" className="text-muted-foreground"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => meta.onPin(m)}><Pin />{m.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta.onEdit(m)}><Pencil />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta.onCopy(m)}><Copy />Copy text</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => meta.onDelete(m)}><Trash2 />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]

// dashboard-01 data table for the Memory store: sortable (text/category/source/
// uses/updated) + paginated, with category/source badges, search + category
// chips, row-selection bulk-delete, a per-row ⋮ menu, and an edit dialog.
export function MemoryTable({ memories }: { memories: Memory[] }) {
  const { update, remove, bulkRemove, pin } = useMemoryMutations()
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [editing, setEditing] = useState<Memory | null>(null)
  const [editText, setEditText] = useState("")
  const [editCat, setEditCat] = useState("fact")

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = memories.filter((m) =>
      (!cat || m.category === cat || (m.categories || []).includes(cat)) &&
      (!needle || (m.text || "").toLowerCase().includes(needle)),
    )
    return defaultMemoryOrder(filtered)
  }, [memories, q, cat])

  const openEdit = useCallback((m: Memory) => {
    setEditing(m); setEditText(m.text); setEditCat(memoryCategory(m))
  }, [])

  const meta = useMemo<MemoryMeta>(() => ({
    onEdit: openEdit,
    onPin: async (m) => { await pin.mutateAsync({ id: m.id, pinned: !m.pinned }); toast(m.pinned ? "Memory unpinned" : "Pinned — always in context", "success") },
    onDelete: (m) => { if (confirm("Delete this memory?")) remove.mutate(m.id) },
    onCopy: (m) => { navigator.clipboard?.writeText(m.text); toast("Copied to clipboard", "success") },
  }), [openEdit, pin, remove])

  const table = useReactTable({
    data: matched, columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (m) => m.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    meta,
  })

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  // Prune the selection to ids that still exist, so deleting a row elsewhere
  // (its ⋮ menu, or a partially-failed bulk delete) can't strand a stale id
  // that a later bulk-delete would 404 on.
  useEffect(() => {
    setRowSelection((prev) => {
      const live = new Set(memories.map((m) => m.id))
      const next: RowSelectionState = {}
      let changed = false
      for (const id of Object.keys(prev)) {
        if (prev[id] && live.has(id)) next[id] = true
        else changed = true
      }
      return changed ? next : prev
    })
  }, [memories])

  const deleteSelected = async () => {
    const ids = selectedIds
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} selected ${ids.length === 1 ? "memory" : "memories"}?`)) return
    try {
      await bulkRemove.mutateAsync(ids)
      toast(`Deleted ${ids.length} ${ids.length === 1 ? "memory" : "memories"}`, "success")
    } catch {
      toast("Couldn't delete some memories", "error")
    } finally {
      setRowSelection({})
    }
  }

  const saveEdit = async () => {
    if (!editing || !editText.trim()) return
    try {
      await update.mutateAsync({ id: editing.id, text: editText, category: editCat })
      setEditing(null)
      toast("Memory updated", "success")
    } catch {
      toast("Couldn't update the memory", "error")
    }
  }

  if (!memories.length) {
    return (
      <Card className="p-0">
        <EmptyState icon={Sparkles} title="No memories yet"
          description="Memories the assistant saves about you will appear here. Add one above, import a file, or extract from a chat." />
      </Card>
    )
  }

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
    active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {selectedIds.length > 0 ? (
            <>
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <Button size="sm" variant="destructive" disabled={bulkRemove.isPending} onClick={deleteSelected}><Trash2 className="size-4" />Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>Clear</Button>
            </>
          ) : (
            <>
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories…" aria-label="Search memories" className="h-8 pl-8" />
              </div>
              <button onClick={() => setCat(null)} aria-pressed={!cat} className={chip(!cat)}>All</button>
              {CATS.map((c) => <button key={c} onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={chip(cat === c)}>{c}</button>)}
            </>
          )}
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
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">No matching memories.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{matched.length} memor{matched.length === 1 ? "y" : "ies"}</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
            <Button variant="outline" size="iconSm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="iconSm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit memory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit() }} aria-label="Memory text" autoFocus />
            <div className="flex items-center gap-2">
              <Label htmlFor="edit-memory-cat">Category</Label>
              <select id="edit-memory-cat" value={editCat} onChange={(e) => setEditCat(e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm capitalize outline-none focus-visible:border-ring">
                {!CATS.includes(editCat) && <option value={editCat}>{editCat}</option>}
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={!editText.trim() || update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

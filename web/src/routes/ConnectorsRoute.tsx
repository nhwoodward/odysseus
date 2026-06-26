import { useMemo, useState } from "react"
// (icon lookups use a direct map index — see ICONS — not a function call, to
// satisfy react-hooks/static-components, mirroring components/ui/Toaster.)
import {
  Plug, Plus, Search, Loader2, Check, X, Trash2, ExternalLink, ArrowRight, ChevronRight,
  FileText, ListChecks, Code, CreditCard, Bug, Boxes, Users, Palette, Box,
  Zap, Database, Cloud, FolderOpen, Globe, Brain, MessageSquare,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useConnectorCatalog, useConnections, useConnectorMutations, useConnectorTools } from "@/api/connectors"
import type { CatalogEntry, Connection } from "@/api/connectors"
import { Switch } from "@/components/ui/switch"
import { Markdown } from "@/components/chat/Markdown"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  FileText, ListChecks, Code, CreditCard, Bug, Boxes, Users, Palette, Box,
  Zap, Database, Cloud, FolderOpen, Globe, Brain, MessageSquare, Search,
}
function CapBadges({ caps }: { caps: string[] }) {
  return (
    <>
      {caps.map((c) => (
        <span key={c} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">{c}</span>
      ))}
    </>
  )
}

function statusChip(status: string, needsAuth: boolean) {
  if (status === "connected") return { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Connected" }
  if (needsAuth) return { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Authorize" }
  if (status === "error") return { cls: "bg-destructive/15 text-destructive", label: "Error" }
  return { cls: "bg-muted text-muted-foreground", label: "Connecting…" }
}

const inp = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"

// A connected (or connecting) source the user owns. Expands to per-tool
// enable/disable switches (parity with the legacy/settings MCP tool toggles).
function ConnectionRow({ c, onDisconnect }: { c: Connection; onDisconnect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const chip = statusChip(c.status, c.needs_auth)
  const expandable = c.status === "connected" && c.tool_count > 0
  const { data: tools } = useConnectorTools(c.id, open && expandable)
  const { setTools } = useConnectorMutations()
  const toggle = (name: string, enabled: boolean) => {
    const disabled = new Set((tools || []).filter((t) => t.is_disabled).map((t) => t.name))
    if (enabled) disabled.delete(name)
    else disabled.add(name)
    setTools.mutate({ id: c.id, disabled: [...disabled] })
  }
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-3">
        {expandable ? (
          <button onClick={() => setOpen((o) => !o)} title="Manage tools" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className={cn("size-4 transition-transform duration-200", open && "rotate-90")} />
          </button>
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Plug className="size-[18px]" /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{c.tool_count} tool{c.tool_count === 1 ? "" : "s"}{c.error ? ` · ${c.error}` : ""}</span>
        </span>
        {c.needs_auth && c.auth_url && (
          <a href={c.auth_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
            <ExternalLink className="size-3.5" />Authorize
          </a>
        )}
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", chip.cls)}>{chip.label}</span>
        <button onClick={() => onDisconnect(c.id)} title="Disconnect" className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive">
          <Trash2 className="size-4" />
        </button>
      </div>
      {open && expandable && (
        <div className="space-y-1 border-t px-3 py-2">
          {!tools && <p className="py-1 text-xs text-muted-foreground">Loading tools…</p>}
          {(tools || []).map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate text-sm" title={t.description}>{t.name}</span>
              <Switch checked={!t.is_disabled} onCheckedChange={(v) => toggle(t.name, v)} />
            </div>
          ))}
          {tools && tools.length === 0 && <p className="py-1 text-xs text-muted-foreground">No tools discovered.</p>}
        </div>
      )}
    </div>
  )
}

// A catalog entry card with the Connect affordance (remote = OAuth, local = a
// small field form).
function CatalogCard({ entry, connectedCount, onConnected, isAdmin, onSetAvailable }: {
  entry: CatalogEntry
  connectedCount: number
  onConnected: (authUrl?: string | null) => void
  isAdmin?: boolean
  onSetAvailable?: (val: boolean) => void
}) {
  const { connect } = useConnectorMutations()
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [err, setErr] = useState("")
  const Icon = ICONS[entry.icon] || Plug
  const needsForm = entry.kind === "local" && (entry.fields?.length || entry.help)

  const doConnect = async (fields?: Record<string, string>) => {
    setErr("")
    try {
      const res = await connect.mutateAsync({ id: entry.id, fields })
      setOpen(false)
      // Remote OAuth: pop the provider consent screen; polling flips it live.
      if (res.needs_auth && res.auth_url) window.open(res.auth_url, "_blank", "noopener,width=560,height=720")
      onConnected(res.auth_url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't connect")
    }
  }

  const onClickConnect = () => {
    if (needsForm) setOpen((o) => !o)
    else doConnect()
  }

  return (
    <div className="flex flex-col rounded-xl border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{entry.name}</span>
            {connectedCount > 0 && <Check className="size-3.5 shrink-0 text-emerald-500" />}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <CapBadges caps={entry.capabilities} />
        {entry.kind === "local" && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">local</span>}
        <button
          onClick={onClickConnect}
          disabled={connect.isPending}
          className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {connect.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {connectedCount > 0 ? "Add another" : "Connect"}
        </button>
      </div>

      {open && needsForm && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {entry.help && <div className="prose-chat text-xs text-muted-foreground"><Markdown>{entry.help}</Markdown></div>}
          {(entry.fields || []).map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={vals[f.key] || ""}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                className={inp}
              />
              {f.help && <span className="mt-0.5 block text-[11px] text-muted-foreground">{f.help}</span>}
            </label>
          ))}
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">Cancel</button>
            <button onClick={() => doConnect(vals)} disabled={connect.isPending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">Connect</button>
          </div>
        </div>
      )}
      {err && !open && <p className="mt-2 text-xs text-destructive">{err}</p>}
      {isAdmin && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
          <span className="text-[11px] text-muted-foreground">Available to users</span>
          <Switch checked={entry.available !== false} onCheckedChange={(v) => onSetAvailable?.(v)} />
        </div>
      )}
    </div>
  )
}

function CustomConnector({ onAdded }: { onAdded: () => void }) {
  const { connectCustom } = useConnectorMutations()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [err, setErr] = useState("")
  const add = async () => {
    setErr("")
    try {
      const res = await connectCustom.mutateAsync({ name, url })
      setOpen(false); setName(""); setUrl("")
      if (res.needs_auth && res.auth_url) window.open(res.auth_url, "_blank", "noopener,width=560,height=720")
      onAdded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add connector")
    }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
        <Plus className="size-4" />Add custom
      </button>
    )
  }
  return (
    <div className="w-full space-y-2 rounded-xl border bg-card p-3">
      <div className="text-xs font-medium text-muted-foreground">Add a custom remote MCP connector</div>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inp} />
      <input placeholder="https://mcp.example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} className={inp} />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">Cancel</button>
        <button onClick={add} disabled={connectCustom.isPending || !url} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {connectCustom.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}Connect
        </button>
      </div>
    </div>
  )
}

export function ConnectorsRoute() {
  const { data: catalog, isLoading } = useConnectorCatalog()
  const { data: connections } = useConnections()
  const { disconnect, setAvailability } = useConnectorMutations()
  const [q, setQ] = useState("")

  const conns = useMemo(() => connections || [], [connections])
  const countByCatalog = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of conns) if (c.catalog_id) m[c.catalog_id] = (m[c.catalog_id] || 0) + 1
    return m
  }, [conns])

  const entries = useMemo(() => catalog?.connectors || [], [catalog])
  // Admins get an `available` flag on each catalog entry; use it to detect admin
  // and to drive the per-card "Available to users" curation toggle.
  const isAdmin = useMemo(() => entries.some((e) => e.available !== undefined), [entries])
  const enabledIds = useMemo(() => entries.filter((e) => e.available === true).map((e) => e.id), [entries])
  const setAvailable = (id: string, val: boolean) => {
    const next = new Set(enabledIds)
    if (val) next.add(id)
    else next.delete(id)
    setAvailability.mutate([...next])
  }
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(term) || e.description.toLowerCase().includes(term) || e.category.toLowerCase().includes(term))
  }, [entries, q])

  const byCategory = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {}
    for (const e of filtered) (groups[e.category] ||= []).push(e)
    const order = catalog?.categories || []
    return Object.entries(groups).sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
  }, [filtered, catalog?.categories])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
        <Plug className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Connectors</h1>
        <div className="relative ml-2 hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connectors…" className="h-8 w-56 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:border-ring" />
        </div>
        <div className="ml-auto"><CustomConnector onAdded={() => {}} /></div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        {conns.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your connections</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {conns.map((c) => <ConnectionRow key={c.id} c={c} onDisconnect={(id) => disconnect.mutate(id)} />)}
            </div>
          </section>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading connectors…</p>}

        {byCategory.map(([cat, items]) => (
          <section key={cat} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((e) => (
                <CatalogCard
                  key={e.id}
                  entry={e}
                  connectedCount={countByCatalog[e.id] || 0}
                  onConnected={() => {}}
                  isAdmin={isAdmin}
                  onSetAvailable={(v) => setAvailable(e.id, v)}
                />
              ))}
            </div>
          </section>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <X className="size-8" />
            <p className="text-sm">No connectors match “{q}”.</p>
          </div>
        )}
      </div>
    </div>
  )
}

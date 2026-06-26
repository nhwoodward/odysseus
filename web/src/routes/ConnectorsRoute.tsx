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
import { inputClass } from "@/components/ui/input"
import { Markdown } from "@/components/chat/Markdown"
import { BrandLogo } from "@/components/connectors/BrandLogo"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  FileText, ListChecks, Code, CreditCard, Bug, Boxes, Users, Palette, Box,
  Zap, Database, Cloud, FolderOpen, Globe, Brain, MessageSquare, Search,
}
function CapBadges({ caps }: { caps: string[] }) {
  return (
    <>
      {caps.map((c) => (
        <span key={c} className="rounded-full bg-muted px-1.5 py-0.5 text-micro font-medium capitalize text-muted-foreground">{c}</span>
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

const inp = inputClass

// A connected (or connecting) source the user owns. Expands to per-tool
// enable/disable switches (parity with the legacy/settings MCP tool toggles).
function ConnectionRow({ c, brand, onDisconnect }: { c: Connection; brand?: string; onDisconnect: (id: string) => void }) {
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
        <BrandLogo brand={brand} fallback={Plug} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{c.tool_count} tool{c.tool_count === 1 ? "" : "s"}{c.error ? ` · ${c.error}` : ""}</span>
        </span>
        {c.needs_auth && c.auth_url && (
          <a href={c.auth_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
            <ExternalLink className="size-3.5" />Authorize
          </a>
        )}
        {expandable && (
          <button onClick={() => setOpen((o) => !o)} title="Manage tools" aria-expanded={open} className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronRight className={cn("size-4 transition-transform duration-200", open && "rotate-90")} />
          </button>
        )}
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-label font-medium", chip.cls)}>{chip.label}</span>
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
        <BrandLogo brand={entry.brand} fallback={Icon} />
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
        {entry.kind === "local" && <span className="rounded-full bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">local</span>}
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
              {f.help && <span className="mt-0.5 block text-label text-muted-foreground">{f.help}</span>}
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
          <span className="text-label text-muted-foreground">Available to users</span>
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
  const [tab, setTab] = useState("featured") // "featured" | "all" | <category name>

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
  const brandById = useMemo(() => {
    const m: Record<string, string | undefined> = {}
    for (const e of entries) m[e.id] = e.brand
    return m
  }, [entries])

  const categories = useMemo(() => catalog?.categories || [], [catalog?.categories])
  const hasFeatured = useMemo(() => entries.some((e) => e.featured), [entries])
  const term = q.trim().toLowerCase()
  const searching = term.length > 0
  // If "Featured" is selected but the (admin-curated) set has no featured items,
  // fall back to All so the grid is never empty for a non-search reason.
  const activeTab = tab === "featured" && !hasFeatured ? "all" : tab

  const matches = useMemo(() => {
    if (!searching) return entries
    return entries.filter((e) =>
      e.name.toLowerCase().includes(term) ||
      e.description.toLowerCase().includes(term) ||
      e.category.toLowerCase().includes(term))
  }, [entries, term, searching])

  // The displayed set: search wins; otherwise the active tab filters.
  const visible = useMemo(() => {
    if (searching) return matches
    if (activeTab === "featured") return entries.filter((e) => e.featured)
    if (activeTab === "all") return entries
    return entries.filter((e) => e.category === activeTab)
  }, [searching, matches, activeTab, entries])

  // Only the "All" tab (no search) groups into per-category sections.
  const grouped = !searching && activeTab === "all"
  const byCategory = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {}
    for (const e of visible) (groups[e.category] ||= []).push(e)
    return Object.entries(groups).sort((a, b) => (categories.indexOf(a[0]) + 1 || 99) - (categories.indexOf(b[0]) + 1 || 99))
  }, [visible, categories])

  const tabs = useMemo(() => {
    const t: { id: string; label: string }[] = []
    if (hasFeatured) t.push({ id: "featured", label: "Featured" })
    t.push({ id: "all", label: "All" })
    for (const c of categories) t.push({ id: c, label: c })
    return t
  }, [hasFeatured, categories])

  const card = (e: CatalogEntry) => (
    <CatalogCard
      key={e.id}
      entry={e}
      connectedCount={countByCatalog[e.id] || 0}
      onConnected={() => {}}
      isAdmin={isAdmin}
      onSetAvailable={(v) => setAvailable(e.id, v)}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Plug className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Connectors</h1>
          {entries.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">{entries.length}</span>}
          <div className="ml-auto"><CustomConnector onAdded={() => {}} /></div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search connectors by name, category, or what they do…"
            aria-label="Search connectors"
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus-visible:border-ring"
          />
          {q && (
            <button onClick={() => setQ("")} title="Clear search" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
        {!searching && tabs.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={activeTab === t.id}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  activeTab === t.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        {conns.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your connections</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {conns.map((c) => <ConnectionRow key={c.id} c={c} brand={c.catalog_id ? brandById[c.catalog_id] : undefined} onDisconnect={(id) => disconnect.mutate(id)} />)}
            </div>
          </section>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading connectors…</p>}

        {!isLoading && entries.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {searching ? `Results for “${q}”` : activeTab === "featured" ? "Featured" : activeTab === "all" ? "All connectors" : activeTab}
            </h2>
            <span className="shrink-0 text-xs text-muted-foreground">{visible.length} connector{visible.length === 1 ? "" : "s"}</span>
          </div>
        )}

        {grouped ? (
          byCategory.map(([cat, items]) => (
            <section key={cat} className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(card)}</div>
            </section>
          ))
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(card)}</div>
        )}

        {!isLoading && visible.length === 0 && (
          <EmptyState
            icon={Search}
            title={searching ? `No connectors match “${q}”` : "Nothing here yet"}
            description={searching ? "Try a different name, category, or keyword — or add a custom MCP connector." : "Connectors will show up here."}
          />
        )}
      </div>
    </div>
  )
}

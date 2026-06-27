import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiJson } from "@/lib/api"

export interface ConnectorField {
  key: string
  label: string
  help?: string
  secret?: boolean
  placeholder?: string
}

export interface CatalogEntry {
  id: string
  name: string
  description: string
  category: string
  icon: string
  brand?: string // simple-icons slug for the brand logo (BrandLogo); absent = lucide fallback
  featured?: boolean
  capabilities: string[]
  kind: "remote" | "local"
  auth_type: string
  url?: string
  transport?: string
  fields?: ConnectorField[]
  help?: string
  available?: boolean // admin view only
}

export interface Connection {
  id: string
  name: string
  catalog_id?: string | null
  owner?: string | null
  transport: string
  url?: string | null
  status: string
  tool_count: number
  needs_auth: boolean
  auth_url?: string | null
  error?: string | null
  last_connected_at?: string | null
}

export interface ConnectResult {
  id: string
  name: string
  connected: boolean
  status: string
  needs_auth: boolean
  auth_url?: string | null
  tool_count: number
  error?: string | null
}

export interface ConnectorTool {
  server_id: string
  name: string
  description?: string
  is_disabled: boolean
}

// Tools exposed by one connected source (only fetched when its card is open).
export function useConnectorTools(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["connector-tools", id],
    enabled,
    retry: false,
    queryFn: () => apiJson<{ tools: ConnectorTool[] }>(`/api/connectors/${id}/tools`).then((r) => r.tools),
  })
}

// Admin-only: which catalog entries are available to users (null = all).
export function useConnectorAvailability(enabled: boolean) {
  return useQuery({
    queryKey: ["connector-availability"],
    enabled,
    retry: false,
    queryFn: () => apiJson<{ enabled: string[] | null; all_ids: string[] }>("/api/connectors/admin/availability"),
  })
}

export function useConnectorCatalog(enabled = true) {
  return useQuery({
    queryKey: ["connector-catalog"],
    enabled,
    retry: false,
    queryFn: () => apiJson<{ connectors: CatalogEntry[]; categories: string[] }>("/api/connectors/catalog"),
  })
}

// Self-polls while any connection is still settling (connecting / needs_auth)
// so a card flips to "Connected" right after the user finishes the OAuth popup,
// then goes quiet once everything is settled.
export function useConnections() {
  return useQuery({
    queryKey: ["connectors"],
    retry: false,
    queryFn: () => apiJson<{ connections: Connection[] }>("/api/connectors").then((r) => r.connections),
    refetchInterval: (q) => {
      const data = q.state.data as Connection[] | undefined
      const pending = !!data && data.some((c) => c.status !== "connected" && c.status !== "error")
      return pending ? 2500 : false
    },
  })
}

async function errOf(r: Response, fallback: string): Promise<string> {
  try {
    const j = await r.json()
    return (j && (j.detail || j.error)) || fallback
  } catch {
    return fallback
  }
}

export function useConnectorMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ["connectors"] })
  return {
    connect: useMutation({
      mutationFn: async (v: { id: string; fields?: Record<string, string> }): Promise<ConnectResult> => {
        const fd = new FormData()
        fd.append("fields", JSON.stringify(v.fields || {}))
        const r = await apiFetch(`/api/connectors/${encodeURIComponent(v.id)}/connect`, { method: "POST", body: fd })
        if (!r.ok) throw new Error(await errOf(r, "Couldn't connect"))
        return r.json()
      },
      onSuccess: inv,
    }),
    connectCustom: useMutation({
      mutationFn: async (v: { name: string; url: string }): Promise<ConnectResult> => {
        const fd = new FormData()
        fd.append("name", v.name)
        fd.append("url", v.url)
        const r = await apiFetch("/api/connectors/custom", { method: "POST", body: fd })
        if (!r.ok) throw new Error(await errOf(r, "Couldn't add connector"))
        return r.json()
      },
      onSuccess: inv,
    }),
    disconnect: useMutation({
      mutationFn: async (id: string) => {
        const r = await apiFetch(`/api/connectors/${id}`, { method: "DELETE" })
        if (!r.ok) throw new Error(await errOf(r, "Couldn't disconnect"))
      },
      onSuccess: inv,
    }),
    setTools: useMutation({
      mutationFn: async (v: { id: string; disabled: string[] }) => {
        const fd = new FormData()
        fd.append("disabled_tools", JSON.stringify(v.disabled))
        const r = await apiFetch(`/api/connectors/${v.id}/tools`, { method: "PATCH", body: fd })
        if (!r.ok) throw new Error(await errOf(r, "Couldn't update tools"))
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["connector-tools", v.id] }),
    }),
    setAvailability: useMutation({
      mutationFn: async (enabled: string[]) => {
        const fd = new FormData()
        fd.append("enabled", JSON.stringify(enabled))
        const r = await apiFetch("/api/connectors/admin/availability", { method: "PUT", body: fd })
        if (!r.ok) throw new Error(await errOf(r, "Couldn't update availability"))
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["connector-availability"] })
        qc.invalidateQueries({ queryKey: ["connector-catalog"] })
      },
    }),
  }
}

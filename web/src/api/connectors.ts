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

export function useConnectorCatalog() {
  return useQuery({
    queryKey: ["connector-catalog"],
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
  }
}

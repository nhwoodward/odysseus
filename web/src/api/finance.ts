import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiJson } from "@/lib/api"

// ── Types (mirror routes/finance_routes.py + src/finance_service.py) ──
export interface FinanceStatus { configured: boolean; env: string; item_count: number }
export interface PlaidAccount {
  account_id: string; name?: string; mask?: string; type?: string; subtype?: string
  kind?: "asset" | "liability" | "other"; current?: number | null; available?: number | null
  iso_currency_code?: string | null; institution?: string | null
}
export interface PlaidItemInfo {
  id: string; item_id: string; institution_name?: string | null; institution_id?: string | null
  status?: string; error?: string | null; accounts?: Array<Record<string, unknown>>
}
export interface Balances { accounts: PlaidAccount[]; assets: number; liabilities: number; net_worth: number; errors: unknown[] }
export interface Txn {
  date?: string; name?: string; amount?: number; category?: string
  iso_currency_code?: string | null; pending?: boolean; institution?: string | null
}
export interface Subscription {
  description?: string; frequency?: string; average_amount?: number | null
  last_date?: string; predicted_next_date?: string; status?: string; category?: string; institution?: string | null
}
export interface Holding {
  name?: string; ticker?: string | null; type?: string | null; quantity?: number | null
  value?: number | null; iso_currency_code?: string | null; institution?: string | null
}
export interface FinanceSummary {
  net_worth: number; assets: number; liabilities: number; accounts_count: number
  spending_30d_total: number; spending_by_category: { category: string; amount: number }[]
  subscriptions_count: number; subscriptions_monthly: number
  investments_value: number; investments_allocation: Record<string, number>; pending: boolean
}

export function useFinanceStatus() {
  return useQuery({ queryKey: ["finance-status"], retry: false, queryFn: () => apiJson<FinanceStatus>("/api/finance/status") })
}
export function useFinanceItems(enabled = true) {
  return useQuery({ queryKey: ["finance-items"], enabled, retry: false, queryFn: () => apiJson<{ items: PlaidItemInfo[] }>("/api/finance/items").then((r) => r.items) })
}
export function useFinanceSummary(enabled = true) {
  return useQuery({ queryKey: ["finance-summary"], enabled, retry: false, queryFn: () => apiJson<FinanceSummary>("/api/finance/summary") })
}
export function useFinanceAccounts(enabled = true) {
  return useQuery({ queryKey: ["finance-accounts"], enabled, retry: false, queryFn: () => apiJson<Balances>("/api/finance/accounts") })
}
export function useFinanceTransactions(days = 90, enabled = true) {
  return useQuery({ queryKey: ["finance-transactions", days], enabled, retry: false, queryFn: () => apiJson<{ transactions: Txn[]; pending: boolean }>(`/api/finance/transactions?days=${days}`) })
}
export function useFinanceRecurring(enabled = true) {
  return useQuery({ queryKey: ["finance-recurring"], enabled, retry: false, queryFn: () => apiJson<{ subscriptions: Subscription[]; monthly_total: number }>("/api/finance/recurring") })
}
export function useFinanceInvestments(enabled = true) {
  return useQuery({ queryKey: ["finance-investments"], enabled, retry: false, queryFn: () => apiJson<{ holdings: Holding[]; total_value: number; allocation: Record<string, number> }>("/api/finance/investments") })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Plaid Hosted Link: open the Plaid-hosted page in a popup (no CSP/SDK), then
// poll /exchange until the session yields a public_token and the server stores
// an encrypted Item. Mirrors the connectors' OAuth popup flow.
async function connectBank(): Promise<{ connected: boolean }> {
  const popup = window.open("about:blank", "plaid-link", "width=560,height=760,noopener=false")
  let r: Response
  try {
    r = await apiFetch("/api/finance/link-token", { method: "POST" })
  } catch (e) {
    popup?.close()
    throw e
  }
  if (!r.ok) { popup?.close(); throw new Error((await r.json().catch(() => ({}))).detail || "Couldn't start Plaid Link") }
  const { hosted_link_url, link_token } = await r.json()
  if (!hosted_link_url || !link_token) { popup?.close(); throw new Error("Plaid Link is unavailable") }
  if (popup) popup.location.href = hosted_link_url
  else window.open(hosted_link_url, "_blank", "noopener")

  // Poll for completion (~5 min). Stop shortly after the popup closes.
  let closedTicks = 0
  for (let i = 0; i < 140; i++) {
    await sleep(2500)
    const fd = new FormData(); fd.set("link_token", link_token)
    const er = await apiFetch("/api/finance/exchange", { method: "POST", body: fd })
    if (er.ok) {
      const data = await er.json()
      if (!data.pending) { popup?.close(); return { connected: true } }
    }
    if (popup && popup.closed) { closedTicks += 1; if (closedTicks >= 3) break }
  }
  popup?.close()
  return { connected: false }
}

export function useFinanceMutations() {
  const qc = useQueryClient()
  const invalidateAll = () => {
    for (const k of ["finance-status", "finance-items", "finance-summary", "finance-accounts", "finance-transactions", "finance-recurring", "finance-investments"]) {
      qc.invalidateQueries({ queryKey: [k] })
    }
  }
  return {
    connect: useMutation({ mutationFn: connectBank, onSuccess: invalidateAll }),
    removeItem: useMutation({
      mutationFn: async (id: string) => {
        const r = await apiFetch(`/api/finance/items/${id}`, { method: "DELETE" })
        if (!r.ok) throw new Error("Couldn't disconnect")
      },
      onSuccess: invalidateAll,
    }),
  }
}

// Currency formatting helper used across the dashboard.
export function money(n?: number | null, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n)
}

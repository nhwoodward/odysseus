import { useIsFetching, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiJson } from "@/lib/api"
import { toast } from "@/stores/toast"

// Every finance query key — used to invalidate/refetch the whole dashboard at
// once and to detect when any finance data is in flight (the header spinner).
const FINANCE_KEYS = [
  "finance-status", "finance-items", "finance-summary", "finance-cashflow", "finance-networth",
  "finance-accounts", "finance-transactions", "finance-recurring", "finance-investments",
] as const

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
export interface CashflowMonth { month: string; income: number; expenses: number; net: number }
export interface CashflowCategory { category: string; amount: number; prev: number; delta_pct: number | null }
export interface FinanceCashflow {
  months: CashflowMonth[]
  categories: CashflowCategory[]
  this_month: { income: number; expenses: number; net: number }
  income_mom: number; expense_mom: number; pending: boolean
}
// Net-worth trend (Phase 1) — daily snapshots accumulated forward from the first
// dashboard load (Plaid can't backfill historical balances).
export interface NetWorthPoint { day: string; net_worth: number; assets: number; liabilities: number }
export interface NetWorthHistory { points: NetWorthPoint[] }

// Admin-only Plaid setup snapshot (in-UI onboarding). `client_id` is shown but
// the secret is NEVER returned — only `has_secret`. `source` = settings | env | none.
export interface FinanceConfig {
  configured: boolean; env: string; client_id: string; has_secret: boolean
  source: "settings" | "env" | "none"
}

export function useFinanceStatus() {
  return useQuery({ queryKey: ["finance-status"], retry: false, queryFn: () => apiJson<FinanceStatus>("/api/finance/status") })
}
// Only fetched for admins (the endpoint is admin-gated → 403 otherwise).
export function useFinanceConfig(enabled = true) {
  return useQuery({ queryKey: ["finance-config"], enabled, retry: false, queryFn: () => apiJson<FinanceConfig>("/api/finance/config") })
}
export function useSaveFinanceConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cfg: { client_id: string; env: string; secret?: string }) => {
      const fd = new FormData()
      fd.set("client_id", cfg.client_id.trim())
      fd.set("env", cfg.env)
      if (cfg.secret?.trim()) fd.set("secret", cfg.secret.trim())
      const r = await apiFetch("/api/finance/config", { method: "PUT", body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Couldn't save Plaid settings")
      return (await r.json()) as FinanceConfig
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-config"] })
      qc.invalidateQueries({ queryKey: ["finance-status"] })
    },
  })
}
export function useFinanceItems(enabled = true) {
  return useQuery({ queryKey: ["finance-items"], enabled, retry: false, queryFn: () => apiJson<{ items: PlaidItemInfo[] }>("/api/finance/items").then((r) => r.items) })
}
export function useFinanceSummary(enabled = true) {
  return useQuery({ queryKey: ["finance-summary"], enabled, retry: false, queryFn: () => apiJson<FinanceSummary>("/api/finance/summary") })
}
export function useFinanceCashflow(enabled = true) {
  return useQuery({ queryKey: ["finance-cashflow"], enabled, retry: false, queryFn: () => apiJson<FinanceCashflow>("/api/finance/cashflow") })
}
export function useFinanceNetworth(enabled = true) {
  return useQuery({ queryKey: ["finance-networth"], enabled, retry: false, queryFn: () => apiJson<NetWorthHistory>("/api/finance/networth") })
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

// Thrown when the browser blocks the Plaid popup. Surfaced as a distinct type so
// ConnectStep can show a gesture-correct "allow pop-ups and try again" recovery
// rather than a generic error — a blocked popup is otherwise a silent dead end.
export class PopupBlockedError extends Error {
  constructor() {
    super("Your browser blocked the Plaid window.")
    this.name = "PopupBlockedError"
  }
}

// Plaid Hosted Link: open the Plaid-hosted page in a popup (no CSP/SDK), then
// poll /exchange until the session yields a public_token and the server stores
// an encrypted Item. Mirrors the connectors' OAuth popup flow. The popup is
// opened synchronously first so it counts as user-gesture-initiated; if the
// browser blocks it we bail immediately (the old post-await window.open fallback
// fired outside the gesture and silently failed too).
async function connectBank(): Promise<{ connected: boolean }> {
  const popup = window.open("about:blank", "plaid-link", "width=560,height=760,noopener=false")
  if (!popup) throw new PopupBlockedError()
  // Everything past the popup open is wrapped so ANY throw (network error / 401
  // redirect during the exchange poll, link-token failure, unavailable link)
  // closes the popup instead of leaking an orphaned window.
  try {
    const r = await apiFetch("/api/finance/link-token", { method: "POST" })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Couldn't start Plaid Link")
    const { hosted_link_url, link_token } = await r.json()
    if (!hosted_link_url || !link_token) throw new Error("Plaid Link is unavailable")
    popup.location.href = hosted_link_url

    // Poll for completion (~5 min). Stop shortly after the popup closes.
    let closedTicks = 0
    for (let i = 0; i < 140; i++) {
      await sleep(2500)
      const fd = new FormData(); fd.set("link_token", link_token)
      const er = await apiFetch("/api/finance/exchange", { method: "POST", body: fd })
      if (er.ok) {
        const data = await er.json()
        if (!data.pending) { popup.close(); return { connected: true } }
      }
      if (popup.closed) { closedTicks += 1; if (closedTicks >= 3) break }
    }
    popup.close()
    return { connected: false }
  } catch (e) {
    popup.close()
    throw e
  }
}

// Manual "refresh" affordance for the dashboard: re-fetch every finance query and
// expose whether any is currently in flight so the header can spin. Plaid data is
// slow and never auto-refreshes after the first load, so a user with no way to
// re-sync is stuck staring at stale balances until a full reload.
export function useFinanceRefresh() {
  const qc = useQueryClient()
  const fetching = useIsFetching({
    predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("finance-"),
  })
  const refresh = () => { for (const k of FINANCE_KEYS) qc.invalidateQueries({ queryKey: [k] }) }
  return { refresh, fetching: fetching > 0 }
}

export function useFinanceMutations() {
  const qc = useQueryClient()
  const invalidateAll = () => {
    for (const k of FINANCE_KEYS) qc.invalidateQueries({ queryKey: [k] })
  }
  return {
    connect: useMutation({
      mutationFn: connectBank,
      onSuccess: (data) => {
        if (data.connected) {
          // Optimistically mark connected (item_count >= 1) so the success hub
          // renders with connected === true and the real count arrives via the
          // refetch below. Without this, "View dashboard" could briefly derive
          // the pre-connect Connect step while finance-status is still refetching.
          qc.setQueryData<FinanceStatus>(["finance-status"], (old) =>
            old ? { ...old, item_count: Math.max(old.item_count, 1) } : old)
        }
        invalidateAll()
        // Timeout/abandon resolves { connected: false } (it doesn't throw, so the
        // global mutation-error toast never fires). Surface it so an
        // already-connected "Connect another"/"Add more" attempt isn't silent.
        if (!data.connected) toast("The Plaid window closed before finishing. Try again.", "info")
      },
    }),
    removeItem: useMutation({
      mutationFn: async (id: string) => {
        const r = await apiFetch(`/api/finance/items/${id}`, { method: "DELETE" })
        if (!r.ok) throw new Error("Couldn't disconnect")
      },
      onSuccess: invalidateAll,
    }),
  }
}

// Currency formatting helper used across the dashboard. `Intl.NumberFormat` is
// expensive to construct, and money() is called per-row in the transactions feed
// (which re-renders on every search keystroke) and across every card — so cache
// one formatter per currency instead of allocating one per call.
const moneyFmt = new Map<string, Intl.NumberFormat>()
export function money(n?: number | null, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "—"
  let fmt = moneyFmt.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
    moneyFmt.set(currency, fmt)
  }
  return fmt.format(n)
}

import { useState, type FormEvent } from "react"
import { Landmark, ExternalLink, Loader2 } from "lucide-react"
import { useFinanceConfig, useSaveFinanceConfig } from "@/api/finance"
import { useAuthStatus } from "@/api/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SectionCard } from "./fields"
import { cn } from "@/lib/utils"

// Admin-only, one-time Plaid key setup — the operator side of the consumer
// finance onboarding. Lives here (Settings → Integrations) so the /finance flow
// stays purely consumer (Get started → Connect). Production is the default;
// Sandbox is a tucked-away test toggle. Reuses the admin-gated
// PUT /api/finance/config (keys stored encrypted, applied with no restart).
export function FinancePlaidSection() {
  const { data: auth } = useAuthStatus()
  const isAdmin = !!auth?.is_admin
  const { data: cfg } = useFinanceConfig(isAdmin)
  const save = useSaveFinanceConfig()
  const [clientId, setClientId] = useState("")
  const [secret, setSecret] = useState("")
  const [env, setEnv] = useState("production")
  const [showSandbox, setShowSandbox] = useState(false)
  const [prefilled, setPrefilled] = useState(false)

  // Prefill client_id/env from existing config exactly once (guarded render-time
  // setState — React's sanctioned pattern). Reveal the env toggle if the saved
  // env is a non-production/test one so the operator can see/change it.
  if (cfg && !prefilled) {
    setPrefilled(true)
    setClientId(cfg.client_id || "")
    const sandbox = cfg.env === "sandbox" || cfg.env === "development"
    setEnv(sandbox ? "sandbox" : "production")
    if (sandbox) setShowSandbox(true)
  }

  if (!isAdmin) return null

  const hasSavedSecret = !!cfg?.has_secret
  const configured = !!cfg?.configured
  const canSave = clientId.trim().length > 0 && (secret.trim().length > 0 || hasSavedSecret) && !save.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    save.mutate({ client_id: clientId.trim(), env, secret: secret.trim() || undefined })
  }

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Landmark className="size-3.5" />Finance (Plaid) <span className="normal-case text-muted-foreground/70">(admin)</span>
      </h2>
      <SectionCard>
        <p className="text-xs text-muted-foreground">
          Connect Plaid once so anyone here can link a bank or brokerage on the Finance page. Keys are
          stored encrypted and take effect immediately — no restart.{" "}
          {configured && <span className="font-medium text-emerald-600 dark:text-emerald-400">Connected.</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Free for personal use:</span> Plaid’s Trial plan covers up to
          10 connected accounts with real data at $0 — you only pay (pay-as-you-go) beyond that.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm">Client ID</span>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="e.g. 5f9a2b…" autoComplete="off" spellCheck={false} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">
              Secret{hasSavedSecret && <span className="text-xs font-normal text-muted-foreground"> · saved — leave blank to keep</span>}
            </span>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder={hasSavedSecret ? "••••••••••••" : "Your Plaid secret"} autoComplete="off" />
          </label>

          {showSandbox ? (
            <div className="space-y-1.5">
              <span className="text-sm">Environment</span>
              <div role="radiogroup" aria-label="Plaid environment" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
                {([["production", "Production"], ["sandbox", "Sandbox · test"]] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={env === v} onClick={() => setEnv(v)}
                    className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      env === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {env === "sandbox"
                  ? <>Test mode — fake banks, instant. Login <code className="rounded bg-muted px-1">user_good</code> / <code className="rounded bg-muted px-1">pass_good</code>.</>
                  : "Real institutions. Production needs an HTTPS redirect URI allowlisted in your Plaid dashboard (Team settings → API)."}
              </p>
            </div>
          ) : (
            <button type="button" onClick={() => { setShowSandbox(true); setEnv("sandbox") }}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Use sandbox (test mode) instead
            </button>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <a href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Get free keys <ExternalLink className="size-3" />
            </a>
            <div className="flex items-center gap-2">
              {save.isSuccess && !save.isPending && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
              <Button type="submit" size="sm" disabled={!canSave}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}Save
              </Button>
            </div>
          </div>
          {save.isError && <p className="text-sm text-destructive">{(save.error as Error)?.message || "Couldn't save Plaid settings."}</p>}
        </form>
      </SectionCard>
    </section>
  )
}

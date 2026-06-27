import { useEffect, useRef, useState, type FormEvent, type Ref } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  KeyRound, Landmark, Wallet, CreditCard, Repeat, PiggyBank,
  ShieldCheck, Lock, EyeOff, CheckCircle2, ExternalLink, Loader2,
  type LucideIcon,
} from "lucide-react"
import {
  useFinanceConfig, useSaveFinanceConfig, useFinanceMutations,
  type FinanceStatus,
} from "@/api/finance"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// In-route, stepped onboarding for the Personal Finance (Plaid) feature. The
// step is a pure function of (configured, connected, isAdmin) + a transient
// `celebrate` latch — no persisted "onboarded" flag. Saving keys / connecting a
// bank invalidate finance-status, which advances the flow on the next render.
//
// FinanceRoute is React.lazy, so framer-motion lives only in the finance chunk
// (never the eager bundle).

type ConnectMutation = ReturnType<typeof useFinanceMutations>["connect"]
type Step = "setup" | "connect" | "ask-admin" | "success"

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

const VALUE_PROPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Wallet, title: "Net worth", desc: "Every balance, totaled live." },
  { icon: CreditCard, title: "Spending", desc: "Categorized transactions and 30-day trends." },
  { icon: Repeat, title: "Subscriptions", desc: "Catch recurring charges before they renew." },
  { icon: PiggyBank, title: "Investments", desc: "Holdings and allocation at a glance." },
]

const SECURITY: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: ShieldCheck, title: "Read-only access", desc: "We see balances and transactions — we can never move money." },
  { icon: Lock, title: "Bank-grade encryption", desc: "Connections are secured end-to-end by Plaid." },
  { icon: EyeOff, title: "Credentials stay private", desc: "Odysseus never sees your bank username or password." },
  { icon: Landmark, title: "Powered by Plaid", desc: "The same secure network trusted by major finance apps." },
]

// Move keyboard focus to a step's heading when it mounts (a11y on step change).
function useAutoFocusHeading() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return ref
}

function Stepper({ total, current }: { total: number; current: number }) {
  return (
    <>
      <p className="sr-only" aria-live="polite">Step {current + 1} of {total}</p>
      <div className="mb-8 flex items-center justify-center gap-1.5" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-all duration-200", i === current ? "w-6 bg-foreground" : "w-1.5 bg-muted")} />
        ))}
      </div>
    </>
  )
}

function HeroHeader({ icon: Icon, title, subtitle, headingRef }: {
  icon: LucideIcon; title: string; subtitle: string; headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function ValueProps() {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
      {VALUE_PROPS.map(({ icon: Icon, title, desc }) => (
        <li key={title} className="flex items-start gap-3 rounded-lg border bg-card p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function SecurityList() {
  return (
    <ul className="mx-auto mt-6 max-w-md space-y-2.5 text-left">
      {SECURITY.map(({ icon: Icon, title, desc }) => (
        <li key={title} className="flex items-start gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{title}.</span> {desc}</p>
        </li>
      ))}
    </ul>
  )
}

// Step 1 (admin): the operator's one-time Plaid key entry. Refactored from the
// old PlaidSetupCard. useFinanceConfig runs only here — i.e. only for admins —
// so non-admins never hit the admin-gated /config (403).
function SetupStep({ onSaved }: { onSaved: () => void }) {
  const { data: cfg } = useFinanceConfig(true)
  const save = useSaveFinanceConfig()
  const [clientId, setClientId] = useState("")
  const [secret, setSecret] = useState("")
  const [env, setEnv] = useState("sandbox")
  const [prefilled, setPrefilled] = useState(false)
  const headingRef = useAutoFocusHeading()

  // Prefill client_id/env from any existing config (e.g. env-var keys) exactly
  // once. Guarded render-time setState is React's sanctioned pattern here.
  if (cfg && !prefilled) {
    setPrefilled(true)
    setClientId(cfg.client_id || "")
    setEnv(cfg.env === "production" ? "production" : "sandbox")
  }

  // Advance once the save lands (configured flips -> parent re-renders to connect).
  useEffect(() => { if (save.isSuccess) onSaved() }, [save.isSuccess, onSaved])

  const hasSavedSecret = !!cfg?.has_secret
  const canSave = clientId.trim().length > 0 && (secret.trim().length > 0 || hasSavedSecret) && !save.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    save.mutate({ client_id: clientId, env, secret: secret.trim() || undefined })
  }

  return (
    <div>
      <HeroHeader headingRef={headingRef} icon={KeyRound} title="Add your Plaid keys"
        subtitle="One-time setup. Your developer keys are stored encrypted on this server and take effect immediately — no restart. After this, anyone here can connect an account." />
      <form onSubmit={submit} className="mx-auto mt-6 max-w-md space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">Client ID</span>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="e.g. 5f9a2b…" autoComplete="off" spellCheck={false} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">
            Secret{hasSavedSecret && <span className="font-normal text-muted-foreground"> · saved — leave blank to keep</span>}
          </span>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
            placeholder={hasSavedSecret ? "••••••••••••" : "Your sandbox or production secret"} autoComplete="off" />
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-medium">Environment</span>
          <div role="radiogroup" aria-label="Plaid environment" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
            {([["sandbox", "Sandbox"], ["production", "Production"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={env === v} onClick={() => setEnv(v)}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  env === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {env === "sandbox"
              ? <>Fake banks, instant. Test login <code className="rounded bg-muted px-1">user_good</code> / <code className="rounded bg-muted px-1">pass_good</code>.</>
              : "Real institutions — requires Plaid production approval."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <a href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Get free keys <ExternalLink className="size-3" />
          </a>
          <Button type="submit" disabled={!canSave}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}Save &amp; continue
          </Button>
        </div>
        {save.isError && <p className="text-sm text-destructive">{(save.error as Error)?.message || "Couldn't save Plaid settings."}</p>}
      </form>
    </div>
  )
}

// Step 2 (everyone, once configured): connect a bank via Plaid Hosted Link.
// connecting / timed-out / error are sub-states of this step, read from the
// shared `connect` mutation.
function ConnectStep({ connect, env, isAdmin, onEditKeys }: {
  connect: ConnectMutation; env?: string; isAdmin: boolean; onEditKeys: () => void
}) {
  const connecting = connect.isPending
  const timedOut = connect.isSuccess && connect.data?.connected === false
  const failed = connect.isError
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [connecting])

  if (connecting) {
    return (
      <div className="text-center" role="status">
        <Loader2 className="mx-auto size-10 animate-spin text-muted-foreground" aria-hidden="true" />
        <h2 ref={headingRef} tabIndex={-1} className="mt-5 text-xl font-semibold tracking-tight outline-none">Finish in the Plaid window</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Complete the secure login in the window that just opened. This page updates automatically when you’re done.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Don’t see a window? Your browser may have blocked the popup — <button type="button" onClick={() => connect.mutate()} className="underline underline-offset-2 hover:text-foreground">try again</button>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Closing the Plaid window cancels the connection.</p>
      </div>
    )
  }

  return (
    <div className="text-center">
      <HeroHeader headingRef={headingRef} icon={Landmark} title="Connect your first account"
        subtitle="Securely link a bank or brokerage through Plaid. It opens in a separate window — your credentials go straight to your bank, never to Odysseus." />
      {env && <div className="mt-3 flex justify-center"><Badge variant="secondary">{env}</Badge></div>}
      <ValueProps />
      <Button size="lg" className="mt-6" disabled={connecting} onClick={() => connect.mutate()}>
        <Landmark className="size-4" />Connect with Plaid
      </Button>
      {timedOut && <p className="mt-3 text-sm text-muted-foreground">The Plaid window closed before finishing. <button type="button" onClick={() => connect.mutate()} className="font-medium text-foreground underline underline-offset-2">Try again</button>.</p>}
      {failed && <p className="mt-3 text-sm text-destructive">{(connect.error as Error)?.message || "Couldn't start Plaid Link."}{isAdmin && <> · <button type="button" onClick={onEditKeys} className="underline underline-offset-2">Edit keys</button></>}</p>}
      <SecurityList />
      {isAdmin && !failed && (
        <button type="button" onClick={onEditKeys} className="mt-6 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Edit Plaid keys
        </button>
      )}
    </div>
  )
}

// Non-admin, no keys yet — a single polished state, not a wizard.
function AskAdminStep() {
  const headingRef = useAutoFocusHeading()
  return (
    <div className="text-center">
      <HeroHeader headingRef={headingRef} icon={Lock} title="Finance isn’t set up yet"
        subtitle="Your administrator needs to add Plaid keys before anyone can connect an account. Once that’s done, you’ll be able to link a bank or brokerage here and ask your assistant about your money." />
      <div className="mt-6 opacity-70"><ValueProps /></div>
    </div>
  )
}

function SuccessStep() {
  const headingRef = useAutoFocusHeading()
  return (
    <div className="animate-pop-in text-center">
      <CheckCircle2 className="mx-auto size-14 text-emerald-500" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="mt-5 text-xl font-semibold tracking-tight outline-none">You’re connected</h2>
      <p className="mt-2 text-sm text-muted-foreground">Pulling in your accounts now…</p>
    </div>
  )
}

export function FinanceOnboarding({ isAdmin, status, connect, celebrate }: {
  isAdmin: boolean
  status?: FinanceStatus
  connect: ConnectMutation
  celebrate: boolean
}) {
  const configured = !!status?.configured
  const [forceSetup, setForceSetup] = useState(false)

  const step: Step =
    celebrate ? "success"
      : (!configured || forceSetup) && isAdmin ? "setup"
        : !configured ? "ask-admin"
          : "connect"

  // Admins moving through setup -> connect get a 2-step progress indicator; a
  // lone connect step (non-admin or already-configured) hides it.
  const adminFlow = isAdmin && step !== "ask-admin" && step !== "success"
  const totalSteps = adminFlow ? 2 : 1
  const currentIndex = step === "setup" ? 0 : 1
  const showStepper = totalSteps > 1

  const reduce = useReducedMotion()

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8 lg:py-12">
      <div className="w-full max-w-xl">
        {showStepper && <Stepper total={totalSteps} current={currentIndex} />}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0.12 : 0.2, ease: EASE_OUT }}
          >
            {step === "setup" && <SetupStep onSaved={() => setForceSetup(false)} />}
            {step === "connect" && <ConnectStep connect={connect} env={status?.env} isAdmin={isAdmin} onEditKeys={() => setForceSetup(true)} />}
            {step === "ask-admin" && <AskAdminStep />}
            {step === "success" && <SuccessStep />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

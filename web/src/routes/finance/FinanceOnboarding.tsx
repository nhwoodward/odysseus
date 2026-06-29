import { useEffect, useRef, useState, type Ref } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Landmark, Wallet, CreditCard, Repeat, PiggyBank,
  ShieldCheck, PlugZap, Lock, Info, CheckCircle2,
  Sparkles, ArrowRight, Plus, Loader2,
  type LucideIcon,
} from "lucide-react"
import {
  useFinanceMutations, PopupBlockedError,
  type FinanceStatus, type PlaidItemInfo,
} from "@/api/finance"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useAskAssistant } from "@/lib/composerHandoff"
import { InstitutionList } from "./InstitutionList"
import { FinanceDisclaimer } from "./FinanceDisclaimer"

// Consumer onboarding for the Personal Finance (Plaid) feature — a ChatGPT-style
// flow: Get started → Connect Finances → connected. The operator's one-time Plaid
// key setup lives in admin Settings (Integrations), NOT here, so this surface is
// purely consumer. The step is a pure function of (configured, connected) + a
// transient `started` latch + the `celebrate` beat — no persisted flag.
//
// FinanceRoute is React.lazy, so framer-motion lives only in the finance chunk.

type ConnectMutation = ReturnType<typeof useFinanceMutations>["connect"]
type Step = "intro" | "connect" | "not-set-up" | "success"

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

const VALUE_PROPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Wallet, title: "Net worth", desc: "Every balance, totaled live." },
  { icon: CreditCard, title: "Spending", desc: "Categorized transactions and 30-day trends." },
  { icon: Repeat, title: "Subscriptions", desc: "Catch recurring charges before they renew." },
  { icon: PiggyBank, title: "Investments", desc: "Holdings and allocation at a glance." },
]

// The three concise disclosure blocks mirroring ChatGPT's "Connect Finances"
// sheet. Every claim is literally true of the Odysseus + Plaid integration.
const DISCLOSURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: ShieldCheck, title: "Private and secure", desc: "Read-only access through Plaid's bank-grade encryption — Odysseus can't move money and never sees your bank password." },
  { icon: PlugZap, title: "You're in control of your data", desc: "Disconnect any account in one tap; that deletes its stored data from Odysseus. Your bank login is never affected." },
  { icon: Info, title: "Information only", desc: "Balances, transactions and investments answer your questions — never full account numbers, never the ability to make changes." },
]

// Tone-coded environment badge. Production is the default and shows NOTHING (the
// consumer view stays clean); only a non-production env surfaces a small amber
// "test" hint so the operator can tell a sandbox connection apart.
export function EnvBadge({ env, className }: { env?: string; className?: string }) {
  if (!env || env === "production") return null
  const label = env === "sandbox" ? "Sandbox · test" : env.charAt(0).toUpperCase() + env.slice(1)
  return <Badge variant="warning" className={className}>{label}</Badge>
}

// Move keyboard focus to a step's heading when it mounts (a11y on step change).
function useAutoFocusHeading() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return ref
}

function HeroHeader({ icon: Icon, title, subtitle, headingRef }: {
  icon: LucideIcon; title: string; subtitle: string; headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

// Co-brand "you connect through Plaid" trust lockup — adapted into muted zinc
// tokens (no Plaid logo/colour, "Plaid" as text only). Decorative, so aria-hidden.
function BrandLockup() {
  return (
    <div className="mb-4 flex items-center justify-center gap-2.5" aria-hidden="true">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
        <Landmark className="size-6" />
      </span>
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => <span key={i} className="size-1 rounded-full bg-muted-foreground/40" />)}
      </span>
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-sm font-semibold tracking-tight text-muted-foreground">
        Plaid
      </span>
    </div>
  )
}

function ValueProps() {
  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
      {VALUE_PROPS.map(({ icon: Icon, title, desc }) => (
        <Card key={title} className="flex items-start gap-3 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </Card>
      ))}
    </ul>
  )
}

function Disclosures() {
  return (
    <ul className="mx-auto mt-6 max-w-md space-y-3 text-left">
      {DISCLOSURES.map(({ icon: Icon, title, desc }) => (
        <li key={title} className="flex items-start gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{title}.</span> {desc}</p>
        </li>
      ))}
    </ul>
  )
}

// Step 1 — "Get started" intro (ChatGPT screen 1): benefit-led, one tap to connect.
function IntroStep({ onStart }: { onStart: () => void }) {
  const headingRef = useAutoFocusHeading()
  return (
    <div className="text-center">
      <HeroHeader headingRef={headingRef} icon={Sparkles} title="Get personalized financial insights"
        subtitle="Securely connect your accounts to see your whole financial picture and ask your assistant about your money. Odysseus only reads your data — it can't move money or make changes." />
      <ValueProps />
      <Button size="lg" className="mt-6" onClick={onStart}>Get started</Button>
    </div>
  )
}

// Step 2 — "Connect Finances" (ChatGPT screen 2): the co-brand handoff + three
// concise disclosures + the Plaid Hosted Link connect. connecting / timed-out /
// error / popup-blocked are sub-states read from the shared `connect` mutation.
function ConnectStep({ connect, env }: { connect: ConnectMutation; env?: string }) {
  const connecting = connect.isPending
  const timedOut = connect.isSuccess && connect.data?.connected === false
  const popupBlocked = connect.isError && connect.error instanceof PopupBlockedError
  const failed = connect.isError && !popupBlocked
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
        <p className="mt-4 text-xs text-muted-foreground">Don’t see a window? Your browser may have blocked the popup.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => connect.mutate()}>Reopen Plaid window</Button>
        <p className="mt-3 text-xs text-muted-foreground">Closing the Plaid window cancels the connection.</p>
      </div>
    )
  }

  return (
    <div className="text-center">
      <BrandLockup />
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">Connect your accounts</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Securely link a bank or brokerage through Plaid. It opens in a separate window — your credentials go straight to your bank, never to Odysseus.
      </p>
      {env === "sandbox" && <div className="mt-3 flex justify-center"><EnvBadge env={env} /></div>}

      <Disclosures />

      <Button size="lg" className="mt-6" disabled={connecting} onClick={() => connect.mutate()}>
        <Landmark className="size-4" />Connect with Plaid
      </Button>
      <p className="mx-auto mt-3 max-w-md text-xs text-muted-foreground">
        Continuing opens Plaid’s secure login in a new window — your credentials go straight to Plaid, never to Odysseus. By connecting, you agree to Plaid’s{" "}
        <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</a>.
      </p>

      {/* Error sub-states share an assertive live region so screen-reader users
          hear the failure (focus stays on the heading via the effect above). */}
      <div role="alert" aria-live="assertive">
        {popupBlocked && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-left">
            <p className="text-sm font-medium">Your browser blocked the Plaid window</p>
            <p className="mt-1 text-xs text-muted-foreground">Allow pop-ups for this site, then try again — the secure Plaid login opens in a new window.</p>
            <Button className="mt-3" onClick={() => connect.mutate()}>Allow pop-ups and try again</Button>
          </div>
        )}
        {timedOut && <p className="mt-3 text-sm text-muted-foreground">The Plaid window closed before finishing. <button type="button" onClick={() => connect.mutate()} className="font-medium text-foreground underline underline-offset-2">Try again</button>.</p>}
        {failed && <p className="mt-3 text-sm text-destructive">{(connect.error as Error)?.message || "Couldn't start Plaid Link."} <button type="button" onClick={() => connect.mutate()} className="font-medium text-foreground underline underline-offset-2">Try again</button>.</p>}
      </div>
    </div>
  )
}

// Plaid not configured yet. Admins get a one-tap jump to the Settings key form;
// non-admins are told their administrator needs to set it up.
function NotSetUpStep({ isAdmin }: { isAdmin: boolean }) {
  const headingRef = useAutoFocusHeading()
  const navigate = useNavigate()
  if (isAdmin) {
    return (
      <div className="text-center">
        <HeroHeader headingRef={headingRef} icon={Landmark} title="Finance isn’t set up yet"
          subtitle="Connect Plaid once in Settings, then anyone here can link a bank or brokerage and ask the assistant about their money." />
        <Button className="mt-6" onClick={() => navigate("/settings?section=integrations")}>Open Settings</Button>
        <div className="mt-6 opacity-70"><ValueProps /></div>
      </div>
    )
  }
  return (
    <div className="text-center">
      <HeroHeader headingRef={headingRef} icon={Lock} title="Finance isn’t set up yet"
        subtitle="Your administrator needs to connect Plaid before anyone can link an account. Once that’s done, you’ll be able to connect a bank here and ask your assistant about your money." />
      <div className="mt-6 opacity-70"><ValueProps /></div>
    </div>
  )
}

const STARTER_QUESTIONS = [
  "What’s my net worth right now?",
  "Where did I spend the most in the last 30 days?",
  "Which subscriptions can I cancel?",
]

// Persistent, data-aware confirmation hub (no auto-dismiss). Shows the connected
// institutions with live status, deep-links starter questions into the chat
// assistant (the manage_finance differentiator), and hands control to the user
// via Add more / View dashboard. Falls back to a spinner until items populate.
function SuccessStep({ items, pending, onAddMore, onViewDashboard }: {
  items?: PlaidItemInfo[]; pending?: boolean; onAddMore: () => void; onViewDashboard: () => void
}) {
  const headingRef = useAutoFocusHeading()
  const ask = useAskAssistant()
  const hasItems = !!items?.length

  return (
    <div className="animate-pop-in text-center">
      <CheckCircle2 className="mx-auto size-14 text-emerald-500" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="mt-5 text-xl font-semibold tracking-tight outline-none">Great — your accounts are connected</h2>

      {hasItems ? (
        <>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Here’s what’s linked. Ask your assistant anything about it.</p>

          <div className="mx-auto mt-5 max-w-md text-left">
            <InstitutionList items={items!} pending={pending} />
          </div>

          <div className="mx-auto mt-5 max-w-md text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ask your assistant</p>
            <div className="flex flex-col gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button key={q} type="button" onClick={() => ask(q)}
                  className="group flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent">
                  <span className="flex items-center gap-2"><Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{q}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        // Items haven't populated yet (status flipped before the items query
        // resolved). Show a holding message — but keep the actions below so the
        // user is never stuck here, even if the items query errors.
        <p className="mt-2 text-sm text-muted-foreground">Pulling in your accounts now…</p>
      )}

      <div className="mt-6 flex items-center justify-center gap-2">
        <Button variant="outline" onClick={onAddMore}><Plus className="size-4" />Add more</Button>
        <Button onClick={onViewDashboard}>View dashboard</Button>
      </div>
    </div>
  )
}

export function FinanceOnboarding({ isAdmin, status, connect, celebrate, items, pending }: {
  isAdmin: boolean
  status?: FinanceStatus
  connect: ConnectMutation
  celebrate: boolean
  items?: PlaidItemInfo[]
  pending?: boolean
}) {
  const configured = !!status?.configured
  // Transient: clicking "Get started" advances the intro → connect. Resets when
  // the route swaps onboarding out (e.g. after connecting, or disconnect-all).
  const [started, setStarted] = useState(false)

  const step: Step =
    celebrate ? "success"
      : !configured ? "not-set-up"
        // `connect.isPending` covers the dashboard "Connect another" remount, which
        // mounts this fresh (started=false) — without it that path would flash the
        // first-run intro behind the Plaid popup instead of the connecting screen.
        : (started || connect.isPending) ? "connect"
          : "intro"

  const reduce = useReducedMotion()

  return (
    // Top-aligned on phones (sm:items-center on larger): vertical centering would
    // otherwise push the primary CTA below the fold on small screens.
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-8 sm:items-center lg:py-12">
      <div className="w-full max-w-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0.12 : 0.2, ease: EASE_OUT }}
          >
            {step === "intro" && <IntroStep onStart={() => setStarted(true)} />}
            {step === "connect" && <ConnectStep connect={connect} env={status?.env} />}
            {step === "not-set-up" && <NotSetUpStep isAdmin={isAdmin} />}
            {step === "success" && <SuccessStep items={items} pending={pending} onAddMore={() => connect.mutate()} onViewDashboard={() => connect.reset()} />}
          </motion.div>
        </AnimatePresence>
        <FinanceDisclaimer />
      </div>
    </div>
  )
}

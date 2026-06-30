import { useId, useState } from "react"
import { X, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { IconButton } from "@/components/ui/IconButton"
import { Switch } from "@/components/ui/switch"
import { Input, inputClass } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { cn } from "@/lib/utils"

// Reusable settings field primitives, built on the shadcn Field + Input/Textarea
// primitives. Text/number/textarea commit on blur (or Enter) so we don't POST on
// every keystroke; they stay uncontrolled and keyed by the committed value so a
// server refresh resets them cleanly (no effect).

export function SectionCard({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-lg border bg-card p-3">{children}</div>
}

// Horizontal: label (+ hint) on the left, control on the right.
export function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <Field orientation="horizontal" className="gap-3 py-0.5">
      <div className="flex min-w-0 flex-auto flex-col gap-0.5">
        <FieldLabel htmlFor={htmlFor} className="text-sm font-normal">{label}</FieldLabel>
        {hint && <FieldDescription className="text-xs">{hint}</FieldDescription>}
      </div>
      {children}
    </Field>
  )
}

// Vertical: label (+ hint) above the control.
export function FieldRow({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <Field className="gap-1.5 py-0.5">
      <FieldLabel htmlFor={htmlFor} className="text-sm font-normal">{label}</FieldLabel>
      {hint && <FieldDescription className="text-xs">{hint}</FieldDescription>}
      {children}
    </Field>
  )
}

export function SettingSwitch({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <Row label={label} hint={hint} htmlFor={id}><Switch id={id} checked={value} onCheckedChange={onChange} disabled={disabled} /></Row>
}

export function SettingSelect({ label, hint, value, onChange, options, disabled }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  const id = useId()
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cn(inputClass, "w-auto min-w-40 max-w-[60vw] px-2")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Row>
  )
}

export function SettingText({ label, hint, value, onCommit, type = "text", placeholder, disabled }: { label: string; hint?: string; value: string; onCommit: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <FieldRow label={label} hint={hint} htmlFor={id}>
      <Input id={id} key={value} defaultValue={value} type={type} placeholder={placeholder} autoComplete="off" disabled={disabled}
        onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
    </FieldRow>
  )
}

export function SettingNumber({ label, hint, value, onCommit, min, max, step, disabled }: { label: string; hint?: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const id = useId()
  return (
    <FieldRow label={label} hint={hint} htmlFor={id}>
      <Input id={id} key={value} defaultValue={value} type="number" min={min} max={max} step={step} disabled={disabled}
        onBlur={(e) => { const n = e.target.value === "" ? 0 : Number(e.target.value); if (!Number.isNaN(n) && n !== value) onCommit(n) }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
    </FieldRow>
  )
}

export function SettingTextarea({ label, hint, value, onCommit, rows = 3, placeholder, mono }: { label: string; hint?: string; value: string; onCommit: (v: string) => void; rows?: number; placeholder?: string; mono?: boolean }) {
  const id = useId()
  return (
    <FieldRow label={label} hint={hint} htmlFor={id}>
      <Textarea id={id} key={value} defaultValue={value} rows={rows} placeholder={placeholder} className={cn("max-h-60 resize-y", mono && "font-mono text-xs")}
        onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }} />
    </FieldRow>
  )
}

// Ordered list-of-strings editor (search fallback chain, extra path roots, …).
export function StringListEditor({ label, hint, value, onChange, placeholder }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("")
  const add = () => { const v = draft.trim(); if (!v) return; onChange([...value, v]); setDraft("") }
  return (
    <FieldRow label={label} hint={hint}>
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-1.5 text-sm">{item}</span>
            <IconButton icon={<X />} label="Remove item" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-muted-foreground transition-colors hover:text-destructive" />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} />
          <IconButton icon={<Plus />} label="Add item" onClick={add} disabled={!draft.trim()} className="text-muted-foreground transition-colors disabled:opacity-40" />
        </div>
      </div>
    </FieldRow>
  )
}

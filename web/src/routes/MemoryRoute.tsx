import { useRef, useState } from "react"
import { Check, Download, Loader2, MessageSquare, Plus, Settings2, Sparkles, Upload, X } from "lucide-react"
import { useMemory, useMemoryMutations, type MemoryImportSuggestion } from "@/api/memory"
import { usePrefs, useSetPref } from "@/api/prefs"
import { useSessions } from "@/api/sessions"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/IconButton"
import { RouteHeader } from "@/components/shell/RouteHeader"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/stores/toast"
import { MemoryTable } from "./memory/MemoryTable"
import { CATS } from "./memory/util"

type ReviewItem = { text: string; category: string; active: boolean }

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <Switch checked={on} onCheckedChange={onClick} />
}

function SettingRow({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <div className="flex items-center justify-between py-1.5"><span className="text-sm text-muted-foreground">{label}</span><Toggle on={on} onClick={onClick} /></div>
}

function NumberSettingRow({
  label,
  prefKey,
  value,
  min,
  max,
  step,
  onSave,
}: {
  label: string
  prefKey: string
  value: number
  min: number
  max: number
  step: number
  onSave: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        key={`${prefKey}-${value}`}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onBlur={(e) => {
          const raw = Number(e.target.value)
          if (!Number.isFinite(raw)) return
          const next = Math.max(min, Math.min(max, raw))
          e.target.value = String(next)
          onSave(next)
        }}
        className="h-8 w-20 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
      />
    </div>
  )
}

function MemorySettings() {
  const { data: prefs } = usePrefs()
  const setPref = useSetPref()
  const b = (k: string, def = true) => (prefs?.[k] as boolean | undefined) ?? def
  const num = (k: string, def: number) => typeof prefs?.[k] === "number" ? prefs[k] as number : def
  const row = (k: string, label: string) => <SettingRow label={label} on={b(k)} onClick={() => setPref.mutate({ key: k, value: !b(k) })} />
  return (
    <div className="mb-4 space-y-1 rounded-md border bg-card p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memory settings</div>
      {row("memory_enabled", "Inject memories into chat")}
      {row("skills_enabled", "Inject skills into agent chats")}
      {row("auto_memory", "Auto-extract memories from chats")}
      {row("auto_skills", "Auto-extract skills from agent runs")}
      {row("auto_approve_skills", "Auto-approve extracted skills")}
      <NumberSettingRow label="Skill min-confidence" prefKey="skill_min_confidence" value={num("skill_min_confidence", 0.85)} min={0} max={1} step={0.05} onSave={(value) => setPref.mutate({ key: "skill_min_confidence", value })} />
      <NumberSettingRow label="Max injected skills" prefKey="skill_max_injected" value={num("skill_max_injected", 3)} min={0} max={20} step={1} onSave={(value) => setPref.mutate({ key: "skill_max_injected", value: Math.round(value) })} />
    </div>
  )
}

function normalizeSuggestion(item: MemoryImportSuggestion | string): ReviewItem | null {
  if (typeof item === "string") {
    const text = item.trim()
    return text ? { text, category: "fact", active: true } : null
  }
  const text = (item.text || "").trim()
  return text ? { text, category: item.category || "fact", active: true } : null
}

export function MemoryRoute() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { data: memories, isLoading: memoriesLoading, isError: memoriesError, refetch: refetchMemories } = useMemory()
  const { data: sessions } = useSessions()
  const { add, tidy, importFile, extract } = useMemoryMutations()
  const [text, setText] = useState("")
  const [cat, setCat] = useState("fact")
  const [showSettings, setShowSettings] = useState(false)
  const [review, setReview] = useState<ReviewItem[]>([])
  const [importName, setImportName] = useState("")
  const [showExtract, setShowExtract] = useState(false)
  const [extractSession, setExtractSession] = useState("")

  const remainingReview = review.filter((item) => item.active)

  const submit = async () => {
    const value = text.trim()
    if (!value) return
    await add.mutateAsync({ text: value, category: cat })
    setText("")
    toast("Memory added", "success")
  }

  const runTidy = async () => {
    const result = await tidy.mutateAsync()
    const removed = result.removed || 0
    toast(removed ? `Tidied memories and removed ${removed}` : "Memory is already tidy", "success")
  }

  const exportMemories = () => {
    const items = memories || []
    if (!items.length) {
      toast("No memories to export", "info")
      return
    }
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "memories.json"
    a.click()
    URL.revokeObjectURL(url)
    toast(`Exported ${items.length} memories`, "success")
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const data = await importFile.mutateAsync(file)
    const items = (data.suggestions || []).map(normalizeSuggestion).filter((x): x is ReviewItem => Boolean(x))
    setImportName(data.filename || file.name)
    setReview(items)
    toast(items.length ? `Found ${items.length} memory suggestions` : data.message || "No useful memories found", items.length ? "success" : "info")
  }

  const runExtract = async () => {
    const sessionId = extractSession.trim()
    if (!sessionId) return
    try {
      const data = await extract.mutateAsync(sessionId)
      const items = (data.suggestions || []).map(normalizeSuggestion).filter((x): x is ReviewItem => Boolean(x))
      const label = sessions?.find((s) => s.id === sessionId)?.name
      setImportName(label ? `session "${label}"` : "session")
      setReview(items)
      setShowExtract(false)
      toast(items.length ? `Found ${items.length} memory suggestions` : "No useful memories found", items.length ? "success" : "info")
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't extract memories from that session", "error")
    }
  }

  const saveReviewItem = async (idx: number) => {
    const item = review[idx]
    if (!item?.active) return
    await add.mutateAsync({ text: item.text, category: item.category })
    setReview((prev) => prev.map((x, i) => i === idx ? { ...x, active: false } : x))
    toast("Saved to memory", "success")
  }

  const saveAllReview = async () => {
    let saved = 0
    for (const item of remainingReview) {
      await add.mutateAsync({ text: item.text, category: item.category })
      saved += 1
    }
    setReview([])
    toast(`Saved ${saved} ${saved === 1 ? "memory" : "memories"}`, "success")
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col" data-tour="memory-root">
      <RouteHeader
        title="Memory"
        actions={(
          <>
            <Button size="sm" variant="outline" disabled={tidy.isPending} onClick={runTidy} title="Tidy memories" data-tour="memory-tidy">
              {tidy.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Tidy
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowExtract((s) => !s)} disabled={extract.isPending} title="Extract memories from a chat session">
              {extract.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
              Extract
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importFile.isPending} title="Import memories">
              {importFile.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Import
            </Button>
            <Button size="sm" variant="outline" onClick={exportMemories} title="Export memories"><Download className="size-4" />Export</Button>
            <IconButton data-tour="memory-settings" icon={<Settings2 />} label="Memory settings" onClick={() => setShowSettings((s) => !s)} className={showSettings ? "text-foreground" : "text-muted-foreground"} />
          </>
        )}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".txt,.md,.pdf,.csv,.log,.json,.py,.js,.html"
        onChange={(e) => { void handleImport(e.currentTarget.files?.[0]); e.currentTarget.value = "" }}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {showSettings && <MemorySettings />}

        <div className="mb-4 flex flex-wrap gap-2" data-tour="memory-add">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a memory..."
            onKeyDown={(e) => { if (e.key === "Enter") void submit() }}
            className="h-9 min-w-52 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm capitalize">
            {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button onClick={submit} disabled={add.isPending}><Plus className="size-4" />Add</Button>
        </div>

        {showExtract && (
          <div className="mb-4 rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Extract from a chat session</div>
              <IconButton icon={<X />} label="Close" onClick={() => setShowExtract(false)} className="text-muted-foreground" />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Analyze a conversation for facts worth remembering, then review the suggestions before saving.</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={extractSession}
                onChange={(e) => setExtractSession(e.target.value)}
                className="h-9 min-w-52 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">Select a session...</option>
                {(sessions || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 8)}</option>
                ))}
              </select>
              <input
                value={extractSession}
                onChange={(e) => setExtractSession(e.target.value)}
                placeholder="...or paste a session id"
                className="h-9 min-w-44 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring"
              />
              <Button onClick={runExtract} disabled={!extractSession.trim() || extract.isPending}>
                {extract.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Extract
              </Button>
            </div>
          </div>
        )}

        {review.length > 0 && (
          <div className="mb-4 rounded-lg border bg-card p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Imported from {importName || "file"}</div>
                <div className="text-xs text-muted-foreground">{remainingReview.length} suggestion{remainingReview.length === 1 ? "" : "s"} ready to review</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!remainingReview.length || add.isPending} onClick={saveAllReview}><Check className="size-4" />Save all</Button>
                <Button size="sm" variant="outline" onClick={() => setReview([])}><X className="size-4" />Dismiss</Button>
              </div>
            </div>
            <div className="space-y-2">
              {review.map((item, idx) => item.active && (
                <div key={`${idx}-${item.text}`} className="flex items-start gap-3 rounded-md border bg-background p-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{item.text}</p>
                    <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-label capitalize text-muted-foreground">{item.category}</span>
                  </div>
                  <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => saveReviewItem(idx)}><Check className="size-4" />Save</Button>
                  <IconButton icon={<X />} label="Reject suggestion" onClick={() => setReview((prev) => prev.map((x, i) => i === idx ? { ...x, active: false } : x))} className="text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div data-tour="memory-list">
          <MemoryTable memories={memories || []} loading={memoriesLoading} error={memoriesError} onRetry={() => refetchMemories()} />
        </div>
      </div>
    </div>
  )
}

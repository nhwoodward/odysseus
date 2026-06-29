import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { uploadFiles } from "@/api/upload"
import { useVoiceCaps, transcribe } from "@/api/voice"
import { useSlashCatalog, invokeSkill } from "@/api/skills"
import { apiFetch, apiJson } from "@/lib/api"
import { PENDING_COMPOSER_KEY } from "@/lib/composerHandoff"
import { toast } from "@/stores/toast"
import { useComposer } from "@/stores/composer"
import type { ChatAttachment, DefaultChat, Memory, ModelsResponse, Session } from "@/types"
import {
  CORE_SLASH_COMMANDS,
  coreCommandFor,
  CHAT_LEGACY_COMMANDS,
  CHAT_SUB_ALIASES,
  SETUP_PROVIDER_URLS,
  SETUP_DEVICE_PROVIDERS,
  pickStarterPrompt,
  deadlineFromNow,
  beforeDeadline,
  CHAT_HELP,
  MEMORY_HELP,
  RAG_HELP,
  WORKSPACE_HELP,
  TOGGLE_HELP,
  TOUR_GUIDES,
  FLAT_HELP,
  HELP_SECTIONS,
  parseTimeSpec,
  toLocalIso,
} from "./constants"
import type { SlashHelpEntry } from "./constants"

export function useComposerController({
  onSend,
  onLocalReply,
  onClearMessages,
  onStop,
  streaming,
  sessionId,
}: {
  onSend: (t: string, ids?: string[], sendAs?: string, opts?: { forceWeb?: boolean; attachments?: ChatAttachment[] }) => void
  onLocalReply: (display: string, reply: string) => void
  onClearMessages: (reply?: string) => void
  onStop: () => void
  streaming: boolean
  sessionId?: string
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [atts, setAtts] = useState<{ id: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: caps } = useVoiceCaps()
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const { data: slashAll } = useSlashCatalog()
  const [slashSel, setSlashSel] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const toggleComposer = useComposer((s) => s.toggle)
  const promptPrefix = useComposer((s) => s.promptPrefix)
  const promptSuffix = useComposer((s) => s.promptSuffix)
  const selectedModel = useComposer((s) => s.model)
  const selectedEndpointId = useComposer((s) => s.endpointId)
  const selectedEndpointUrl = useComposer((s) => s.endpointUrl)
  const workspace = useComposer((s) => s.workspace)
  const setWorkspace = useComposer((s) => s.setWorkspace)
  // Slash autocomplete only while typing the leading command token (no space yet).
  const slashTok = /^\/([\w-]*)$/.exec(text)
  const coreMatches = slashTok
    ? CORE_SLASH_COMMANDS.filter((c) =>
      [c.name, ...(c.aliases || [])].some((name) => name.toLowerCase().startsWith(slashTok[1].toLowerCase())))
    : []
  const skillMatches = slashTok
    ? (slashAll || []).filter((c) => c.name.toLowerCase().startsWith(slashTok[1].toLowerCase()))
    : []
  const slashMatches = slashTok && !streaming
    ? [
      ...coreMatches.map((c) => ({ ...c, kind: "core" as const })),
      ...skillMatches.map((c) => ({ ...c, kind: "skill" as const })),
    ].slice(0, 8)
    : []
  const slashOpen = slashMatches.length > 0 && !slashDismissed
  const sel = Math.min(slashSel, slashMatches.length - 1)
  const grow = () => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px" }
  const pickSlash = (name: string) => { setText(`/${name} `); setSlashSel(0); requestAnimationFrame(() => { ref.current?.focus(); grow() }) }
  const withPromptInject = (payload: string) => {
    const prefix = promptPrefix.trim()
    const suffix = promptSuffix.trim()
    return [prefix, payload, suffix].filter(Boolean).join("\n\n")
  }
  const sendAsFor = (display: string, payload: string) => {
    const injected = withPromptInject(payload)
    return injected !== display ? injected : undefined
  }
  const local = (display: string, reply: string) => onLocalReply(display, reply)
  const requireArgs = (display: string, args: string, usage: string) => {
    if (args.trim()) return true
    local(display, usage)
    return false
  }
  const providerForSetup = (name: string) => {
    const key = name.toLowerCase().replace(/\s+/g, "-")
    const direct = SETUP_PROVIDER_URLS[key]
    if (direct) return direct
    return Object.values(SETUP_PROVIDER_URLS).find((provider) =>
      provider.aliases?.some((alias) => alias.toLowerCase() === key))
  }
  const deviceProviderForSetup = (name: string) => {
    const key = name.toLowerCase().replace(/\s+/g, "-")
    const direct = SETUP_DEVICE_PROVIDERS[key]
    if (direct) return { key, provider: direct }
    const found = Object.entries(SETUP_DEVICE_PROVIDERS).find(([, provider]) =>
      provider.aliases?.some((alias) => alias.toLowerCase().replace(/\s+/g, "-") === key))
    return found ? { key: found[0], provider: found[1] } : undefined
  }
  const normalizeSetupBaseUrl = (raw: string) => {
    let u = raw.trim()
    u = u.replace(/^https?:\/(?!\/)/, (m) => `${m}/`)
    u = u.replace(/^htp:/, "http:").replace(/^htps:/, "https:")
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`
    u = u.replace(/\/+$/, "")
    u = u.replace(/\/v1\/(models|chat\/completions|completions|messages)\/?$/i, "/v1")
    u = u.replace(/\/(models|chat\/completions|completions|v1\/messages)\/?$/i, "")
    u = u.replace(/\/v1\/v1$/i, "/v1")
    if (!u.includes("api.") && !u.includes("openrouter") && !u.endsWith("/v1")) {
      try {
        const parsed = new URL(u)
        if (!parsed.pathname || parsed.pathname === "/") u += "/v1"
      } catch { /* leave invalid-ish URLs for the backend to reject */ }
    }
    return u
  }
  const looksLocalEndpoint = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(url)
  const setupDisplay = (display: string, secret?: string) => {
    if (!secret) return display
    const trimmed = secret.trim()
    if (!trimmed) return display
    return display.replace(trimmed, trimmed.length <= 8 ? "********" : `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`)
  }
  const openModelSetup = (display: string) => {
    navigate("/settings?section=models")
    local(display, "Opening Settings > Models. Use Add endpoint to save a local server or provider key.")
  }
  const hasConfiguredModels = async () => {
    const data = await apiJson<ModelsResponse>("/api/models").catch(() => null)
    return !!data?.items?.some((item) => {
      const hasModels = (item.models || []).length > 0 || (item.models_extra || []).length > 0
      const offline = Boolean((item as { offline?: boolean }).offline)
      return hasModels && !!item.url && !offline
    })
  }
  const runTourCommand = async (display: string, name: string) => {
    const guide = TOUR_GUIDES[name]
    if (!guide) {
      local(display, "Tour not found. Try /demo, /tour-compare, /tour-research, /tour-library, /tour-brain, or /tour-task-1.")
      return
    }
    if (name === "demo" && !await hasConfiguredModels()) {
      navigate("/settings?section=models")
      local(display, "Add a model first, then run /demo again. Opening Settings > Models so you can connect a local server or provider key.")
      return
    }
    if (guide.route) navigate(guide.route)
    window.setTimeout(() => {
      if (name === "tour-task-2") window.dispatchEvent(new CustomEvent("odysseus:tasks-open-add"))
      window.dispatchEvent(new CustomEvent("odysseus:start-tour", { detail: guide }))
    }, guide.route ? 60 : 0)
    const lines = [
      `**${guide.title}**`,
      "",
      ...guide.steps.map((step, i) => `${i + 1}. ${step.text}`),
      guide.closing ? "" : undefined,
      guide.closing,
    ].filter((line): line is string => typeof line === "string")
    local(display, lines.join("\n"))
  }
  const cleanHelpParts = (value: string) => value.trim().split(/\s+/).filter((p) => p && p !== "--help" && p !== "-h")
  const formatAliases = (entry: SlashHelpEntry) => entry.aliases?.length ? `\nAliases: ${entry.aliases.join(", ")}` : ""
  const helpBlock = (entry: SlashHelpEntry) => `\`\`\`\n${entry.usage}\n${entry.help}${formatAliases(entry)}\n\`\`\``
  const entryFor = (raw: string, entries: Record<string, SlashHelpEntry>) => {
    const needle = raw.replace(/^\/+/, "").toLowerCase()
    const found = Object.entries(entries).find(([key, entry]) => (
      key === needle || entry.aliases?.some((alias) => alias.replace(/^\/+/, "").toLowerCase() === needle)
    ))
    return found?.[1]
  }
  const groupHelp = (label: string, entries: Record<string, SlashHelpEntry>, aliases: string[] = []) => {
    const lines = [label + (aliases.length ? ` (aliases: ${aliases.join(", ")})` : ""), ""]
    for (const entry of Object.values(entries)) lines.push(`  ${entry.usage.padEnd(34)}${entry.help}`)
    return `\`\`\`\n${lines.join("\n")}\n\`\`\``
  }
  const showCommandHelp = (display: string, name: string, args = "") => {
    const clean = cleanHelpParts(args)
    const raw = name.replace(/^\/+/, "").toLowerCase()
    const cmd = coreCommandFor(raw)
    const canonical = cmd?.name || raw
    const chatSub = CHAT_LEGACY_COMMANDS[canonical]
    if (chatSub) {
      local(display, helpBlock(CHAT_HELP[chatSub]))
      return true
    }
    if (canonical === "chats") {
      const entry = clean[0] ? entryFor(CHAT_SUB_ALIASES[clean[0].toLowerCase()] || clean[0], CHAT_HELP) : undefined
      local(display, entry ? helpBlock(entry) : groupHelp("Manage chat sessions", CHAT_HELP, ["/chat", "/session", "/sessions", "/s"]))
      return true
    }
    if (canonical === "memory") {
      const entry = clean[0] ? entryFor(clean[0], MEMORY_HELP) : undefined
      local(display, entry ? helpBlock(entry) : groupHelp("Manage persistent memories", MEMORY_HELP, ["/brain", "/memories"]))
      return true
    }
    if (canonical === "rag") {
      const entry = clean[0] ? entryFor(clean[0], RAG_HELP) : undefined
      local(display, entry ? helpBlock(entry) : groupHelp("Manage Knowledge indexing", RAG_HELP))
      return true
    }
    if (canonical === "workspace") {
      const entry = clean[0] ? entryFor(clean[0], WORKSPACE_HELP) : undefined
      local(display, entry ? helpBlock(entry) : groupHelp("Set the agent workspace", WORKSPACE_HELP, ["/ws"]))
      return true
    }
    if (canonical === "toggle") {
      const entry = clean[0] ? entryFor(clean[0], TOGGLE_HELP) : undefined
      local(display, entry ? helpBlock(entry) : groupHelp("Toggle features on or off", TOGGLE_HELP))
      return true
    }
    const toggleEntry = entryFor(canonical, TOGGLE_HELP)
    if (toggleEntry && ["web", "bash", "incognito"].includes(canonical)) {
      local(display, helpBlock(toggleEntry))
      return true
    }
    const flat = FLAT_HELP[canonical]
    if (flat) {
      local(display, helpBlock(flat))
      return true
    }
    const skill = (slashAll || []).find((item) => item.name.toLowerCase() === raw)
    if (skill) {
      local(display, `\`\`\`\n/${skill.name} request\n${skill.help || "Run this skill with the provided request."}\n\`\`\``)
      return true
    }
    return false
  }
  const showSlashHelp = (display: string, args: string) => {
    const clean = cleanHelpParts(args)
    if (clean[0] && showCommandHelp(display, clean[0], clean.slice(1).join(" "))) return
    const lines = ["Slash commands:"]
    for (const section of HELP_SECTIONS) {
      lines.push("", `${section.title}:`)
      for (const entry of section.entries) lines.push(`  ${entry.usage.padEnd(34)}${entry.help}`)
    }
    const skills = slashAll || []
    if (skills.length) {
      lines.push("", "Skills:")
      for (const skill of skills.slice(0, 20)) lines.push(`  ${String(skill.token || `/${skill.name}`).padEnd(34)}${skill.help || ""}`)
      if (skills.length > 20) lines.push(`  ... ${skills.length - 20} more. Use /skills`)
    }
    lines.push("", "Tip: /<command> --help for details")
    lines.push("Shortcuts: /new /rename /fork /web /bash /memory /skills")
    local(display, `\`\`\`\n${lines.join("\n")}\n\`\`\``)
  }
  const exportCurrentChat = (display: string, args: string) => {
    if (!sessionId) { local(display, "No active session."); return }
    let filename = ""
    let fmt = "md"
    const raw = args.trim()
    const redir = raw.match(/^>\s*(.+)/)
    if (redir) {
      filename = redir[1].trim()
      const ext = filename.split(".").pop()?.toLowerCase()
      if (ext && ["json", "txt", "html", "md"].includes(ext)) fmt = ext
    } else if (raw && ["json", "txt", "html", "md"].includes(raw.toLowerCase())) {
      fmt = raw.toLowerCase()
    }
    const params = new URLSearchParams({ fmt })
    if (filename) params.set("filename", filename)
    window.open(`/api/session/${encodeURIComponent(sessionId)}/export?${params.toString()}`, "_blank")
    local(display, `Exporting as .${fmt}${filename ? ` -> ${filename}` : ""}...`)
  }
  const listModels = async (display: string) => {
    const data = await apiJson<ModelsResponse>("/api/models")
    const lines: string[] = []
    for (const ep of data.items || []) {
      lines.push(ep.endpoint_name || ep.url || ep.endpoint_id || "Endpoint")
      const models = [...(ep.models || []), ...(ep.models_extra || [])]
      if (models.length) models.forEach((model) => lines.push(`  ${model}`))
      else lines.push("  No models found")
    }
    local(display, `\`\`\`\n${lines.join("\n") || "No models found"}\n\`\`\``)
  }
  const quickEvent = async (display: string, args: string) => {
    if (!requireArgs(display, args, "Usage: /event tomorrow 14:00 Team call")) return
    const parsed = parseTimeSpec(args)
    if (!parsed || !parsed.rest) {
      local(display, `Could not parse time from: ${args}`)
      return
    }
    const start = parsed.date
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const body = { summary: parsed.rest, dtstart: toLocalIso(start), dtend: toLocalIso(end), all_day: false }
    const res = await apiFetch("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error("event create failed")
    qc.invalidateQueries({ queryKey: ["calendar"] })
    local(display, `Event added: ${parsed.rest}\n\n${start.toLocaleString()}`)
  }
  const runMemoryCommand = async (display: string, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean)
    const sub = (parts[0] || "list").toLowerCase()
    const rest = parts.slice(1).join(" ").trim()
    if (sub === "list" || sub === "ls") {
      const data = await apiJson<{ memory?: Memory[] }>("/api/memory")
      const mems = data.memory || []
      if (!mems.length) { local(display, "No memories stored."); return }
      const lines = mems.slice(0, 40).map((m) => `[${m.category || "fact"}] ${m.id.slice(0, 8)} - ${m.text}`)
      if (mems.length > 40) lines.push(`... and ${mems.length - 40} more`)
      local(display, `\`\`\`\n${lines.join("\n")}\n\`\`\``)
      return
    }
    if (sub === "add" || sub === "echo") {
      if (!rest) { local(display, "Usage: /memory add Your text here"); return }
      const res = await apiFetch("/api/memory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rest, category: "fact", source: "user" }),
      })
      if (!res.ok) throw new Error("Failed to add memory")
      qc.invalidateQueries({ queryKey: ["memory"] })
      local(display, `Memory added: ${rest}`)
      return
    }
    if (sub === "delete" || sub === "del" || sub === "rm") {
      const raw = rest
      const force = /-(rf|fr)\b/.test(raw)
      const cleanArg = raw.replace(/\s*-(rf|fr)\b\s*/, "").trim()
      const list = async () => (await apiJson<{ memory?: Memory[] }>("/api/memory")).memory || []
      if (cleanArg === "all" || (force && !cleanArg)) {
        const mems = await list()
        if (!mems.length) { local(display, "No memories to delete."); return }
        if (!force) { local(display, `This will delete all ${mems.length} memories. Use /memory rm -rf to confirm.`); return }
        let deleted = 0
        for (const m of mems) {
          const res = await apiFetch(`/api/memory/${m.id}`, { method: "DELETE" })
          if (res.ok) deleted += 1
        }
        qc.invalidateQueries({ queryKey: ["memory"] })
        local(display, `Deleted ${deleted}/${mems.length} memories.`)
        return
      }
      if (!cleanArg) { local(display, "Usage: /memory delete <id> or /memory rm -rf to wipe all"); return }
      let memId = cleanArg
      let preview = cleanArg.slice(0, 8)
      if (memId.length < 36) {
        const match = (await list()).find((m) => m.id.startsWith(memId))
        if (match) { memId = match.id; preview = (match.text || "").slice(0, 50) }
      }
      const res = await apiFetch(`/api/memory/${memId}`, { method: "DELETE" })
      if (!res.ok) { local(display, "Delete failed. Check the ID."); return }
      qc.invalidateQueries({ queryKey: ["memory"] })
      local(display, `Deleted: ${preview}${preview.length >= 50 ? "..." : ""}`)
      return
    }
    if (sub === "search" || sub === "grep") {
      if (!rest) { local(display, "Usage: /memory search query"); return }
      const fd = new FormData()
      fd.set("query", rest)
      const res = await apiFetch("/api/memory/search", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Memory search failed")
      const data = await res.json().catch(() => ({})) as { memories?: Memory[] }
      const mems = data.memories || []
      local(display, mems.length ? `\`\`\`\n${mems.map((m) => `[${m.category || "fact"}] ${m.text}`).join("\n")}\n\`\`\`` : `No memories matching "${rest}".`)
      return
    }
    local(display, "Usage: /memory list | add text | delete id | search query")
  }
  const runRagCommand = async (display: string, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean)
    const sub = (parts[0] || "list").toLowerCase()
    const rest = parts.slice(1).join(" ").trim()
    const listPersonal = async () => {
      const res = await apiFetch("/api/personal")
      if (res.status === 403) { local(display, "Knowledge indexing is unavailable for this user."); return null }
      if (!res.ok) throw new Error("Failed to load indexed files")
      return await res.json().catch(() => ({})) as { directories?: (string | { path?: string })[]; files?: { name?: string; path?: string }[] }
    }
    if (sub === "list" || sub === "ls") {
      const data = await listPersonal()
      if (!data) return
      const lines: string[] = []
      if (data.directories?.length) {
        lines.push("Directories:")
        data.directories.forEach((d) => lines.push(`  ${typeof d === "string" ? d : d.path || JSON.stringify(d)}`))
      }
      if (data.files?.length) {
        lines.push(`Files (${data.files.length}):`)
        data.files.slice(0, 30).forEach((f) => lines.push(`  ${f.name || f.path || String(f)}`))
        if (data.files.length > 30) lines.push(`  ... and ${data.files.length - 30} more`)
      }
      local(display, lines.length ? `\`\`\`\n${lines.join("\n")}\n\`\`\`` : "No files or directories indexed.")
      return
    }
    if (sub === "add") {
      if (!rest) { local(display, "Usage: /rag add /path/to/directory"); return }
      const res = await apiFetch("/api/personal/add_directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: rest }),
      })
      if (res.status === 403) { local(display, "Knowledge indexing is unavailable for this user."); return }
      if (!res.ok) throw new Error("Failed to add directory")
      const data = await res.json().catch(() => ({})) as { indexed_count?: number }
      qc.invalidateQueries({ queryKey: ["personal"] })
      qc.invalidateQueries({ queryKey: ["rag", "documents"] })
      qc.invalidateQueries({ queryKey: ["rag", "stats"] })
      local(display, `Indexed "${rest}" (${data.indexed_count || 0} chunks).`)
      return
    }
    if (sub === "remove" || sub === "rm") {
      const raw = rest
      const force = /-(rf|fr)\b/.test(raw)
      const cleanArg = raw.replace(/\s*-(rf|fr)\b\s*/, "").trim()
      if (cleanArg === "all" || (force && !cleanArg)) {
        const data = await listPersonal()
        if (!data) return
        const dirs = data.directories || []
        if (!dirs.length) { local(display, "No RAG directories to remove."); return }
        if (!force) { local(display, `This will remove all ${dirs.length} directories from RAG. Use /rag rm -rf to confirm.`); return }
        let removed = 0
        for (const d of dirs) {
          const path = typeof d === "string" ? d : d.path || ""
          if (!path) continue
          const res = await apiFetch(`/api/personal/remove_directory?directory=${encodeURIComponent(path)}`, { method: "DELETE" })
          if (res.ok) removed += 1
        }
        qc.invalidateQueries({ queryKey: ["personal"] })
        qc.invalidateQueries({ queryKey: ["rag", "documents"] })
        qc.invalidateQueries({ queryKey: ["rag", "stats"] })
        local(display, `Removed ${removed}/${dirs.length} directories from RAG.`)
        return
      }
      if (!cleanArg) { local(display, "Usage: /rag remove /path or /rag rm -rf to remove all"); return }
      const res = await apiFetch(`/api/personal/remove_directory?directory=${encodeURIComponent(cleanArg)}`, { method: "DELETE" })
      if (res.status === 403) { local(display, "Knowledge indexing is unavailable for this user."); return }
      if (!res.ok) throw new Error("Failed to remove directory")
      qc.invalidateQueries({ queryKey: ["personal"] })
      qc.invalidateQueries({ queryKey: ["rag", "documents"] })
      qc.invalidateQueries({ queryKey: ["rag", "stats"] })
      local(display, `Removed "${cleanArg}" from RAG.`)
      return
    }
    local(display, "Usage: /rag list | add /path | remove /path")
  }
  const runWorkspaceCommand = async (display: string, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean)
    const sub = (parts[0] || "show").toLowerCase()
    const rest = parts.slice(1).join(" ").trim()
    if (sub === "show" || sub === "status" || sub === "info") {
      local(display, workspace ? `Workspace: ${workspace}` : "No workspace set. Use /workspace set /path or /workspace pick.")
      return
    }
    if (sub === "clear" || sub === "off" || sub === "none" || sub === "unset") {
      setWorkspace("")
      local(display, "Workspace cleared.")
      return
    }
    if (sub === "set" || sub === "cd" || sub === "use") {
      if (!rest) { local(display, "Usage: /workspace set /absolute/path"); return }
      const res = await apiFetch(`/api/workspace/vet?path=${encodeURIComponent(rest)}`)
      if (res.status === 403) { local(display, "Workspace selection is unavailable for this user."); return }
      if (!res.ok) throw new Error("Workspace validation failed")
      const data = await res.json().catch(() => ({})) as { ok?: boolean; path?: string }
      if (data.ok && data.path) {
        setWorkspace(data.path)
        local(display, `Workspace set: ${data.path}`)
      } else {
        local(display, `Not a usable workspace folder: ${rest}`)
      }
      return
    }
    if (sub === "pick" || sub === "browse" || sub === "open") {
      const browsePath = rest || workspace || ""
      const res = await apiFetch(`/api/workspace/browse${browsePath ? `?path=${encodeURIComponent(browsePath)}` : ""}`)
      if (res.status === 403) { local(display, "Workspace browsing is unavailable for this user."); return }
      if (!res.ok) throw new Error("Workspace browse failed")
      const data = await res.json().catch(() => ({})) as { path?: string; parent?: string | null; dirs?: { name?: string; path?: string }[]; truncated?: boolean; selectable?: boolean }
      const lines = [
        `Path: ${data.path || browsePath || "~"}`,
        data.selectable === false ? "This folder cannot be used as a workspace." : "Use /workspace set <path> to select a folder.",
        ...(data.parent ? [`.. ${data.parent}`] : []),
        ...((data.dirs || []).slice(0, 25).map((d) => `${d.name || "folder"}  ${d.path || ""}`)),
      ]
      if (data.truncated) lines.push("... more folders omitted")
      local(display, `\`\`\`\n${lines.join("\n")}\n\`\`\``)
      return
    }
    local(display, "Usage: /workspace [set <path> | clear | pick]")
  }
  const runDeviceSetup = async (display: string, key: string, provider: { label: string; startUrl: string; pollUrl: string }) => {
    const res = await apiFetch(provider.startUrl, { method: "POST", body: new FormData() })
    const start = await res.json().catch(() => ({})) as {
      poll_id?: string; user_code?: string; verification_uri?: string; verification_uri_complete?: string; interval?: number; expires_in?: number; detail?: string
    }
    if (!res.ok || !start.poll_id) {
      if (res.status === 403 || start.detail === "Admin only") {
        navigate("/settings?section=models")
        local(display, "Opening Settings > Models. Connecting provider accounts is admin-only on this instance; ask an admin to connect this provider or sign in as an admin.")
        return
      }
      local(display, start.detail || `${provider.label} authorization could not start.`)
      return
    }
    const authUrl = start.verification_uri_complete || start.verification_uri || ""
    if (authUrl) window.open(authUrl, "_blank")
    local(display, [
      `${provider.label} authorization started.`,
      start.user_code ? `Code: ${start.user_code}` : "",
      authUrl ? `Opened: ${authUrl}` : "",
      "After approval, Odysseus will finish saving the endpoint automatically while this tab stays open.",
    ].filter(Boolean).join("\n"))

    const intervalMs = Math.max(2, start.interval || 5) * 1000
    const deadline = deadlineFromNow(Math.max(30, start.expires_in || 900) * 1000)
    while (beforeDeadline(deadline)) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
      const fd = new FormData()
      fd.set("poll_id", start.poll_id)
      const pollRes = await apiFetch(provider.pollUrl, { method: "POST", body: fd })
      const data = await pollRes.json().catch(() => ({})) as { status?: string; endpoint?: { name?: string; models?: string[] }; error?: string; detail?: string }
      if (!pollRes.ok) {
        if (pollRes.status === 403 || data.detail === "Admin only") {
          navigate("/settings?section=models")
          local(`/${key}`, "Opening Settings > Models. Connecting provider accounts is admin-only on this instance; ask an admin to connect this provider or sign in as an admin.")
          return
        }
        local(`/${key}`, data.detail || `${provider.label} authorization failed.`)
        return
      }
      if (data.status === "authorized") {
        qc.invalidateQueries({ queryKey: ["models"] })
        qc.invalidateQueries({ queryKey: ["default-chat"] })
        const models = data.endpoint?.models?.length ? ` (${data.endpoint.models.length} models)` : ""
        local(`/${key}`, `${provider.label} endpoint saved${models}.`)
        return
      }
      if (data.status === "failed") {
        local(`/${key}`, `${provider.label} authorization failed: ${data.error || "denied"}.`)
        return
      }
    }
    local(`/${key}`, `${provider.label} authorization expired. Run /setup ${key} to try again.`)
  }
  const runSetupCommand = async (display: string, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean)
    const topic = (parts[0] || "").toLowerCase()
    const rest = parts.slice(1).join(" ").trim()
    if (!topic || ["endpoint", "api", "key", "models", "model"].includes(topic)) {
      openModelSetup(display)
      return
    }
    if (topic === "theme" || topic === "themes") {
      navigate("/settings?section=general")
      local(display, "Opening Settings > General. Use Appearance to change theme, accent, font, and density.")
      return
    }
    if (topic === "memory" || topic === "memories") {
      navigate("/memory")
      local(display, "Opening Memory.")
      return
    }
    if (topic === "features") {
      navigate("/settings?section=advanced")
      local(display, "Opening Settings > Advanced for feature and system controls.")
      return
    }

    const device = deviceProviderForSetup(topic)
    if (device) {
      await runDeviceSetup(display, device.key, device.provider)
      return
    }

    let name: string
    let baseUrl: string
    let apiKey = ""
    const provider = providerForSetup(topic)
    if (topic === "local") {
      if (!rest) {
        local(display, "Usage: /setup local http://localhost:11434/v1")
        return
      }
      name = "Local"
      baseUrl = normalizeSetupBaseUrl(rest)
    } else if (provider) {
      if (!rest) {
        local(display, `Paste your ${provider.name} API key, or run /setup ${topic} <api-key> to set it in one step.`)
        return
      }
      name = provider.name
      baseUrl = provider.url
      apiKey = rest
    } else if (/^https?:\/\//i.test(topic) || /^localhost(?::|\/|$)/i.test(topic) || /^(\d{1,3}\.){3}\d{1,3}/.test(topic)) {
      name = "Custom"
      baseUrl = normalizeSetupBaseUrl([topic, ...parts.slice(1)].join(" "))
    } else {
      local(display, `I don't have a setup wizard for "${topic}" yet. Try /setup endpoint, /setup local URL, /setup openai KEY, /setup copilot, or /settings.`)
      return
    }

    const fd = new FormData()
    fd.set("name", name)
    fd.set("base_url", baseUrl)
    if (apiKey) fd.set("api_key", apiKey)
    fd.set("require_models", "true")
    if (!looksLocalEndpoint(baseUrl)) fd.set("skip_probe", "true")
    const res = await apiFetch("/api/model-endpoints", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({})) as { id?: string; name?: string; models?: string[]; detail?: string; existing?: boolean }
    const safeDisplay = setupDisplay(display, apiKey)
    if (!res.ok) {
      if (res.status === 403 || data.detail === "Admin only") {
        navigate("/settings?section=models")
        local(safeDisplay, "Opening Settings > Models. Adding model endpoints is admin-only on this instance; ask an admin to add this provider or sign in as an admin.")
        return
      }
      local(safeDisplay, data.detail ? `Endpoint was not saved: ${data.detail}` : "Endpoint was not saved.")
      return
    }
    qc.invalidateQueries({ queryKey: ["models"] })
    qc.invalidateQueries({ queryKey: ["default-chat"] })
    const count = data.models?.length || 0
    local(safeDisplay, `${data.existing ? "Endpoint already exists" : "Endpoint saved"}: ${data.name || name || baseUrl}${count ? ` (${count} models)` : ""}.`)
  }
  const loadSessions = async () => apiJson<Session[]>("/api/sessions")
  const responseMessage = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => null) as { detail?: unknown } | null
    const detail = data?.detail
    if (typeof detail === "string") return `${fallback}: ${detail}`
    if (detail && typeof detail === "object" && "message" in detail) {
      return `${fallback}: ${String((detail as { message?: unknown }).message)}`
    }
    return fallback
  }
  const sessionLabel = (session?: Session) => session ? `"${session.name || session.id.slice(0, 8)}"` : "session"
  const resolveSession = (query: string, sessions: Session[]) => {
    const q = query.trim().toLowerCase()
    if (!q && sessionId) return sessions.find((s) => s.id === sessionId) || ({ id: sessionId, name: "", model: "" } as Session)
    if (!q) return undefined
    return sessions.find((s) => !s.archived && (
      s.id.toLowerCase().startsWith(q) || (s.name || "").toLowerCase().includes(q)
    ))
  }
  const runChatsCommand = async (display: string, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean)
    const rawSub = (parts[0] || "info").toLowerCase()
    const sub = CHAT_SUB_ALIASES[rawSub] || rawSub
    const rest = parts.slice(1).join(" ").trim()

    if (sub === "export") {
      exportCurrentChat(display, rest)
      return
    }

    if (sub === "new") {
      const sessions = await loadSessions().catch(() => [])
      const current = sessionId ? sessions.find((s) => s.id === sessionId) : undefined
      const fallbackName = `Chat ${new Date().toLocaleTimeString()}`
      const name = rest || fallbackName
      let model: string | undefined = current?.model || selectedModel || undefined
      let endpointId: string | undefined = current?.endpoint_id || selectedEndpointId || undefined
      let endpointUrl: string | undefined = current?.endpoint_url || selectedEndpointUrl || undefined

      if (!model || (!endpointId && !endpointUrl)) {
        const def = await apiJson<DefaultChat>("/api/default-chat").catch(() => null)
        if (def) {
          model = model || def.model
          endpointId = endpointId || def.endpoint_id
          endpointUrl = endpointUrl || def.endpoint_url
        }
      }
      if (!model) {
        const models = await apiJson<ModelsResponse>("/api/models").catch(() => null)
        const endpoint = models?.items?.find((ep) => ep.models?.length || ep.models_extra?.length)
        model = endpoint?.models?.[0] || endpoint?.models_extra?.[0] || ""
        endpointId = endpointId || endpoint?.endpoint_id
        endpointUrl = endpointUrl || endpoint?.url
      }
      if (!model) { local(display, "No model available. Choose a model first."); return }

      const fd = new FormData()
      fd.set("name", name)
      fd.set("model", model)
      fd.set("skip_validation", "true")
      if (endpointId) fd.set("endpoint_id", endpointId)
      if (endpointUrl) fd.set("endpoint_url", endpointUrl)
      const res = await apiFetch("/api/session", { method: "POST", body: fd })
      if (!res.ok) { local(display, await responseMessage(res, "Failed to create session")); return }
      const created = await res.json() as Session
      qc.invalidateQueries({ queryKey: ["sessions"] })
      navigate(`/chat/${created.id}`)
      local(display, `New session - ${(model || "").split("/").pop() || "ready"}.`)
      return
    }

    if (sub === "delete") {
      const raw = rest
      const force = /(^|\s)-(rf|fr)\b/.test(raw) || /(^|\s)--force\b/.test(raw)
      const cleanArg = raw.replace(/(^|\s)-(rf|fr)\b/g, " ").replace(/(^|\s)--force\b/g, " ").trim()
      const sessions = await loadSessions()

      if (cleanArg === "all" || (force && !cleanArg)) {
        const active = sessions.filter((s) => !s.archived)
        const targets = force ? active : active.filter((s) => !s.is_important)
        const skipped = active.length - targets.length
        if (!targets.length) { local(display, `Nothing to delete${skipped ? ` (${skipped} favorite)` : ""}.`); return }
        let deleted = 0
        let failed = 0
        for (const s of targets) {
          if (force && s.is_important) {
            const fd = new FormData()
            fd.set("important", "false")
            await apiFetch(`/api/session/${encodeURIComponent(s.id)}/important`, { method: "POST", body: fd }).catch(() => null)
          }
          const res = await apiFetch(`/api/session/${encodeURIComponent(s.id)}`, { method: "DELETE" })
          if (res.ok) deleted += 1
          else failed += 1
        }
        qc.invalidateQueries({ queryKey: ["sessions"] })
        if (sessionId && targets.some((s) => s.id === sessionId)) navigate("/chat", { replace: true })
        const suffix = [
          skipped && !force ? `kept ${skipped} favorite` : "",
          failed ? `${failed} failed` : "",
        ].filter(Boolean).join(", ")
        local(display, `Deleted ${deleted} session${deleted === 1 ? "" : "s"}${suffix ? `, ${suffix}` : ""}.`)
        return
      }

      const target = resolveSession(cleanArg, sessions)
      if (!target) { local(display, "No session to delete."); return }
      const res = await apiFetch(`/api/session/${encodeURIComponent(target.id)}`, { method: "DELETE" })
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["sessions"] })
        local(display, `Deleted ${sessionLabel(target)}.`)
        if (target.id === sessionId) navigate("/chat", { replace: true })
      } else if (res.status === 403) {
        local(display, "Cannot delete a favorite session. Unfavorite it first, or use /chats rm -rf.")
      } else {
        local(display, await responseMessage(res, "Delete failed"))
      }
      return
    }

    if (sub === "archive") {
      const sessions = await loadSessions()
      const target = resolveSession(rest, sessions)
      if (!target) { local(display, "No session to archive."); return }
      const res = await apiFetch(`/api/session/${encodeURIComponent(target.id)}/archive`, { method: "POST" })
      if (!res.ok) { local(display, await responseMessage(res, "Archive failed")); return }
      qc.invalidateQueries({ queryKey: ["sessions"] })
      local(display, `Archived ${sessionLabel(target)}.`)
      if (target.id === sessionId) navigate("/chat", { replace: true })
      return
    }

    if (sub === "rename") {
      if (!sessionId) { local(display, "No active session."); return }
      if (!rest) { local(display, "Usage: /rename New Name"); return }
      const fd = new FormData()
      fd.set("name", rest)
      const res = await apiFetch(`/api/session/${encodeURIComponent(sessionId)}`, { method: "PATCH", body: fd })
      if (!res.ok) { local(display, await responseMessage(res, "Rename failed")); return }
      qc.invalidateQueries({ queryKey: ["sessions"] })
      local(display, `Renamed to "${rest}".`)
      return
    }

    if (sub === "favorite" || sub === "unfavorite") {
      const sessions = await loadSessions()
      const target = resolveSession(rest, sessions)
      if (!target) { local(display, "No active session."); return }
      const important = sub === "favorite"
      const fd = new FormData()
      fd.set("important", String(important))
      const res = await apiFetch(`/api/session/${encodeURIComponent(target.id)}/important`, { method: "POST", body: fd })
      if (!res.ok) { local(display, await responseMessage(res, "Favorite update failed")); return }
      qc.invalidateQueries({ queryKey: ["sessions"] })
      local(display, important ? "Session marked as favorite." : "Session unmarked.")
      return
    }

    if (sub === "fork") {
      if (!sessionId) { local(display, "No active session."); return }
      const keepCount = Number.parseInt(rest, 10) || 0
      if (keepCount < 0) { local(display, "Usage: /fork [N]"); return }
      const res = await apiFetch(`/api/session/${encodeURIComponent(sessionId)}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_count: keepCount }),
      })
      if (!res.ok) { local(display, await responseMessage(res, "Fork failed")); return }
      const data = await res.json().catch(() => ({})) as { id?: string; kept?: number }
      qc.invalidateQueries({ queryKey: ["sessions"] })
      if (data.id) navigate(`/chat/${data.id}`)
      local(display, `Forked session (${data.kept || 0} messages).`)
      return
    }

    if (sub === "truncate") {
      if (!sessionId) { local(display, "No active session."); return }
      const keep = Number.parseInt(rest, 10)
      if (!Number.isFinite(keep) || keep < 1) { local(display, "Usage: /truncate N"); return }
      const res = await apiFetch(`/api/session/${encodeURIComponent(sessionId)}/truncate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_count: keep }),
      })
      if (!res.ok) { local(display, await responseMessage(res, "Truncate failed")); return }
      qc.invalidateQueries({ queryKey: ["history", sessionId] })
      qc.invalidateQueries({ queryKey: ["sessions"] })
      local(display, `Truncated to ${keep} messages.`)
      return
    }

    if (sub === "switch") {
      const sessions = await loadSessions()
      const target = resolveSession(rest, sessions)
      if (!rest) { local(display, "Usage: /switch <name or id>"); return }
      if (!target) { local(display, `No session matching "${rest}".`); return }
      navigate(`/chat/${target.id}`)
      local(display, `Switched to ${sessionLabel(target)}.`)
      return
    }

    if (sub === "sort") {
      toast("Auto-sorting sessions...", "info")
      const res = await apiFetch("/api/sessions/auto-sort", { method: "POST" })
      if (!res.ok) { local(display, await responseMessage(res, "Auto-sort failed")); return }
      const data = await res.json().catch(() => ({})) as { status?: string; reason?: string; updated?: number; folders?: unknown[]; deleted_empty?: number }
      qc.invalidateQueries({ queryKey: ["sessions"] })
      if (data.status === "skipped") local(display, `Auto-sort skipped: ${data.reason || "No sessions to sort"}.`)
      else local(display, `Sorted ${data.updated || 0} sessions into ${data.folders?.length || 0} folders${data.deleted_empty ? ` (${data.deleted_empty} empty deleted)` : ""}.`)
      return
    }

    if (sub === "list") {
      const sessions = (await loadSessions()).filter((s) => !s.archived)
      if (!sessions.length) { local(display, "No active sessions."); return }
      const lines = sessions.slice(0, 40).map((s) => `${s.id === sessionId ? "* " : "  "}${s.name || "Untitled"}  ${s.id.slice(0, 8)}${s.is_important ? "  favorite" : ""}`)
      if (sessions.length > 40) lines.push(`... and ${sessions.length - 40} more`)
      local(display, `\`\`\`\n${lines.join("\n")}\n\`\`\``)
      return
    }

    if (sub === "info") {
      if (!sessionId) { local(display, "No active session."); return }
      const sessions = await loadSessions()
      const s = sessions.find((item) => item.id === sessionId)
      if (!s) { local(display, "Session not found."); return }
      local(display, `\`\`\`\nSession:  ${s.name || "Untitled"}\nID:       ${s.id}\nModel:    ${s.model || "?"}\nFolder:   ${s.folder || "(none)"}\nMessages: ${s.message_count ?? 0}\nCreated:  ${s.created_at || "?"}\nUpdated:  ${s.updated_at || "?"}\n\`\`\``)
      return
    }

    if (sub === "clear") {
      onClearMessages("Chat display cleared.")
      return
    }

    local(display, "Usage: /chats new | delete | archive | rename | favorite | fork | truncate | switch | sort | info | clear | export")
  }
  const runCoreCommand = async (name: string, args: string, display: string, attachmentIds: string[], attachments: ChatAttachment[]) => {
    const cmd = coreCommandFor(name)
    if (!cmd) return false
    const wantsHelp = args.trim().split(/\s+/).some((part) => part === "--help" || part === "-h")
    if (cmd.name === "help") {
      showSlashHelp(display, args)
      return true
    }
    if (wantsHelp && showCommandHelp(display, name, args)) return true
    if (cmd.name === "memory" && args.trim()) {
      await runMemoryCommand(display, args)
      return true
    }
    if (cmd.name === "rag") {
      if (!args.trim()) navigate("/knowledge")
      else await runRagCommand(display, args)
      return true
    }
    if (cmd.name === "search") {
      if (!requireArgs(display, args, "Usage: /search query")) return true
      const query = args.trim()
      onSend(query, attachmentIds, sendAsFor(query, query), { forceWeb: true, attachments })
      return true
    }
    if (cmd.name === "setup") {
      await runSetupCommand(display, args)
      return true
    }
    if (cmd.name === "prompt") {
      const firstUseKey = "odysseus_prompt_command_used"
      const firstUse = window.localStorage.getItem(firstUseKey) !== "1"
      const prompt = pickStarterPrompt(firstUse)
      if (firstUse) window.localStorage.setItem(firstUseKey, "1")
      setText(prompt)
      requestAnimationFrame(() => { ref.current?.focus(); grow() })
      return true
    }
    if (TOUR_GUIDES[cmd.name]) {
      await runTourCommand(display, cmd.name)
      return true
    }
    if (cmd.name === "workspace") {
      await runWorkspaceCommand(display, args)
      return true
    }
    if (cmd.name === "export") {
      exportCurrentChat(display, args)
      return true
    }
    if (cmd.name === "chats") {
      await runChatsCommand(display, args)
      return true
    }
    const legacyChatSub = CHAT_LEGACY_COMMANDS[cmd.name]
    if (legacyChatSub) {
      await runChatsCommand(display, [legacyChatSub, args].filter(Boolean).join(" "))
      return true
    }
    const routes: Record<string, string> = {
      settings: "/settings",
      research: "/research",
      compare: "/compare",
      calendar: "/calendar",
      email: "/email",
      gallery: "/gallery",
      memory: "/memory",
      notes: "/notes",
      tasks: "/tasks",
      library: "/library",
      cookbook: "/cookbook",
      skills: "/skills",
      personal: "/personal",
      knowledge: "/knowledge",
    }
    if (cmd.name === "find") {
      window.dispatchEvent(new CustomEvent("odysseus:open-search", { detail: args.trim() }))
      return true
    }
    const toggleMap: Record<string, "useWeb" | "useResearch" | "allowBash" | "useRag" | "incognito"> = {
      web: "useWeb",
      research: "useResearch",
      bash: "allowBash",
      shell: "allowBash",
      rag: "useRag",
      knowledge: "useRag",
      incognito: "incognito",
      private: "incognito",
    }
    if (cmd.name === "toggle") {
      const target = args.trim().split(/\s+/)[0]?.toLowerCase()
      const key = toggleMap[target]
      if (!key) { toast("Try /toggle web, research, bash, rag, or incognito.", "info"); return true }
      toggleComposer(key)
      toast(`${target} toggled`, "success")
      return true
    }
    const directToggle = toggleMap[cmd.name]
    if (directToggle && !routes[cmd.name]) {
      toggleComposer(directToggle)
      toast(`${cmd.name} toggled`, "success")
      return true
    }
    const route = routes[cmd.name]
    if (route) {
      navigate(route)
      return true
    }
    if (cmd.name === "shortcuts") {
      window.dispatchEvent(new CustomEvent("odysseus:open-shortcuts"))
      return true
    }
    if (cmd.name === "models" || (cmd.name === "model" && ["list", "ls"].includes(args.trim().toLowerCase()))) {
      await listModels(display)
      return true
    }
    if (cmd.name === "model") {
      local(display, `\`\`\`\nCurrent model: ${selectedModel || "None selected"}\nEndpoint: ${selectedEndpointUrl || selectedEndpointId || "not available"}\n\nUsage: /model list to show all available models\n\`\`\``)
      return true
    }
    if (cmd.name === "mcp") {
      const res = await apiFetch("/api/mcp/servers")
      if (!res.ok) { local(display, "MCP status is unavailable for this user."); return true }
      const servers = (await res.json().catch(() => [])) as { name?: string; status?: string; tool_count?: number; is_enabled?: boolean; error?: string }[]
      if (!servers.length) { local(display, "No MCP servers configured."); return true }
      local(display, `\`\`\`\n${servers.map((s) => `${s.name || "MCP server"}: ${s.is_enabled === false ? "disabled" : (s.status || "unknown")}${s.tool_count != null ? ` (${s.tool_count} tools)` : ""}${s.error ? ` - ${s.error}` : ""}`).join("\n")}\n\`\`\``)
      return true
    }
    if (cmd.name === "stats") {
      const res = await apiFetch("/api/db/stats")
      if (!res.ok) { local(display, "Database statistics are unavailable for this user."); return true }
      const d = (await res.json().catch(() => ({}))) as Record<string, unknown>
      local(display, `\`\`\`\nSessions:  ${d.sessions ?? "?"}\nMessages:  ${d.messages ?? "?"}\nMemories:  ${d.memories ?? "?"}\nDocuments: ${d.documents ?? "?"}\nUploads:   ${d.uploads ?? "?"}\n\`\`\``)
      return true
    }
    if (cmd.name === "usage") {
      if (!sessionId) { local(display, "No active session."); return true }
      const sessions = await apiJson<Session[]>("/api/sessions")
      const s = sessions.find((item) => item.id === sessionId)
      local(display, `\`\`\`\nSession: ${s?.name || "Current chat"}\nModel: ${s?.model || selectedModel || "Unknown"}\nMessages: ${(s?.message_count || 0).toLocaleString()}\nEndpoint: ${s?.endpoint_url || selectedEndpointUrl || selectedEndpointId || "not available"}\n\nProvider account usage is not available from here; check the provider dashboard for account quota/billing.\n\`\`\``)
      return true
    }
    if (cmd.name === "compact") {
      if (!sessionId) { local(display, "No active chat to compact."); return true }
      const res = await apiFetch(`/api/session/${encodeURIComponent(sessionId)}/compact`, { method: "POST", headers: { "Content-Type": "application/json" } })
      const data = await res.json().catch(() => ({})) as { summarized?: number; kept?: number; detail?: string }
      if (!res.ok) { local(display, data.detail || "Compaction failed."); return true }
      qc.invalidateQueries({ queryKey: ["history", sessionId] })
      qc.invalidateQueries({ queryKey: ["sessions"] })
      local(display, `Conversation compacted. Summarized ${data.summarized || 0} older messages, kept ${data.kept || 0} recent messages.`)
      return true
    }
    if (cmd.name === "note") {
      if (!requireArgs(display, args, "Usage: /note Your note here")) return true
      const title = args.trim()
      const res = await apiFetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content: "", note_type: "note", source: "slash" }) })
      if (!res.ok) throw new Error("note create failed")
      qc.invalidateQueries({ queryKey: ["notes"] })
      local(display, `Note added: ${title}`)
      return true
    }
    if (cmd.name === "todo") {
      const parts = args.trim().split(/\s+/)
      const sub = (parts[0] || "").toLowerCase()
      if (sub === "list" || sub === "ls") {
        const data = await apiJson<{ notes?: { title?: string; content?: string; archived?: boolean; label?: string }[] }>("/api/notes?note_type=note")
        const items = (data.notes || []).filter((n) => !n.archived && n.label === "todo").slice(0, 30)
        local(display, items.length ? `\`\`\`\n${items.map((n) => `- ${n.title || n.content || "Untitled"}`).join("\n")}\n\`\`\`` : "No todos.")
        return true
      }
      const title = (sub === "add" ? parts.slice(1).join(" ") : args).trim()
      if (!requireArgs(display, title, "Usage: /todo Your task here  |  /todo list")) return true
      const res = await apiFetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, note_type: "note", source: "slash", label: "todo" }) })
      if (!res.ok) throw new Error("todo create failed")
      qc.invalidateQueries({ queryKey: ["notes"] })
      local(display, `Todo added: ${title}`)
      return true
    }
    if (cmd.name === "event") {
      await quickEvent(display, args.trim())
      return true
    }
    if (cmd.name === "sh") {
      if (!requireArgs(display, args, "Usage: /sh command")) return true
      const res = await apiFetch("/api/shell/exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: args }) })
      const data = await res.json().catch(() => ({})) as { stdout?: string; stderr?: string; exit_code?: number; detail?: string }
      if (!res.ok) { local(display, data.detail || "Shell execution is unavailable for this user."); return true }
      const output = [data.stdout, data.stderr].filter(Boolean).join("\n") || "(no output)"
      local(display, `\`\`\`\n$ ${args}\n${output}\n[exit ${data.exit_code ?? "?"}]\n\`\`\``)
      return true
    }
    return false
  }
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    const focus = () => ref.current?.focus()
    // Apply prefill text, clearing any stashed handoff key so it can't re-fire on
    // a later mount (whichever path — live event or durable sessionStorage —
    // wins, clears it).
    const apply = (t: string) => {
      try { sessionStorage.removeItem(PENDING_COMPOSER_KEY) } catch { /* ignore */ }
      setText(t)
      requestAnimationFrame(() => { ref.current?.focus(); grow() })
    }
    const setText_ = (e: Event) => { const t = (e as CustomEvent).detail; if (typeof t === "string") apply(t) }
    window.addEventListener("odysseus:focus-composer", focus)
    window.addEventListener("odysseus:set-composer", setText_)
    // Durable handoff: consume a question stashed by another route (e.g. /finance)
    // before this composer had mounted to hear the event above.
    try { const pending = sessionStorage.getItem(PENDING_COMPOSER_KEY); if (pending) apply(pending) } catch { /* sessionStorage unavailable */ }
    return () => { window.removeEventListener("odysseus:focus-composer", focus); window.removeEventListener("odysseus:set-composer", setText_) }
  }, [])

  const toggleMic = async () => {
    if (recording) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        if (!blob.size) return
        setTranscribing(true)
        try {
          const t = await transcribe(blob)
          if (t) { setText((p) => (p ? p + " " : "") + t); requestAnimationFrame(grow) }
        } catch { /* ignore */ } finally { setTranscribing(false); ref.current?.focus() }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
    } catch { /* mic denied/unavailable */ }
  }
  const submit = async () => {
    if ((!text.trim() && atts.length === 0) || streaming || uploading) return
    const ids = atts.map((a) => a.id)
    const attachments = [...atts]
    const display = text
    if (display.trim()) lastSentRef.current = display // for ArrowUp recall on an empty composer
    const cmd = /^\/([\w-]+)\s*([\s\S]*)$/.exec(display.trim())
    setText(""); setAtts([]); setSlashSel(0); if (ref.current) ref.current.style.height = "auto"
    try {
      if (cmd && await runCoreCommand(cmd[1], cmd[2] || "", display.trim(), ids, attachments)) return
    } catch (err) {
      onLocalReply(display.trim(), err instanceof Error ? err.message : "Command failed.")
      return
    }
    // /skill <request> → expand to the skill-pinned prompt (display the command, send the expansion)
    if (cmd && (slashAll || []).some((c) => c.name === cmd[1])) {
      try {
        const expanded = await invokeSkill(cmd[1], cmd[2] || "")
        onSend(display, ids, sendAsFor(display, expanded || display), { attachments })
      } catch {
        // Don't lose the message if skill expansion fails — send the raw command.
        onSend(display, ids, sendAsFor(display, display), { attachments })
      }
      return
    }
    onSend(display, ids, sendAsFor(display, display), { attachments })
  }
  const lastSentRef = useRef("")
  const uploadFileList = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    try { const up = await uploadFiles(files); setAtts((p) => [...p, ...up.map((f) => ({ id: f.id, name: f.name }))]) }
    catch { toast("Couldn't upload the file. Please try again.") }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }
  const onFiles = (files: FileList | null) => uploadFileList(files ? Array.from(files) : [])
  // Paste an image straight from the clipboard (Ctrl/Cmd+V of a screenshot) — the
  // original wired this globally; v2 had no paste handling at all.
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f)
    if (imgs.length) { e.preventDefault(); uploadFileList(imgs) }
  }
  const [dragging, setDragging] = useState(false)

  return {
    text, setText,
    atts, setAtts,
    uploading,
    ref, fileRef,
    caps,
    recording, transcribing,
    setSlashSel, setSlashDismissed,
    slashMatches, slashOpen, sel,
    grow, pickSlash,
    onFiles, onPaste,
    toggleMic, submit,
    dragging, setDragging,
    lastSentRef,
    streaming, onStop,
  }
}

export type ComposerController = ReturnType<typeof useComposerController>

interface CoreSlashCommand {
  name: string
  aliases?: string[]
  token: string
  help: string
}

interface SlashHelpEntry {
  usage: string
  help: string
  aliases?: string[]
}

const CORE_SLASH_COMMANDS: CoreSlashCommand[] = [
  { name: "help", aliases: ["?", "commands"], token: "/help", help: "Show slash command help" },
  { name: "settings", token: "/settings", help: "Open Settings" },
  { name: "research", token: "/research", help: "Open Research" },
  { name: "compare", token: "/compare", help: "Open Compare" },
  { name: "calendar", token: "/calendar", help: "Open Calendar" },
  { name: "email", aliases: ["mail", "inbox"], token: "/email", help: "Open Email" },
  { name: "gallery", aliases: ["photos"], token: "/gallery", help: "Open Gallery" },
  { name: "memory", aliases: ["brain", "memories"], token: "/memory", help: "Open Memory" },
  { name: "notes", token: "/notes", help: "Open Notes" },
  { name: "tasks", token: "/tasks", help: "Open Tasks" },
  { name: "library", aliases: ["docs", "documents"], token: "/library", help: "Open Library" },
  { name: "cookbook", aliases: ["cook"], token: "/cookbook", help: "Open Cookbook" },
  { name: "skills", token: "/skills", help: "Open Skills" },
  { name: "personal", token: "/personal", help: "Open Personal files" },
  { name: "knowledge", token: "/knowledge", help: "Open Knowledge base" },
  { name: "rag", token: "/rag", help: "Open or manage Knowledge indexing" },
  { name: "find", aliases: ["search-history"], token: "/find", help: "Search conversations" },
  { name: "search", aliases: ["websearch"], token: "/search", help: "Send a web search query" },
  { name: "toggle", token: "/toggle", help: "Toggle web, research, bash, RAG, or incognito" },
  { name: "web", token: "/web", help: "Toggle web search" },
  { name: "bash", aliases: ["shell"], token: "/bash", help: "Toggle shell access" },
  { name: "incognito", aliases: ["private"], token: "/incognito", help: "Toggle incognito" },
  { name: "mcp", token: "/mcp", help: "Show MCP server status" },
  { name: "model", token: "/model", help: "Show current model" },
  { name: "models", token: "/models", help: "List available models" },
  { name: "stats", aliases: ["df"], token: "/stats", help: "Show database statistics" },
  { name: "usage", aliases: ["cost", "tokens"], token: "/usage", help: "Show current chat usage" },
  { name: "compact", token: "/compact", help: "Compact older chat messages" },
  { name: "sh", aliases: ["exec", "run"], token: "/sh", help: "Run a shell command" },
  { name: "shortcuts", aliases: ["keys", "keybinds", "bind"], token: "/shortcuts", help: "Show keyboard shortcuts" },
  { name: "note", aliases: ["n"], token: "/note", help: "Quick-save a note" },
  { name: "todo", aliases: ["td"], token: "/todo", help: "Add or list todos" },
  { name: "event", aliases: ["ev"], token: "/event", help: "Create a calendar event" },
  { name: "setup", aliases: ["su", "seutp"], token: "/setup", help: "Add local or API model endpoints" },
  { name: "prompt", token: "/prompt", help: "Fill in a starter prompt" },
  { name: "demo", aliases: ["tour"], token: "/demo", help: "Show the full product tour" },
  { name: "tour-compare", aliases: ["compare-tour"], token: "/tour-compare", help: "Show the Compare tour" },
  { name: "tour-cookbook", aliases: ["cookbook-tour"], token: "/tour-cookbook", help: "Show the Cookbook tour" },
  { name: "tour-research", aliases: ["research-tour"], token: "/tour-research", help: "Show the Research tour" },
  { name: "tour-library", aliases: ["library-tour", "tour-doc", "tour-document", "doc-tour", "document-tour"], token: "/tour-library", help: "Show the Library tour" },
  { name: "tour-theme", aliases: ["theme-tour"], token: "/tour-theme", help: "Show the Theme tour" },
  { name: "tour-settings", aliases: ["tour-setting", "settings-tour"], token: "/tour-settings", help: "Show the Settings tour" },
  { name: "tour-gallery", aliases: ["gallery-tour"], token: "/tour-gallery", help: "Show the Gallery tour" },
  { name: "tour-brain", aliases: ["brain-tour", "tour-memory", "memory-tour"], token: "/tour-brain", help: "Show the Memory tour" },
  { name: "tour-task-1", aliases: ["tour-task", "tour-tasks", "tour-tasks-1", "tasks-tour", "tasks-tour-1"], token: "/tour-task-1", help: "Show the first Tasks tour" },
  { name: "tour-task-2", aliases: ["tour-tasks-2", "tasks-tour-2"], token: "/tour-task-2", help: "Show the second Tasks tour" },
  { name: "export", aliases: ["cat"], token: "/export", help: "Export the current chat" },
  { name: "chats", aliases: ["chat", "session", "sessions", "s"], token: "/chats", help: "Chat session commands" },
  { name: "new", aliases: ["create", "mkdir"], token: "/new", help: "Create a new chat" },
  { name: "delete", aliases: ["del", "rm"], token: "/delete", help: "Delete a chat" },
  { name: "archive", aliases: ["tar"], token: "/archive", help: "Archive a chat" },
  { name: "rename", aliases: ["mv"], token: "/rename", help: "Rename the current chat" },
  { name: "favorite", aliases: ["important", "star"], token: "/favorite", help: "Mark the current chat as favorite" },
  { name: "unfavorite", aliases: ["unimportant", "unstar"], token: "/unfavorite", help: "Unmark the current chat as favorite" },
  { name: "fork", aliases: ["cp"], token: "/fork", help: "Fork the current chat" },
  { name: "truncate", token: "/truncate", help: "Truncate the current chat" },
  { name: "switch", aliases: ["goto", "cd"], token: "/switch", help: "Switch chats by name or id" },
  { name: "sort", token: "/sort", help: "Auto-sort chats into folders" },
  { name: "info", aliases: ["stat"], token: "/info", help: "Show current chat details" },
  { name: "clear", token: "/clear", help: "Clear the chat display" },
  { name: "workspace", aliases: ["ws"], token: "/workspace", help: "Set the agent workspace" },
]

function coreCommandFor(name: string) {
  const lower = name.toLowerCase()
  return CORE_SLASH_COMMANDS.find((cmd) => cmd.name === lower || cmd.aliases?.includes(lower))
}

const CHAT_LEGACY_COMMANDS: Record<string, string> = {
  new: "new",
  delete: "delete",
  archive: "archive",
  rename: "rename",
  favorite: "favorite",
  unfavorite: "unfavorite",
  fork: "fork",
  truncate: "truncate",
  switch: "switch",
  sort: "sort",
  info: "info",
  clear: "clear",
}

const CHAT_SUB_ALIASES: Record<string, string> = {
  create: "new",
  mkdir: "new",
  del: "delete",
  rm: "delete",
  tar: "archive",
  mv: "rename",
  pin: "favorite",
  important: "favorite",
  star: "favorite",
  unpin: "unfavorite",
  unimportant: "unfavorite",
  unstar: "unfavorite",
  cp: "fork",
  goto: "switch",
  cd: "switch",
  stat: "info",
  ls: "list",
  sessions: "list",
  cat: "export",
}

const SETUP_PROVIDER_URLS: Record<string, { name: string; url: string; aliases?: string[] }> = {
  deepseek: { name: "DeepSeek", url: "https://api.deepseek.com/v1" },
  openai: { name: "OpenAI", url: "https://api.openai.com/v1", aliases: ["chatgpt", "open-ai"] },
  openrouter: { name: "OpenRouter", url: "https://openrouter.ai/api/v1", aliases: ["open-router"] },
  ollama: { name: "Ollama Cloud", url: "https://ollama.com/api", aliases: ["ollama-cloud"] },
  xai: { name: "xAI", url: "https://api.x.ai/v1", aliases: ["grok", "x-ai"] },
  anthropic: { name: "Anthropic", url: "https://api.anthropic.com/v1", aliases: ["claude"] },
  groq: { name: "Groq", url: "https://api.groq.com/openai/v1" },
  gemini: { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", aliases: ["google"] },
  "opencode-zen": { name: "OpenCode Zen", url: "https://opencode.ai/zen/v1" },
  "opencode-go": { name: "OpenCode Go", url: "https://opencode.ai/zen/go/v1" },
  nvidia: { name: "NVIDIA", url: "https://integrate.api.nvidia.com/v1" },
}

const SETUP_DEVICE_PROVIDERS: Record<string, { label: string; startUrl: string; pollUrl: string; aliases?: string[] }> = {
  copilot: { label: "GitHub Copilot", startUrl: "/api/copilot/device/start", pollUrl: "/api/copilot/device/poll", aliases: ["github"] },
  "chatgpt-subscription": {
    label: "ChatGPT Subscription",
    startUrl: "/api/chatgpt-subscription/device/start",
    pollUrl: "/api/chatgpt-subscription/device/poll",
    aliases: ["chatgptsubscription", "chatgpt-sub", "codex"],
  },
}

const STARTER_PROMPTS = [
  "i have no imagination help me",
  "Help me plan a focused work session for the next hour.",
  "Review this idea and give me the strongest next step.",
  "Turn this rough note into a clear plan.",
  "Help me compare the trade-offs in this decision.",
  "Write a small script that solves a repetitive task.",
]

function pickStarterPrompt(firstUse: boolean) {
  return firstUse ? STARTER_PROMPTS[0] : STARTER_PROMPTS[Math.floor(Math.random() * STARTER_PROMPTS.length)]
}

function deadlineFromNow(ms: number) {
  return Date.now() + ms
}

function beforeDeadline(deadline: number) {
  return Date.now() < deadline
}

const CHAT_HELP: Record<string, SlashHelpEntry> = {
  new: { usage: "/chats new [name]", help: "Create a new chat.", aliases: ["create", "mkdir", "/new"] },
  delete: { usage: "/chats delete [id|name|all]", help: "Delete a chat. Use /chats rm -rf for force/bulk delete.", aliases: ["del", "rm", "/delete"] },
  archive: { usage: "/chats archive [id|name]", help: "Archive the matched or current chat.", aliases: ["tar", "/archive"] },
  rename: { usage: "/chats rename Name", help: "Rename the current chat.", aliases: ["mv", "/rename"] },
  favorite: { usage: "/chats favorite [id|name]", help: "Mark a chat as favorite/important.", aliases: ["pin", "important", "star", "/favorite"] },
  unfavorite: { usage: "/chats unfavorite [id|name]", help: "Remove favorite/important protection.", aliases: ["unpin", "unimportant", "unstar", "/unfavorite"] },
  fork: { usage: "/chats fork [N]", help: "Fork the current chat, copying the first N messages.", aliases: ["cp", "/fork"] },
  truncate: { usage: "/chats truncate N", help: "Truncate the current chat through the history API.", aliases: ["/truncate"] },
  switch: { usage: "/chats switch name-or-id", help: "Switch to an active chat by name or id prefix.", aliases: ["goto", "cd", "/switch"] },
  sort: { usage: "/chats sort", help: "Auto-sort chats into folders.", aliases: ["/sort"] },
  info: { usage: "/chats info", help: "Show current chat details.", aliases: ["stat", "/info"] },
  clear: { usage: "/chats clear", help: "Clear the visible chat display.", aliases: ["/clear"] },
  list: { usage: "/chats list", help: "List active chats.", aliases: ["ls", "sessions"] },
  export: { usage: "/chats export [md|txt|html|json]", help: "Download the current chat.", aliases: ["cat", "/export"] },
}

const MEMORY_HELP: Record<string, SlashHelpEntry> = {
  list: { usage: "/memory list", help: "List stored memories.", aliases: ["ls", "/memories"] },
  add: { usage: "/memory add text", help: "Save a persistent memory.", aliases: ["echo"] },
  delete: { usage: "/memory delete id", help: "Delete a memory by id prefix. Use /memory rm -rf to wipe all.", aliases: ["del", "rm", "/forget"] },
  search: { usage: "/memory search query", help: "Search persistent memories.", aliases: ["grep"] },
}

const RAG_HELP: Record<string, SlashHelpEntry> = {
  list: { usage: "/rag list", help: "List indexed knowledge files.", aliases: ["ls"] },
  add: { usage: "/rag add /path", help: "Add a directory to knowledge indexing." },
  remove: { usage: "/rag remove /path", help: "Remove an indexed directory.", aliases: ["rm"] },
}

const WORKSPACE_HELP: Record<string, SlashHelpEntry> = {
  show: { usage: "/workspace", help: "Show the active agent workspace.", aliases: ["show", "status", "info", "/ws"] },
  set: { usage: "/workspace set /absolute/path", help: "Vet and set the agent workspace.", aliases: ["cd", "use"] },
  clear: { usage: "/workspace clear", help: "Clear the active workspace.", aliases: ["off", "none", "unset"] },
  pick: { usage: "/workspace pick [path]", help: "Browse available workspace folders.", aliases: ["browse", "open"] },
}

const TOGGLE_HELP: Record<string, SlashHelpEntry> = {
  web: { usage: "/toggle web", help: "Toggle web search.", aliases: ["/web"] },
  bash: { usage: "/toggle bash", help: "Toggle shell/tool access.", aliases: ["shell", "/bash"] },
  research: { usage: "/toggle research", help: "Toggle deep research mode." },
  rag: { usage: "/toggle rag", help: "Toggle knowledge retrieval." },
  incognito: { usage: "/toggle incognito", help: "Toggle incognito chat.", aliases: ["private", "/incognito"] },
}

interface TourGuide {
  title: string
  route?: string
  steps: TourStep[]
  closing?: string
}

interface TourStep {
  text: string
  selector?: string
}

const tourStep = (selector: string, text: string): TourStep => ({ selector, text })
const tourNote = (text: string): TourStep => ({ text })

const TOUR_GUIDES: Record<string, TourGuide> = {
  demo: {
    title: "Full Product Tour",
    route: "/chat",
    steps: [
      tourStep('[data-tour="new-chat"]', "Start with a new chat, then pick the model you want to use."),
      tourStep('[data-tour="mode-picker"]', "Use Chat for straightforward conversation or Agent when the model should operate tools."),
      tourStep('[data-tour="tools-menu"]', "Toggle web search, research, shell, RAG, and incognito from the composer controls."),
      tourStep('[data-tour="primary-nav"]', "Your pinned tools live here; open everything else (Compare, Library, Gallery, Tasks, Cookbook…) from “More tools”. Pin the ones you use most."),
      tourStep('[data-tour="composer-input"]', "Type in the composer, drop files to attach them, or run /prompt for a starter prompt."),
    ],
    closing: "For focused walkthroughs, run /tour-compare, /tour-research, /tour-library, /tour-brain, or /tour-task-1.",
  },
  "tour-compare": {
    title: "Compare Tour",
    route: "/compare",
    steps: [
      tourStep('[data-tour="compare-mode"]', "Choose a compare mode: chat, agent, search, or deep research."),
      tourStep('[data-tour="compare-blind"]', "Use blind mode to hide model names until you vote."),
      tourStep('[data-tour="compare-parallel"]', "Choose parallel or sequential comparisons depending on how you want to read responses."),
      tourStep('[data-tour="compare-models"]', "Choose or change models when you want broader coverage."),
      tourStep('[data-tour="compare-prompt"]', "Use repeatable prompts when you need consistent model tests."),
      tourStep('[data-tour="compare-panes"]', "Read the side-by-side answers, then vote when the run finishes."),
    ],
  },
  "tour-cookbook": {
    title: "Cookbook Tour",
    route: "/cookbook",
    steps: [
      tourStep('[data-tour="cookbook-download"]', "Search or paste a model repository to download a local model."),
      tourStep('[data-tour="cookbook-hardware"]', "Use hardware fit scans to see which models should run on the current machine."),
      tourStep('[data-tour="cookbook-cached"]', "Review downloaded models and their current local status."),
      tourNote("Original also had deeper serve/dependency log walkthroughs; v2 keeps the local-model status in this page."),
    ],
  },
  "tour-research": {
    title: "Deep Research Tour",
    route: "/research",
    steps: [
      tourStep('[data-tour="research-query"]', "Write a specific research question in the query box."),
      tourStep('[data-tour="research-settings"]', "Tune rounds, search engine, and model when you need a quicker pass or a deeper report."),
      tourStep('[data-tour="research-start"]', "Start the run and let the agent plan searches, collect sources, and synthesize findings."),
      tourStep('[data-tour="research-library"]', "Open past research from the panel or continue discussing finished reports in chat."),
    ],
  },
  "tour-library": {
    title: "Library Tour",
    route: "/library",
    steps: [
      tourStep('[data-tour="library-list"]', "Browse saved documents, research reports, and chat-linked artifacts."),
      tourStep('[data-tour="library-actions"]', "Create a blank document or import a file from disk."),
      tourStep('[data-tour="library-filters"]', "Search, sort, filter, archive, select, export, or delete documents."),
      tourStep('[data-tour="library-list"]', "Open a document to edit it, export it, or return to its source chat when available."),
      tourNote("Active document editing uses the editor toolbar after you open a document."),
    ],
  },
  "tour-theme": {
    title: "Theme Tour",
    route: "/settings?section=general",
    steps: [
      tourStep('[data-tour="settings-appearance"]', "Pick light or dark theme."),
      tourStep('[data-tour="settings-appearance"]', "Change accent color from the swatches or custom color input."),
      tourStep('[data-tour="settings-appearance"]', "Choose font family and density for the workspace."),
      tourStep('[data-tour="settings-nav"]', "Use sidebar visibility controls to keep the navigation focused."),
    ],
  },
  "tour-settings": {
    title: "Settings Tour",
    route: "/settings?section=models",
    steps: [
      tourStep('[data-tour="settings-models"]', "Models is where admins add endpoints and users choose available defaults."),
      tourStep('[data-tour="settings-nav"]', "General controls appearance and sidebar visibility."),
      tourStep('[data-tour="settings-nav"]', "Personalization, Account, and Integrations hold user-level setup."),
      tourStep('[data-tour="settings-nav"]', "Admins also see Users, System, Tools, and Advanced controls."),
    ],
  },
  "tour-gallery": {
    title: "Gallery Tour",
    route: "/gallery",
    steps: [
      tourStep('[data-tour="gallery-grid"]', "Photos shows uploaded images and videos in a searchable grid."),
      tourStep('[data-tour="gallery-upload"]', "Upload adds new media to the library."),
      tourStep('[data-tour="gallery-tabs"]', "Albums group media into collections."),
      tourStep('[data-tour="gallery-tabs"]', "The editor tab is where image-editing workflows live when available."),
      tourStep('[data-tour="gallery-tabs"]', "Settings controls gallery-specific preferences."),
    ],
  },
  "tour-brain": {
    title: "Memory Tour",
    route: "/memory",
    steps: [
      tourStep('[data-tour="memory-list"]', "Browse persistent memories and edit or delete stale entries."),
      tourStep('[data-tour="memory-add"]', "Add saves new facts Odysseus should remember."),
      tourStep('[data-tour="memory-tidy"]', "Tidy asks the model to remove duplicates or irrelevant memories."),
      tourStep('[data-tour="memory-settings"]', "Skills and settings control learned abilities and memory extraction behavior."),
    ],
  },
  "tour-task-1": {
    title: "Tasks Tour: Running Work",
    route: "/tasks",
    steps: [
      tourStep('[data-tour="tasks-tabs"]', "Tasks collects scheduled prompts, research jobs, actions, webhooks, and background work."),
      tourStep('[data-tour="tasks-list"]', "Runs and activity show queued, running, completed, and failed work."),
      tourStep('[data-tour="tasks-bulk-controls"]', "Pause and resume controls let you decide which automations are active."),
      tourStep('[data-tour="tasks-list"]', "Background cleanup uses the configured utility model when available."),
    ],
    closing: "Run /tour-task-2 for adding and managing tasks.",
  },
  "tour-task-2": {
    title: "Tasks Tour: Adding Work",
    route: "/tasks",
    steps: [
      tourStep('[data-tour="tasks-add"]', "Use Add to create scheduled prompts, research runs, actions, event triggers, or webhooks."),
      tourStep('[data-tour="tasks-ai-draft"]', "Describe the task in plain language to draft it with AI."),
      tourStep('[data-tour="tasks-presets"]', "Pick templates when you want a structured starting point."),
      tourStep('[data-tour="tasks-list"]', "Edit, pause, resume, run now, or delete task cards from the list."),
      tourStep('[data-tour="composer-input"]', "You can also ask in chat for a new recurring task and let Odysseus build it."),
    ],
  },
}

const TOUR_HELP: Record<string, SlashHelpEntry> = {
  demo: { usage: "/demo", help: "Show the full product tour.", aliases: ["tour"] },
  "tour-compare": { usage: "/tour-compare", help: "Show the Compare tour.", aliases: ["compare-tour"] },
  "tour-cookbook": { usage: "/tour-cookbook", help: "Show the Cookbook tour.", aliases: ["cookbook-tour"] },
  "tour-research": { usage: "/tour-research", help: "Show the Research tour.", aliases: ["research-tour"] },
  "tour-library": { usage: "/tour-library", help: "Show the Library tour.", aliases: ["library-tour", "tour-doc", "tour-document", "doc-tour", "document-tour"] },
  "tour-theme": { usage: "/tour-theme", help: "Show the Theme tour.", aliases: ["theme-tour"] },
  "tour-settings": { usage: "/tour-settings", help: "Show the Settings tour.", aliases: ["tour-setting", "settings-tour"] },
  "tour-gallery": { usage: "/tour-gallery", help: "Show the Gallery tour.", aliases: ["gallery-tour"] },
  "tour-brain": { usage: "/tour-brain", help: "Show the Memory tour.", aliases: ["brain-tour", "tour-memory", "memory-tour"] },
  "tour-task-1": { usage: "/tour-task-1", help: "Show Tasks tour part 1.", aliases: ["tour-task", "tour-tasks", "tour-tasks-1", "tasks-tour", "tasks-tour-1"] },
  "tour-task-2": { usage: "/tour-task-2", help: "Show Tasks tour part 2.", aliases: ["tour-tasks-2", "tasks-tour-2"] },
}

const FLAT_HELP: Record<string, SlashHelpEntry> = {
  setup: { usage: "/setup local URL  |  /setup openai KEY  |  /setup copilot", help: "Add or open model endpoint setup.", aliases: ["su", "seutp"] },
  prompt: { usage: "/prompt", help: "Fill the composer with a starter prompt." },
  ...TOUR_HELP,
  settings: { usage: "/settings", help: "Open Settings." },
  research: { usage: "/research", help: "Open Research." },
  compare: { usage: "/compare", help: "Open Compare." },
  calendar: { usage: "/calendar", help: "Open Calendar." },
  email: { usage: "/email", help: "Open Email.", aliases: ["mail", "inbox"] },
  gallery: { usage: "/gallery", help: "Open Gallery.", aliases: ["photos"] },
  notes: { usage: "/notes", help: "Open Notes." },
  tasks: { usage: "/tasks", help: "Open Tasks." },
  library: { usage: "/library", help: "Open Library.", aliases: ["docs", "documents"] },
  cookbook: { usage: "/cookbook", help: "Open Cookbook.", aliases: ["cook"] },
  skills: { usage: "/skills", help: "Open Skills." },
  personal: { usage: "/personal", help: "Open Personal files." },
  knowledge: { usage: "/knowledge", help: "Open Knowledge base." },
  find: { usage: "/find query", help: "Search conversation history.", aliases: ["search-history"] },
  search: { usage: "/search query", help: "Send one query with web search enabled.", aliases: ["websearch"] },
  mcp: { usage: "/mcp", help: "Show MCP server status." },
  model: { usage: "/model  |  /model list", help: "Show the current model or list available models." },
  models: { usage: "/models", help: "List available models." },
  stats: { usage: "/stats", help: "Show database statistics.", aliases: ["df"] },
  usage: { usage: "/usage", help: "Show local usage for the current chat.", aliases: ["cost", "tokens"] },
  compact: { usage: "/compact", help: "Compact older chat messages." },
  sh: { usage: "/sh command", help: "Run a shell command.", aliases: ["exec", "run", "shell"] },
  shortcuts: { usage: "/shortcuts", help: "Open keyboard shortcuts.", aliases: ["keys", "keybinds", "bind"] },
  note: { usage: "/note text", help: "Quick-save a note.", aliases: ["n"] },
  todo: { usage: "/todo task  |  /todo list", help: "Add or list todos.", aliases: ["td"] },
  event: { usage: "/event tomorrow 14:00 Team call", help: "Create a calendar event.", aliases: ["ev"] },
  export: CHAT_HELP.export,
  help: { usage: "/help [command]", help: "Show slash command help.", aliases: ["?", "commands"] },
}

const HELP_SECTIONS: { title: string; entries: SlashHelpEntry[] }[] = [
  { title: "Getting started", entries: [FLAT_HELP.setup, FLAT_HELP.prompt] },
  { title: "Tours", entries: Object.values(TOUR_HELP) },
  { title: "Chats", entries: Object.values(CHAT_HELP) },
  { title: "Tools", entries: ["settings", "research", "compare", "calendar", "email", "gallery", "notes", "tasks", "library", "cookbook", "personal", "knowledge"].map((k) => FLAT_HELP[k]) },
  { title: "Memory", entries: [...Object.values(MEMORY_HELP), FLAT_HELP.note, FLAT_HELP.skills] },
  { title: "Agent", entries: [...Object.values(WORKSPACE_HELP), ...Object.values(RAG_HELP)] },
  { title: "Productivity", entries: [FLAT_HELP.todo, FLAT_HELP.event] },
  { title: "Settings", entries: [FLAT_HELP.model, FLAT_HELP.models, FLAT_HELP.usage] },
  { title: "Utility", entries: [FLAT_HELP.search, FLAT_HELP.find, FLAT_HELP.mcp, FLAT_HELP.stats, FLAT_HELP.compact, FLAT_HELP.sh, FLAT_HELP.shortcuts, FLAT_HELP.help] },
]

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function toLocalIso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`
}

function parseTimeSpec(input: string): { date: Date; rest: string } | null {
  const s = input.trim().replace(/^(me\s+)/i, "").trim()
  const now = new Date()
  let m = s.match(/^in\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)\b\s*(?:to\s+)?(.*)$/i)
  if (m) {
    const d = new Date(now)
    const n = Number.parseInt(m[1], 10)
    const unit = m[2].toLowerCase()
    if (unit.startsWith("m")) d.setMinutes(d.getMinutes() + n)
    else if (unit.startsWith("h")) d.setHours(d.getHours() + n)
    else d.setDate(d.getDate() + n)
    return { date: d, rest: m[3].trim() }
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})\s*(?:to\s+)?(.*)$/i)
  if (m) {
    return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), rest: m[6].trim() }
  }
  m = s.match(/^(today|tomorrow)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to\s+)?(.*)$/i)
  if (m) {
    const d = new Date(now)
    if (m[1].toLowerCase() === "tomorrow") d.setDate(d.getDate() + 1)
    let hh = Number.parseInt(m[2], 10)
    const mm = m[3] ? Number.parseInt(m[3], 10) : 0
    const mer = (m[4] || "").toLowerCase()
    if (mer === "pm" && hh < 12) hh += 12
    if (mer === "am" && hh === 12) hh = 0
    if (hh > 23 || mm > 59) return null
    d.setHours(hh, mm, 0, 0)
    return { date: d, rest: m[5].trim() }
  }
  m = s.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b\s*(?:to\s+)?(.*)$/i)
  if (m) {
    const d = new Date(now)
    let hh = Number.parseInt(m[1], 10)
    const mm = m[2] ? Number.parseInt(m[2], 10) : 0
    const mer = (m[3] || "").toLowerCase()
    if (mer === "pm" && hh < 12) hh += 12
    if (mer === "am" && hh === 12) hh = 0
    if (hh > 23 || mm > 59) return null
    if (m[2] == null && !mer) return null
    d.setHours(hh, mm, 0, 0)
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
    return { date: d, rest: m[4].trim() }
  }
  return null
}

export {
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
}
export type { SlashHelpEntry }

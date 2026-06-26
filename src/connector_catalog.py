"""Curated catalog of connectors (Claude/ChatGPT-style "connectors" directory).

A connector is just an MCP server presented with branding + a connect template.
Two kinds:

  - ``remote``: a hosted MCP server over Streamable HTTP. Connecting runs the
    OAuth 2.1 + Dynamic Client Registration + PKCE flow already implemented in
    ``src/mcp_oauth.py`` — no user-entered secrets, the provider's consent
    screen handles auth.
  - ``local``: a local stdio MCP server (``npx`` package). Connecting fills the
    template's ``env``/``args`` from the user's ``fields`` (API keys, paths).

This module is pure data + helpers (no DB, no I/O) so it is trivially testable
and easy to update as endpoints/providers change. Mirrors the existing
``INTEGRATION_PRESETS`` pattern in ``src/integrations.py``.

``routes/connector_routes.py`` turns a chosen catalog entry into a per-user
``McpServer`` row (``owner`` set, ``catalog_id`` set) and kicks the connect flow.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Each entry:
#   id            stable catalog key (also stored on McpServer.catalog_id)
#   name          display name
#   description   one-line "what it does"
#   category      grouping for the gallery
#   icon          lucide-react icon name the frontend renders (brand logos: TODO)
#   capabilities  subset of {"read", "write"} shown as badges
#   kind          "remote" | "local"
#   auth_type     "oauth" | "api_key" | "none"
#   url           (remote) Streamable-HTTP MCP endpoint
#   transport     (remote) "http"; (local) "stdio"
#   command/args/env  (local) stdio launch template
#   fields        (local/api_key) user inputs: {key,label,help,secret,placeholder}
#   help          (local/api_key) setup instructions (markdown)
CONNECTOR_CATALOG: Dict[str, Dict[str, Any]] = {
    # ── Remote MCP connectors (one-click OAuth) ──────────────────────────────
    "notion": {
        "name": "Notion", "category": "Productivity", "icon": "FileText", "brand": "notion", "featured": True,
        "description": "Search and edit your Notion pages, databases, and comments.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.notion.com/mcp",
    },
    "linear": {
        "name": "Linear", "category": "Developer", "icon": "ListChecks", "brand": "linear", "featured": True,
        "description": "Manage Linear issues, projects, and cycles.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.linear.app/mcp",
    },
    "github": {
        "name": "GitHub", "category": "Developer", "icon": "Code", "brand": "github", "featured": True,
        "description": "Browse repos, search code, and manage issues & pull requests.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://api.githubcopilot.com/mcp/",
    },
    "stripe": {
        "name": "Stripe", "category": "Payments", "icon": "CreditCard", "brand": "stripe", "featured": True,
        "description": "Look up customers, payments, subscriptions, and invoices.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.stripe.com",
    },
    "sentry": {
        "name": "Sentry", "category": "Monitoring", "icon": "Bug", "brand": "sentry",
        "description": "Investigate errors, performance, and releases in Sentry.",
        "capabilities": ["read"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.sentry.dev/mcp",
    },
    "atlassian": {
        "name": "Atlassian (Jira & Confluence)", "category": "Productivity", "icon": "Boxes", "brand": "atlassian", "featured": True,
        "description": "Work with Jira issues and Confluence pages.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.atlassian.com/v1/mcp",
    },
    "asana": {
        "name": "Asana", "category": "Productivity", "icon": "ListChecks", "brand": "asana", "featured": True,
        "description": "Manage Asana tasks, projects, and portfolios.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.asana.com/v2/mcp",
    },
    "hubspot": {
        "name": "HubSpot", "category": "CRM & Sales", "icon": "Users", "brand": "hubspot",
        "description": "Query CRM contacts, deals, and companies.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.hubspot.com",
    },
    "canva": {
        "name": "Canva", "category": "Design", "icon": "Palette", "brand": "canva", "featured": True,
        "description": "Browse and export Canva designs and assets.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.canva.com/mcp",
    },
    "box": {
        "name": "Box", "category": "Files", "icon": "Box", "brand": "box",
        "description": "Search and manage files in Box.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.box.com",
    },
    "vercel": {
        "name": "Vercel", "category": "Developer", "icon": "Zap", "brand": "vercel", "featured": True,
        "description": "Inspect deployments, build status, logs, and env vars.",
        "capabilities": ["read"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.vercel.com",
    },
    "neon": {
        "name": "Neon", "category": "Data", "icon": "Database", "brand": "neon",
        "description": "Query serverless Postgres, manage branches and operations.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.neon.tech/mcp",
    },
    "cloudflare": {
        "name": "Cloudflare", "category": "Developer", "icon": "Cloud", "brand": "cloudflare", "featured": True,
        "description": "Manage zones, DNS, Workers, and read analytics.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.cloudflare.com/mcp",
    },
    "paypal": {
        "name": "PayPal", "category": "Payments", "icon": "CreditCard", "brand": "paypal",
        "description": "Look up transactions, invoices, orders, and subscriptions.",
        "capabilities": ["read", "write"], "kind": "remote", "auth_type": "oauth",
        "transport": "http", "url": "https://mcp.paypal.com/http",
    },

    # ── Local (stdio / npx) connectors ───────────────────────────────────────
    "filesystem": {
        "name": "Filesystem", "category": "Files", "icon": "FolderOpen",
        "description": "Read and write files in a directory you choose.",
        "capabilities": ["read", "write"], "kind": "local", "auth_type": "none",
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
        "env": {},
        "help": "Edit the **Directory** below to choose which folder the agent can access.",
        "fields": [
            {"key": "__arg2", "label": "Directory", "help": "Absolute path the server may read/write.",
             "secret": False, "placeholder": "/data/personal_docs"},
        ],
    },
    "browser": {
        "name": "Browser (Playwright)", "category": "Automation", "icon": "Globe",
        "description": "Let the agent navigate web pages, click, fill forms, and read content.",
        "capabilities": ["read", "write"], "kind": "local", "auth_type": "none",
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@playwright/mcp@latest", "--headless"], "env": {},
        "help": "Runs Chromium headless. First run installs the browser automatically.",
        "fields": [],
    },
    "memory": {
        "name": "Memory (Knowledge Graph)", "category": "Productivity", "icon": "Brain",
        "description": "A persistent knowledge-graph memory the agent can read and write.",
        "capabilities": ["read", "write"], "kind": "local", "auth_type": "none",
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-memory"], "env": {}, "fields": [],
    },
    "postgres": {
        "name": "Postgres", "category": "Data", "icon": "Database", "brand": "postgresql",
        "description": "Run read-only queries against a Postgres database.",
        "capabilities": ["read"], "kind": "local", "auth_type": "api_key",
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres", ""], "env": {},
        "help": "Paste your Postgres connection URL (e.g. `postgresql://user:pass@host/db`).",
        "fields": [
            {"key": "__arg2", "label": "Connection URL", "help": "postgresql://user:pass@host:5432/db",
             "secret": True, "placeholder": "postgresql://…"},
        ],
    },
    "brave": {
        "name": "Brave Search", "category": "Search", "icon": "Search", "brand": "brave",
        "description": "Web search via the Brave Search API.",
        "capabilities": ["read"], "kind": "local", "auth_type": "api_key",
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-brave-search"],
        "env": {"BRAVE_API_KEY": ""},
        "help": "1. Go to brave.com/search/api\n2. Sign up for a free plan\n3. Copy your API key",
        "fields": [
            {"key": "BRAVE_API_KEY", "label": "Brave API key", "help": "From brave.com/search/api",
             "secret": True, "placeholder": "BSA…"},
        ],
    },
    "slack": {
        "name": "Slack", "category": "Communication", "icon": "MessageSquare", "brand": "slack", "featured": True,
        "description": "Read channels and messages, search, and post to Slack.",
        "capabilities": ["read", "write"], "kind": "local", "auth_type": "api_key",
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-slack"],
        "env": {"SLACK_BOT_TOKEN": "", "SLACK_TEAM_ID": ""},
        "help": ("1. api.slack.com/apps > Create New App > From Scratch\n"
                 "2. Add Bot Token Scopes (channels:read, chat:write, …)\n"
                 "3. Install to workspace, copy the Bot User OAuth Token (xoxb-…)\n"
                 "4. Team ID is in your workspace URL or admin settings"),
        "fields": [
            {"key": "SLACK_BOT_TOKEN", "label": "Bot token", "help": "xoxb-…", "secret": True, "placeholder": "xoxb-…"},
            {"key": "SLACK_TEAM_ID", "label": "Team ID", "help": "T0…", "secret": False, "placeholder": "T0…"},
        ],
    },
    "todoist": {
        "name": "Todoist", "category": "Productivity", "icon": "ListChecks", "brand": "todoist",
        "description": "Create and manage Todoist tasks and projects.",
        "capabilities": ["read", "write"], "kind": "local", "auth_type": "api_key",
        "transport": "stdio", "command": "npx", "args": ["-y", "todoist-mcp-server"],
        "env": {"TODOIST_API_TOKEN": ""},
        "help": "todoist.com > Settings > Integrations > Developer > copy your API token.",
        "fields": [
            {"key": "TODOIST_API_TOKEN", "label": "API token", "help": "From Todoist Developer settings",
             "secret": True, "placeholder": "…"},
        ],
    },
}

# Ordered categories for the gallery UI.
CATEGORY_ORDER = [
    "Productivity", "Developer", "Communication", "CRM & Sales",
    "Payments", "Design", "Monitoring", "Search", "Data", "Files", "Automation",
]


def get_entry(catalog_id: str) -> Optional[Dict[str, Any]]:
    """Return the catalog entry for ``catalog_id`` (with its id injected), or None."""
    entry = CONNECTOR_CATALOG.get(catalog_id)
    if entry is None:
        return None
    return {"id": catalog_id, **entry}


def list_catalog(enabled_ids: Optional[set] = None) -> List[Dict[str, Any]]:
    """All catalog entries (id injected), optionally filtered to ``enabled_ids``
    (the admin-curated set). Catalog data is all public branding/templates — it
    contains no secrets — so entries are returned as-is for the client."""
    out: List[Dict[str, Any]] = []
    for cid, entry in CONNECTOR_CATALOG.items():
        if enabled_ids is not None and cid not in enabled_ids:
            continue
        out.append({"id": cid, **entry})
    # Stable, category-grouped ordering.
    out.sort(key=lambda e: (
        CATEGORY_ORDER.index(e["category"]) if e["category"] in CATEGORY_ORDER else 99,
        e["name"].lower(),
    ))
    return out

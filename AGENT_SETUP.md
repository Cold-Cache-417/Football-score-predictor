# AGENT_SETUP — tools, skills and MCP status in this environment

Inventory taken 2026-11-07 by the incoming agent (Buffy). Only verified facts
are listed. Nothing was installed. No credentials were read or printed.

---

## 1. This agent's own toolset

The incoming agent runs as Buffy inside Freebuff, on the user's local Mac
(`/Users/luqmankhan/...`), not in a VM.

| Capability | Status | Notes |
|---|---|---|
| Terminal / shell | **Available** | Bash, project root as default cwd |
| Filesystem read/write | **Available** | Scoped to the project folder |
| Local Chromium browser automation | **Available** | `preview_*` tools: snapshot, click, type, evaluate, logs, screenshots |
| Screenshots with saved PNG | **Available** | `preview_screenshot` with `savePath` |
| Dev-server preview panel | **Available** | `register_preview` |
| Web search / URL fetch | **Available** | |
| Sub-agents | **Available** | `researcher-web` |
| MCP tools | **Not exposed** | See §3 |

## 2. Skills

### 2.1 Account skills (readable via `cloud_read_skill`)

| Name | Purpose | Accessible |
|---|---|---|
| `frontend-design` | Aesthetic direction, typography, avoiding templated defaults | **Yes — read this session** |
| `web-design-guidelines` | Review UI against Web Interface Guidelines (a11y, UX audit) | Yes, not yet read |
| `shadcn` | shadcn/ui component management, presets, registries | Yes, not yet read |
| `migrate-radix-to-base` | Radix → Base UI migration | Yes, not relevant here |
| `ponytail` | Minimal-change discipline for coding tasks | Yes, not yet read |
| `find-skills` | Skill discovery | Yes |
| `setup-matt-pocock-skills` | Repo setup for the engineering skill set | Yes, not needed |

### 2.2 Local `~/.claude/skills` (OpenCode/Claude-style skill folders)

Present on disk, 26 entries, including:

`api-and-interface-design`, `browser-testing-with-devtools`,
`ci-cd-and-automation`, `code-review-and-quality`, `code-simplification`,
`constraint-driven-development`, `context-engineering`,
`debugging-and-error-recovery`, `deprecation-and-migration`,
`documentation-and-adrs`, `doubt-driven-development`,
`frontend-ui-engineering`, `git-workflow-and-versioning`, **`graphify`**,
`idea-refine`, `incremental-implementation`, `interview-me`,
`observability-and-instrumentation`, `performance-optimization`,
`planning-and-task-breakdown`, `ponytail` (+ `-audit`, `-debt`, `-gain`,
`-help`, `-review`), `security-and-hardening`, `shipping-and-launch`,
`source-driven-development`, `spec-driven-development`,
`test-driven-development`, `using-agent-skills`.

These are **OpenCode/Claude-format skill folders**. They are NOT registered as
this agent's skills and cannot be invoked as tools. They can be read as plain
markdown files if their guidance is wanted. `graphify` is a skill folder here,
not a connected MCP server.

### 2.3 Project-local skills

None. `./skills`, `./.claude/skills`, `./.freebuff/skills` and
`./.opencode/skill(s)` do not exist. `.freebuff/` contains only `project-id`
(an internal Freebuff marker) and `.gitignore`.

### 2.4 Next.js-specific instructions

`web/AGENTS.md` is auto-written by `next dev` and states that Next.js 16 has
breaking changes versus older knowledge. It instructs reading
`web/node_modules/next/dist/docs/` before writing app code. That directory
exists (guides for app router, pages router, architecture, community).
**Treat this as binding for `web/` work.**

## 3. MCP servers

### 3.1 Configured for OpenCode — `~/.config/opencode/opencode.json`

Server names found (names only; no values read):

| Server | Configured for OpenCode | Available to this agent |
|---|---|---|
| `shadcn` | yes | **No** |
| `playwright` | yes | **No** (but local Chromium tools replace it) |
| `context7` | yes | **No** |
| `gh_grep` | yes | **No** |
| `github` | yes | **No** |
| `whatsapp` | yes | **No** — unrelated to this project |

`~/.claude.json` exists but contains no `mcpServers` entries.

**Conclusion:** OpenCode MCP configuration does **not** carry over to this
agent. None of those six servers is connected here, and this agent's tool
schema exposes no MCP tools at all. Any work that assumed shadcn MCP, GitHub
MCP, Playwright MCP or Context7 must be done another way:

- shadcn MCP → the **shadcn CLI is available**: `npx shadcn@latest` reports
  version `4.23.0`, and `web/components.json` already points at
  `@/components/ui` with the `@react-bits` registry configured.
- Playwright MCP → replaced by the built-in `preview_*` browser tools.
  A standalone `playwright` binary also exists at `/opt/homebrew/bin/playwright`
  but its version and browser downloads are UNVERIFIED.
- GitHub MCP → no Git remote and no Git repo exist anyway.
- Context7 → replaced by `web_search` / `read_url`.

### 3.2 Connected third-party apps

None. The Freebuff account has no Gmail/Slack/Linear/etc. integrations
connected, and this project needs none.

## 4. Installed project tooling

`web/package.json` (verified):

- Next.js `16.4.5`, React `19.3.0`, TypeScript `^5`
- Tailwind CSS `^4` via `@tailwindcss/turbopack`
- `framer-motion ^14.10.1`, `gsap ^3.15.1`, `lenis ^1.3.27`
- `lucide-react ^1.70.0`
- Radix primitives: `react-slot`, `react-progress`, `react-tabs`, `react-tooltip`
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `node_modules` present (299 entries) — no install needed

Notes:
- `gsap` and `lenis` are installed but **not imported anywhere** in `src/`.
- `@radix-ui/react-tabs` is installed but there is no `ui/tabs.tsx`.
- `lucide-react` is not imported anywhere.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching` (Next 16
  flags) and wires a Turbopack CSS loader.

Python (`.venv/` exists, `requirements.txt`): pandas 3.1.1, numpy 2.5.4,
pyarrow 26.0.1, penaltyblog 1.13.1, catboost 1.2.10, xgboost 3.4.1,
scikit-learn 1.9.1, matplotlib 3.11.2, pytest 9.2.0. Not re-verified by import
during this inspection beyond running pandas for data checks (worked).

## 5. Rules this agent will follow here

1. Do not run `src/` Python (no refits, no export regeneration) without
   explicit instruction.
2. Do not modify `src/`, `data/`, or `reports/` during website work.
3. Do not install dependencies unless a real requirement appears; ask first.
4. Do not claim an MCP/skill/screenshot works without evidence.
5. Do not read or print `.env` files or any credentials.

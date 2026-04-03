# Competitor Audit: What to Steal, What to Skip

> Full feature comparison of Conductor, Emdash, OpenCode, and VS Code against Hashmark Studio.
> Written 2026-04-03. Updated with REAL Conductor.app audit (Tauri app by Melty, not Claude Code CLI).
> Every feature categorized as STEAL, SKIP, or ALREADY HAVE.

---

## CONDUCTOR.APP -- THE REAL ONE

Conductor (v0.45.0, com.conductor.app) is a **Tauri app** like hashmark. NOT Electron. NOT Claude Code CLI.

### Architecture (key difference from hashmark)
- **Framework**: Tauri 2.6.2 (Rust backend, web frontend at localhost:1420)
- **Backend**: Node.js sidecar running Fastify HTTP + JSON-RPC 2.0 over Unix sockets
- **Database**: SQLite (conductor.db) with sessions, messages, workspaces, settings, repos, attachments tables
- **AI Engine**: Claude Code's engine bundled as `internal.bundled.js` (69K lines) -- NOT shelling out to `claude` CLI
- **Communication**: Bidirectional JSON-RPC between frontend and sidecar
- **Also bundles**: `claude` binary (203MB), `codex` (77MB), `gh`, `node`, `watchexec`

### Why Conductor Feels Better Than Hashmark
1. **No CLI spawning** -- tool calls are real-time RPC events, not parsed from stdout
2. **Bidirectional RPC** -- backend pushes events (message, thinking, toolApproval, planMode) to frontend
3. **Native tool approval** -- `toolApproval` RPC prompts user inline, not via CLI permission flags
4. **Session compaction built-in** -- `is_compacting` flag, `freshly_compacted`, `context_token_count`
5. **Proper message blocks** -- messages have typed blocks (text, thinking, tool_use, tool_result, agentMessage)

### Conductor's Full Schema
```sql
sessions: id, status, claude_session_id, unread_count, model, permission_mode,
          freshly_compacted, context_token_count, notes, is_compacting,
          created_at, updated_at, pending_message, resume_session_at

session_messages: id, session_id, role, content, sent_at, cancelled_at,
                  full_message, model, input_tokens, output_tokens, cache,
                  created_at, updated_at

workspaces: id, path, status, updated_at, notes
repos: git repository tracking
attachments: file references linked to sessions
settings: key, value, created_at, updated_at
```

### Conductor's RPC Methods
**Backend -> Frontend (notifications/events):**
- `message` -- new chat message with blocks
- `agentMessage` -- agent-level communication
- `enterPlanModeNotification` -- enter plan mode
- `fastModeUnavailableNotification` -- model fallback
- `sessionLoaded` -- session ready
- `sidecarLog` -- debug output

**Frontend -> Backend (requests):**
- `askUserQuestion` -- prompt user
- `toolApproval` -- approve/deny tool execution
- `getDiff` -- get file diffs
- `diffComment` -- post code review comment on a line
- `getTerminalOutput` -- fetch terminal output (spotlight/run_script/terminal/auto)
- `exitPlanMode` -- leave plan mode
- `cancel` -- cancel operation
- `claudeAuth` -- authenticate
- `workspaceInit` -- init workspace
- `contextUsage` -- token usage info
- `codexRollback` -- rollback codex session

### What This Means for Hashmark
Our architecture (spawn `claude --print`, parse stdout) is fundamentally different. We CAN'T do real-time tool approval or bidirectional RPC without rewriting the backend. BUT we can match the VISUAL design and interaction patterns:
- Session tabs, message rendering, tool cards, thinking blocks -- all frontend
- The warmth, density, polish -- all CSS
- Keyboard shortcuts, panel layout -- all React

The backend difference means some features (inline tool approval, real-time plan mode toggle) won't work the same way. That's OK -- we have other strengths (agent teams, codebase scanning, multi-provider).

---

## How to Read This

- **STEAL** -- we need this. High impact, users expect it, competitors all have it.
- **STEAL (v2)** -- good feature but not blocking launch. Build after shipping.
- **SKIP** -- not worth the complexity, or doesn't fit our product.
- **HAVE** -- we already built this.
- **BROKEN** -- we have it but it's broken or incomplete.

Target: **Conductor** is the closest comp. Our app should feel like Conductor but with hashmark's codebase intelligence + agent orchestration on top.

---

## 1. APP SHELL & LAYOUT

### Conductor
- Top bar: repo name + branch (breadcrumb style, clickable) + workspace selector dropdown
- Session tabs across top (like browser tabs) -- multiple conversations visible, each named
- Left sidebar: History + Workspaces list with green dot for active
- Right sidebar: file changes panel (All files, Changes, Checks, Review tabs)
- Bottom: terminal with Setup/Run/Terminal tabs
- Chat input bar: always at bottom of main area with model selector, thinking toggle, plan mode, @mentions, /commands
- Status bar: model name + thinking indicator + icons

### Emdash
- Left sidebar: project list + task kanban board
- Main area: terminal-based agent output
- Right sidebar: file changes / diff review
- Bottom: terminal with tabs (Setup, Run, Terminal)
- Task-per-worktree isolation model

### OpenCode
- Clean layout similar to Conductor
- Theme selector with 100+ themes
- Status popovers for context info

### VS Code
- Activity bar (left icons) -> Sidebar -> Editor area -> Panel (bottom) -> Status bar
- The gold standard for developer tool layout
- Copilot Chat as sidebar panel

### Hashmark (Current)
- Rail (left icons) + Main area (chat or page) + Optional sessions panel + Terminal drawer
- Chat input bar always at bottom of home
- No session tabs
- No right sidebar for changes
- No breadcrumb titlebar

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Session tabs across top (like Conductor) | **STEAL** | P0 |
| Right sidebar: Changes/Review panel | **STEAL** | P1 |
| Breadcrumb titlebar (repo > branch > session) | **STEAL** | P1 |
| Workspace selector dropdown in titlebar | **HAVE** (WorkspaceDropdown exists) | -- |
| Terminal tabs (Setup/Run/Terminal) | **HAVE** (TerminalTabs.tsx exists) | -- |
| Status bar at bottom | **HAVE** (StatusBar.tsx exists but thin) | P2 polish |
| Activity bar (left rail) | **HAVE** | -- |

---

## 2. CHAT & AI INTERACTION

### Conductor (Claude Code Desktop)
- Rich message rendering: tool calls shown inline with expand/collapse
- Tool call cards: "[Read] file.ts" with icon, file name, elapsed time
- Thinking block: collapsible "Thinking..." section with streaming content
- Plan mode: responses marked as plan-only, no code execution
- @file mentions: autocomplete file picker, inlines content
- /commands: full slash command system (101 commands)
- Model selector: dropdown in input bar (Opus 4.6, Sonnet 4.6, Haiku 4.5)
- Thinking toggle: brain icon to enable/disable extended thinking
- Stop button: interrupt streaming
- Cost display: shows token usage per message
- Message actions: copy, retry, edit (on user messages)
- Code blocks: syntax highlighted with copy button and language label
- File attachment cards: clickable badges that show file context
- Streaming: real-time text rendering with cursor indicator
- Session resume: picks up where you left off

### Emdash
- Multi-agent: run Claude, Codex, Gemini, etc. in parallel terminals
- Agent-as-terminal: each agent gets its own PTY
- Review mode: dedicated review conversation with diff focus
- Line-level commenting on file diffs
- Skill catalog: 100+ curated skills (install via symlink)

### Hashmark (Current)
- Basic chat with streaming
- Tool call rendering (ToolResultCard, ToolSummary)
- Thinking block (ThinkingBlock.tsx)
- Plan mode (PlanReviewGate.tsx)
- @file mentions (MentionPicker.tsx)
- /slash commands (14 commands via SlashPicker)
- Model selector (ModelPicker.tsx)
- Code blocks with syntax highlighting (CodeRendering.tsx)
- EditPreview for showing file changes

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Tool call cards with icon + file + elapsed time | **BROKEN** -- we have ToolResultCard but it's not as polished as Conductor | P0 |
| Collapsible thinking blocks | **HAVE** | -- |
| Streaming cursor/indicator | **STEAL** -- Conductor shows a pulsing cursor at the stream end | P1 |
| Message actions (copy, retry, edit) | **STEAL** | P0 |
| Cost/token display per message | **STEAL** -- we track tokens but don't show per-message | P1 |
| File attachment badges (clickable) | **STEAL** from Conductor -- shows files Claude read as clickable chips | P0 |
| Code block copy button + language label | **HAVE** but verify polish | P1 |
| Session resume divider | **HAVE** | -- |
| Interrupt/stop button | **HAVE** (ChatInputBar has stop) | -- |
| Agent-as-terminal (Emdash style) | **SKIP** -- different paradigm, our chat is better | -- |
| Skill catalog (100+ installable skills) | **STEAL (v2)** -- great for ecosystem but not launch-blocking | P2 |
| Line-level code comments | **STEAL (v2)** -- powerful for review workflows | P2 |
| Multi-agent parallel terminals | **SKIP** -- we have swarm mode which is better | -- |

---

## 3. GIT & SOURCE CONTROL

### Conductor
- Branch display in titlebar (always visible)
- Changes panel (right sidebar): file tree with modification status
- Tabs: All files | Changes N | Checks | Review
- Inline diff viewing
- One-click PR creation
- Checkpoint system: save/restore points during conversation
- Working... indicator when agent is making changes

### Emdash
- Git worktree per task (full isolation)
- Automatic branch creation with configurable prefix
- Worktree pool for fast task creation
- PR creation with auto-generated title/body
- Issue integration: GitHub, GitLab, Linear, Jira
- Preservation patterns (.env, docker-compose stay across worktrees)

### Hashmark (Current)
- Branch display in titlebar
- Git status polling
- Diff drawer (DiffDrawer.tsx)
- Checkpoint system (CheckpointPanel.tsx)
- Drift detection (DriftIndicator.tsx)
- Create PR dialog (CreatePrDialog.tsx)
- Branch picker (BranchPicker.tsx)

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Changes panel in right sidebar (like Conductor) | **STEAL** | P0 |
| File tree with modification status (U/M/A/D badges) | **STEAL** | P0 |
| Inline diff viewer in changes panel | **HAVE** (DiffDrawer) but needs to move to right sidebar | P1 |
| "Working..." indicator during agent changes | **STEAL** | P0 |
| Checkpoint save/restore | **HAVE** | -- |
| Worktree per task (Emdash) | **STEAL (v2)** | P2 |
| Issue integration (GitHub, Linear, Jira) | **STEAL (v2)** | P2 |
| PR auto-creation | **HAVE** | -- |
| Branch picker | **HAVE** | -- |
| Drift detection | **HAVE** | -- |
| Worktree pool for fast spin-up | **SKIP** -- over-engineered for now | -- |
| Preservation patterns for worktrees | **STEAL (v2)** -- when we add worktrees | P3 |

---

## 4. TERMINAL

### Conductor
- Bottom panel with 3 tabs: Setup, Run, Terminal
- Setup tab: shows project setup commands (npm install, etc.)
- Run tab: shows agent execution output
- Terminal tab: real shell
- Resizable panel height
- Multiple terminal instances

### Emdash
- xterm.js with WebGL rendering
- Tmux session isolation
- Terminal snapshot (record/replay)
- Per-task terminal
- Remote SSH terminal support

### VS Code
- Multiple terminal tabs
- Split terminals
- Terminal profiles (bash, zsh, PowerShell)
- Drag-to-resize
- Task detection from terminal output

### Hashmark (Current)
- xterm.js terminal with WebSocket
- Terminal tabs
- Resizable drawer
- OSC 633 shell integration (CWD tracking)
- Search in terminal

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Setup/Run/Terminal tab separation | **STEAL** -- separates agent output from shell | P1 |
| WebGL rendering for terminal | **STEAL** -- smooth scrolling on large output | P2 |
| Multiple terminal profiles | **SKIP** -- not needed for v1 | -- |
| Split terminals | **SKIP** | -- |
| Remote SSH terminal | **SKIP** for now | -- |
| Terminal snapshot/replay | **SKIP** | -- |
| Basic terminal | **HAVE** | -- |
| Terminal tabs | **HAVE** | -- |
| Search in terminal | **HAVE** | -- |
| Resizable panel | **HAVE** | -- |

---

## 5. SESSION & WORKSPACE MANAGEMENT

### Conductor
- Session tabs across top: each conversation is a tab
- Tab shows: icon + session name (truncated) + close button
- New tab button (+)
- Workspace sidebar: lists all workspaces with green dot active indicator
- History sidebar: searchable list of past sessions
- Session auto-naming from first message

### Emdash
- Task-based: each task is a workspace with its own branch
- Task kanban board (like Linear)
- Task archival
- Multiple conversations per task
- Auto-generate task names from context

### OpenCode
- Project switching without server restart
- `x-opencode-directory` header per request

### Hashmark (Current)
- Sessions panel (toggle sidebar)
- Sessions list with title, preview, time ago
- Session switching by Cmd+1-9
- Auto-titling from first message
- Session search with FTS

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Session TABS across top (not sidebar list) | **STEAL** | P0 |
| Tab shows name + close button + streaming indicator | **STEAL** | P0 |
| "+" button to create new tab | **STEAL** | P0 |
| Workspace sidebar with active indicator | **HAVE** (SessionsPanel) | -- |
| Session search | **HAVE** | -- |
| Session auto-naming | **HAVE** | -- |
| Task kanban board (Emdash) | **SKIP** -- different paradigm | -- |
| Multi-conversation per task | **SKIP** | -- |
| Project switching without restart | **BROKEN** -- fixed in this session | -- |

---

## 6. DELIGHTFUL INTERACTIONS (THE BIG GAP)

These are the small touches that make Conductor feel alive. Hashmark has none of them.

### Conductor Has:
- **Streaming cursor**: pulsing dot at end of streaming text
- **Tool call animations**: cards slide in with subtle animation
- **Thinking shimmer**: loading shimmer effect on thinking blocks
- **Progress indicators**: elapsed time on tool calls (13.6s in your screenshot)
- **File badges**: tool results show as pill-shaped badges with file icons
- **Read N lines badge**: "Read 100 lines" shown as a chip next to file name
- **Diff indicator**: "+3" green badge on changed files count
- **Model badge**: "Opus 4.6" with icon in status area
- **Thinking badge**: "Thinking" with brain icon, toggleable
- **Keyboard shortcut hints**: "Cmd+L to focus" shown in input placeholder
- **Working indicator**: "Working..." pill in titlebar during agent execution
- **Review button**: one-click code review in changes panel
- **Breadcrumb navigation**: clickable repo > branch > workspace path

### What Hashmark Needs:

| Interaction | Priority | Effort |
|------------|----------|--------|
| Streaming cursor (pulsing dot) | P0 | 30 min |
| Tool call elapsed time display | P0 | 1 hr |
| File badges as clickable pills | P0 | 2 hr |
| "Read N lines" chip on file tool calls | P0 | 1 hr |
| Thinking shimmer/loading animation | P0 | 1 hr |
| "Working..." indicator in titlebar | P0 | 30 min |
| Keyboard hint in input placeholder | P0 | 10 min |
| Model + thinking badge row below input | P0 | 1 hr |
| Tool card slide-in animation | P1 | 2 hr |
| Diff count badge (+3 green) | P1 | 30 min |
| Subtle hover states on all interactive elements | P1 | 2 hr |
| Smooth scroll-to-bottom animation | P1 | 1 hr |
| Input focus ring animation | P2 | 30 min |

---

## 7. FILE BROWSER & SEARCH

### Conductor
- Right sidebar: All files tab shows file tree
- Changes tab shows only modified files
- Files are clickable (opens in editor or shows diff)
- File search via command palette

### Emdash
- Full file browser with ignore patterns
- Worker-thread file listing for performance
- Remote file system support
- Attachment system for images

### VS Code
- Explorer panel with full file tree
- Search panel with ripgrep
- Minimap for code overview

### Hashmark (Current)
- FileTreeSidebar.tsx exists with search/filter
- Command palette file search (Cmd+P)
- No right sidebar file view

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| File tree in right sidebar (changes view) | **STEAL** | P0 |
| File search via command palette | **HAVE** | -- |
| Left sidebar file explorer | **HAVE** (FileTreeSidebar) but not prominent | P2 |
| Image attachment support | **STEAL (v2)** | P2 |
| Remote file system | **SKIP** | -- |

---

## 8. MODEL & PROVIDER MANAGEMENT

### Conductor
- Model picker in input bar: Opus 4.6, Sonnet 4.6, Haiku 4.5
- Thinking toggle next to model picker
- Plan mode toggle
- Uses Claude Code's auth (no API key needed)

### Emdash
- 24 providers, 8 agent targets
- Per-provider auto-approve flags
- Agent-specific execution modes
- API key management in settings

### OpenCode
- Multi-provider: Claude, OpenAI, Gemini, DeepSeek, etc.
- Model management dialog
- Cost tracking per provider

### Hashmark (Current)
- Model picker with 15+ models across 7 providers
- Provider settings with API key management
- Smart router for model recommendations
- Provider auto-discovery

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Model picker in input bar | **HAVE** | -- |
| Thinking toggle | **HAVE** | -- |
| Plan mode toggle | **HAVE** | -- |
| Multi-provider support | **HAVE** | -- |
| Smart router | **HAVE** (unique to us) | -- |
| Per-agent model override | **STEAL (v2)** from Emdash | P2 |
| Cost tracking dashboard | **HAVE** (analytics) but needs better UI | P1 |

---

## 9. KEYBOARD SHORTCUTS & NAVIGATION

### Conductor
- Cmd+L: focus chat input
- Cmd+K: command palette
- Cmd+B: toggle sidebar
- Cmd+`: toggle terminal
- Shift+Tab: cycle permission mode

### Emdash
- Cmd+K: command palette
- Cmd+B: toggle left sidebar
- Cmd+.: toggle right sidebar
- Cmd+T: toggle theme
- Cmd+P: toggle kanban
- Cmd+E: toggle editor
- Cmd+N: new task
- Cmd+O: open in editor
- Cmd+], Cmd+[: next/prev project

### Hashmark (Current)
- Cmd+K: command palette (commands)
- Cmd+P: command palette (files)
- Cmd+B: toggle sidebar
- Cmd+` or Cmd+J: toggle terminal
- Cmd+1-9: switch session
- Cmd+,: settings
- Cmd+Shift+A: agents
- ?: shortcuts help
- g+letter: navigation

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Cmd+L: focus chat input | **STEAL** -- the most used shortcut in Conductor | P0 |
| Cmd+.: toggle right sidebar | **STEAL** -- when we add right sidebar | P1 |
| Permission mode cycle (Shift+Tab) | **HAVE** (from Claude Code features) | -- |
| All other shortcuts | **HAVE** | -- |

---

## 10. THEMING & DESIGN

### Conductor
- Dark theme (warm dark, similar to Claude Desktop)
- Brown/amber accent on active elements
- Rounded cards for tool calls
- Clean monospace + sans-serif mix
- Subtle borders, emphasis on content

### Emdash
- 4 themes: Light, Dark, Dark-black (OLED), System
- Radix UI + Tailwind
- Monaco Editor for code
- Framer Motion animations

### OpenCode
- 100+ syntax themes (Nord, Dracula, Gruvbox, Tokyo Night, etc.)
- Rich theme customization

### VS Code
- CSS custom properties for all colors
- High contrast modes
- Theme marketplace

### Hashmark (Current)
- Light + Dark + System themes
- Compact density mode
- CSS custom properties design system
- JetBrains Mono + Inter fonts
- 9 semantic colors

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| Warm dark theme (match Conductor vibe) | **STEAL** -- our dark theme is too cold/grey | P1 |
| Framer Motion animations | **STEAL** -- adds life to the UI | P1 |
| Syntax theme selection (10-20 themes) | **STEAL (v2)** | P2 |
| 100+ themes | **SKIP** -- overkill | -- |
| Compact density | **HAVE** | -- |
| Design tokens | **HAVE** | -- |

---

## 11. MCP & EXTENSIBILITY

### All Competitors
- MCP server configuration
- Tool plugin system
- Extension/skill catalogs

### Hashmark (Current)
- MCP server bridge
- MCP settings UI
- Tool plugin system
- Agent-as-extension pattern

### Verdict

| Feature | Status | Priority |
|---------|--------|----------|
| MCP server configuration | **HAVE** | -- |
| Tool plugins | **HAVE** | -- |
| Skill/extension catalog | **STEAL (v2)** | P2 |

---

## 12. UNIQUE TO HASHMARK (Our Moat)

These are things NONE of the competitors have:

| Feature | Description | Status |
|---------|-------------|--------|
| Codebase scanning + context generation | Scan project, generate CLAUDE.md/AGENTS.md for all tools | **HAVE** (working) |
| Agent company generation | Generate 15-25 agents across departments from scan | **HAVE** (working) |
| Agent effectiveness tracking | Success rate, run count, cost per agent | **HAVE** (working) |
| Drift detection | Alert when codebase changes since last scan | **HAVE** (working) |
| Smart model routing | Auto-recommend optimal model per task | **HAVE** (working) |
| Multi-format output | Generate .cursorrules, GEMINI.md, .windsurfrules, etc. | **HAVE** (working) |
| Context compaction | Auto-compact when context window fills up | **HAVE** (just improved this session) |
| Session memory | Cross-session learning | **HAVE** (working) |

---

## PRIORITY EXECUTION ORDER

### P0 -- Before Launch (do these first)

1. **Session tabs across top** -- replace sessions sidebar toggle with persistent tabs. Every competitor has this. Users expect it.
2. **Right sidebar: Changes panel** -- show modified files during/after agent work. Copy Conductor's layout exactly.
3. **"Working..." indicator** -- show in titlebar when Claude is executing tools.
4. **Tool call polish** -- elapsed time, file badges as pills, "Read N lines" chips. Match Conductor's rendering.
5. **Message actions** -- copy, retry, edit buttons on hover.
6. **Streaming cursor** -- pulsing dot at end of streaming text.
7. **Keyboard hint in input** -- "Ask to make changes, @mention files, run /commands" + "Cmd+L to focus"
8. **Cmd+L to focus chat** -- the single most important shortcut.
9. **Fix project switching** -- done this session (Tauri reload fix).
10. **Don't show chat on welcome screen** -- show ProjectPicker with no Shell chrome.

### P1 -- Right After Launch

11. Breadcrumb titlebar (repo > branch)
12. Warm dark theme (match Conductor aesthetic)
13. Framer Motion for tool card animations
14. Cost/token display per message
15. Setup/Run/Terminal tab separation
16. Thinking shimmer animation
17. Streaming progress on tool calls
18. Diff count badge on git changes

### P2 -- Growth Features

19. Theme selector (10-20 popular themes)
20. Skill/extension catalog
21. Worktree-per-task isolation
22. Line-level code comments
23. Image attachment support
24. WebGL terminal rendering
25. Issue integration (GitHub, Linear)
26. Per-agent model override

### SKIP -- Not Worth It

- 100+ themes (OpenCode has, nobody cares)
- Agent-as-terminal paradigm (Emdash's approach, our chat is better)
- Remote SSH support (niche, complex)
- Terminal snapshot/replay (cool but useless)
- Task kanban board (Emdash, different product)
- Split terminals (VS Code, overkill for us)
- Browser preview engine (Emdash, not our focus)
- Multi-conversation per task (over-engineered)

---

## DESIGN REFERENCE: MATCH CONDUCTOR

Based on your screenshot and the audit, the target layout should be:

```
+------------------------------------------------------------------+
| < > | repo/branch > origin/main   | /workspace v |  Working...  |
+------------------------------------------------------------------+
| [Tab 1] [Tab 2: Review works...] [+]     | Changes 13 | Review |
+----+----------------------------------------+--------------------+
|    |                                        | file-1.png    U    |
| H  |  [Tool Card]                           | file-2.png    U    |
| i  |  Review request.md                     | file-3.png    U    |
| s  |  ## Code Review Instruction...         | file-4.png    U    |
| t  |                                        | file-5.png    U    |
| o  |  Let me start by reading...            |                    |
| r  |                                        |                    |
| y  |  [Read] Read 100 lines [file.md]       |                    |
|    |  [Bash] Show diff stat  git diff...    |                    |
| W  |  [Thinking] This is a large diff...    |                    |
| o  |                                        +--------------------+
| r  |  Large diff - mostly deletions.        | Setup Run Terminal |
| k  |                                        | $ prompt %         |
| s  |  [toolsearch]                          |                    |
| p  |  :: 13.6s                              |                    |
| a  |                                        |                    |
| c  +----------------------------------------+                    |
| e  | Ask to make changes, @mention files    | Cmd+L to focus     |
| s  | * Opus 4.6  lightning  (i) Thinking  [] + eye               |
+----+-------------------------------------------------------------+
```

This is Conductor's layout. We should match it.

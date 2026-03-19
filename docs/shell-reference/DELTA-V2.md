# DELTA-V2: Comprehensive Feature Gap Analysis

> hashmark studio vs Conductor, Cursor, VS Code, Emdash, (t3code pending clone)
> Generated: 2026-03-19
> Based on: installed app binary analysis, source code audit, exhaustive product.json extraction

---

## Summary

5 reference apps examined. 147 specific feature gaps identified. Grouped by priority:
- **P0 (must have)**: 31 gaps -- core functionality users expect from day one
- **P1 (should have)**: 52 gaps -- features that make or break retention
- **P2 (nice to have)**: 64 gaps -- polish and competitive differentiators

---

## 1. Conductor -- Features We're Missing

Conductor v0.40.1 (Tauri v2 + bundled Claude/Codex CLIs + Node.js sidecar)

### 1a. Workspace System (git worktree isolation)

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Git worktree-based workspaces** | Each task gets its own worktree. Full file isolation between parallel tasks on the same repo. 5-state machine: initializing > setting_up > ready > archiving > archived. | Nothing. Single working directory. No parallel task isolation. | P0 |
| **Workspace pinning** | `pinned_at` timestamp moves workspace to top of repo list | No workspace concept | P1 |
| **Workspace notes** | Freeform text notes per workspace | No workspace concept | P2 |
| **Workspace unread indicator** | `unread` flag for visual notification when agent activity happens in background workspace | No workspace concept | P1 |
| **Big terminal mode** | `big_terminal_mode` flag swaps main pane from Claude chat to full-screen terminal per workspace | Terminal is always a bottom drawer, can maximize but doesn't replace chat | P2 |
| **Linked workspaces** | JSON array of workspace IDs for directory linking (secondary_directory_name) | No cross-workspace linking | P2 |
| **Workspace state persistence** | SQLite tables for workspaces, sessions, messages. Full DB schema with migrations. | Sessions in SQLite but no workspace abstraction | P1 |
| **Workspace status tracking** | `derived_status` (computed from activity) + `manual_status` (user override) -- visible in sidebar | Sessions show streaming indicator only | P1 |

### 1b. Git Checkpoint System

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Non-disruptive checkpoint save** | `checkpointer.sh save`: captures HEAD, index tree, worktree tree as git refs under `refs/conductor-checkpoints/`. No HEAD movement, no file changes. | CheckpointPanel exists but uses basic git stash/tag approach | P0 |
| **Checkpoint restore** | `checkpointer.sh restore`: `git reset --hard` to saved HEAD, `git read-tree --reset -u` for worktree, `git clean -fd`, restore staged state | Basic restore via git checkout | P1 |
| **Checkpoint diff** | Compare two checkpoints or checkpoint vs current working tree | DiffPanel exists but no checkpoint-to-checkpoint comparison | P1 |
| **Per-turn checkpoints** | Auto-checkpoint before EVERY user turn. Enables "undo last agent action" by reverting to pre-turn snapshot. | No auto-checkpointing | P0 |
| **Git busy detection** | `git-busy-check.sh` detects rebase/merge/cherry-pick/revert in progress. Skips checkpointing gracefully (exit 101). | No git operation detection | P1 |

### 1c. Multi-Agent Support

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Codex agent** | Full OpenAI Codex integration via app-server JSON-RPC. Thread management, plan mode, reasoning effort levels. | Claude only | P1 |
| **Multi-provider model routing** | Anthropic API direct + AWS Bedrock + Google Vertex. Per-model provider mapping. | Anthropic only (3 Claude models) | P1 |
| **Per-session model** | Each session can override the global model | Single global model selection | P0 |
| **Per-message model tracking** | Each message records which model generated it | No per-message model tracking | P2 |
| **Fast mode** | `fast_mode` toggle for faster/cheaper responses | No fast mode | P2 |
| **In-flight model switching** | Model changes use `setModel()` callback without restarting the session | Model change only affects next message | P1 |

### 1d. Session Management

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Session compaction** | `is_compacting` flag. During context compaction, new messages are queued (not lost). Compaction detected via Claude Code events. | No compaction awareness | P0 |
| **Session resume** | `--resume <session_id>` flag. Sessions can be resumed after app restart. `resume_session_at` stores restart point. | Sessions re-created from scratch on restart | P0 |
| **Pending message safety** | "Potato Problem" workaround: if Claude crashes before ack, message stored in `pending_message` to prevent data loss. Cancel disabled until ack. | Messages lost if stream fails mid-send | P0 |
| **Context usage tracking** | `context_token_count`, `context_used_percent` displayed in UI. `/context` slash command queries Claude for usage. | No context window usage display | P0 |
| **Idle session eviction** | After 30 min idle, generator destroyed. Max 5 concurrent active sessions. 60s check interval. | All sessions stay alive until app close | P1 |
| **Session soft delete** | `is_hidden` flag hides without data loss | Delete is permanent | P2 |

### 1e. Plan Mode

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Plan mode with approval flow** | Agent enters plan mode > generates plan > calls ExitPlanMode > user approves/denies/gives feedback > transitions to execution with new turn | Plan toggle exists but no approval flow. Plan mode just changes permission_mode flag. | P0 |
| **Plan mode feedback loop** | User can provide feedback on plan (not just approve/deny). Agent regenerates plan with feedback. | No plan feedback | P1 |
| **Claude `--permission-mode plan`** | Actually sends permission-mode flag to Claude Code CLI | Flag not passed to CLI spawn | P0 |

### 1f. MCP Server Integration

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Conductor MCP server** | Injects custom MCP server into Claude session with 3 tools: GetWorkspaceDiff, DiffComment, GetTerminalOutput | No MCP server injection | P1 |
| **GetWorkspaceDiff tool** | Agent can view workspace diff (all changes on branch vs merge base, including uncommitted). Supports --stat and per-file focus. | Agent has no diff visibility | P1 |
| **DiffComment tool** | Agent can post inline comments on specific file:line locations. Thread support, multi-line ranges, resolution tracking. | No agent-driven code review | P1 |
| **GetTerminalOutput tool** | Agent reads terminal output from spotlight/run_script/terminal sources. Maxlines param. | Agent cannot read terminal | P1 |
| **Enterprise data privacy mode** | When enabled, MCP server NOT injected -- no workspace data sent to agent | No enterprise mode | P2 |

### 1g. Native App Features

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Auto-updater** | `tauri_plugin_updater`: check, download, install. Seamless updates. | No auto-updater | P0 |
| **Deep link handler** | `conductor://` URL scheme registered in Info.plist | No URL scheme | P2 |
| **OS notifications** | `tauri_plugin_notification` for agent completion alerts | No notifications | P1 |
| **Window state persistence** | `tauri_plugin_window_state`: saves/restores position, size, maximized, fullscreen state between sessions | Window always opens at default 1400x900 | P1 |
| **Lottie animations** | 7 animation states: loader, logo, running, setting-up, typing, waiting, working | No loading animations (skeleton only) | P2 |
| **Bundled CLIs** | Ships with `claude`, `codex`, `node`, `gh`, `watchexec` binaries | Requires user's local `claude` CLI | P1 |

### 1h. Code Review System

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Diff comments table** | Full `diff_comments` SQLite table: file_path, line_number, end_line_number, body, state, author, avatar, thread_id, reply_to, is_resolved, is_outdated | No diff comment system | P1 |
| **Custom prompts per repo** | 4 custom prompt slots: general, code_review, create_pr, rename_branch | No per-repo custom prompts | P1 |
| **Repo-level settings** | display_order, run_script, run_script_mode, conductor_config, hidden flag, custom icon | No repo-level settings | P2 |

### 1i. Settings and Configuration

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Branch prefix config** | `branch_prefix_type` (github_username/custom) + `branch_prefix_custom` value | No branch naming config | P2 |
| **HTTP proxy** | `http_proxy` setting passed to Claude | No proxy support | P2 |
| **Custom API base URL** | `anthropic_base_url`, `anthropic_auth_token`, `anthropic_api_key` | Hardcoded to default Anthropic API | P1 |
| **Environment variables** | `claude_env_vars` setting (newline-separated KEY=VALUE) injected into Claude sessions | No env var injection | P1 |
| **Thinking control** | `default_thinking_enabled` boolean + per-session `thinking_enabled` toggle | Thinking toggle exists but doesn't pass `--thinking` flag | P0 |

---

## 2. Cursor -- Features We're Missing

Cursor (VS Code 1.105.1 fork + custom AI layer)

### 2a. AI Features

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Composer (multi-file agent edit)** | Full agentic editor: opens files, makes edits across codebase, creates/deletes files. Runs in background. Diff review before accept. | Chat only -- agent can't edit files (except via terminal commands) | P0 |
| **Background Agent** | Agent runs in cloud, continues working when app is closed. Returns with PR/results. | Agent stops when app closes | P1 |
| **Inline completions** | Tab-autocomplete suggestions as you type. Ghost text preview. Accept with Tab. | No code editing, no completions | P2 |
| **Next Edit Suggestions (NES)** | `github.copilot.nextEditSuggestions.enabled` -- predictive next-edit based on recent changes | No editing capabilities | P2 |
| **Multi-file diff review** | After agent edits, shows all changed files in a diff view. Accept/reject per file or per hunk. | DiffDrawer shows git diff but no accept/reject flow | P1 |
| **Chat participants** | `chatParticipant` API -- @workspace, @terminal, @vscode for scoped context | No chat scoping system | P2 |
| **Codebase indexing** | Embeds entire codebase for semantic search. Used by @codebase context. | No codebase indexing | P1 |
| **Image/vision support** | `chatReferenceBinaryData`, `vscode-copilot-vision` -- paste screenshots into chat | No image input | P1 |
| **Notepads** | Persistent scratchpad notes that can be @-referenced in chat for context | No notepads | P2 |

### 2b. Editor Features

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Full Monaco editor** | Complete code editor with syntax highlighting, IntelliSense, error squiggles, multi-cursor, minimap, breadcrumbs | CodeViewer is read-only with basic syntax highlighting | P0 |
| **File tabs** | Open multiple files as tabs, tab management (close, close others, pin) | No file tab system | P0 |
| **Go to definition** | Cmd+click on symbols, peek definition, go to references | No code navigation | P1 |
| **Find and replace** | Cmd+F with regex, match case, whole word, replace all | No find in file | P0 |
| **Find in files** | Cmd+Shift+F searches across entire project with file filters | No project-wide search | P0 |
| **Minimap** | Scrollbar-height code preview on right side of editor | No minimap | P2 |
| **Breadcrumbs** | File path breadcrumbs above editor showing folder > file > symbol | Titlebar has project > branch but no file breadcrumbs | P1 |
| **Multi-cursor** | Cmd+D, Alt+Click for multiple cursors | No editing | P2 |
| **Code folding** | Collapse/expand code blocks, regions | No code folding | P2 |
| **Outline/symbol view** | Sidebar showing code structure (functions, classes, exports) | No outline view | P1 |

### 2c. Source Control

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Inline diff decorations** | Gutter markers showing added/modified/deleted lines in the active editor | No inline diff | P1 |
| **Stage/unstage per hunk** | Stage individual hunks within a file, not just whole files | Stage/unstage whole files only | P1 |
| **Commit amend** | Amend last commit from source control panel | No commit amend | P2 |
| **Branch creation** | Create new branch from source control sidebar | Branch picker is read-only (display + switch only) | P0 |
| **Merge/rebase UI** | Visual merge conflict resolution with 3-way merge editor | No merge UI | P1 |
| **Git graph** | Timeline view of commit history with branch visualization | Basic commit list only | P2 |
| **Stash management** | Stash, pop, apply, drop from UI | No stash UI | P2 |
| **Remote operations** | Push, pull, fetch, sync from status bar and sidebar | No remote operations | P0 |

### 2d. Terminal

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Split terminal** | Horizontal split: two terminals side-by-side in same pane | Split button exists but just adds a tab (no side-by-side) | P1 |
| **Terminal profiles** | Named profiles (bash, zsh, fish, pwsh) with custom args, env, icon | Shell selector (zsh/bash/node/python) but no saved profiles | P2 |
| **Terminal find** | Cmd+F search within terminal output | No terminal search | P0 |
| **Link detection** | Clickable URLs and file paths in terminal output | No link detection (xterm web links addon not loaded) | P1 |
| **Shell integration decorations** | Command status markers in gutter (green check / red X per command) | OSC 633 parsed for CWD but no gutter decorations displayed | P1 |
| **Terminal rename** | Double-click tab to rename | No terminal tab rename | P2 |
| **Default shell config** | Configurable default shell in settings | Defaults to zsh, no setting | P2 |
| **Terminal scrollback config** | Configurable scrollback buffer size | Fixed 5000 lines | P2 |

### 2e. Command Palette

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **File search (Cmd+P)** | Fuzzy file search across entire project. Recent files at top. File icon by type. | Command palette has 18 commands but NO file search | P0 |
| **Symbol search (Cmd+Shift+O)** | Search for functions/classes/exports in current file | No symbol search | P1 |
| **Line number (Ctrl+G)** | Jump to specific line number | Menu item exists but no handler in renderer | P1 |
| **> prefix for commands** | Type ">" to filter to commands only (without file results) | Always shows commands (no mode switching) | P1 |
| **Recently opened files** | Recent files shown when palette opens (before typing) | No recent file tracking | P1 |
| **Fuzzy matching with highlights** | Matched characters highlighted in results | Simple `.includes()` matching, no character highlights | P1 |
| **Extension commands** | Extensions can register commands in palette | No extension system | P2 |

### 2f. Settings

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Settings search** | Search across ALL settings with keyword matching | Settings page has nav sections but no search | P1 |
| **Settings sync** | Cloud sync of settings, keybindings, extensions, snippets | No settings sync | P2 |
| **JSON settings editor** | Edit settings.json directly with IntelliSense | No raw settings editing | P2 |
| **Workspace settings** | Per-project settings override global | No per-project settings | P1 |
| **Keyboard shortcut editor** | Visual keybinding editor with conflict detection, search, record keys | ShortcutsHelp overlay is read-only display | P1 |

### 2g. Extensions and MCP

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Extension marketplace** | Full VS Code extension marketplace (gallery URL in product.json) | No extension system | P2 |
| **MCP gallery** | `mcpGallery` in product.json: serviceUrl at `api.mcp.github.com`, browsable catalog | MCP settings page shows configured servers but no gallery/install | P1 |
| **MCP server management** | Install/configure/remove MCP servers from UI | MCP section in settings is read-only display | P1 |

### 2h. Accessibility

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Accessibility signals** | Audio cues for: error, warning, success, task completed/failed, terminal bell, diff changes, format, save, voice recording, chat responses | No audio signals | P2 |
| **Screen reader support** | Full ARIA roles, live regions, announcements | Minimal ARIA (some role="listbox" on model dropdown) | P1 |
| **High contrast themes** | Light HC, Dark HC themes for accessibility | No high contrast theme | P2 |

---

## 3. VS Code -- Features We're Missing

VS Code (latest stable, com.microsoft.VSCode)

### 3a. Layout

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Auxiliary bar (right sidebar)** | Second sidebar on the right side. Hosts secondary panels like outline, timeline. | No right sidebar | P1 |
| **Panel tabs (bottom)** | Bottom panel has TERMINAL, PROBLEMS, OUTPUT, DEBUG CONSOLE, PORTS tabs | Terminal panel has TERMINAL and OUTPUT tabs only | P1 |
| **Editor groups** | Split editor into 2x2 grid, vertical/horizontal splits, drag tabs between groups | No editor split | P1 |
| **Zen mode** | Distraction-free mode: hides all chrome, centers editor | No zen mode | P2 |
| **Panel position** | Move panel to bottom, left, right, or floating | Terminal always at bottom | P2 |
| **Activity bar position** | Move to top, side, or hidden | Activity bar fixed at left | P2 |

### 3b. Embedded Sessions (VS Code specific)

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Sessions window** | Separate embedded app ("Visual Studio Code Sessions") for AI chat. Own HTML entry point, own CSS bundle, letterpress artwork. | Chat is part of main window | P2 |
| **Copilot integration** | Deep integration with GitHub Copilot: entitlements, quotas, SKU management, walkthrough, status menu | No Copilot integration (we use Claude directly) | N/A |

### 3c. Project Management

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Multi-root workspaces** | Open multiple folders in one window | Single project directory | P1 |
| **Workspace trust** | Security prompt when opening untrusted folders. Restricted mode for untrusted content. | No workspace trust | P2 |
| **Recent projects** | File > Open Recent shows last 10+ projects with pins | `get-recent-projects` IPC exists but no UI for it | P0 |
| **Profile templates** | `profileTemplatesUrl` -- download pre-configured profiles | No profiles | P2 |

### 3d. Debugging

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Integrated debugger** | Full debug adapter protocol: breakpoints, step through, variable inspection, call stack, watch expressions | No debugging capability | P2 |
| **Launch configurations** | `.vscode/launch.json` for project-specific debug configs | No launch configs | P2 |
| **Debug console** | Interactive REPL connected to debugger | No debug console | P2 |

### 3e. Other

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Welcome/getting started** | First-launch walkthrough with interactive steps: customize AI, set theme, learn shortcuts, explore settings | No onboarding flow | P0 |
| **Emergency alerts** | `emergencyAlertUrl` -- can push urgent messages to all users | No alert system | P2 |
| **Telemetry-core** | `telemetry-core.json` bundled for structured telemetry | No telemetry | P2 |
| **Process explorer** | View all running processes, memory/CPU per process | No process explorer | P2 |

---

## 4. Emdash -- Features We're Missing

Emdash v0.4.37 (Electron 30.5 + React 18 + SQLite/Drizzle)

### 4a. Multi-Agent Orchestration

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **23 agent support** | Codex, Claude, Cursor, Gemini, Qwen, Droid, Amp, OpenCode, Hermes, Copilot, Crush, Auggie, Goose, Kimi, Kilocode, Kiro, Rovo Dev, Cline, Continue, Codebuff, Mistral Vibe, Pi, Autohand | Claude only (3 models) | P1 |
| **Multi-agent tasks** | Pick N agents x M instances each. Each gets own worktree + PTY. Tabbed terminal panes per agent variant. | Single agent per session | P1 |
| **Agent auto-detection** | Scans PATH for installed agent CLIs, shows installed/missing status with version | No CLI detection | P1 |
| **Install banner** | When selected agent CLI not found, shows install command | No install guidance | P2 |
| **Agent activity detection** | PTY output analyzed character-by-character to classify busy/idle/waiting per agent | Streaming boolean only (binary) | P1 |
| **Agent event hooks** | HTTP server receives POST webhooks from agents (e.g., Claude Code hooks) for completion notifications | No webhook receiver | P1 |

### 4b. Task/Issue Management

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Task system** | Full task CRUD: create with name/agent/branch/prompt, auto-slug, worktree toggle, auto-approve toggle | Sessions only (no task abstraction) | P1 |
| **Task archiving** | Archive/restore tasks with collapsible archived section in sidebar | Delete is permanent | P1 |
| **Task pinning** | Pin tasks to top of sidebar | No task pinning | P2 |
| **Auto-generated task names** | Random friendly names (human-id), optional AI-inferred names from context | Sessions named "Untitled" | P1 |
| **Kanban board** | 3 columns: To-do, In-progress, Ready for review. Auto-promote on agent activity. Auto-complete after idle. | No kanban view | P1 |

### 4c. Issue Tracker Integrations

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **GitHub Issues** | OAuth device flow, issue selector with preview tooltip, auto-linked to PRs | No issue tracker integration | P1 |
| **Linear integration** | API key auth, issue selector with status/assignee/team | No Linear | P1 |
| **Jira integration** | Site URL + email + API token, issue selector | No Jira | P2 |
| **GitLab integration** | Instance URL + token, issue selector | No GitLab | P2 |
| **Plain (support)** | API key, thread selector | No support integration | P2 |
| **Forgejo** | Instance URL + token, issue selector | No Forgejo | P2 |

### 4d. Code Editor

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Full Monaco editor** | `@monaco-editor/react` with file tree sidebar, multiple file tabs, TypeScript config, diff decorations, markdown preview, content search | Read-only CodeViewer with basic highlight.js | P0 |
| **Diff viewer with staging** | Changes tab + History tab. File staging checkboxes. Commit area. Revert individual files. Stacked diff view. | SourceControlPage has file list + DiffViewer but staging is API-based, no Monaco diff | P1 |
| **PR review mode** | Fetches diff against PR base branch specifically | No PR-specific diff | P1 |
| **Diff warnings** | Flags potentially problematic changes | No diff analysis | P2 |
| **Line comments on diff** | Users leave inline comments that get injected into agent's next prompt | No diff commenting | P1 |

### 4e. Browser Preview

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **BrowserView preview** | Electron BrowserView rendering actual web content. Resizable pane. URL bar with back/forward/reload. | No browser preview | P1 |
| **Port auto-discovery** | Probes common dev server ports (5173, 3000, 8080). Watches for new servers. | No port detection | P1 |
| **Per-task URL persistence** | Remembers last URL per task | No URL tracking | P2 |

### 4f. PR Management

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **PR creation** | AI-generated title + description from git diff. Uses preferred agent, falls back to Claude, then heuristics. | No PR creation | P0 |
| **PR status tracking** | Auto-refreshes PR state | No PR tracking | P1 |
| **PR comments** | View and reply to PR comments | No PR comments | P1 |
| **Check runs** | View CI/CD check run results | No CI visibility | P1 |
| **Merge from UI** | Merge PR directly from the app | No merge capability | P1 |

### 4g. Remote Development

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **SSH connections** | Create, edit, test, delete SSH connections. Auth types: password, key, agent. | No SSH | P2 |
| **Remote PTY** | Terminals run over SSH for remote projects | Local only | P2 |
| **SCP file transfer** | Drag-and-drop files to remote terminal | Local only | P2 |
| **Workspace provisioning** | Custom provision/terminate scripts for cloud envs | No cloud provisioning | P2 |

### 4h. Native App Polish

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Custom keyboard shortcuts** | All shortcuts stored in settings, fully user-configurable with conflict detection | Shortcuts are hardcoded, not configurable | P1 |
| **Sound notifications** | Configurable sounds when agents finish tasks | No sounds | P2 |
| **Welcome screen** | Animated splash with logo + "Start shipping" button. Sets localStorage flag. | WorkspaceSetup page exists but minimal | P1 |
| **In-app changelog** | Changelog notifications with modal viewer | No changelog | P1 |
| **In-app feedback** | Feedback form with GitHub issue creation | No feedback form | P2 |
| **Three themes** | Light, Dark (navy), Dark-black with per-agent terminal color overrides | Dark theme only. Light toggle does nothing. | P0 |
| **Lifecycle scripts** | Per-task setup/run/teardown scripts with dedicated PTY | No lifecycle hooks | P2 |

### 4i. Skills/MCP

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Skills system** | Create custom skills (name, description, content), install from catalog, search, validate | No skills | P2 |
| **MCP page** | Full page: list installed servers, browse catalog, search, install/remove, status, tools count | MCP section in settings is read-only display | P1 |

---

## 5. Warp -- Features We're Missing

(From WARP_AUDIT.md -- Warp v0.2026.03.04, native Rust terminal)

### 5a. Terminal Innovation

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Block-based terminal** | Every command creates a discrete "block" with its own ID. Individually selectable, copyable, shareable. | Standard streaming terminal output | P2 |
| **Unified Developer Input (UDI)** | Single input box that switches between shell and AI modes. "@" menu for context injection. | Separate chat input and terminal | P1 |
| **Secret detection** | Built-in regex patterns for 20+ secret types (AWS keys, GitHub PATs, Stripe, JWT, etc). Custom regex support. Applied to terminal output. | No secret detection | P1 |
| **Settings import** | Auto-detects and imports settings from iTerm on first run | No settings import | P2 |
| **Dock icon variants** | 16+ dock icon choices for personalization | Default Electron icon | P2 |

### 5b. Cloud Agent Platform (Oz)

| Feature | What They Have | What We Have | Priority |
|---------|---------------|-------------|----------|
| **Cloud agents** | Run agents in cloud Docker containers. REST API for task management. GitHub Actions integration. | Local only | P2 |
| **Multi-model per feature** | 5 AI categories (agent, planning, coding, CLI, computerUse) each with independent model selection | Single model for everything | P1 |
| **Usage quotas** | Request limits, autosuggestion limits, voice limits, codebase index limits, bonus grants, monthly spending tracking | No usage tracking | P1 |
| **Skills system** | Modular skill packages with YAML frontmatter + markdown + scripts + references. 3-tier progressive disclosure. | No skills | P2 |
| **Scheduling** | Cron-based agent scheduling | No scheduling | P2 |

---

## 6. t3code -- Not Yet Examined

t3code (`https://github.com/pingdotgg/t3code.git`) needs to be cloned to `/tmp/t3code-ref` for examination. Could not clone without Bash access.

**Known from public info**: t3code is Theo's AI coding tool. Key features to examine after cloning:
- Agent architecture and model support
- UI components and layout patterns
- Terminal integration approach
- File editing workflow

---

## 7. Cross-Cutting Gaps (All Apps Have, We Don't)

These features appear in 3+ reference apps:

| Feature | Conductor | Cursor | VS Code | Emdash | Warp | Priority |
|---------|-----------|--------|---------|--------|------|----------|
| **Auto-updater** | Yes | Yes | Yes | Yes | Yes | P0 |
| **Onboarding/welcome flow** | No | Yes | Yes | Yes | Yes | P0 |
| **File search in palette** | No | Yes | Yes | No | No | P0 |
| **Working theme system** | No | Yes | Yes | Yes | Yes | P0 |
| **Context window tracking** | Yes | Yes | Yes | No | Yes | P0 |
| **Window state persistence** | Yes | Yes | Yes | Yes | Yes | P1 |
| **OS notifications** | Yes | Yes | Yes | Yes | Yes | P1 |
| **Custom keyboard shortcuts** | No | Yes | Yes | Yes | No | P1 |
| **Recent projects** | No | Yes | Yes | No | No | P0 |
| **Per-project settings** | Yes | Yes | Yes | Yes | No | P1 |
| **MCP server management** | Yes | Yes | Yes | Yes | No | P1 |
| **Usage/cost tracking** | No | Yes | No | No | Yes | P1 |
| **Telemetry** | Yes | Yes | Yes | Yes | Yes | P2 |
| **In-app changelog** | No | Yes | Yes | Yes | No | P1 |

---

## 8. Priority Summary -- What To Build Next

### P0 (31 items) -- Build These First

**Core AI:**
1. Session resume (`--resume` flag) -- sessions survive app restart
2. Context window usage display -- token count + percentage bar
3. Pending message safety -- never lose a message if Claude crashes
4. Session compaction awareness -- queue messages during compaction
5. Plan mode approval flow -- approve/deny/feedback cycle
6. Pass `--thinking` and `--permission-mode` flags to CLI
7. Per-session model override

**Editor:**
8. Full Monaco editor (read+write, not just read-only viewer)
9. File tabs (open/close/switch)
10. Find and replace (Cmd+F)
11. Find in files (Cmd+Shift+F)
12. File search in command palette (Cmd+P)

**Git:**
13. Per-turn auto-checkpointing (save before every agent action)
14. Non-disruptive checkpoint save (git ref, no HEAD movement)
15. Branch creation from UI
16. Push/pull/fetch from UI
17. PR creation with AI-generated description

**App:**
18. Auto-updater (electron-updater)
19. Welcome/onboarding flow (first launch)
20. Recent projects list (File > Open Recent)
21. Working theme system (dark + light, actually applied)

### P1 (52 items) -- Build These Second

**Workspace/Task:**
- Git worktree isolation
- Workspace state persistence
- Workspace unread indicators
- Task archiving
- Auto-generated task names

**Multi-Agent:**
- Multi-provider model routing (Bedrock, Vertex)
- In-flight model switching
- Agent CLI auto-detection
- Agent activity detection (busy/idle/waiting)

**Editor:**
- Go to definition
- Breadcrumbs
- Outline/symbol view
- Stage/unstage per hunk
- Inline diff decorations

**Integration:**
- GitHub Issues integration
- Linear integration
- MCP server install/manage (not just display)
- Codebase indexing
- Image input to chat
- Browser preview pane
- PR status/comments/merge

**Terminal:**
- Split terminal (side-by-side)
- Terminal search (Cmd+F)
- Link detection in terminal output
- Shell integration decorations

**App:**
- Window state persistence
- OS notifications
- Custom keyboard shortcuts (editable)
- Settings search
- In-app changelog
- Bundled Claude CLI
- Secret detection

### P2 (64 items) -- Polish Later

Fast mode, notepads, Zen mode, panel position config, SSH/remote dev, cloud agents, dock icons, sound notifications, Lottie animations, debug adapter, workspace trust, settings sync, extension system, terminal profiles, accessibility signals, high contrast themes, lifecycle scripts, scheduling, and more.

---

## 9. Architecture Notes for Implementation

### What Conductor Does Right (steal this)
- **Sidecar architecture**: Node.js sidecar communicates via Unix socket JSON-RPC. Clean separation between native shell and agent orchestration. Our Hono server could adopt this.
- **Checkpoint refs**: Using `refs/conductor-checkpoints/` is brilliant -- no HEAD movement, no file disruption, full undo per turn.
- **Idle sweep**: Max 5 concurrent sessions with 30-min idle timeout prevents resource exhaustion.
- **Pending message pattern**: The "Potato Problem" solution (store unsent message, disable cancel until ack) is essential for reliability.

### What Emdash Does Right (steal this)
- **PTY-based agent management**: Every agent is just a CLI process in a PTY. No SDK integration needed. Add new agents by just knowing their CLI flags.
- **Worktree pool**: Pre-creates reserve worktrees for faster task creation.
- **Line comments to prompt injection**: Diff comments get formatted and injected into the agent's next prompt. Simple but powerful review loop.

### What Cursor Does Right (steal this)
- **Composer diff review**: After agent edits, all changes shown in diff view with per-file accept/reject. This is the gold standard for agent-assisted editing.
- **File search with recent files**: Command palette Cmd+P with recent files at top, fuzzy matching with character highlights.

### What Warp Does Right (steal this)
- **Unified Developer Input**: One input box, intelligent mode switching between shell and AI. The "@" menu for context injection.
- **Secret detection regex**: Built-in patterns for 20+ secret types applied to terminal output.
- **Multi-model per feature**: Different models for different tasks (agent, planning, coding).

# Emdash Full Feature Audit

**Version**: 0.4.37
**Tagline**: "A cross-platform Electron app that orchestrates multiple coding agents in parallel"
**Publisher**: General Action, Inc. (generalaction/emdash on GitHub)
**Stack**: Electron 30.5 + Vite + React 18 + TypeScript + Tailwind + SQLite (Drizzle ORM)
**Platforms**: macOS (arm64), Linux (x64: AppImage/deb/rpm), Windows (x64: NSIS/MSI)

---

## 1. App Architecture

### Process Model
- **Main process** (`src/main/`): Electron main, IPC handlers, services, SQLite DB, PTY management, SSH tunneling, git operations, auto-updater
- **Renderer process** (`src/renderer/`): React SPA (no router -- single Workspace view with state-driven content switching), Vite bundled
- **Preload** (`src/main/preload.ts`): Exposes `window.electronAPI` bridge
- **Shared** (`src/shared/`): Provider registry, types, utilities shared between processes

### Database (SQLite via Drizzle ORM)
Tables:
- `ssh_connections` -- SSH connection configs (host, port, username, auth type, key path)
- `projects` -- Local or remote project folders (path, git remote, github repo, SSH connection ref)
- `tasks` -- Work units within a project (branch, path, agent, worktree flag, archived_at)
- `conversations` -- Multi-chat per task (provider, isActive, isMain, displayOrder)
- `messages` -- Chat message history (content, sender, timestamp)
- `line_comments` -- Inline code review comments (file path, line number, sent_at)
- `workspace_instances` -- Remote workspace provisioning state (host, port, status, connection ref)

### IPC Architecture
27 IPC modules registered at startup:
- Core: `appIpc`, `debugIpc`, `telemetryIpc`, `updateIpc`
- Domain: `projectIpc`, `projectSettingsIpc`, `githubIpc`, `accountIpc`, `gitIpc`
- Terminal: `ptyIpc`, `worktreeIpc`, `fsIpc`, `lifecycleIpc`
- Integrations: `linearIpc`, `jiraIpc`, `gitlabIpc`, `forgejoIpc`, `plainIpc`
- Infrastructure: `connectionsIpc` (SSH), `sshIpc`, `netIpc`, `browserIpc`, `hostPreviewIpc`
- Features: `skillsIpc`, `workspaceIpc`, `mcpIpc`, `planLockIpc`
- RPC Router: typed controller pattern for `db`, `appSettings`, `changelog`

### Context Providers (React)
10 context providers nested in App.tsx:
1. `QueryClientProvider` (TanStack React Query)
2. `ModalProvider` -- centralized modal state manager
3. `AppContextProvider` -- app-level state
4. `EmdashAccountProvider` -- Emdash account/auth
5. `PostHogFeatureFlagProvider` -- feature flags
6. `GithubContextProvider` -- GitHub auth state
7. `ProjectManagementProvider` -- project CRUD, navigation, branch state
8. `TaskManagementProvider` -- task CRUD, selection, agent state
9. `AppSettingsProvider` -- global settings cache
10. `ThemeProvider` -- theme management

---

## 2. Complete View/Page Map

### First Launch
- **WelcomeScreen** (`views/Welcome.tsx`): Animated splash with logo + "Start shipping" button. Sets `emdash:first-launch:v1` localStorage key.

### Main Workspace Layout (`views/Workspace.tsx`)
Three-panel resizable layout:
- **Left sidebar** (16-30% width, collapsible)
- **Main content** (min 30%)
- **Right sidebar** (16-50% width, collapsible)
- **Titlebar** (36px fixed, custom drag region)

The MainContentArea renders ONE of these based on state:

| Priority | Condition | View |
|----------|-----------|------|
| 1 | `showSettingsPage` | `SettingsPage` |
| 2 | `showKanban && selectedProject` | `KanbanBoard` |
| 3 | `showSkillsView` | `SkillsView` |
| 4 | `showMcpView` | `McpPage` |
| 5 | `showHomeView` (no project selected) | `HomeView` |
| 6 | `selectedProject && activeTask && multiAgent` | `MultiAgentTask` |
| 7 | `selectedProject && activeTask` | `ChatInterface` |
| 8 | `selectedProject && !activeTask` | `ProjectMainView` |

### Overlay Views (rendered on top)
- **DiffViewer** -- replaces main content, has Changes + History tabs
- **CodeEditor** -- full-screen Monaco editor with file tree, replaces entire layout
- **BrowserPane** -- floating browser preview pane (Electron BrowserView)
- **CommandPalette** -- overlay dialog (cmdk)
- **ModalRenderer** -- centralized modal system

---

## 3. Feature Inventory

### 3a. Project Management
- **Open local folder** via native dialog
- **Create new project** (mkdir + git init)
- **Clone from GitHub** (`CloneFromUrlModal`)
- **Add remote project** via SSH (`AddRemoteProjectModal`)
- **Delete project** with confirmation
- **Reorder projects** in sidebar via drag-and-drop (`ReorderList`)
- **Base branch configuration** per project (auto-detected, user-changeable)
- **Project config file** (`.emdash.json`) for lifecycle scripts and workspace provider

### 3b. Task Management
- **Create task** (`TaskModal`): name (auto-generated, slugified), agent selection, branch selection, initial prompt, issue linking, worktree toggle, auto-approve toggle, remote workspace toggle
- **Select/switch tasks** from sidebar or command palette
- **Rename tasks** inline
- **Delete tasks** with worktree cleanup
- **Archive/restore tasks** with collapsible archived section in sidebar
- **Pin tasks** to top of sidebar list
- **Task creation loading** overlay with animation
- **Auto-generated task names**: random friendly names (human-id), optional AI-inferred names from context (prompt/issue)
- **Optimistic task creation**: placeholder ID while creating

### 3c. Multi-Agent Orchestration
23 supported CLI agents (all terminal-based):
1. **Codex** (OpenAI) -- `codex`
2. **Claude Code** (Anthropic) -- `claude`
3. **Cursor** -- `cursor-agent`
4. **Gemini** (Google) -- `gemini`
5. **Qwen Code** -- `qwen`
6. **Droid** (Factory) -- `droid`
7. **Amp** (Sourcegraph) -- `amp`
8. **OpenCode** -- `opencode`
9. **Hermes Agent** (Nous Research) -- `hermes`
10. **GitHub Copilot** -- `copilot`
11. **Charm** (Crush) -- `crush`
12. **Auggie** (Augment Code) -- `auggie`
13. **Goose** (Block) -- `goose`
14. **Kimi** -- `kimi`
15. **Kilocode** -- `kilocode`
16. **Kiro** (AWS) -- `kiro-cli`
17. **Rovo Dev** (Atlassian) -- `rovodev`/`acli`
18. **Cline** -- `cline`
19. **Continue** -- `cn`
20. **Codebuff** -- `codebuff`
21. **Mistral Vibe** -- `vibe`
22. **Pi** -- `pi`
23. **Autohand Code** -- `autohand`

Agent capabilities per provider:
- `autoApproveFlag` -- CLI flag for unattended mode (e.g., `--dangerously-skip-permissions` for Claude)
- `initialPromptFlag` -- CLI flag to pass initial prompt (e.g., `-i` for Gemini)
- `useKeystrokeInjection` -- inject prompts via typing into TUI (Amp, OpenCode, Hermes)
- `resumeFlag` -- CLI flag to resume last session
- `sessionIdFlag` -- per-conversation session isolation (Claude Code)
- `planActivateCommand` -- enter plan mode (Claude Code: `/plan`)

**Multi-agent tasks**:
- `MultiAgentDropdown` in task creation lets you pick N agents x M instances each
- `MultiAgentTask` component renders tabbed terminal panes, one per agent variant
- Each variant gets its own git worktree and PTY
- Shared prompt input at bottom sends to ALL agents simultaneously
- Per-variant busy/idle status tracking with spinner indicators
- Tab switching via Cmd+1-9 or Cmd+Shift+[/]

### 3d. Chat Interface
- **Multi-conversation per task**: tab bar with agent logo + status indicator per conversation
- **Create additional chats** (`CreateChatModal`): pick different agent, optional review mode
- **Close individual chats** (except main)
- **Conversation status tracking**: idle/working/waiting states derived from PTY output
- **Unread indicators** on non-active tabs
- **Auto-scroll on task switch**
- **Terminal search** overlay (Cmd+F within terminal)
- **Initial prompt injection**: delivered via CLI flag or keystroke injection depending on agent
- **Comment injection**: inline code comments from diff viewer are formatted and injected into next prompt
- **Agent switching**: change agent for active conversation
- **Install banner**: shown when selected agent CLI is not found, with install command

### 3e. Terminal System
- **xterm.js 6.0** with WebGL renderer, fit addon, web links addon, serialization addon
- **Session registry**: manages PTY session lifecycle, attaches/detaches terminals to DOM containers
- **Terminal snapshots**: save/restore terminal state across tab switches
- **SSH terminal support**: PTY runs over SSH for remote projects
- **File drag-and-drop**: drop files onto terminal to insert paths (local) or SCP transfer (remote)
- **Theme variants**: dark, light, dark-black with custom color overrides per agent (e.g., Mistral gets custom blue bg)
- **Shift+Enter to Ctrl+J mapping**: for agents that use Ctrl+J as submit
- **Content filtering**: CSS filter support on terminal output
- **Keep-alive**: terminals persist when switching between tasks

### 3f. Git Worktree System
- **Automatic worktree creation** per task (configurable, default on)
- **Branch naming**: auto-generated from task name
- **Worktree pool**: pre-creates reserve worktrees for faster task creation
- **Orphan cleanup**: cleans up leftover worktrees from crashed sessions on startup
- **File preservation**: copies `.env`, `.env.local`, `.envrc`, `docker-compose.override.yml` into new worktrees
- **Trust management**: auto-trust worktrees in Claude Code config (optional setting)
- **Base ref tracking**: worktrees branch from configurable base (default: main/master)

### 3g. Diff Viewer (`diff-viewer/`)
- **Changes tab**: file list + side-by-side diff view using Monaco diff editor
- **History tab**: commit list with per-commit file changes
- **Stacked diff view**: alternative view mode
- **PR review mode**: fetches diff against PR base branch
- **Diff warnings**: flags potentially problematic changes
- **File staging**: checkbox to stage/unstage files
- **Commit area**: compose commit message and commit staged changes
- **Revert support**: revert individual files

### 3h. Code Editor (Monaco)
- **Full Monaco editor** (`@monaco-editor/react`) with file tree sidebar
- **File tabs**: open multiple files with tab bar
- **File tree**: recursive directory tree with search, exclude patterns (node_modules, .git, etc.)
- **TypeScript configuration**: auto-configured for TS/TSX files
- **Diff decorations**: highlights changed lines (added/modified/deleted) inline
- **Markdown preview**: rendered markdown for .md files
- **Content search**: search across file contents
- **Custom keyboard shortcuts**: integrated with app shortcuts
- **Custom themes**: synced with app theme (light/dark/dark-black)
- **Settings overlay**: settings page can be shown over the editor

### 3i. Kanban Board
- **Three columns**: To-do, In-progress, Ready for review
- **Auto-promote**: tasks automatically move to In-progress when agent is busy
- **Auto-complete**: tasks move to Done after idle grace period
- **Manual status changes**: drag or click to change status
- **Task cards**: show agent logo, branch name, change count badge
- **PR status badges**: show PR state on cards
- **Create task button**: opens task modal

### 3j. Right Sidebar
- **File changes panel**: git status diff showing modified/added/deleted files
- **Task terminal panel**: secondary terminal for the active task
- **Vertical resizable split**: changes panel on top, terminal on bottom
- **Multi-agent variant support**: collapsible sections per agent variant
- **Open changes button**: opens full diff viewer for a specific file

### 3k. Browser Preview
- **BrowserView-based** (Electron): renders actual web content
- **Resizable pane**: draggable width handle (5-96% of viewport)
- **URL bar**: manual URL input + navigation (back/forward/reload)
- **Auto-detection**: probes common dev server ports (5173, 3000, 8080)
- **Port auto-discovery**: watches for new servers starting
- **Per-task URL persistence**: remembers last URL per task
- **Overlay handling**: hides when modals/settings are open

### 3l. Pull Request Management
- **PR creation**: generates title + description from git diff using AI (tries preferred agent, falls back to Claude, then heuristics)
- **PR status tracking**: auto-refreshes PR state
- **Open PRs section** in ProjectMainView: lists all open PRs
- **PR comments**: view and reply to PR comments
- **Check runs**: view CI/CD check run results
- **Merge PR section**: merge directly from UI
- **Delete PR notice**: warning when deleting task with open PR
- **PR issue footer**: auto-links issues in PR description

### 3m. Issue Tracker Integrations
6 integrations, all linkable to tasks:

1. **GitHub Issues**: OAuth device flow auth, issue selector with preview tooltip, auto-linked to PRs
2. **Linear**: API key auth, issue selector with status/assignee/team preview
3. **Jira**: site URL + email + API token auth, issue selector with status
4. **GitLab**: instance URL + token auth, issue selector
5. **Plain** (customer support): API key auth, thread selector
6. **Forgejo**: instance URL + token auth, issue selector

Issue context is injected into the agent's initial prompt (title, description, status, assignees, labels).

### 3n. MCP (Model Context Protocol) Servers
- **MCP Page** (`McpPage`): list installed servers, browse catalog, search
- **Install/remove** MCP servers
- **Server cards**: show server name, status, tools count
- **Server modal**: detailed view with configuration
- **Provider detection**: checks which MCP providers are available
- **Refresh**: re-scan installed servers and catalog

### 3o. Skills
- **Skills view** (`SkillsView`): list installed + recommended skills
- **Create custom skills**: name, description, content
- **Install/uninstall** skills from catalog
- **Skill detail modal**: full view of skill content
- **Search**: filter skills by name
- **Validation**: skill names must be lowercase, 2-64 chars

### 3p. SSH/Remote Development
- **SSH connection management**: create, edit, test, delete connections
- **Auth types**: password, SSH key, SSH agent
- **Remote project support**: projects can live on remote servers
- **Remote PTY**: terminals run over SSH
- **Remote file system**: file operations over SSH (read, write, list)
- **SCP file transfer**: drag-and-drop files to remote terminal
- **Connection status indicators**: connected/disconnected/reconnecting
- **Auto-reconnect**: on SSH connection restored, restart affected terminals
- **Workspace provisioning**: run custom provision/terminate scripts on remote hosts

### 3q. Lifecycle Scripts
- **Task lifecycle service**: runs user-defined scripts at lifecycle phases
- **Phases**: setup, run (long-running), teardown
- **PTY-based execution**: lifecycle scripts run in their own PTY
- **Lifecycle terminal view**: view script output in dedicated terminal
- **Environment variables**: `EMDASH_TASK_ID`, `EMDASH_TASK_NAME`, `EMDASH_TASK_PATH`, `EMDASH_PROJECT_PATH`, `EMDASH_DEFAULT_BRANCH`, `EMDASH_PORT` (deterministic port per task)

### 3r. Emdash Account System
- **Account creation/login**: managed by EmdashAccountService
- **Session token**: stored in keytar (OS keychain)
- **OAuth flow**: OAuthFlowService for external auth
- **Account tab** in settings: manage account
- **Server health check**: verify backend connectivity

---

## 4. Keyboard Shortcuts (Complete Map)

All shortcuts are customizable via Settings > Interface > Keyboard Shortcuts.

| Shortcut (Mac) | Shortcut (Win/Linux) | Action |
|---|---|---|
| Cmd+K | Ctrl+K | Toggle Command Palette |
| Cmd+, | Ctrl+, | Open Settings |
| Cmd+B | Ctrl+B | Toggle Left Sidebar |
| Cmd+. | Ctrl+. | Toggle Right Sidebar |
| Cmd+T | Ctrl+T | Cycle Theme (light/dark/dark-black) |
| Cmd+P | Ctrl+P | Toggle Kanban Board |
| Cmd+E | Ctrl+E | Toggle Code Editor |
| Cmd+N | Ctrl+N | New Task |
| Cmd+] | Ctrl+Tab | Next Task |
| Cmd+[ | Ctrl+Shift+Tab | Previous Task |
| Cmd+Shift+] | Ctrl+Shift+] | Next Agent Tab |
| Cmd+Shift+[ | Ctrl+Shift+[ | Previous Agent Tab |
| Cmd+1-9 | Ctrl+1-9 | Select Agent Tab by Index |
| Cmd+O | Ctrl+O | Open in External Editor |
| Cmd+Shift+F | Ctrl+Shift+F | Open Feedback |
| Cmd+W | Ctrl+W | Close Active Chat Tab |
| Cmd+Z | Ctrl+Z | Undo |
| Cmd+Shift+Z | Ctrl+Y | Redo |
| Escape | Escape | Close active modal/overlay (priority: command palette > settings > browser > diff > editor > kanban) |

---

## 5. Settings Structure (Complete)

### General Tab
- Telemetry opt-in/out
- Auto-generate task names (toggle)
- Auto-infer task names from context (toggle)
- Auto-approve by default (toggle)
- Create worktree by default (toggle)
- Auto-trust worktrees (toggle)
- Notification settings (master enable, sound on/off, focus mode: always/background-only)
- Auto-update card (check for updates, current version)

### Agents Tab
- Default agent selection (dropdown of all 23 agents)
- Review agent settings (agent for code review chats, custom review prompt)
- CLI agents list: shows installed/missing status, version, path for each agent

### Integrations Tab
- GitHub: OAuth device flow connect/disconnect, shows auth status
- Linear: API key input, connect/disconnect
- Jira: site URL + email + API token form
- GitLab: instance URL + token form
- Plain: API key input
- Forgejo: instance URL + token form

### Repository Tab
- Branch name template configuration

### Interface Tab
- Theme card: light, dark (navy), dark-black
- Terminal settings card
- Keyboard shortcuts: customizable key bindings for all shortcuts
- Workspace: right sidebar default state, browser preview settings, task hover action (delete vs archive)
- Hidden tools: configure which tools to hide from agents

### Account Tab
- Emdash account management (create/login/logout)

### Docs Tab
- External link to https://docs.emdash.sh

---

## 6. How It Communicates with Coding Agents

Emdash does NOT use APIs or SDKs to talk to coding agents. Instead:

1. **PTY Spawn**: Each agent is launched as a child process via `node-pty` in the main process
2. **CLI invocation**: The agent's CLI binary is spawned (e.g., `claude`, `codex`, `gemini`) with appropriate flags
3. **Terminal rendering**: The PTY output streams directly into an xterm.js terminal in the renderer
4. **Prompt injection**: User messages are delivered to the agent via one of two methods:
   - **CLI flag** (`initialPromptFlag`): prompt passed as argument on startup
   - **Keystroke injection** (`useKeystrokeInjection`): characters typed into the terminal after the agent starts
5. **Activity detection**: PTY output is analyzed character-by-character to classify agent state (busy/idle/waiting) using pattern matching per agent
6. **Agent events**: An HTTP server (`AgentEventService`) runs locally, receiving POST webhook callbacks from agents that support hook-based notifications (e.g., Claude Code hooks)

The user sees the raw terminal output of whatever agent is running. There is no parsed/structured message display -- it is pure terminal.

---

## 7. Menu Structure

### macOS
- **Emdash**: About, Settings, Check for Updates, Services, Hide/Unhide, Quit
- **File**: Close Tab (Cmd+W)
- **Edit**: Undo, Redo, Cut, Copy, Paste, Paste and Match Style, Delete, Select All
- **View**: Reload, Force Reload, Toggle DevTools, Reset Zoom, Zoom In/Out, Fullscreen
- **Window**: (standard windowMenu role)
- **Help**: Docs, Changelog

### Windows/Linux
- Custom titlebar menu (not native): File, Edit, View, Window, Help
- Popup menu rendered via `app:popupMenu` IPC on right-click
- Window controls (minimize, maximize, close) rendered as custom buttons

---

## 8. Telemetry & Analytics
- **PostHog**: feature flags, event tracking
- **Privacy-first**: opt-in telemetry card in settings
- **Events tracked**: task creation, project open, toolbar clicks, editor usage, feedback submission, agent detection, DB setup outcome, session duration
- **Error tracking**: separate error tracking service (`errorTracking.ts`)
- **No PII**: telemetry uses bucketed counts, no names/paths

---

## 9. Auto-Update System
- **electron-updater**: checks GitHub releases for updates
- **Update notification**: toast notification when update available
- **Update card** in settings: manual check for updates
- **Differential NSIS packages** on Windows

---

## 10. Startup Sequence (main.ts)

1. Load `.env` from project root
2. Fix PATH for macOS (Homebrew paths), Linux (nvm/npm paths), Windows (npm global path)
3. Detect SSH_AUTH_SOCK from user's shell
4. Request single instance lock (production only)
5. `app.whenReady()`:
   a. Initialize SQLite database (run Drizzle migrations, handle schema mismatch with reset dialog)
   b. Initialize PostHog telemetry
   c. Initialize error tracking
   d. Start AgentEventService HTTP server (receives hook callbacks from CLI agents)
   e. Register all 27 IPC handlers
   f. Load Emdash account session token from keychain
   g. Clean up orphaned worktree reserves from previous sessions
   h. Reconcile workspace instances (mark stale as error)
   i. Warm provider installation cache (detect which agent CLIs are installed)
   j. Set up native application menu
   k. Create main BrowserWindow
   l. Initialize auto-update service
6. Register app lifecycle handlers (window-all-closed, activate)
7. On `before-quit`: telemetry shutdown, auto-updater shutdown, agent event server stop, lifecycle service shutdown, worktree pool cleanup, SSH disconnect all

---

## 11. Notable Implementation Details

- **No router**: The app uses a single React component tree with state-driven view switching, not a traditional SPA router
- **Terminal-only agents**: Every single agent is launched as a CLI process in a terminal. There is no structured API-based chat UI
- **Worktree isolation**: Each task gets its own git worktree by default, enabling true parallel development
- **Agent event hooks**: Claude Code (and potentially others) can POST to an internal HTTP endpoint to notify Emdash of events like task completion, enabling OS notifications
- **Sound notifications**: configurable notification sounds when agents finish tasks
- **Custom keyboard shortcuts**: all shortcuts stored in app settings, fully user-configurable with conflict detection
- **Remote development**: full SSH-based remote development support including remote file system, remote PTY, SCP file transfer
- **Workspace provisioning**: can run custom scripts to provision/terminate cloud development environments
- **PR generation**: uses any installed coding agent to generate PR title/description from git diff
- **Line comments**: users can leave inline comments on diffs that get injected into the agent's next prompt
- **Review chats**: dedicated review conversation type with configurable review agent and prompt
- **Changelog system**: in-app changelog notifications with modal viewer
- **Feedback modal**: in-app feedback form with GitHub issue creation

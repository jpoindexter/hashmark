# Conductor App — Full Analysis
> Reverse-engineered from `/Applications/Conductor.app` bundle, scripts, and UI screenshots
> Date: 2026-03-18

---

## What Conductor Is

An Electron desktop app that runs Claude Code and Codex (GPT) agents in isolated git worktrees,
with a full workspace management system. Each workspace is a separate git repo/branch.
Agents run in their own worktree so you can have N agents working in parallel without conflicts.

The core insight: **worktree = workspace = isolated agent context**.

---

## Tech Stack (from bundle analysis)

- **Frontend**: Electron + React/Vue (bundled, not source-accessible)
- **Backend**: Node.js sidecar process (`index.bundled.js` — 844KB bundled)
- **AI**: Claude Code SDK + OpenAI Codex (both bundled as binaries: `bin/claude`, `bin/codex`)
- **Git**: Custom `checkpointer.sh` for save/restore, `git-busy-check.sh`, bundled `git`
- **File watching**: Bundled `watchexec` binary
- **GitHub**: Bundled `gh` CLI for PR creation
- **Terminal**: PTY-based (node-pty or similar)
- **IPC**: JSON-RPC tunnel between frontend and sidecar

---

## Layout (from screenshots)

```
┌─────────────────────────────────────────────────────────────────┐
│  ● ● ●  [◁ ▷]  jpoindexter/chennai › origin/feat/product-dir ↺ │  ← titlebar
│         └─ worktree path ─┘                                     │
├──────────────────────┬──────────────────────┬───────────────────┤
│ SIDEBAR (220px)      │ MAIN CONTENT         │ RIGHT PANEL       │
│                      │                      │                   │
│ ▤  Activity          │ [Plan tabs] [Codex]  │ All files Changes │
│ ─────────────────    │ ─ tab bar ──────     │ ─ file list ──    │
│ Workspaces  ≡ +      │                      │ path/file.tsx +12 │
│                      │  [content area]      │ path/file.tsx +80 │
│ B brutal             │                      │ ...               │
│   ⚠ Fix todo  ⌘1    │                      │ ─────────────     │
│     port-louis       │                      │ Setup  Run  Term  │
│                      │                      │                   │
│ G gripe              │                      │  [Add setup       │
│   ⚠ Finish  +1661    │                      │   script]         │
│     -186  dalat ⌘2  │                      │                   │
│                      │                      │                   │
│ D datacut            │                      │                   │
│   ⚠ Chennai +395     │                      │                   │
│     -37  chennai ⌘3  │                      │                   │
│                      │                      │                   │
│ [□ Add]  [?]  [⚙]   │                      │                   │
├──────────────────────┴──────────────────────┴───────────────────┤
│  ✳ Sonnet 4.6   🧠 Thinking   📋 [plan mode tooltip]    ○ + ↑  │  ← input bar
└─────────────────────────────────────────────────────────────────┘
```

---

## Left Sidebar — Workspace List

Each workspace entry shows:
- **Letter badge** — first letter of repo name, color-coded
- **Status indicator** — yellow/orange dot (⚠) when agent is running or has changes
- **Repo name** — bold
- **Task name** — current task/session title (dimmed)
- **Git branch** — current branch name
- **Diff stats** — `+1661 -186` (green/red, relative to base)
- **Keyboard shortcut** — ⌘1, ⌘2, ⌘3 to jump between workspaces
- **Active state** — highlighted row for current workspace

Bottom of sidebar:
- `□ Add` — add new workspace (file picker)
- `?` — help
- `⚙` — settings

Top section:
- **Activity** — shows recent agent events across ALL workspaces
- **Workspaces** section header with `≡` (sort/filter) and `+` (add) buttons

---

## Top Bar (Titlebar)

```
[◁ ▷]  jpoindexter/chennai  ›  origin/feat/product-direction  ↺    /chennai  Open ▾    Create PR ▾
```

- Back/Forward navigation buttons
- `owner/repo` — GitHub repo identifier
- `›` breadcrumb separator
- `origin/branch-name` — current remote tracking branch
- `↺` — refresh/sync
- `/worktree-path` — relative path of worktree
- `Open ▾` — dropdown: open in Finder, open in terminal, copy path
- `Create PR ▾` — create GitHub PR from current changes (uses bundled `gh` CLI)

---

## Main Content Tabs

```
[☀ Plan tabs]  [@ Codex]  [+]
```

- **Plan tabs** — shows the agent's current plan, tasks checklist, progress
- **Codex** — Codex/GPT agent tab (separate from Claude)
- `+` — open new tab (file view, agent view, etc.)

The Plan view shows a structured task breakdown:
```
HIGH PRIORITY — All done:
┌─────────────────────────┬──────────────────────────────────────┐
│ Feature                 │ Status                               │
├─────────────────────────┼──────────────────────────────────────┤
│ Intent tabs as primary  │ ✅ Already a top-level IntentTabs    │
│ Audiences list = saved  │ ✅ Already shows cards with...       │
└─────────────────────────┴──────────────────────────────────────┘
```

---

## Right Panel — Git/PR Review

Tabs: `All files` | `Changes 11` | `Checks` | `Review`

File list:
```
apps/gripe/.../page.tsx          +12 -10  [□]
apps/gripe/.../page.tsx          +80  -0  [□]
apps/gripe/.../route.ts          +27 -10  [□]
```

- Each file shows path (truncated), green `+additions`, red `-deletions`
- `[□]` — expand to see diff inline
- Clicking a file opens the diff

Bottom section of right panel:
```
▾  Setup  Run  Terminal  +
```

- **Setup** — "Add setup script" — a shell script that runs when the workspace is created
  - Use case: `npm install`, `pip install -r requirements.txt`, env setup
  - "Run commands when a workspace is created to install dependencies or set up the environment"
- **Run** — dev server / run script (maps to `spotlight` terminal source)
- **Terminal** — raw terminal in this workspace
- `+` — add another tab

---

## Bottom Input Bar

```
✳ Sonnet 4.6    🧠 Thinking    📋    [Enable plan mode ⇧Tab]          ○   +   ↑
```

- `✳` — Claude asterisk/logo
- **Model name** — "Sonnet 4.6" — clicking opens model selector dropdown
- **Thinking** — toggle extended thinking (maxThinkingTokens) — brain icon, pink when active
- **📋 map icon** — Plan mode — `⇧Tab` shortcut — "Enable plan mode"
  - Plan mode = agent makes a plan first before executing
- `○` — stop/loading indicator (spinning when agent is running)
- `+` — attach files, add context
- `↑` — send message

### Model Selector Dropdown (from screenshot)

```
Claude Code
  ✳ Opus 4.6 1M        NEW              1
  ✳ Opus 4.6           ★   2
  ✳ Sonnet 4.6         ✓ ★  3   ← currently selected
  ✳ Haiku 4.5              4

Codex
  ⊙ GPT-5.4            NEW  ↗           5
  ⊙ GPT-5.3-Codex-Spark    ↗           6
  ⊙ GPT-5.3-Codex          ↗           7
  ⊙ GPT-5.2-Codex          ↗           8
```

- ✳ = Claude models, ⊙ = Codex/GPT models
- ★ = favorites/pinned
- ✓ = currently active
- ↗ = external link (Codex docs/pricing)
- Numbers = keyboard shortcuts within dropdown
- `NEW` badge on latest models

---

## Core Features (from bundle reverse engineering)

### 1. Workspaces = Git Worktrees

Each workspace is an isolated git worktree. When you add a workspace pointing to a repo,
Conductor creates (or reuses) a `git worktree add` for that repo.

This means:
- Agent A works on `feature/auth` in `/repo-worktree-1`
- Agent B works on `feature/ui` in `/repo-worktree-2`
- Both share the same git history but have isolated working trees
- No conflicts, no stashing, no branch switching

### 2. Checkpoint System (`checkpointer.sh`)

Every agent turn creates git checkpoints using **private git refs** (`refs/conductor-checkpoints/*`).

Save: captures HEAD + index tree + full working tree (including untracked files) into git objects.
No HEAD movement, no file changes on disk. Pure git object store manipulation.

Restore: `git reset --hard <saved-HEAD>` + `git read-tree` + `git clean`

Diff: compares two checkpoint trees via `git diff`

Checkpoint IDs: `session-{id}-turn-{n}-{type}` (pre/post per turn)

Use cases:
- Undo agent changes ("restore to before this turn")
- Compare what the agent did this turn vs last turn
- Full rollback to any point in session history

### 3. Spotlight — File Sync Between Worktrees

`spotlighter.sh` watches a worktree for file changes using `watchexec`, then:
1. Saves a checkpoint of the changed worktree
2. Restores that checkpoint into `$CONDUCTOR_ROOT_PATH` (another worktree)

This syncs file changes from one worktree to another in real-time.
Use case: "shadow" mode where a second workspace mirrors the first.

Terminal sources in the bundle:
- `spotlight` — spotlight sync process terminal
- `run_script` — dev server output
- `terminal` — regular interactive terminal
- `auto` — auto-detect

### 4. Tasks System

Full task lifecycle: `taskCreated` → `running` → `completed/failed/cancelled`

Tasks are tied to sessions. Each agent turn is a task.
Task store persists tasks with status transitions.
Terminal state (completed/failed/cancelled) cannot transition — immutable once done.

### 5. Plan Mode

Claude's native plan mode (EnterPlanMode / ExitPlanMode tools).
`⇧Tab` shortcut in the input bar.
When plan mode is on, Claude proposes a plan before executing.
Frontend sends `exitPlanMode` request when user approves the plan.

### 6. MCP Tools Conductor Injects

Conductor runs a local MCP server that gives Claude these tools:

**GetWorkspaceDiff** — "When the user asks what the agent is currently working on, or refers to the 'workspace diff', 'PR diff', or 'all changes'. Compares current working tree to..."
Returns the full unified diff for the workspace, or diff for a specific file.
Parameters: `file` (optional), `stat` (boolean — returns `--stat` style summary)

**DiffComment** — "Use this tool to leave comments on the user's diff"
Parameters: `file`, `line`, `body`
Posts comments on the diff view visible in the right panel.

**GetTerminalOutput** — "Use this tool to view terminal output in the user's workspace"
Reads from: `spotlight`, `run_script`, `terminal`, or `auto`
Parameters: `source` (optional), `maxLines` (default 1000)

### 7. Session Management

- Sessions are per-workspace
- Session replay — can re-run a session
- Context usage tracking (token counts per session)
- `externalSessionId` — links to Claude Code's session ID
- Idle sweep — offloads idle sessions to save memory (`[IdleSweep] Offloading idle session`)

### 8. Permission Mode

`updatePermissionMode` — controls what Claude can do without asking:
- auto-approve / ask / deny for file writes, shell commands, etc.

### 9. Workspace Init

When a workspace opens:
1. Load shell environment (PATH, env vars from user's shell)
2. Detect supported commands (available CLI tools)
3. Connect MCP servers
4. Reports timing: shell env, supportedCommands, mcpServerStatus

### 10. Models

Claude models (via Anthropic API):
- `claude-opus-4-6` — Opus 4.6 (also "opus-1m" = 1M context variant)
- `claude-sonnet-4-6` — Sonnet 4.6 (default)
- Haiku 4.5

Codex models (via OpenAI API):
- `gpt-5.4` (NEW)
- GPT-5.3-Codex-Spark
- GPT-5.3-Codex
- GPT-5.2-Codex

Model can be changed mid-session. Handler checks `currentModel !== newModel` and calls `setModel` callback.

### 11. Extended Thinking

`maxThinkingTokens` — configurable per session.
Toggled via the 🧠 Thinking button in the input bar.
Maps directly to Claude API's extended thinking parameter.

---

## User Flows

### Flow 1: Add a Workspace

1. Click `□ Add` in sidebar bottom
2. File picker → select repo directory
3. Conductor runs `workspaceInit`:
   - Loads shell env
   - Detects available commands
   - Connects configured MCP servers
4. Workspace appears in sidebar with repo name + current branch
5. Shows diff stats vs remote (`+0 -0` initially)

### Flow 2: Start an Agent Task

1. Click workspace in sidebar → activates it
2. Type task in bottom input bar
3. Press `↑` or Enter to send
4. Agent starts → status dot turns orange/yellow
5. Conductor creates a `pre` checkpoint before the turn starts
6. Agent works — plan view updates in real time
7. Diff panel updates as files are changed
8. Agent finishes → creates `post` checkpoint
9. Status dot turns green or goes idle

### Flow 3: Review Agent Changes

1. Right panel shows `Changes N` with count
2. Click file in list → see inline diff (green/red)
3. Agent can also comment via `DiffComment` tool (appears in diff view)
4. If happy → click `Create PR` in titlebar
5. `gh pr create` runs with current branch → opens PR URL

### Flow 4: Undo Agent Turn

1. Each turn saved as `session-{id}-turn-{n}-pre` and `post` checkpoints
2. User triggers restore (from UI, presumably a "revert" button)
3. `checkpointer.sh restore session-{id}-turn-{n}-pre` runs
4. Working tree reset to exactly where it was before the turn

### Flow 5: Run Dev Server + Monitor Output

1. Right panel → Setup tab → "Add setup script"
2. Enter: `npm install && npm run dev`
3. Runs in `run_script` terminal source
4. Claude can read output via `GetTerminalOutput(source: "run_script")`
5. If app breaks, Claude sees the error output and fixes it

### Flow 6: Spotlight Sync

1. Two workspaces pointing to same repo
2. Enable Spotlight on workspace A
3. `spotlighter.sh` starts watching workspace A with `watchexec`
4. Any file change in A → checkpoint saved → restored into workspace B
5. Both workspaces stay in sync in real time

### Flow 7: Plan Mode

1. User types: "refactor the auth module to use JWT"
2. Press `⇧Tab` or click 📋 — enables plan mode
3. Send message
4. Claude responds with a structured plan (checklist)
5. User reviews plan → approves or edits
6. Claude executes the plan step by step

### Flow 8: Multi-Model — Claude vs Codex

1. Open model selector
2. Select a Codex/GPT model
3. Same workspace, same diff panel, same tools
4. Codex runs via separate `CodexHandler`
5. Can switch models mid-conversation

---

## What's Missing from Our Studio That Conductor Has

| Feature | Conductor | Our Studio |
|---------|-----------|------------|
| Workspace sidebar with git stats | ✅ | ❌ |
| Git worktree per workspace | ✅ | ❌ |
| Checkpoint system (undo turns) | ✅ | ❌ |
| Chat at bottom (full width) | ✅ | ❌ (right panel) |
| Model selector in input bar | ✅ | ❌ |
| Thinking toggle | ✅ | ❌ |
| Plan mode toggle (⇧Tab) | ✅ | ❌ |
| Setup script per workspace | ✅ | ❌ |
| Run script / dev server terminal | ✅ | ❌ (single terminal) |
| Inline diff view (right panel) | ✅ | ❌ |
| DiffComment (agent comments on diff) | ✅ | ❌ |
| GetTerminalOutput MCP tool | ✅ | ❌ |
| GetWorkspaceDiff MCP tool | ✅ | ❌ |
| Create PR button | ✅ | ❌ |
| Multiple terminal sources | ✅ | partial |
| Session replay | ✅ | ❌ |
| Context usage indicator | ✅ | ❌ |
| Permission mode toggle | ✅ | ❌ |
| Spotlight file sync | ✅ | ❌ |
| Multi-model (Claude + Codex) | ✅ | ❌ |

---

## Priority Order for Hashmark Studio

### Phase 1 — Layout parity (visual)
1. Chat moves to **bottom full-width** (input bar always visible)
2. Model selector + thinking + plan mode in input bar
3. Workspace sidebar with current project + git diff stats

### Phase 2 — Functional parity
4. Inline git diff view in right panel
5. Setup script / run script per workspace
6. MCP tools: GetWorkspaceDiff, GetTerminalOutput (inject into Claude sessions)

### Phase 3 — Hashmark-specific features (our moat)
7. Checkpoint system (undo agent turns)
8. Multi-workspace with worktrees
9. Agent company view (run N agents in parallel)
10. Scan → generate → run pipeline (Conductor doesn't have this — it's our differentiator)

---

## VSCode Shell Notes (user requested)

VSCode's terminal shell integration works by:
1. Injecting shell integration scripts into the user's shell (bash/zsh/fish/pwsh)
2. Shell sends OSC escape sequences back over PTY:
   - `OSC 633 ; A ST` — prompt start
   - `OSC 633 ; B ST` — prompt end (command starts)
   - `OSC 633 ; C ST` — command executed
   - `OSC 633 ; D ; <exitcode> ST` — command finished
   - `OSC 633 ; E ; <cmdline> ST` — command line (for history)
3. VSCode uses these to: know when commands start/end, show exit codes inline,
   navigate between commands (⌘↑/⌘↓), rerun commands, show command duration

Key scripts: `shellIntegration-bash.sh`, `shellIntegration-zsh.sh` (in VSCode resources)

For hashmark studio: we should inject shell integration to get per-command tracking,
so we can show "last command: npm run build — 2.3s ✅" in the status bar.

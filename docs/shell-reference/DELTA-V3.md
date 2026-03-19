# Remaining Gaps vs Competitors (v3)

> Delta from DELTA-V2. Only gaps we have NOT yet addressed.
> Audited: 2026-03-19
> Source: Conductor v0.40.1, Cursor (latest), VS Code (latest), Emdash v0.4.37
> Our state: Shell.tsx, Titlebar, ActivityBar, ModelBar, CommandPalette (files+commands), StatusBar, Settings (10 sections), ContextBar, DiffDrawer, CheckpointPanel, SourceControlPage, BranchPicker, Swarm, Run, Agents, FileTreeSidebar, XTerminal, TerminalTabs, CodeViewer, DriftIndicator, ContextHeatmap, ChatInputBar (slash commands), WorkspaceSetup

---

## What We Already Have (skip these)

Built since initial analysis -- confirmed in source:
- Command palette with file search (fuzzy match + highlights) AND command mode (> prefix)
- File tree sidebar with context menu
- Multi-model selector (Claude, Codex, Gemini, Aider, Amp, Goose, Copilot) with provider detection
- Thinking toggle + Plan mode toggle
- Terminal with tabs, split support, output panel
- Checkpoint panel (create, restore, diff, delete)
- Source control page (staged/unstaged files, diff viewer, commit)
- Branch picker (read + switch)
- Diff drawer (slide-out panel, per-file diffs)
- Context bar (token usage, waste estimate, loop detection)
- Context heatmap (section hit tracking)
- Drift indicator (CLAUDE.md drift detection)
- Settings page (10 sections: appearance, chat, project, git, env, workspace, providers, scan, claude-code, MCP)
- Dark + Light themes with compact density
- Slash commands in chat input (/compact, /clear, /plan, /think, /checkpoint, /scan, etc.)
- Swarm page (multi-agent parallel tasks)
- Run page (single agent task with worktree branch)
- Agent cards with status state machine
- Recent files tracking in command palette
- Keyboard shortcuts overlay
- Resizable sidebar + resizable terminal drawer
- Electron IPC (pickFolder, setProjectDir, showInFinder, onMenu)
- Session sidebar with session switching
- Project switcher / workspace setup flow
- Toast notification system (in-app)

---

## Must-Have (blocking for launch)

| # | Gap | Competitor | Effort | Impact | Notes |
|---|-----|-----------|--------|--------|-------|
| 1 | **Session resume after restart** | Conductor | M | HIGH | `--resume <session_id>` flag. Currently sessions die on app restart. Without this, users lose all context on quit/crash. Conductor stores `resume_session_at` for restart point. |
| 2 | **Pending message safety** | Conductor | M | HIGH | "Potato Problem": if Claude crashes mid-stream, message is lost. Conductor stores `pending_message` in DB, re-sends on reconnect, disables cancel until ack. We have no recovery. |
| 3 | **Per-turn auto-checkpointing** | Conductor | M | HIGH | Auto-checkpoint before every user turn. Enables "undo last agent action". We have manual checkpoint create but no auto-trigger. |
| 4 | **Plan mode approval flow** | Conductor | M | HIGH | Currently our plan toggle just sets a flag. Conductor: agent generates plan -> user approves/denies/gives feedback -> transitions to execution. No approval gate exists in our flow. |
| 5 | **`--permission-mode plan` passthrough** | Conductor | S | HIGH | Our plan mode toggle doesn't actually pass the flag to Claude CLI spawn args. Dead toggle. |
| 6 | **Auto-updater** | Conductor | M | HIGH | No update mechanism. Users stuck on old versions with no notification. Conductor uses `tauri_plugin_updater`. We need electron-updater. |
| 7 | **PR creation from workspace** | Emdash | L | HIGH | Emdash: AI-generates title + description from diff, creates PR via GitHub API. Conductor: stores `pr_title`, `pr_description` per workspace. We have nothing. |
| 8 | **Remote git operations (push/pull/fetch)** | Cursor, Emdash | M | HIGH | SourceControlPage shows status but cannot push, pull, or fetch. Users must drop to terminal for basic git workflow. |
| 9 | **Branch creation** | Cursor | S | HIGH | BranchPicker is read + switch only. No create-new-branch UI. Basic git workflow gap. |
| 10 | **Find in terminal** | Cursor | S | HIGH | No Cmd+F search within terminal output. xterm.js search addon exists but not loaded. |

---

## Should-Have (competitive parity)

| # | Gap | Competitor | Effort | Impact | Notes |
|---|-----|-----------|--------|--------|-------|
| 11 | **Git worktree-based workspaces** | Conductor | XL | HIGH | Each task gets file-isolated worktree. 5-state machine (initializing > setting_up > ready > archiving > archived). Our Run page creates worktree branches but no persistent workspace abstraction. |
| 12 | **Session compaction awareness** | Conductor | M | HIGH | `is_compacting` flag. During compaction, queue new messages instead of losing them. We show token usage in ContextBar but no compaction state handling. |
| 13 | **OS notifications** | Conductor, Emdash | S | MED | Desktop notifications when agent completes a task. Conductor: `tauri_plugin_notification`. Emdash: sound + system notification. We have in-app toasts only -- invisible if app is backgrounded. |
| 14 | **Window state persistence** | Conductor | S | MED | Saves/restores window position, size, maximized state between launches. We always open at default size. |
| 15 | **Image/screenshot input in chat** | Cursor | M | HIGH | Paste or drag screenshots into chat for vision context. We accept text only. |
| 16 | **MCP server injection for agent** | Conductor | L | HIGH | Conductor injects custom MCP server into Claude sessions giving the agent 3 tools: GetWorkspaceDiff, DiffComment, GetTerminalOutput. Agent can see diffs and read terminal. Our agent is blind to workspace state. |
| 17 | **Inline diff commenting** | Conductor, Emdash | L | MED | Full diff_comments system: file_path, line_number, body, thread_id, resolved state. Comments injected into agent's next prompt. We have DiffViewer but no commenting. |
| 18 | **Code review custom prompts** | Conductor | S | MED | 4 custom prompt slots per repo: general, code_review, create_pr, rename_branch. We have no per-repo prompts. |
| 19 | **Multi-file diff review (accept/reject)** | Cursor, Emdash | M | HIGH | After agent edits, show all changed files with per-file or per-hunk accept/reject. Our DiffDrawer shows diffs but has no approval flow. |
| 20 | **Issue tracker integration** | Emdash | L | MED | GitHub Issues, Linear, Jira selector with auto-linking to PRs. We have no issue tracker integration. |
| 21 | **Browser preview pane** | Emdash | L | MED | Electron BrowserView rendering dev server output. Port auto-discovery (5173, 3000, 8080). Per-task URL persistence. We have nothing. |
| 22 | **Split view / editor groups** | Cursor, VS Code | M | MED | Titlebar has a Split View button but it logs "not implemented yet". No actual split pane rendering. |
| 23 | **Agent event hooks (webhook receiver)** | Emdash | M | MED | HTTP server receives POST webhooks from Claude Code hooks for completion notifications. We detect streaming state but no hook receiver. |
| 24 | **Task/kanban board** | Emdash | L | MED | 3-column board: To-do, In-progress, Ready for review. Auto-promote on agent activity. We have sessions but no task state machine or board view. |
| 25 | **Idle session eviction** | Conductor | S | MED | After 30 min idle, destroy generator. Max 5 concurrent active sessions. 60s check interval. We keep all sessions alive until app close. |
| 26 | **Custom API base URL** | Conductor | S | MED | `anthropic_base_url`, `anthropic_auth_token` settings. We're hardcoded to default Anthropic API. Blocks enterprise/proxy users. |
| 27 | **Environment variable injection** | Conductor | S | MED | `claude_env_vars` setting (newline-separated KEY=VALUE) injected into Claude sessions. We have env display in Settings but no injection. |
| 28 | **Agent activity detection (busy/idle/waiting)** | Emdash | M | MED | PTY output analyzed character-by-character to classify agent state beyond binary streaming/not-streaming. |
| 29 | **Welcome/onboarding flow** | VS Code, Emdash | M | MED | First-launch walkthrough: configure theme, set API keys, learn shortcuts. Our WorkspaceSetup is a folder picker, not an onboarding flow. |
| 30 | **Screen reader / ARIA support** | Cursor, VS Code | M | MED | We have minimal ARIA (role="listbox" on model dropdown). Need live regions, announcements, keyboard focus management throughout. |

---

## Nice-to-Have (differentiation)

| # | Gap | Competitor | Effort | Impact | Notes |
|---|-----|-----------|--------|--------|-------|
| 31 | **Workspace pinning + notes** | Conductor | S | LOW | `pinned_at` timestamp pins workspace to top. `notes` field for freeform text. |
| 32 | **Workspace unread indicator** | Conductor | S | MED | `unread` flag for visual badge when background workspace has activity. |
| 33 | **Big terminal mode** | Conductor | S | LOW | Swap main pane from chat to full-screen terminal per workspace. We can maximize terminal but it doesn't replace chat. |
| 34 | **Per-message model tracking** | Conductor | S | LOW | Each message records which model generated it. Useful for mixed-model sessions. |
| 35 | **Session soft delete** | Conductor | S | LOW | `is_hidden` flag hides session without data loss. Our delete is permanent. |
| 36 | **Linked workspaces** | Conductor | M | LOW | JSON array of workspace IDs for cross-directory linking. |
| 37 | **Deep link handler** | Conductor | S | LOW | `conductor://` URL scheme. We'd register `hashmark://`. |
| 38 | **Lottie loading animations** | Conductor | M | LOW | 7 animation states vs our skeleton loaders. |
| 39 | **Bundled CLIs** | Conductor | L | MED | Ships with claude, codex, node, gh, watchexec binaries. We require user's local CLI. |
| 40 | **Git busy detection** | Conductor | S | LOW | Detect rebase/merge/cherry-pick in progress. Skip checkpoint gracefully. |
| 41 | **PR status tracking + CI checks** | Emdash | M | MED | Auto-refresh PR state, view CI/CD check run results, merge from UI. |
| 42 | **SSH remote development** | Emdash | XL | LOW | SSH connections, remote PTY, SCP file transfer. |
| 43 | **In-app changelog** | Emdash | S | LOW | Changelog notifications with modal viewer. |
| 44 | **Configurable keyboard shortcuts** | Emdash | M | MED | All shortcuts stored in settings, user-configurable with conflict detection. Ours are hardcoded. |
| 45 | **Sound notifications** | Emdash | S | LOW | Configurable sounds when agents finish. |
| 46 | **Right sidebar (auxiliary bar)** | VS Code | M | LOW | Second sidebar for outline, timeline. |
| 47 | **Problems/diagnostics panel** | VS Code | L | MED | Bottom panel tab showing lint/type errors. |
| 48 | **Zen mode** | VS Code | S | LOW | Distraction-free: hide all chrome, center editor. |
| 49 | **Multi-root workspaces** | VS Code | M | LOW | Open multiple folders in one window. |
| 50 | **High contrast theme** | VS Code | S | LOW | Accessibility theme variant. |
| 51 | **Notepads (@-referenceable)** | Cursor | M | LOW | Persistent scratchpad notes injected into chat context via @ reference. |
| 52 | **Outline/symbol view** | Cursor, VS Code | M | MED | Sidebar showing code structure (functions, classes, exports). |
| 53 | **Stash management** | Cursor, VS Code | S | LOW | Stash, pop, apply, drop from UI. |
| 54 | **Git graph / timeline** | VS Code | L | LOW | Visual commit history with branch visualization. |
| 55 | **Terminal profiles** | Cursor | S | LOW | Named profiles (bash, zsh, fish, pwsh) with custom args, env, icon. |
| 56 | **Terminal link detection** | Cursor | S | MED | Clickable URLs and file paths in terminal output. xterm web links addon exists, just not loaded. |
| 57 | **Shell integration decorations** | Cursor | M | LOW | Command status markers in gutter (green check / red X). We parse OSC 633 for CWD but don't display decorations. |
| 58 | **Settings search** | Cursor | S | MED | Search across all settings sections. Our Settings page has nav but no search. |
| 59 | **Workspace-level settings** | Cursor, VS Code | M | LOW | Per-project settings that override global. |
| 60 | **Lifecycle scripts (setup/run/teardown)** | Emdash, Conductor | M | MED | Per-task setup/run/teardown scripts with dedicated PTY. Conductor: `run_script`, `run_script_mode`, `archive_script`. |

---

## Effort Key

- **S** = Small (< 1 day, single file, mostly config/wiring)
- **M** = Medium (1-3 days, 2-5 files, new component + API route)
- **L** = Large (3-7 days, new subsystem, DB schema + multiple components)
- **XL** = Extra Large (1-2 weeks, architectural change, new data model)

## Recommended Build Order

**Sprint 1 (ship blockers):** #5, #9, #10, #6 -- all S/M effort, unblock basic workflows
**Sprint 2 (session reliability):** #1, #2, #3, #12 -- make sessions reliable
**Sprint 3 (agent workflow):** #4, #8, #7 -- plan approval + git ops + PR creation
**Sprint 4 (competitive):** #13, #14, #15, #16 -- notifications, window state, images, MCP injection

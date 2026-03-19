# Conductor App -- Exhaustive Audit Report

**App**: Conductor v0.40.1
**Bundle ID**: com.conductor.app
**Framework**: Tauri v2 (Rust backend + WebView frontend)
**Min macOS**: 10.13
**URL Scheme**: `conductor://`
**Date**: 2026-03-19

---

## 1. Architecture Overview

Conductor is a Tauri v2 desktop app (NOT Electron) that orchestrates AI coding agents. It has three layers:

1. **Rust Backend** (Tauri) -- Window management, SQLite via sqlx, menu system, file system access, shell spawning, auto-updater, deep links, tray icon, window state persistence
2. **Node.js Sidecar** (`index.bundled.js`, 844KB) -- Manages Claude Code SDK and OpenAI Codex SDK connections, MCP server, git checkpointing, JSON-RPC tunnel to frontend
3. **WebView Frontend** -- SPA rendered in the Tauri webview (CSS/JS compiled into binary, not extractable as static files)

### Bundled Binaries (in `/Contents/Resources/bin/`)

| Binary | Size | Purpose |
|--------|------|---------|
| `claude` | 190MB | Bundled Claude Code CLI |
| `codex` | 77MB | Bundled OpenAI Codex CLI |
| `node` | 110MB | Node.js runtime for sidecar |
| `gh` | 53MB | GitHub CLI |
| `watchexec` | 7MB | File watcher (used by Spotlighter) |
| `index.bundled.js` | 844KB | Node.js sidecar (orchestration layer) |
| `checkpointer.sh` | 8KB | Git checkpoint save/restore/diff |
| `spotlighter.sh` | 4KB | File change watcher + auto-sync |
| `git-busy-check.sh` | 1.2KB | Detects in-progress git operations |

### External Services

- `https://app.conductor.build/*` -- App backend/API
- `https://conductor.build/*` -- Marketing site
- `https://app.chorus.sh/*` -- Related service (Chorus)
- `https://hercules.tail7093e.ts.net/*` -- Internal Tailscale endpoint
- `https://api.github.com/*` -- GitHub API
- `https://api.linear.app/graphql` -- Linear integration
- `https://statuspage.incident.io/*` -- Status monitoring
- `https://us.i.posthog.com/i/v0/e/` -- PostHog analytics
- Deep link protocols: `linear://`, `vscode://`, `slack://`, `figma://`, `notion://`, `raycast://`

---

## 2. Database Schema (SQLite)

Database location: `~/Library/Application Support/com.conductor.app/conductor.db`

### Table: `settings`

Key-value store for global app settings.

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Known settings keys** (from migrations + binary):
- `claude_model` / `default_model` -- Current default model (migrated from claude_model to default_model)
- `review_model` -- Model used for code review sessions
- `claude_provider` -- Provider setting (deprecated, migrated from 'openai' to 'default')
- `anthropic_base_url` -- Custom Anthropic API base URL
- `anthropic_auth_token` -- Custom auth token
- `anthropic_api_key` -- API key
- `claude_env_vars` -- Environment variables for Claude (newline-separated KEY=VALUE)
- `http_proxy` -- HTTP proxy for Claude
- `bedrock_profile` -- AWS Bedrock profile name
- `vertex_project_id` -- Google Vertex project ID
- `branch_prefix_type` -- How workspace branches are named (default: 'github_username')
- `branch_prefix_custom` -- Custom branch prefix value
- `default_thinking_level` / `review_thinking_level` -- (deprecated, replaced by thinking_enabled)
- `default_thinking_enabled` -- Boolean for extended thinking
- `default_codex_thinking_level` -- Codex thinking level (default: 'high')
- `review_codex_thinking_level` -- Codex review thinking level (default: 'high')
- `enterprise_data_privacy` -- Enterprise data privacy mode (was 'strict_data_privacy')

### Table: `repos`

Represents a connected Git repository.

```sql
CREATE TABLE repos (
    id TEXT PRIMARY KEY,
    remote_url TEXT,
    name TEXT,
    default_branch TEXT DEFAULT 'main',
    root_path TEXT,
    setup_script TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Added columns** (via migrations):
- `display_order INTEGER DEFAULT 0` -- Drag-to-reorder repos
- `remote TEXT` -- Git remote name (default backfilled to 'origin')
- `run_script TEXT` -- Custom script for "Run server" button
- `run_script_mode TEXT DEFAULT 'concurrent'` -- 'concurrent' allows parallel run across workspaces
- `storage_version INTEGER DEFAULT 1` -- Version 1: old layout, Version 2: new `<root>/conductor/<workspace>` layout
- `archive_script TEXT` -- Runs in linked workspace when archiving
- `conductor_config TEXT` -- JSON config blob for the repo
- `custom_prompt_general TEXT` -- Custom system prompt for general sessions
- `custom_prompt_code_review TEXT` -- Custom system prompt for code review
- `custom_prompt_create_pr TEXT` -- Custom system prompt for PR creation
- `custom_prompt_rename_branch TEXT` -- Custom system prompt for branch renaming
- `hidden INTEGER DEFAULT 0` -- Hide repo from sidebar
- `icon TEXT` -- Custom repo icon

### Table: `workspaces`

Git worktree-based workspace (one repo can have many workspaces).

```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    repository_id TEXT,
    city_name TEXT,               -- deprecated (was random city name)
    directory_name TEXT,
    archived INTEGER DEFAULT 0,   -- deprecated
    active_session_id TEXT,
    branch TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Added columns**:
- `state TEXT DEFAULT 'active'` -- 5 states: 'initializing', 'setting_up', 'ready', 'archiving', 'archived'
- `notes TEXT` -- User notes for the workspace (moved from sessions)
- `big_terminal_mode INTEGER DEFAULT 0` -- When 1, terminal is the main pane instead of Claude Code
- `pinned_at TEXT` -- When set, workspace appears at top of its repo's list
- `unread INTEGER DEFAULT 0` -- Visual indicator for unread activity
- `parent_branch TEXT` / `initialization_parent_branch TEXT` -- Branch the workspace was created from
- `placeholder_branch_name TEXT` -- Original branch name for rename instruction display
- `linked_workspace_ids TEXT` -- JSON array of linked workspace IDs
- `setup_log_path TEXT` -- Path to setup script log for debugging
- `initialization_log_path TEXT` -- Path to git worktree init log
- `initialization_files_copied INTEGER` -- Count of files copied during init
- `archive_commit TEXT` -- Commit hash at time of archiving
- `derived_status TEXT DEFAULT 'in-progress'` -- Computed status
- `manual_status TEXT` -- User-set status override
- `intended_target_branch TEXT` -- Target branch for merging
- `pr_title TEXT` -- Pull request title
- `pr_description TEXT` -- Pull request description
- `secondary_directory_name TEXT` -- For directory linking

### Table: `sessions`

A chat session within a workspace. One workspace can have many sessions.

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'idle',
    claude_session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Added columns**:
- `workspace_id TEXT` -- Links session to workspace (one-to-many)
- `agent_type TEXT` -- 'claude' or 'codex'
- `title TEXT DEFAULT 'Untitled'` -- Session title
- `model TEXT` -- Per-session model override
- `unread_count INTEGER DEFAULT 0` -- Unread message count
- `freshly_compacted INTEGER DEFAULT 0` -- Whether session was just compacted
- `context_token_count INTEGER DEFAULT 0` -- Current context usage
- `context_used_percent FLOAT` -- Context usage as percentage
- `is_compacting INTEGER DEFAULT 0` -- Currently being compacted
- `is_hidden INTEGER DEFAULT 0` -- Soft-delete (hidden from UI)
- `thinking_enabled INTEGER DEFAULT 1` -- Extended thinking on/off
- `thinking_level TEXT DEFAULT 'NONE'` -- (deprecated)
- `codex_thinking_level TEXT` -- Codex-specific thinking level
- `permission_mode TEXT DEFAULT 'default'` -- 'default' or 'plan'
- `pending_message TEXT` -- Workaround for "Potato Problem" (CC crash before ack)
- `last_user_message_at TEXT` -- Timestamp of last user message
- `resume_session_at TEXT` -- Where to resume after revert
- `fast_mode INTEGER DEFAULT 0` -- Fast mode toggle
- `notes TEXT` -- (deprecated, moved to workspaces)

### Table: `session_messages`

Individual messages within a session.

```sql
CREATE TABLE session_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    role TEXT,
    content TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Added columns**:
- `sent_at TEXT` -- When NULL = queued/pending, when set = sent to agent
- `cancelled_at TEXT` -- When set, message was cancelled
- `full_message TEXT` -- Expanded slash command content (NULL for regular messages)
- `model TEXT` -- Per-message model (if different from session default)
- `sdk_message_id TEXT` -- ID from the Claude/Codex SDK
- `last_assistant_message_id TEXT` -- Links to last assistant response
- `turn_id TEXT` -- Groups messages into turns for checkpointing

**Indexes**:
- `idx_session_messages_sent_at (session_id, sent_at)`
- `idx_session_messages_cancelled_at (session_id, cancelled_at)`
- `idx_session_messages_turn_id (turn_id)`

### Table: `attachments`

File attachments to messages.

```sql
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    type TEXT,
    original_name TEXT,
    path TEXT,
    is_loading INTEGER DEFAULT 0,
    session_id TEXT,
    session_message_id TEXT,
    is_draft INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `diff_comments`

Code review comments on workspace diffs.

```sql
CREATE TABLE diff_comments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    file_path TEXT,
    line_number INTEGER,
    body TEXT,
    state TEXT,
    location TEXT,
    created_at INTEGER NOT NULL,
    remote_url TEXT,
    author TEXT,
    thread_id TEXT,
    reply_to_comment_id TEXT,
    update_memory INTEGER        -- deprecated
);
```

**Added columns**:
- `end_line_number INTEGER` -- For multi-line range comments
- `author_avatar_url TEXT` -- Avatar for comment author
- `is_outdated INTEGER` -- Whether comment is on stale code
- `is_resolved INTEGER` -- Whether comment thread is resolved
- `updated_at INTEGER` -- Last update timestamp

### Table: `symlinks_pending_deletion`

Tracks symlinks that need cleanup.

```sql
CREATE TABLE symlinks_pending_deletion (
    path TEXT
);
```

### Migration System

Uses sqlx migrations (`_sqlx_migrations` table). The binary contains ~50+ migrations covering the full evolution of the schema.

---

## 3. Menu System and Keyboard Shortcuts

Extracted from binary:

| Menu Item | Shortcut | ID |
|-----------|----------|----|
| Settings... | Cmd+, | (native) |
| Quit | Cmd+Q | custom_quit |
| Toggle Left Sidebar | Cmd+B | toggle_left_sidebar |
| Toggle Right Sidebar | Cmd+Alt+B | toggle_right_sidebar |
| Keyboard Shortcuts | Cmd+/ | keyboard_shortcuts |
| Documentation | (none) | documentation |
| Best Practices | (none) | best_practices |
| Changelog | (none) | changelog |
| Send Feedback | Cmd+Alt+F | send_feedback |
| Submit a Prompt... | (none) | submit_a_prompt |
| Debug | Cmd+Alt+I | debug |

---

## 4. Tauri Plugin Surface

Full list of Tauri plugins used:

| Plugin | Purpose |
|--------|---------|
| `tauri_plugin_sql` | SQLite database (via sqlx) |
| `tauri_plugin_fs` | File system access |
| `tauri_plugin_shell` | Process spawning (sidecars) |
| `tauri_plugin_http` | HTTP fetch |
| `tauri_plugin_opener` | Open URLs/files in OS default |
| `tauri_plugin_window_state` | Save/restore window position/size |
| `tauri_plugin_updater` | Auto-update system |
| `tauri_plugin_deep_link` | `conductor://` URL handler |
| `tauri_plugin_notification` | OS notifications |
| `tauri_plugin_dialog` | Native file/message dialogs |

### Key Plugin Commands

**SQL**: `plugin:sql|load`, `plugin:sql|execute`, `plugin:sql|select`, `plugin:sql|close`
**FS**: `plugin:fs|create`, `plugin:fs|exists`, `plugin:fs|read_file`, `plugin:fs|write_file`, `plugin:fs|watch`, etc.
**Shell**: `plugin:shell|execute`, `plugin:shell|spawn`, `plugin:shell|kill`, `plugin:shell|stdin_write`, `plugin:shell|open`
**Window**: `plugin:window|close`, `plugin:window|set_title`, `plugin:window|set_focus`, `plugin:window|show`, `plugin:window|center`, etc.
**Updater**: `plugin:updater|check`, `plugin:updater|download`, `plugin:updater|download_and_install`, `plugin:updater|install`

### File System Permissions

The app has scoped FS access to:
- `$APPLOCALDATA/**` (app data directory)
- `$HOME/.claude/**` (Claude config directory)

---

## 5. Sidecar Architecture (Node.js Process)

The sidecar (`index.bundled.js`) communicates with the Tauri frontend over a Unix domain socket at `/tmp/conductor-sidecar-<PID>.sock` using JSON-RPC.

### Sidecar Startup

1. Creates a Unix socket server
2. Initializes the bundled Claude CLI (`claude -v` to verify)
3. Outputs `SOCKET_PATH=<path>` to stdout for the frontend to connect
4. Listens for connections and sets up JSON-RPC handlers

### JSON-RPC API (Frontend to Sidecar)

**Requests from Frontend**:
- `onQuery(params)` -- Start a new agent query (Claude or Codex)
- `onCancel(params)` -- Cancel an active query
- `onClaudeAuth(params)` -- Check Claude authentication status
- `onWorkspaceInit(params)` -- Initialize workspace (fetch slash commands + MCP servers)
- `onContextUsage(params)` -- Get context window usage stats
- `onUpdatePermissionMode(params)` -- Switch between 'default' and 'plan' mode
- `onResetGenerator(params)` -- Force-reset the Claude session
- `onSetForwardLogs(params)` -- Toggle log forwarding to webview
- `onSetPostHogDistinctId(params)` -- Set analytics user ID
- `onCrashTest()` -- Debug: trigger a crash

**Messages from Sidecar to Frontend**:
- `sendMessage(data)` -- Stream agent response messages
- `sendError(data)` -- Error messages
- `sendSidecarLog(data)` -- Debug log forwarding
- `sendFastModeUnavailableNotification(data)` -- Fast mode billing warning
- `sendEnterPlanModeNotification(data)` -- Agent entered plan mode

**Request/Response (bidirectional)**:
- `requestGetDiff(params)` -- Get workspace diff from frontend
- `requestDiffComment(params)` -- Post diff comments
- `requestExitPlanMode(params)` -- Ask user to approve/deny plan
- `requestGetTerminalOutput(params)` -- Get terminal output

### Process Management

**Idle Sweep** (session cleanup):
- Max concurrent active sessions: **5** (`x0=5`)
- Idle timeout: **30 minutes** (`QU=30*60*1e3`)
- Check interval: **60 seconds** (`e4=60*1e3`)
- When a session idles: generator is destroyed, session is offloaded from memory
- When over 5 active sessions: oldest inactive sessions are evicted

**Parent PID Watchdog**: Every 2 seconds, checks if parent PID changed (indicating Tauri process died). If so, shuts down gracefully.

**Shutdown sequence**: Kill child processes via `pgrep -P`, clean up socket file, close server.

---

## 6. Claude Agent Integration

### Session Lifecycle

1. **New session**: Frontend sends `onQuery` with prompt, model, cwd, settings
2. **Generator created**: Async generator wraps Claude Code SDK, yielding messages
3. **Session reuse**: Subsequent messages reuse the existing generator if settings haven't changed
4. **Model change**: Uses `setModel()` callback on the query object (no restart needed)
5. **Permission mode change**: Uses `setPermissionMode()` callback
6. **Cancel**: Closes the query, sends "aborted by user" error
7. **Compaction**: `is_compacting` flag queues messages during context compaction
8. **Idle eviction**: After 30 min idle, generator is destroyed but session data persists in DB

### Model Selection

**Claude models** (from the model mapping function `Mg()`):

| Internal ID | Default API | Bedrock API | Vertex API |
|-------------|-------------|-------------|------------|
| `opus` | `claude-opus-4-6` | `global.anthropic.claude-opus-4-6-v1` | `claude-opus-4-6` |
| `opus-1m` | `claude-opus-4-6[1m]` | `global.anthropic.claude-opus-4-6-v1[1m]` | `claude-opus-4-6[1m]` |
| `sonnet` | `claude-sonnet-4-6` | `global.anthropic.claude-sonnet-4-6` | `claude-sonnet-4-6` |
| `haiku` | (uses raw name) | `global.anthropic.claude-haiku-4-5-20251001-v1:0` | `claude-haiku-4-5@20251001` |

**Codex models** (from migrations):
- `gpt-5.4` (current default in code)
- `gpt-5.3-codex` (migration target)
- `gpt-5.2-codex` / `gpt-5.2` (deprecated)
- `gpt-5.1-codex` / `gpt-5.1-codex-max` (deprecated)
- `gpt-5-codex` / `gpt-5-codex-mini` / `gpt-5.1-codex-mini` (deprecated)

**Deprecated/migrated models**: `automatic`, `opusplan` -- both migrated to `sonnet`

### Provider Support

- **Default** (Anthropic API direct)
- **AWS Bedrock** -- Enabled via `CLAUDE_CODE_USE_BEDROCK=1` + `AWS_PROFILE=<bedrock_profile>`
- **Google Vertex** -- Enabled via `CLAUDE_CODE_USE_VERTEX=true`
- **OpenAI** (for Codex) -- via `CODEX_API_KEY`

### Claude SDK Options

When spawning Claude Code, the sidecar passes these SDK options:

```
--output-format stream-json
--verbose
--input-format stream-json
--thinking <adaptive|disabled>
--max-thinking-tokens <N>
--max-turns <N> (default 1000)
--model <model>
--permission-prompt-tool stdio (when canUseTool callback is set)
--permission-mode <default|plan>
--resume <session_id> (for session resumption)
--setting-sources user,project,local
--disallowedTools AskUserQuestion
--mcp-config <json> (for conductor MCP server)
```

Additional flags: `--chrome` (when chrome enabled), `--fast-mode` (when fast mode on), `--add-dir` (for additional directories)

### Settings Change Detection

The sidecar detects when these settings change between messages and decides whether to restart the generator:
- `envVars` -- Environment variables
- `executablePath` -- Custom Claude executable path
- `additionalDirectories` -- Extra watched directories
- `chromeEnabled` -- Chrome browser integration
- `enterpriseDataPrivacy` -- Enterprise mode
- `fastMode` -- Fast mode toggle

If any of these change, the generator is recreated. Model and thinking token changes use in-flight callbacks without restart.

### Tool Use Permission System

The `canUseTool` callback intercepts tool calls with custom logic:

1. **ExitPlanMode**: When the agent calls this tool, the sidecar asks the frontend for user approval. If approved, the plan transitions to execution mode with a new turn.
2. **File edit safety**: `Edit`, `MultiEdit`, `Write`, `NotebookEdit` are blocked if the target file is outside the workspace's allowed directories.
3. All other tools: allowed by default.

### Hooks System

```
UserPromptSubmit: [start git checkpoint]
Stop: [end git checkpoint]
PostToolUse (EnterPlanMode): [notify frontend of plan mode entry]
```

---

## 7. Codex Agent Integration

Two modes of Codex operation:

### Mode 1: Direct CLI (Legacy)

Uses `codex` binary directly via a subprocess, streaming events.

```
sandboxMode: "danger-full-access"
skipGitRepoCheck: true
webSearchMode: "live"
model: default "gpt-5.4"
```

### Mode 2: App Server (Current)

Uses `codex app-server --listen stdio://` for a persistent JSON-RPC connection.

**JSON-RPC Methods**:
- `initialize` -- Handshake with client info and capabilities
- `thread/start` -- Create a new thread
- `thread/resume` -- Resume an existing thread
- `turn/start` -- Start a new turn within a thread
- `turn/interrupt` -- Cancel a running turn
- `turn/steer` -- Inject new input mid-turn

**Event Notifications** (server to client):
- `thread/started`, `thread/status/changed`, `thread/name/updated`
- `thread/tokenUsage/updated`, `thread/compacted`
- `turn/started`, `turn/completed`, `turn/diff/updated`, `turn/plan/updated`
- `item/started`, `item/completed`
- `item/agentMessage/delta` -- Streaming text
- `item/plan/delta` -- Plan text streaming
- `item/commandExecution/outputDelta` -- Command output streaming
- `item/commandExecution/terminalInteraction`
- `item/fileChange/outputDelta`
- `item/mcpToolCall/progress`
- `item/reasoning/summaryTextDelta`, `item/reasoning/summaryPartAdded`, `item/reasoning/textDelta`
- `model/rerouted`, `serverRequest/resolved`
- `error`

**Approval Handlers** (auto-approved):
- `item/commandExecution/requestApproval` -- Always returns `{decision: "accept"}`
- `item/fileChange/requestApproval` -- Always returns `{decision: "accept"}`
- `execCommandApproval` -- Always returns `{approved: true}`
- `applyPatchApproval` -- Always returns `{approved: true}`

**Collaboration Modes**: The Codex handler supports a `collaborationMode` parameter with values:
- `"plan"` -- Plan-only mode (generates plan, waits for approval)
- `"default"` -- Normal execution mode

**Plan Mode Flow** (Codex):
1. Send prompt with `collaborationMode: "plan"`
2. Codex generates a plan (captured as `plan` item text)
3. Send `enter_plan_mode_notification` to frontend
4. Wait for `requestExitPlanMode` from frontend
5. If approved: send plan as "PLEASE IMPLEMENT THIS PLAN:\n<plan>" with `collaborationMode: "default"`
6. If feedback given: re-run in plan mode with feedback
7. If denied: complete the turn

---

## 8. MCP Server (Conductor MCP)

When `enterpriseDataPrivacy` is NOT enabled, the sidecar injects an MCP server called `conductor` into the Claude session. This gives the agent access to custom tools:

### Tool: `GetWorkspaceDiff`

Retrieves the workspace diff (all changes on current branch vs merge base, including uncommitted).

**Parameters**:
- `file` (optional string) -- Specific file path for focused diff
- `stat` (optional boolean) -- Return `git diff --stat` style output

**Description**: "You can use this tool to see what the user is currently working on, or when the user refers to the 'workspace diff', 'PR diff', or 'all changes'."

### Tool: `DiffComment`

Posts code review comments on the workspace diff.

**Parameters**:
- `comments` (array of objects):
  - `file` (string) -- File path
  - `lineNumber` (number) -- Line number
  - `body` (string) -- Comment text

### Tool: `GetTerminalOutput`

Reads output from running terminals.

**Parameters**:
- `source` (optional enum): `'spotlight'`, `'run_script'`, `'terminal'`, `'auto'`
- `maxLines` (optional number, default 1000)

**Terminal types**:
- `spotlight` -- The file-watching test process
- `run_script` -- Dev server / run script process
- `terminal` -- User's interactive terminal

---

## 9. Git Checkpoint System

### checkpointer.sh

Three commands: `save`, `restore`, `diff`

**Save** (non-disruptive):
1. Check for in-progress git operations (rebase, merge, cherry-pick, revert)
2. Generate checkpoint ID (default: `cp-YYYYMMDDTHHMMSSz`)
3. Capture HEAD OID
4. Write-tree from current index (staged state)
5. Create temp index, `git add -A`, write-tree (full working tree snapshot including untracked)
6. Create a commit object with metadata: `head <oid>`, `index-tree <oid>`, `worktree-tree <oid>`, `created <timestamp>`
7. Store under `refs/conductor-checkpoints/<id>` -- NO HEAD movement, NO file changes

**Restore** (destructive):
1. `git reset --hard <saved HEAD>`
2. `git read-tree --reset -u <worktree-tree>` (restore files)
3. `git clean -fd` (remove extra untracked files)
4. `git read-tree --reset <index-tree>` (restore staged state)

**Diff**:
- Compare two checkpoints or a checkpoint vs `current` working tree
- Builds transient tree for `current` comparison

### Checkpoint Integration in Sidecar

The function `Bt(sessionId, turnId, action, cwd, source)` is called:
- `"start"` -- At the beginning of each user turn (before agent processes)
- `"end"` -- When a turn completes or is cancelled

This creates a checkpoint before each turn, enabling "undo" by reverting to the pre-turn checkpoint.

### git-busy-check.sh

Detects four states: `busy:rebase`, `busy:merge`, `busy:cherry-pick`, `busy:revert`, or `clean`. Exit code 101 skips checkpointing without error.

---

## 10. Spotlighter (File Watcher)

### spotlighter.sh (watch-checkpointer)

Watches a directory for file changes using `watchexec` and syncs changes to the workspace's root path.

**Flow**:
1. Requires env vars: `CONDUCTOR_INT_CHECKPOINTER_PATH`, `CONDUCTOR_INT_WATCHEXEC_PATH`, `CONDUCTOR_ROOT_PATH`
2. Uses `watchexec` with `--emit-events-to=environment` to detect which files triggered changes
3. On change: runs `checkpointer save --id cp-spotlight-<timestamp>-<pid> --force`
4. Then: `cd $CONDUCTOR_ROOT_PATH && checkpointer restore <id>`
5. Ignores: `*.tmp.*`, `.context/**`
6. Logs to `/tmp/conductor-spotlight-<pid>.log`

**Use case**: When a user edits files in their IDE, Spotlighter detects the changes and syncs them into the agent's worktree.

---

## 11. Workspace Lifecycle

### States (5-state machine)

```
initializing -> setting_up -> ready -> archiving -> archived
```

- **initializing**: Workspace created in DB, git worktree not yet set up
- **setting_up**: Git worktree created, setup script running
- **ready**: Fully operational (was previously called 'active')
- **archiving**: In the process of being archived
- **archived**: Workspace is archived and no longer active

### Workspace Storage

**Version 1** (legacy): `/<repo>/.main`, `/<repo>/<workspace>`
**Version 2** (current): `<rootpath>`, `<rootpath>/conductor/<workspace>`

### Workspace Features

- **Pinning**: `pinned_at` timestamp moves workspace to top of repo list
- **Unread indicator**: `unread` flag for visual notification
- **Notes**: Freeform text notes per workspace
- **Big terminal mode**: Swaps main pane from Claude to full terminal
- **Linked workspaces**: JSON array of workspace IDs for directory linking
- **Branch management**: `branch`, `initialization_parent_branch`, `intended_target_branch`, `placeholder_branch_name`
- **PR metadata**: `pr_title`, `pr_description` stored directly on workspace
- **Status tracking**: `derived_status` (computed) + `manual_status` (user override)
- **Archive commit**: Records the commit hash at time of archival
- **Setup logging**: `setup_log_path` and `initialization_log_path` for debugging

---

## 12. Session Lifecycle

### Session Types

- **Claude session**: Uses Claude Code SDK, supports plan mode, fast mode, extended thinking
- **Codex session**: Uses OpenAI Codex SDK (either direct CLI or app-server)

### Session States

- `idle` -- No active query
- Processing -- Has active generator
- Compacting -- `is_compacting=1`, messages are queued

### Session Features

- **Per-session model**: Override global model at session level
- **Per-message model**: Each message can track which model generated it
- **Fast mode**: `fast_mode` flag for faster (potentially less capable) responses
- **Permission mode**: `'default'` (normal) or `'plan'` (plan-then-execute)
- **Thinking control**: `thinking_enabled` boolean, Codex has separate `codex_thinking_level`
- **Context tracking**: `context_token_count`, `context_used_percent`
- **Compaction**: When context fills up, `is_compacting` flag queues new messages during compaction
- **Soft delete**: `is_hidden` flag hides session without deleting data
- **Resume after revert**: `resume_session_at` stores the message ID to resume from after a checkpoint restore
- **Pending message**: `pending_message` stores unsent message to handle Claude Code crashes

### Context Usage

The `/context` slash command is sent to Claude to get context window usage. Returns `context_usage` data with token counts.

---

## 13. Plan Mode

### Claude Plan Mode

1. Session starts with `permission_mode: 'plan'`
2. Agent works normally until it calls `EnterPlanMode` tool
3. Frontend receives `enter_plan_mode_notification`
4. Agent generates a plan, then calls `ExitPlanMode` tool
5. `canUseTool` callback intercepts `ExitPlanMode`, asks frontend for approval via `requestExitPlanMode`
6. User can: **approve** (transitions to execution), **deny** (interrupts agent), or provide **feedback** (re-plan)
7. On approval: permission mode switches to `'default'` for execution, new turn begins

### Codex Plan Mode

1. Uses `collaborationMode: "plan"` parameter
2. Codex generates plan items
3. Frontend receives plan mode notification
4. User approves/denies/provides feedback
5. On approval: plan text is sent as "PLEASE IMPLEMENT THIS PLAN:\n<plan>" in default mode

---

## 14. Diff and Code Review System

### Workspace Diff

- `GetWorkspaceDiff` MCP tool compares current branch (including uncommitted) against merge base
- Supports full unified diff or `--stat` style summary
- Can focus on a single file

### Diff Comments

- `DiffComment` MCP tool lets the agent post comments on specific file:line locations
- Comments stored in `diff_comments` table with:
  - Thread support (`thread_id`, `reply_to_comment_id`)
  - Multi-line ranges (`line_number`, `end_line_number`)
  - Author tracking (`author`, `author_avatar_url`)
  - Resolution tracking (`is_resolved`, `is_outdated`)
  - Remote URL for linking to hosted repos

### Custom Prompts for Repo Operations

Repos can have custom system prompts for:
- General sessions (`custom_prompt_general`)
- Code review (`custom_prompt_code_review`)
- PR creation (`custom_prompt_create_pr`)
- Branch renaming (`custom_prompt_rename_branch`)

---

## 15. Terminal System

### Terminal Types

1. **Spotlight terminal** -- Spotlighter process output (file watcher)
2. **Run script terminal** -- Dev server / custom run script output
3. **Interactive terminal** -- User's terminal (PTY)

### Big Terminal Mode

When `big_terminal_mode=1` on a workspace, the terminal becomes the primary pane instead of the Claude Code interface.

### Terminal Output Reading

The `GetTerminalOutput` MCP tool can read from any terminal type. The `source` parameter can be:
- `auto` -- Automatically selects the most relevant terminal
- `spotlight` / `run_script` / `terminal` -- Specific terminal

Returns output with status (running/stopped) and terminal type label.

### Run Script

Each repo can have a `run_script` that runs when the user clicks "Run server". The `run_script_mode` controls concurrency:
- `concurrent` -- Multiple workspaces can run the script in parallel

---

## 16. App Icons and Integrations

The app bundles icons for IDE/app detection:
- Android Studio, Cursor, Finder, Ghostty, GitHub Desktop, GitHub, iTerm, Linear, Sublime Text, Terminal, VS Code, Warp, Windsurf, Xcode, Zed

Plus a generic app icon SVG.

### Deep Link Integrations

The app recognizes and can open URLs for: Linear, VS Code, Slack, Figma, Notion, Raycast.

---

## 17. Animations

The app includes Lottie animations:
- `conductor-loader.json` -- Main loading animation
- `conductor-logo.json` -- Logo animation
- `running.json` -- Agent running state
- `setting-up-loader.json` -- Workspace setup progress
- `typing.json` -- Agent typing indicator
- `waiting.json` -- Waiting state
- `working-loader.json` -- Working indicator

---

## 18. Auto-Update System

Uses `tauri_plugin_updater` with commands:
- `plugin:updater|check` -- Check for updates
- `plugin:updater|download` -- Download update
- `plugin:updater|download_and_install` -- Download and install
- `plugin:updater|install` -- Install downloaded update

---

## 19. Analytics (PostHog)

- Uses `posthog-rs` (Rust crate, v0.3.7)
- Endpoint: `https://us.i.posthog.com/i/v0/e/`
- Tracks events with `$distinct_id`, properties, timestamps
- `lib_version: 0.3.7`
- Custom event tracking via `Na("event_name", {properties})`

---

## 20. Security Model

### File System Sandboxing

Tauri's capability system limits file access to:
- `$APPLOCALDATA/**` -- App's local data directory
- `$HOME/.claude/**` -- Claude configuration

### Tool Permission Enforcement

The `canUseTool` callback blocks file edits outside allowed directories (workspace root + additional directories).

### Enterprise Data Privacy

When `enterprise_data_privacy` is enabled:
- The `conductor` MCP server is NOT injected into Claude sessions
- This means no `GetWorkspaceDiff`, `DiffComment`, or `GetTerminalOutput` tools

### Environment Variable Handling

Sensitive env vars are parsed from settings but redacted in logs:
- `ANTHROPIC_API_KEY` -- Shown as first 10 chars only
- `ANTHROPIC_AUTH_TOKEN` -- Shown as first 10 chars only
- `ANTHROPIC_CUSTOM_HEADERS` -- Shown as "Set (hidden)"
- `CODEX_API_KEY` -- Passed to Codex SDK

### Claude SDK Tasks Feature

`CLAUDE_CODE_ENABLE_TASKS=true` is always set in the environment, enabling the tasks/scheduling feature in Claude Code.

---

## 21. Window State Management

Uses `tauri_plugin_window_state` to persist:
- Window position (x, y)
- Window size (width, height)
- Maximized state
- Visible state
- Decorated state
- Fullscreen state

File: `~/Library/Application Support/com.conductor.app/.window-state.json`

---

## 22. Feature Summary Matrix

| Feature | Claude | Codex |
|---------|--------|-------|
| Chat sessions | Yes | Yes |
| Plan mode | Yes (ExitPlanMode tool) | Yes (collaborationMode) |
| Model switching | Yes (in-flight) | Yes |
| Extended thinking | Yes (adaptive/disabled) | Yes (reasoning effort) |
| Fast mode | Yes | No |
| MCP tools | Yes (conductor server) | No |
| Git checkpointing | Yes | Yes |
| Session resumption | Yes (--resume) | Yes (thread resume) |
| Diff comments | Yes (via MCP) | No |
| Terminal reading | Yes (via MCP) | No |
| Context compaction | Yes | Yes (thread/compacted event) |
| Custom executable | Yes | Yes |
| Multiple providers | Anthropic/Bedrock/Vertex | OpenAI |
| Slash commands | Yes | No |
| Web search | No | Yes (webSearchMode: "live") |
| Chrome integration | Yes (--chrome flag) | No |
| File attachments | Yes | Yes |

---

## 23. Key Implementation Patterns

### JSON-RPC Communication

All communication between Tauri frontend and Node.js sidecar uses JSON-RPC over Unix domain sockets. This is a clean separation -- the frontend never directly spawns Claude/Codex processes.

### Async Generator Pattern

Claude sessions use an async generator pattern: messages are pushed into a queue, and the generator yields them to the Claude Code SDK. This allows multiple messages to be sent to an ongoing session without recreating the connection.

### Worktree-Based Isolation

Each workspace gets its own git worktree, providing complete file isolation between parallel tasks on the same repo. The `storage_version` column tracks which directory layout is used.

### Checkpoint-Based Undo

Every user turn creates a git checkpoint before execution. The user can "undo" by reverting to the pre-turn checkpoint. This is non-disruptive on save (no HEAD movement) but destructive on restore (git reset --hard).

### Pending Message Safety

The "Potato Problem" workaround: if Claude Code crashes before acknowledging a message, the message is stored in `pending_message` to prevent data loss. Cancellation is disabled until the message is acknowledged.

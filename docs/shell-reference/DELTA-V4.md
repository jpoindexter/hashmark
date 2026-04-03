# DELTA-V4 -- Exhaustive Competitive Audit

> hashmark studio vs Conductor v0.40.1, Emdash v0.4.37, VS Code, Cursor
> Audited: 2026-03-19
> Auditor: Claude Opus 4.6
> Method: Read every component/page/hook/electron file in our codebase; cross-referenced competitor audit reports and binary analysis

---

## Inventory: What We Have

**49 components**, **13 pages**, **5 hooks**, **1 Electron main** + **1 preload**

### Components (49)
Shell, Titlebar, ActivityBar, StatusBar, ModelBar, SidebarPanel, SidebarResize, FileContentViewer, AgentDetailViewer, DiffContentViewer, TerminalPanel, ChatMessages, ChatInputBar, CommandPalette, ContextBar, ContextHeatmap, DiffDrawer, DiffPanel, DiffViewer, DriftIndicator, CheckpointPanel, BranchPicker, CodeViewer, ProjectPicker, ProjectSwitcher, ProviderSelector, ResizableDrawer, ScanProgress, ShortcutsHelp, Skeleton, Toasts, PageTransition, XTerminal, Terminal, TerminalTabs, AgentCard, SourceControlPage, ScrollToBottom, ConfirmDialog, ContextMenu, IconButton, Badge, ThinkingBlock, ToolSummary, MessageBlock, SessionsSidebar, FileTreeSidebar, GitSidebar, AgentsSidebar

### Pages (13)
Home, Settings, Agents, Run, Swarm, Generate, Files, Git, History, Governance, Company, Sessions, WorkspaceSetup

### Hooks (5)
useKeyboardNav, useKeyboardShortcuts, useProjectInfo, useTheme, useToast

### Electron (2)
main.ts (590 lines), preload.ts (22 lines)

---

## 1. SHELL CHROME (titlebar, sidebar, status bar, activity bar)

### WHAT WE HAVE
- **Titlebar** (224 lines): Custom hidden titlebar with traffic light offset (13,8). Project name, branch picker, drift badge, changed files count badge, refresh git button, PR button (navigates to /source-control), sidebar toggle (left), terminal toggle (right). Drag region with `WebkitAppRegion: drag`. No-drag zones for interactive elements.
- **ActivityBar** (144 lines): 48px wide vertical strip with 5 icons: Chat, Explorer (Cmd+Shift+E), Source Control (Cmd+Shift+G), Agents (Cmd+Shift+A), Settings (Cmd+,). Active indicator is 2px left border accent. Tooltip on hover. Clicking active icon toggles sidebar closed.
- **StatusBar** (117 lines): Full-width accent-colored bar. Left: branch name + changed file count + context window percentage (color-coded: green/yellow/red). Right: provider name / model label + project name. Clickable items with hover background.
- **Sidebar**: Resizable (SidebarResize with drag handle + double-click reset to 240px). Default 240px. Persisted to localStorage. Conditionally shown for chat/files/agents views (source-control uses full-page layout). Contains SessionsSidebar for chat view.
- **Activity bar toggle**: Hideable via Electron menu (View > Toggle Activity Bar). State persisted to localStorage.

### WHAT'S MISSING vs COMPETITORS
- **Right sidebar / auxiliary bar** (VS Code): No second sidebar for outline, timeline, etc. Conductor: `toggle_right_sidebar` (Cmd+Alt+B). We only have left sidebar.
- **Sidebar view switching indicator**: VS Code/Cursor show which sidebar view is active with a filled icon. Ours uses a 2px accent border which is subtle.
- **Breadcrumbs bar** (VS Code): No breadcrumb navigation between titlebar and content area. VS Code shows file > folder > symbol path.
- **Minimap** (VS Code): No code minimap in any viewer.
- **Panel position options** (VS Code): Terminal drawer is bottom-only. VS Code allows bottom, left, right positioning.
- **Zen mode** (VS Code): No distraction-free mode that hides all chrome.
- **Status bar click actions**: Items are styled as buttons but most have no onClick handler. VS Code/Cursor status bar items open quick pickers.

**SCORE: 7/10** -- Solid VS Code-like layout. Missing right sidebar, breadcrumbs, and interactive status bar.

---

## 2. CHAT UX (messages, input, streaming, tool calls)

### WHAT WE HAVE
- **ChatMessages** (981 lines): Virtualized list (tanstack/react-virtual). User bubbles (right-aligned, bg-4 background, "U" avatar). Assistant bubbles (left-aligned, 2px accent border-left). Markdown rendering: headings (h1/h2/h3/h4), code blocks with language label, inline code, bold, bullet lists. Cursor blink animation during streaming. Pulse dots for initial loading state. Context menu (right-click) with Copy Text, Copy as Markdown, Retry.
- **StreamingBubble**: Rich block rendering: text blocks (AssistantContent), tool_use blocks (colored border by tool type: green=write, yellow=bash, blue=read), progress blocks (italic), thinking blocks (ThinkingBlock component with collapsible content). Cost/usage line ($0.0042, 1.2kin / 340out).
- **ChatInputBar** (1183 lines): Auto-growing textarea (max 6 rows). Slash command picker with 14 built-in commands + custom agent commands. @mention file picker with fuzzy search. Agent suggestion chip (routes to best agent based on query). Image attachment (paste + drag-and-drop + preview). Voice input (Web Speech API). Pending message warning (unsent from crashed turn). Send button (arrow up icon, accent when active). Stop button (red square). New session button (+). Terminal CWD injection. Focus shortcut (Cmd+L).
- **Plan mode approval**: PlanReviewGate component with Approve & Execute, Give Feedback, Deny buttons. Shows after last assistant message when planMode=true and not streaming.
- **Empty state**: Logo (#), model label, 3 action cards (Open project, Scan codebase, View agents), 4 suggestion prompts.
- **Resumed session divider**: "Resumed session" line with timestamp when continuing a session with history.
- **Token display**: Hover-revealed timestamp and token count on messages.

### WHAT'S MISSING vs COMPETITORS
- **Diff inline in chat** (Cursor): Agent file edits don't show inline diffs in the chat stream. Cursor shows accept/reject buttons per edit. We show `[Edit] path/to/file` as a flat tool-use block.
- **Accept/reject per tool call** (Conductor): No per-tool approval flow. Conductor's `canUseTool` callback intercepts each tool call for safety checks.
- **Code block copy button**: No one-click copy button on code blocks. Have to select + copy.
- **Message editing**: No ability to edit a sent user message. Have to retype.
- **Message branching/forking**: No ability to branch from a previous message (Cursor feature).
- **Rich streaming state**: We have StreamingState with blocks, but the SSE parsing in ChatInputBar only extracts text events. Tool use/thinking blocks only render if the server sends them as structured blocks. The legacy text path (assembled string) is the common path.
- **Structured cost tracking**: CostLine component exists but cost data only comes from StreamingState.cost which is rarely populated.
- **File attachment beyond images**: Only image paste/drag. No PDF, no multi-file attachment.

**SCORE: 7/10** -- Rich chat with tool call rendering, slash commands, @mentions, voice input, plan gate. Missing inline diff display, per-tool approval, and code block copy.

---

## 3. FILE EXPLORER (tree, viewer, search, git status)

### WHAT WE HAVE
- **FileTreeSidebar** (360 lines): Recursive tree with folder/file icons (code file vs text file by extension). Expand/collapse per directory (auto-expanded depth < 1). Indent guides (vertical lines at each depth level). Git status overlay: filename color-coded by status (M=yellow, A=green, D=red), status letter badge on right. File count badge in header. Context menu: Open File, Copy Path, Copy Relative Path, Reveal in Finder (native integration). Selection highlight with accent border.
- **FileContentViewer**: Opens files from tree selection. Connected via `studio:open-file` custom event.
- **CodeViewer**: Syntax-highlighted file viewer.
- **Command palette file search**: Fuzzy file search with highlighted match characters. Recent files tracking (last 10). File type color coding (TS=accent, JS=yellow, PY=blue, etc.). Keyboard nav (up/down/enter/escape).

### WHAT'S MISSING vs COMPETITORS
- **File search across content** (VS Code Cmd+Shift+F): No global text search. Command palette searches file names only.
- **New file / new folder from tree**: No create actions. Context menu has Open/Copy/Reveal but no New File, New Folder, Rename, Delete.
- **Drag and drop reorder/move**: No file drag-and-drop in tree.
- **File rename inline**: Can't rename files from the tree.
- **File delete**: Can't delete files from the tree.
- **File preview on hover** (Cursor): No hover preview of file contents.
- **File filtering/exclusion**: No way to hide node_modules, .git, etc. from the tree (though the API likely filters these).
- **Multi-select in tree**: No shift-click or cmd-click multi-select.
- **Tree collapse all / expand all**: No toolbar buttons for bulk collapse/expand.
- **Split editor / multiple file tabs**: No tab bar for multiple open files. Single file viewer.

**SCORE: 5/10** -- Functional tree with git status and context menus. Missing CRUD operations, content search, and multi-file editing.

---

## 4. SOURCE CONTROL (staging, commit, push/pull, diff viewer)

### WHAT WE HAVE
- **GitSidebar** (423 lines): Changes list with status badges (M/A/D/?/R/C/U), color-coded. Added/removed line counts per file. Refresh button. Commit textarea with Cmd+Enter shortcut. Commit button. Push/Pull buttons. Status messages (success/error).
- **SourceControlPage**: Full-page source control view accessible from activity bar.
- **DiffDrawer** (86 lines): Slide-out panel (480px wide, right side). File list sidebar (180px) + diff view. Line-by-line diff rendering with color coding (green=added, red=removed, blue=hunk header).
- **DiffPanel**: Reusable diff display used in CheckpointPanel and Run page.
- **DiffViewer**: Another diff visualization component.
- **BranchPicker** (322 lines): Branch switcher in titlebar. Search/filter branches. Create new branch (inline form with name input + create button). Current branch indicator. Keyboard nav (up/down/enter/escape). Error handling for create failures.
- **CheckpointPanel** (459 lines): Manual checkpoint system. Create with optional label. List with status dots (active=yellow, merged=green, abandoned=dim). View diff per checkpoint. Restore (creates new branch). Delete. Prune old (merged/abandoned > 7 days). Confirm dialogs for destructive actions.

### WHAT'S MISSING vs COMPETITORS
- **File staging/unstaging** (VS Code, Emdash): No individual file stage/unstage. Our commit commits everything (no staging area UI). Emdash has per-file checkboxes.
- **Per-hunk staging** (VS Code): No way to stage individual hunks within a file.
- **Inline diff view** (VS Code): Our diff is unified text output. No side-by-side diff mode. No Monaco diff editor.
- **Diff comments/annotations** (Conductor): No inline commenting on diffs. Conductor has full `diff_comments` table with threads, multi-line ranges, resolution tracking. Emdash has `line_comments` table.
- **Stash management** (VS Code): No stash, pop, apply, drop UI.
- **Git graph / timeline** (VS Code): No visual commit history or branch visualization.
- **Merge conflict resolution**: No UI for resolving merge conflicts. Just shows error text.
- **PR creation** (Emdash, Conductor): Titlebar PR button navigates to /source-control but there's no PR creation flow. Emdash AI-generates title + description from diff. Conductor stores PR metadata per workspace.
- **Per-turn auto-checkpointing** (Conductor): Our checkpoint system is manual only. Conductor auto-creates a checkpoint before every user turn.
- **File revert** (Emdash): No way to revert individual files to their last committed state.

**SCORE: 5/10** -- Basic commit/push/pull workflow works. Missing staging, inline commenting, PR creation, auto-checkpoints, and merge resolution.

---

## 5. TERMINAL (tabs, split, profiles, context menu)

### WHAT WE HAVE
- **TerminalTabs** (418 lines): Tab bar with per-tab shell type icon ($, node diamond, python hexagon). Shell picker dropdown (zsh, bash, node, python). Max 8 tabs. Close tab (x button, hidden when single tab). Active tab accent border-bottom. Font size controls (A-/A+, min 12px, max 16px). Clear button (CLR). New terminal (+). Split terminal button. Kill terminal button (red on hover). More actions button (stub). Maximize panel button (stub).
- **TerminalPanel** (187 lines): Container with TERMINAL / OUTPUT tab bar. Maximize/restore toggle. Close button (Cmd+`). Context menu: Copy, Paste, separator, Clear Terminal, New Terminal, separator, Kill Terminal (danger).
- **Terminal**: xterm.js terminal component with lazy loading (code split). PTY via server WebSocket.
- **ResizableDrawer**: Draggable drawer with default 280px height. Terminal lives inside this.
- **CWD tracking**: Terminal CWD bubbled to Shell and injected into chat input.

### WHAT'S MISSING vs COMPETITORS
- **Find in terminal** (Cursor): No Cmd+F search within terminal output. xterm.js search addon exists but not loaded.
- **Terminal link detection** (Cursor): No clickable URLs or file paths in terminal output. xterm web-links addon not loaded.
- **Shell integration decorations** (Cursor): No command status markers in gutter (green check / red X per command). We parse OSC 633 for CWD but don't display decorations.
- **Terminal split pane** (VS Code): "Split Terminal" button exists but just creates a new tab. No actual side-by-side split within the terminal area.
- **Terminal profiles with custom env** (VS Code, Cursor): Shell picker shows 4 hardcoded shells. No custom profiles with args, env, or icons.
- **Terminal rename**: Can't rename tab labels. They show the shell name forever.
- **Terminal drag-and-drop to reorder tabs**: Tabs are fixed order.
- **File drag-and-drop onto terminal** (Emdash): Can't drag files from explorer to terminal to insert path.
- **Big terminal mode** (Conductor): `termBig` state exists and hides chat when active, but there's no explicit UI toggle to switch to "terminal as main pane" mode. The maximize button in TerminalPanel is a stub.

**SCORE: 6/10** -- Working multi-tab terminal with shell picker, font controls, context menu. Missing find-in-terminal, link detection, true split, and custom profiles.

---

## 6. SETTINGS (appearance, git, env, providers, shortcuts)

### WHAT WE HAVE
- **Settings page** (~1600 lines, read from persisted output): 10 sections organized into 4 groups:
  - **Studio**: Appearance (theme picker: dark/light/system, compact density toggle, font size), Chat (system prompt textarea, auto-compact toggle, plan mode default, max turns slider)
  - **Workspace**: Project (project name, dir display), Git (auto-commit toggle, branch naming), Environment (env var display from .env.local + .env), Workspace (multi-workspace settings)
  - **AI**: Providers (detection of 7+ CLI providers with version/path, API key inputs), Scan (format toggles, max tokens slider, watch debounce, auto-rescan)
  - **Integrations**: Claude Code (config display, permission mode), MCP Servers (server list with command/source, source file paths)
- Left nav with section highlighting. Scroll-to-section on click. Section headers with group labels.

### WHAT'S MISSING vs COMPETITORS
- **Settings search** (Cursor, VS Code): No search/filter across settings sections. Have to scroll to find what you need.
- **Keyboard shortcuts customization** (Emdash): All our shortcuts are hardcoded. Emdash has full shortcut editor with conflict detection.
- **Per-workspace settings** (VS Code, Cursor): No project-level settings that override global. Everything is global.
- **Custom API base URL** (Conductor): `anthropic_base_url`, `anthropic_auth_token` settings exist in Conductor for enterprise/proxy. We have no base URL override.
- **Environment variable injection** (Conductor): We display env vars but don't let users add custom env vars for Claude sessions. Conductor injects `claude_env_vars` into spawned processes.
- **HTTP proxy setting** (Conductor): No proxy configuration for API calls.
- **Cloud provider auth** (Conductor): No AWS Bedrock profile or Google Vertex project ID settings.
- **Notification settings** (Emdash): No notification preferences (sound, focus mode, master enable). We have Web Notification permission request but no settings UI.
- **Import/export settings**: No way to export or import settings.
- **Reset to defaults**: No reset button per section or globally.

**SCORE: 6/10** -- Comprehensive 10-section settings with provider detection and MCP display. Missing search, customizable shortcuts, per-workspace overrides, and enterprise auth.

---

## 7. COMMAND PALETTE (file search, commands, recent)

### WHAT WE HAVE
- **CommandPalette** (729 lines): Two modes -- file search (Cmd+P) and command mode (Cmd+K or Cmd+Shift+P or type ">" in file mode).
- **File mode**: Fuzzy search with highlighted match characters. File type icons with extension-based coloring. Directory path display. Recent files section (last 10, persisted to localStorage). File cache for instant reopening. 20 result limit.
- **Command mode**: 18 static commands across 2 sections (Navigation: 9, Actions: 9). Each has icon, label, description, optional keybind pill. Commands: navigate to all views, new session, toggle terminal, open project, toggle thinking, toggle plan, refresh git, open diff, toggle theme.
- **UI**: Fixed position overlay (18% from top, 600px wide). Blur backdrop. Keyboard nav (up/down/enter/escape). Footer hint showing mode switch instructions. Focus on open.

### WHAT'S MISSING vs COMPETITORS
- **Symbol search** (VS Code "@"): No go-to-symbol mode. Menu has "Go to Symbol" (Cmd+Shift+O) but it just opens command palette.
- **Line number search** (VS Code ":"): No go-to-line mode. Menu has "Go to Line" (Ctrl+G) but it just opens command palette.
- **MRU (most recently used) commands**: Commands are in fixed order. VS Code sorts by recent usage.
- **Extension/plugin commands**: No dynamic commands from plugins or MCP servers.
- **Workspace commands** (VS Code): No workspace-specific commands (add folder, remove folder, etc.).
- **Task commands** (VS Code): No run task / configure task commands.
- **Source control commands**: No git commands accessible from palette (commit, push, pull, stash, etc.).
- **Settings search integration**: Can't search settings from command palette.

**SCORE: 7/10** -- Solid dual-mode palette with fuzzy file search and recent files. Missing symbol/line search, dynamic commands, and MRU sorting.

---

## 8. AGENT MANAGEMENT (list, run, edit, delete, multi-agent)

### WHAT WE HAVE
- **Agents page** (~2600 lines, read from persisted output): Full agent management. Agent cards with status state machine (7 states: idle, starting, running, done, error, stopped, interrupted). Department grouping with color coding (engineering=blue, product=purple, design=pink, etc.). Agent detail viewer (sidebar). Run agent with task description. Multi-agent orchestration.
- **AgentCard**: Shows agent name, description, department badge, status indicator, run/stop buttons.
- **Run page** (842 lines): Single-agent task runner. Textarea with recent tasks dropdown (localStorage, max 10). Agent selector with department grouping. Mode cards (Explore = read-only, Execute = write + commit). SSE streaming output with blinking cursor. Elapsed timer. Cancel button. Done banner with diff view, run again, share (copy task), new run actions. Merge conflict handling.
- **Swarm page**: Multi-agent parallel task execution. Multiple agents work simultaneously.
- **Home page** (839 lines): Dashboard with stat cards (agent count, context health/freshness, project size). Quick actions (Scan, Run agent, Launch swarm, View history). Recent runs list with status dots. Agent roster by department. Folder picker with path input fallback.
- **Agent suggestion chip**: In ChatInputBar, auto-suggests relevant agent based on query text. Routes to best match with score threshold (0.3).

### WHAT'S MISSING vs COMPETITORS
- **Agent creation/editing UI** (Emdash): No UI to create or edit agent definitions. Agents come from .claude/agents/ files on disk. No visual editor.
- **Agent versioning/history**: No tracking of agent definition changes over time.
- **Multi-agent comparison view**: Swarm shows parallel runs but no side-by-side output comparison or diff between agent results.
- **Agent marketplace/catalog** (Emdash): No browse/install agents from a catalog. Emdash has MCP server catalog and skills view.
- **Per-agent model override**: Can't set different models per agent. All use the globally selected model.
- **Agent scheduling/cron** (Conductor): No scheduled/recurring agent tasks.
- **Run history detail view**: History page exists but no individual run detail page with full output, diff, cost breakdown.

**SCORE: 8/10** -- Rich agent system with state machine, department grouping, swarm orchestration, smart routing. Missing creation UI, marketplace, and scheduling.

---

## 9. SESSION MANAGEMENT (create, switch, resume, delete)

### WHAT WE HAVE
- **SessionsSidebar** (568 lines): Session list grouped under workspace. Workspace row shows project name, branch, +/- line counts, collapse chevron, letter avatar with color. Session rows with status dots: green=active, yellow=streaming (pulsing animation), dim=inactive. Keyboard shortcut hints (Cmd+1-9) on hover. Context menu: Rename (inline prompt dialog), Duplicate, separator, Delete (confirm dialog). Workspace context menu: Open in Finder, Copy Path, separator, Remove. New session button (+). Auto-refresh every 8 seconds (pauses when tab not visible).
- **Shell session management**: Auto-creates session on mount. Persists active session ID to localStorage. Session switching via custom event or direct prop callback. Max 9 sessions shown.
- **Pending message recovery**: ChatInputBar checks for pending (unsent) messages from crashed turns. Shows warning bar with preview and dismiss button.

### WHAT'S MISSING vs COMPETITORS
- **Session resume after app restart** (Conductor): Sessions die on app restart. No `--resume <session_id>` flag passthrough. Conductor stores resume point and reconnects.
- **Session search/filter**: Can't search through sessions by title or content.
- **Session pinning** (Conductor): No `pinned_at` to pin important sessions to top.
- **Session archiving** (Emdash, Conductor): No archive. Delete is permanent. Conductor has `is_hidden` soft delete. Emdash has archive/restore.
- **Session forking/branching**: Can't fork a session at a specific message to explore different paths.
- **Session export**: Can't export session history as markdown or JSON.
- **Session tags/labels**: No tagging or categorization of sessions.
- **Unread indicator per session** (Conductor): No visual badge when a background session has new activity.
- **Idle session eviction** (Conductor): All sessions kept alive. Conductor evicts after 30 min idle, max 5 concurrent.
- **Session compaction awareness** (Conductor): No `is_compacting` flag. During compaction, messages can be lost if user sends while compacting.

**SCORE: 5/10** -- Basic CRUD with context menus and live status. Critical gaps: no resume after restart, no archive, no session search.

---

## 10. KEYBOARD SHORTCUTS (what's wired, what's missing)

### WHAT WE HAVE
- **useKeyboardNav** (157 lines): Main shortcut handler.
  - **Navigation (g+key)**: g s (Chat), g f (Files), g a (Agents), g g (Git), g r (Run), g c (Company). 1-second timeout for second key.
  - **UI toggles**: Cmd+` or Cmd+J (terminal), Cmd+B (sidebar)
  - **Palette**: Cmd+P (file search), Cmd+K or Cmd+Shift+P (command mode)
  - **Views**: Cmd+Shift+E (Explorer), Cmd+Shift+G (Source Control), Cmd+Shift+A (Agents), Cmd+, (Settings)
  - **Other**: ? (shortcuts help overlay), Escape (close shortcuts)
  - **Chat**: Cmd+L (focus chat input, in ChatInputBar)
- **Electron menu shortcuts**: Cmd+Shift+N (new window), Cmd+Shift+O (open project), Cmd+Shift+D (start agent), Cmd+Shift+F5 (stop agent), Cmd+Shift+B (run scan), Cmd+\\ (split terminal), Cmd+F (find), Cmd+G / Cmd+Shift+G (find next/prev), Ctrl+G (go to line), Ctrl+- / Ctrl+Shift+- (back/forward), standard Edit menu (undo/redo/cut/copy/paste), zoom (Cmd+=/Cmd+-/Cmd+0), fullscreen (Ctrl+Cmd+F), Cmd+Option+I (devtools), Cmd+Shift+R (reload)
- **ShortcutsHelp** (118 lines): Modal overlay showing all shortcuts in 5 sections: Navigation, UI Toggles, Focus, Views, Other. Dismissed with Escape or ?.

### WHAT'S MISSING vs COMPETITORS
- **Customizable shortcuts** (Emdash): All shortcuts hardcoded. Emdash stores shortcuts in settings with conflict detection and UI for rebinding.
- **Cmd+1-9 for session switching**: Hinted in SessionsSidebar UI but NOT actually wired in useKeyboardNav. Dead hints.
- **Cmd+W (close tab)**: Not wired to anything useful in renderer. Menu sends Cmd+W to close window, not close active tab/panel.
- **Cmd+Shift+[/] (cycle tabs)**: No tab cycling shortcuts for terminal tabs or session tabs.
- **Cmd+/ (toggle comment)**: Not relevant since we don't have a code editor, but menu mention missing.
- **Escape priority chain** (Emdash): We close shortcuts overlay on Escape, but no priority chain for: command palette > diff drawer > shortcuts > terminal. Multiple overlays can fight for Escape.
- **Chord shortcuts (Cmd+K Cmd+S)**: No two-chord shortcuts beyond g+key.

**SCORE: 6/10** -- Good coverage of navigation and toggles. Missing customization, some advertised shortcuts are dead, no Escape priority chain.

---

## 11. CONTEXT MENUS (where they exist, where they're missing)

### WHAT WE HAVE
- **ContextMenu component** (220 lines): Reusable component with position clamping (keeps menu in viewport), keyboard nav (up/down/enter/escape), separator support, icon support, danger style (red text, red background on hover), role="menu" / role="menuitem" accessibility. Focus tracking with hover/keyboard.
- **Locations with context menus**:
  - Chat messages: user (Copy Text), assistant (Copy Text, Copy as Markdown, separator, Retry)
  - Session rows: Rename, Duplicate, separator, Delete (danger)
  - Workspace row: Open in Finder, Copy Path, separator, Remove (danger)
  - File tree: Open File, separator, Copy Path, Copy Relative Path, separator, Reveal in Finder
  - Terminal panel: Copy, Paste, separator, Clear Terminal, New Terminal, separator, Kill Terminal (danger)

### WHAT'S MISSING vs COMPETITORS
- **Tab context menus**: No right-click menu on terminal tabs (rename, move, duplicate, close all, close others).
- **Status bar context menus**: No right-click on status bar items to access related settings.
- **Activity bar context menus**: No right-click to hide/show activity bar items or reorder them.
- **Diff context menus**: No right-click in diff view (copy line, stage hunk, revert change, open file).
- **Agent card context menus**: No right-click on agent cards (run, edit, duplicate, disable).
- **Branch picker context menus**: No right-click on branches (delete branch, rename, set upstream).
- **Checkpoint context menus**: Actions are inline buttons, not context menu. Inconsistent pattern.

**SCORE: 6/10** -- Good reusable ContextMenu component deployed in 5 locations. Missing from tabs, status bar, diff view, agent cards, and branch picker.

---

## 12. ERROR HANDLING (what happens when things fail)

### WHAT WE HAVE
- **Session creation failure**: Red error text with Retry button in Shell main content area.
- **Stream interruption**: Toast notification "Stream interrupted" (error type). Partial text preserved on error (not cleared).
- **Chat send failure**: Toast "Failed to send message" (error type).
- **Session creation for chat**: Toast "Failed to create session" (error type).
- **Git operations**: Push/pull/commit show error messages via toast or inline status text. GitSidebar shows "Failed to fetch" state.
- **File tree load failure**: Silent catch, shows empty tree.
- **Branch create failure**: Error text below input in BranchPicker.
- **Checkpoint operations**: Toast messages for save/restore/prune failures. ConfirmDialog for destructive actions.
- **Run page**: Red error box with pre-wrapped error text. Phase transitions to "done" state on error.
- **Toast system**: Fixed bottom-right stack. 3 types (info, error, success). Auto-dismiss after 4 seconds. Fade-in animation.
- **Pending message safety**: ChatInputBar checks `/api/sessions/:id/pending` for unsent messages from crashed turns. Shows warning bar.

### WHAT'S MISSING vs COMPETITORS
- **Automatic retry with backoff**: No auto-retry on transient failures. Every error requires manual user action.
- **Connection status indicator**: No visible indicator when the Hono server is unreachable. Requests silently fail.
- **Error boundary components**: No React error boundaries. A component crash shows white screen.
- **Offline mode detection**: No detection of network connectivity loss.
- **Rate limit handling**: No specific handling for API rate limits (429 responses).
- **Session recovery after crash** (Conductor): No automatic session recovery. Conductor's `pending_message` + `resume_session_at` handles this.
- **Error logging/reporting**: No error tracking service. Conductor uses PostHog, Emdash uses separate error tracking.
- **Graceful degradation**: When git operations fail, the entire sidebar shows error state with no partial data.

**SCORE: 5/10** -- Basic error display (toasts, inline messages, error states). Missing auto-retry, connection monitoring, error boundaries, and session recovery.

---

## 13. NATIVE APP FEATURES (dock, notifications, auto-update, window state)

### WHAT WE HAVE
- **Electron main** (590 lines): BrowserWindow with hidden titlebar, traffic lights at (13,8), vibrancy: "under-window", dark background (#0d1117). Min size 900x600.
- **Window state persistence**: Saves x, y, width, height, maximized to `~/.hashmark/studio-config.json`. Restores on launch. Debounced save (500ms) on resize/move.
- **Dock icon**: Custom icon set on macOS via `app.dock.setIcon()`.
- **Native menu**: 9 menu categories (hashmark, File, Edit, Selection, View, Go, Run, Terminal, Window, Help) with 50+ menu items, all with proper accelerators.
- **Native dialogs**: File picker via `dialog.showOpenDialog` for project selection.
- **IPC bridge**: 5 preload APIs (showInFinder, openExternal, pickFolder, getProjectDir, setProjectDir, getRecentProjects). Menu event subscription system with unsubscribe.
- **Recent projects**: Persisted list (max 10) in config file. New project adds to front.
- **Auto-updater**: `electron-updater` imported dynamically. `checkForUpdatesAndNotify()` on launch in production. Manual check via Help > Check for Updates menu.
- **External link handling**: All external URLs opened in system browser via `shell.openExternal()`.
- **Graceful shutdown**: `before-quit` kills child processes (PTY sessions) via `pkill -P` to prevent SIGABRT.
- **OS notifications**: Web Notification API used when agent finishes while app is backgrounded. Permission requested on mount.
- **Project dir resolution**: Checks env > config file > sentinel. Loads .env.local and .env from project dir.

### WHAT'S MISSING vs COMPETITORS
- **Tray icon** (Conductor): No system tray icon. Conductor has tray with menu.
- **Deep link handler** (Conductor): No URL scheme registration (e.g., `hashmark://`). Conductor has `conductor://`.
- **Auto-update UI notifications**: Update check happens silently. No in-app banner or toast when update is available. Conductor shows update dialog.
- **Multiple windows management**: Can create new windows (Cmd+Shift+N) but each is independent. No project association per window.
- **Splash screen / loading screen**: No loading indicator while Hono server starts. If server isn't ready, shows load error then retries after 1s.
- **Custom protocol handler**: No registration of hashmark:// or similar protocol.
- **Badge count on dock** (Conductor): No dock badge for unread notifications.
- **App certificate / notarization details**: Not visible from code but likely needed for distribution.

**SCORE: 7/10** -- Solid native integration with window state, menu system, auto-updater, OS notifications, graceful shutdown. Missing tray icon, deep links, and update UI.

---

## 14. VISUAL POLISH (spacing, colors, fonts, animations, consistency)

### WHAT WE HAVE
- **Design system**: CSS variables for all colors (--bg, --bg-2, --bg-3, --bg-4, --text, --text-dim, --text-dimmer, --accent, --red, --yellow, --blue, --cyan, --border, --border-dim). Semantic naming.
- **Typography**: Two font families: `--font` (monospace) and `--font-ui` (system UI). Consistent font sizes: 10px labels, 11px secondary, 12px body, 13px primary, 14px headings.
- **Animations**: fadeIn (0.2s ease), spin (1s linear infinite for loading), cursor-blink (1s step-end), pulse (1.2s for streaming dots), session-dot-pulse (1.5s for streaming sessions), dropdown-animate (CSS class for menu animations).
- **Hover states**: Consistent hover pattern across all interactive elements. Background changes on hover. Color transitions (0.1s ease). Explicit onMouseEnter/onMouseLeave handlers (no CSS hover, which is correct for Electron).
- **Border radius**: `--radius`, `--radius-sm`, `--radius-lg` tokens used consistently.
- **Spacing**: Consistent padding patterns (8px, 10px, 12px, 14px, 16px, 20px, 24px, 28px, 32px). Gap values follow similar scale.
- **Icon system**: Lucide React icons throughout. Consistent sizing (10-20px range).
- **Loading states**: Skeleton loaders (SkeletonLine, SkeletonBlock, SkeletonCard). Spinner animations for async operations.
- **Status colors**: Consistent status palette (accent=success, yellow=warning, red=error, blue=info, text-dimmer=inactive).
- **Dark/light themes**: Full theme support via `useTheme` hook and data-theme attribute on HTML. Settings page theme picker.

### WHAT'S MISSING vs COMPETITORS
- **Inline styles vs CSS modules**: Everything uses inline styles (React CSSProperties objects). No CSS modules, no CSS-in-JS library. This means no pseudo-classes (:hover, :focus-visible), no media queries, no complex selectors. Hover states are all manually managed with onMouseEnter/onMouseLeave. This is fragile and verbose.
- **Focus-visible indicators**: Keyboard focus is invisible on most interactive elements. No `:focus-visible` outlines. Accessibility concern.
- **Transition consistency**: Some elements have transitions, others don't. No global transition standard.
- **Empty states**: Some views have proper empty states (FileTreeSidebar: "No files found", GitSidebar: "Working tree clean"), others show nothing.
- **Responsive behavior**: Min width set at 900px. No responsive breakpoints below that. Sidebar widths are fixed percentages/pixels.
- **Motion reduction**: No `prefers-reduced-motion` media query support. Animations play regardless of OS setting.
- **Icon consistency**: Mix of Lucide icons and inline SVGs (CollapseChevron in SessionsSidebar). Some custom emoji icons in action cards.
- **Color contrast**: Most text uses --text-dim or --text-dimmer which may not meet WCAG contrast ratios in light theme.
- **Compact density**: Settings mentions compact density toggle but visual impact unclear.

**SCORE: 6/10** -- Consistent design tokens, good hover states, proper loading skeletons. Weakened by inline-only styles (no pseudo-classes), missing focus indicators, and no reduced motion support.

---

## CATEGORY SUMMARY

| # | Category | Score | Status |
|---|----------|-------|--------|
| 1 | Shell Chrome | 7/10 | Good layout, missing right sidebar + breadcrumbs |
| 2 | Chat UX | 7/10 | Rich features, missing inline diff display + code copy |
| 3 | File Explorer | 5/10 | Read-only tree, no CRUD, no content search |
| 4 | Source Control | 5/10 | Basic commit/push/pull, no staging, no PR creation |
| 5 | Terminal | 6/10 | Multi-tab works, missing find + links + true split |
| 6 | Settings | 6/10 | 10 sections, missing search + customizable shortcuts |
| 7 | Command Palette | 7/10 | Dual-mode with fuzzy search, missing symbol/line modes |
| 8 | Agent Management | 8/10 | Strong system with state machine + swarm, missing creation UI |
| 9 | Session Management | 5/10 | Basic CRUD, critical gap: no resume after restart |
| 10 | Keyboard Shortcuts | 6/10 | Good coverage, not customizable, some dead shortcuts |
| 11 | Context Menus | 6/10 | Good component, deployed in 5 locations, missing from tabs/diff/agents |
| 12 | Error Handling | 5/10 | Basic display, no auto-retry, no error boundaries |
| 13 | Native App Features | 7/10 | Window state + menu + auto-updater + notifications, missing tray + deep links |
| 14 | Visual Polish | 6/10 | Consistent tokens, all inline styles, no focus indicators |

**OVERALL: 6.1/10**

---

## TOP 20 GAPS BY PRIORITY

### P0 -- Ship Blockers (without these, product feels broken)

| # | Gap | Effort | Notes |
|---|-----|--------|-------|
| 1 | Session resume after app restart | M | Users lose all context on quit/crash. Conductor uses `--resume`. |
| 2 | Per-turn auto-checkpointing | M | Undo last agent action. Conductor auto-checkpoints before every turn. |
| 3 | Error boundaries (React) | S | Any component crash = white screen. Need boundary at page/section level. |
| 4 | Cmd+1-9 session switching | S | Hint shown in UI but not wired. Dead shortcut. |

### P1 -- Must-Have for Competitive Parity

| # | Gap | Effort | Notes |
|---|-----|--------|-------|
| 5 | File staging/unstaging | M | No staging area. Commits everything. Basic git workflow gap. |
| 6 | Find in terminal (Cmd+F) | S | xterm search addon exists, just not loaded. |
| 7 | Code block copy button | S | One-click copy on assistant code blocks. |
| 8 | PR creation flow | L | AI-generate title + desc from diff, create via GitHub API. |
| 9 | Settings search | S | Search/filter across all 10 settings sections. |
| 10 | Content search (Cmd+Shift+F) | M | Search file contents across project. |
| 11 | File CRUD in tree | M | New file, new folder, rename, delete from context menu. |
| 12 | Per-hunk / per-file accept/reject | M | After agent edits, approve or reject individual changes. |
| 13 | Terminal link detection | S | Clickable URLs and file paths. Load xterm web-links addon. |
| 14 | Focus-visible indicators | S | Keyboard focus outlines on all interactive elements. |

### P2 -- Should-Have for Differentiation

| # | Gap | Effort | Notes |
|---|-----|--------|-------|
| 15 | MCP server injection for agent context | L | Agent sees workspace diff + terminal output. Conductor feature. |
| 16 | Inline diff commenting | L | Comments on specific file:line in diffs, injected into agent prompt. |
| 17 | Customizable keyboard shortcuts | M | Full shortcut editor with conflict detection. |
| 18 | Agent creation/editing UI | M | Visual editor for .claude/agents/ definitions. |
| 19 | Issue tracker integration | L | GitHub Issues / Linear selector, auto-linked to PRs. |
| 20 | Browser preview pane | L | Electron BrowserView for dev server. Port auto-discovery. |

---

## WHAT WE DO BETTER THAN COMPETITORS

Things that are unique to hashmark studio or executed better than competitors:

1. **Context intelligence**: ContextBar with token flow visualization (your msgs / history / responses), structural waste estimate (dead tool output, unused schemas, static re-sends), loop detection with pattern analysis. No competitor has this level of context visibility.

2. **Drift detection**: DriftIndicator monitors CLAUDE.md freshness against recent commits. No competitor tracks context file staleness.

3. **Context heatmap**: Section-level hit tracking to see which parts of context are actually being used. Unique feature.

4. **Multi-provider model bar**: 7+ provider detection (Claude, Codex, Gemini, Aider, Amp, Goose, Copilot) with installed/not-installed indicators and install links. Auto-routing based on message complexity. Conductor only supports Claude + Codex.

5. **Agent routing chip**: Smart agent suggestion in chat input based on query text + current file. Auto-suggests which specialized agent to use. No competitor has this.

6. **Voice input**: Web Speech API integration for voice-to-text in chat. Neither Conductor nor Emdash has this.

7. **Slash command system**: 14 built-in commands + dynamic agent commands from .claude/agents/ files. Grouped by category (Claude, Mode, Studio). Competitor Conductor only has basic slash commands through Claude Code's built-in ones.

8. **Department-organized agents**: Agent cards grouped by department with color coding, stat cards, freshness tracking, and AI readiness score. More structured than Emdash's flat agent list.

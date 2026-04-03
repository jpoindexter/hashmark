# Shell Overhaul Design Spec

> hashmark studio shell -- VS Code structure + Conductor agent-first workflow + Grove design system.
> Based on competitive audit of VS Code, Conductor, emdash, and Warp.

---

## 1. Product Context

hashmark studio is an agent orchestration platform, not a code editor. The hierarchy:

1. **Chat/orchestration** (primary) -- always visible, always accessible
2. **Agent management** (secondary) -- browse, run, coordinate agents
3. **Code/files** (tertiary) -- view code agents are working on, review diffs

The shell uses VS Code's proven layout structure but prioritizes chat-first content.

---

## 2. Shell Layout

```
+-------------------------------------------------------------+
| TITLEBAR (35px) -- three-column, Grove tokens                |
| [70px traffic lights] [breadcrumb center] [actions right]    |
+----+----------+---------------------------------------------+
| A  | SIDEBAR  | MAIN CONTENT                                |
| C  | PANEL    |                                              |
| T  | (240px,  |  Context-dependent:                          |
| I  | resize-  |  - Chat view (home, default)                 |
| V  | able)    |  - File explorer                             |
| I  |          |  - Source control / diffs                     |
| T  | Content  |  - Agent grid                                |
| Y  | switches |  - Run/swarm output                          |
|    | per      |  - Generate wizard                           |
| B  | active   |  - Governance policies                       |
| A  | icon     |  - Settings                                  |
| R  |          +---------------------------------------------+
|    |          | TERMINAL DRAWER (resizable, bottom)           |
|48px|          +---------------------------------------------+
|    |          | INPUT BAR (always visible, full-width)        |
|    |          +---------------------------------------------+
|    |          | MODEL BAR (Sonnet 4.6 | Thinking | Plan)     |
+----+----------+---------------------------------------------+
| STATUS BAR (22px) -- Grove green, branch + project info      |
+-------------------------------------------------------------+
```

The input bar and model bar are always visible regardless of which view is active. Chat history expands upward from the input bar when the Chat view is active.

---

## 3. Design Token System (Grove)

All components use CSS custom properties from `tokens.css`. No hardcoded colors or dimensions in component code.

### Colors

```css
/* Backgrounds -- darkest to lightest */
--bg:          #0d1117;
--bg-2:        #161b22;
--bg-3:        #1c2128;
--bg-4:        #21262d;

/* Borders */
--border:      #30363d;
--border-dim:  #21262d;

/* Text */
--text:        #e6edf3;
--text-dim:    #8b949e;
--text-dimmer: #484f58;

/* Brand (hashmark green) */
--accent:        #3fb950;
--accent-dim:    #2ea043;
--accent-bg:     rgba(63, 185, 80, 0.08);
--accent-border: rgba(63, 185, 80, 0.2);

/* Semantic */
--blue:     #388bfd;
--blue-bg:  rgba(56, 139, 253, 0.10);
--red:      #f85149;
--red-bg:   rgba(248, 81, 73, 0.10);
--yellow:   #d29922;
--yellow-bg: rgba(210, 153, 34, 0.10);
```

### Typography

```css
--font:    'JetBrains Mono', 'Fira Code', Menlo, monospace;
--font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

| Use | Size | Weight | Font |
|-----|------|--------|------|
| Section headers (uppercase) | 11px | 600 | --font-ui |
| Body / labels | 12px | 400 | --font-ui |
| Message text / code | 13px | 400 | --font |
| Large headings | 14px | 600 | --font-ui |
| Status bar | 12px | 400 | --font-ui |

### Spacing Constants

| Component | Value | Source |
|-----------|-------|--------|
| Titlebar height | 35px | VS Code `DEFAULT_CUSTOM_TITLEBAR_HEIGHT` |
| Activity bar width | 48px | VS Code `ActivitybarPart` |
| Activity bar item height | 48px | VS Code `ACTIVITY_BAR_ACTION_HEIGHT` |
| Activity bar icon size | 20px | Lucide (VS Code uses 24px codicons) |
| Sidebar panel title | 35px | VS Code `.part > .title` |
| Sidebar tree item | 22px | VS Code compact tree |
| Sidebar section header | 22px | VS Code viewlet collapsible |
| Status bar height | 22px | VS Code `StatusbarPart.HEIGHT` |
| Tab height | 35px | VS Code editor tabs |
| Panel tab height | 29px | VS Code panel tabs |
| Input height | 26px | VS Code input |
| Mac traffic light zone | 70px | VS Code `window-controls-container` |
| Toolbar action gap | 4px | VS Code `.actions-container` |

### Border Radius

| Token | Value | Used for |
|-------|-------|----------|
| --radius | 4px | Buttons, inputs, dropdowns |
| --radius-sm | 3px | Badges, icon buttons |
| --radius-lg | 6px | Cards, modals, containers |

### Transitions

| Effect | Value |
|--------|-------|
| Status bar bg | 0.15s ease-out |
| Sidebar collapse | 0.18s ease |
| Hover color | 0.1s ease |
| Resize handle | none (instant) |

---

## 4. File Structure

```
client/src/
  styles/
    tokens.css              -- Grove CSS custom properties
    reset.css               -- Base reset, body, scrollbar styles

  components/
    shell/
      Shell.tsx             -- Root layout (flex column, <150 lines)
      Titlebar.tsx          -- 35px, three-column, breadcrumb, actions
      ActivityBar.tsx       -- 48px icon rail, active indicator
      SidebarPanel.tsx      -- Resizable wrapper, delegates to content
      SidebarResize.tsx     -- Draggable sash (1px visible + 4px hit)
      StatusBar.tsx         -- 22px, Grove green, left/right items
      ModelBar.tsx          -- Model selector, thinking toggle, plan mode

    chat/
      ChatMessages.tsx      -- (existing, enhanced)
      ChatInputBar.tsx      -- (existing, stays)
      MessageBlock.tsx      -- Single message renderer (type dispatch)
      ToolCallRow.tsx       -- Wrench icon + tool name, collapsible
      ThinkingBlock.tsx     -- Brain icon + amber, collapsible preview
      AgentBlock.tsx        -- Bot icon + description
      ToolSummary.tsx       -- "23 tool calls, 2 subagents" header

    sidebar/
      SessionsSidebar.tsx   -- Workspaces + sessions (Chat view)
      FileTreeSidebar.tsx   -- File tree (Explorer view)
      GitSidebar.tsx        -- Changed files (Source Control view)
      AgentsSidebar.tsx     -- Agent roster (Agents view)
      RunsSidebar.tsx       -- Active runs + history (Run view)

    shared/
      IconButton.tsx        -- Ghost button (22x22, Grove tokens)
      Badge.tsx             -- Status badge component
      ScrollToBottom.tsx    -- Sticky "scroll to bottom" button
```

### What stays as-is

These existing components are NOT rewritten. They render inside the new shell:

- `ChatMessages.tsx` -- enhanced with new message block types
- `ChatInputBar.tsx` -- stays, model bar added below it
- `TerminalTabs.tsx` -- stays, renders in terminal drawer
- `CommandPalette.tsx` -- stays
- `ResizableDrawer.tsx` -- stays for terminal
- `ContextBar.tsx` -- stays
- All page components (Home, Files, Git, Agents, Run, etc.) -- stay

### What gets replaced

- `Layout.tsx` -- replaced by `Shell.tsx` + shell components
- `ActivitySidebar.tsx` -- replaced by `SidebarPanel.tsx` + sidebar content components

---

## 5. Component Specs

### 5.1 Shell.tsx (root orchestrator)

Responsibility: Flex column layout, state management for sidebar/terminal/active view.

```
<div style flex-column, height 100vh, bg --bg>
  <Titlebar />
  <div style flex-row, flex 1>
    <ActivityBar activeView onViewChange />
    <SidebarPanel view width onResize />
    <SidebarResize />
    <div style flex-column, flex 1>
      <main>{content based on activeView}</main>
      <ResizableDrawer>{terminal}</ResizableDrawer>
      <ChatInputBar />
      <ModelBar />
    </div>
  </div>
  <StatusBar />
</div>
```

State managed here:
- `activeView` (which activity bar icon is selected)
- `sidebarOpen` + `sidebarWidth` (persisted to localStorage)
- `termOpen` + `termHeight` (persisted)
- `activeSessionId` (persisted)
- `streaming` state
- Project info, git status, drift state

### 5.2 Titlebar.tsx

Height: 35px. Background: `--bg-2`. Border-bottom: 1px solid `--border-dim`.
Drag region: `-webkit-app-region: drag` on container, `no-drag` on interactive children.

```
LEFT (paddingLeft: 70px for traffic lights):
  [sidebar toggle button]
  [project name text]
  [> separator]
  [branch picker with search dropdown]
  [changes badge if > 0]

CENTER (flex, justify center):
  empty for now (command center future)

RIGHT (justify flex-end, paddingRight 8px):
  [route badge showing current view name]
```

Font: 12px `--font-ui`. Text color: `--text-dim`.
Buttons: ghost style (22x22, no bg, `--text-dimmer`, hover `--text`).

### 5.3 ActivityBar.tsx

Width: 48px. Background: `--bg-2`. Border-right: 1px solid `--border-dim`.

Each item:
- Height: 48px, width: 48px
- Icon: 20px Lucide
- Active: `border-left: 2px solid --accent`, `color: --text`
- Inactive: `border-left: 2px solid transparent`, `color: --text-dimmer`
- Hover: `color: --text-dim`

Top section (navigation, flex-grow 1):
1. MessageSquare `/` -- Chat
2. FolderTree `/files` -- Explorer
3. GitCompare `/source-control` -- Source Control
4. Bot `/agents` -- Agents
5. PlayCircle `/run` -- Run
6. Zap `/generate` -- Generate
7. Shield `/governance` -- Governance

Bottom section (utility, flex-shrink 0):
8. Settings `/settings` -- Settings

The active item is determined by the current route, not by click state. `NavLink` with `isActive` drives the visual indicator.

### 5.4 SidebarPanel.tsx

Width: controlled by parent (default 240px, min 170px, max 50% of window).
Background: `--bg-2`. Border-right: 1px solid `--border-dim`.

Header: 35px, 11px uppercase `--text-dim`, `font-weight: normal`, `letter-spacing: 0.08em`.

Content rendered based on `activeView` prop:

| View | Title | Content Component |
|------|-------|-------------------|
| Chat | "Sessions" | `SessionsSidebar` |
| Explorer | "Explorer" | `FileTreeSidebar` |
| Source Control | "Source Control" | `GitSidebar` |
| Agents | "Agents" | `AgentsSidebar` |
| Run | "Runs" | `RunsSidebar` |
| Generate | "Generate" | Simple scan target list |
| Governance | "Policies" | Simple policy list |
| Settings | (hidden) | Sidebar collapses, settings fills main |

Collapse: CSS width transition to 0 (0.18s ease), overflow hidden.

### 5.5 SidebarResize.tsx

A draggable sash between sidebar and main content.

Visual: 1px wide, `--border-dim` color, full height.
Hit area: 4px wide (2px each side of the visual line).
Cursor: `col-resize`.
Hover: `--border` color (brighter).
Drag: Updates `sidebarWidth` state, clamped to min 170px / max 50%.
Width persisted to localStorage.

### 5.6 StatusBar.tsx

Height: 22px. Background: `--accent` (#3fb950). Color: rgba(0,0,0,0.8).
Font: 12px `--font-ui`. `font-variant-numeric: tabular-nums`.
Mac bottom radius: 10px (16px on Tahoe+).
Transition: `background-color 0.15s ease-out`.

```
LEFT:
  [GitBranch 11px] branch-name  [+N changes if > 0]

RIGHT:
  [model name] Sonnet 4.6  [project name]
```

Items: `padding: 0 5px`, `margin: 0 3px`, hover `rgba(0,0,0,0.12)`.

### 5.7 ModelBar.tsx

Height: ~32px. Background: `--bg-2`. Border-top: 1px solid `--border-dim`.
Full width below input bar.

```
LEFT (flex, gap 4px):
  [sparkle icon] "Sonnet 4.6"     -- click opens model dropdown
  [brain icon] "Thinking"         -- toggle, --accent when active
  [clipboard icon] "Plan"         -- toggle plan mode

RIGHT (flex, gap 4px):
  [+ button]                      -- attach files
  [send button]                   -- up-arrow in circle
```

Model dropdown (on click):
- Opus 4.6 1M
- Opus 4.6
- Sonnet 4.6 (default, checkmark)
- Haiku 4.5

### 5.8 SessionsSidebar.tsx (replaces ActivitySidebar.tsx)

Shows workspaces with nested sessions. Follows Conductor pattern:

Section header: "Workspaces" (22px, bold uppercase, `--text-dim`).
Plus button in header for adding workspace.

Workspace row (22px):
- Collapse chevron (16x16 SVG)
- Letter avatar (16x16, colored bg, first letter)
- Workspace name (13px, `--text`)
- Branch name (11px, `--text-dimmer`, truncated)
- Diff stats if present (+N green, -M red, 10px mono)

Session row (22px, indented 28px):
- Status dot (6px): `--yellow` = running, `--blue` = active, `--text-dimmer` = idle
- Session title (13px, single line, ellipsis)
- Keyboard shortcut (10px, `--text-dimmer`, on hover)

No bottom action bar. Settings is in activity bar. Add is in section header.

### 5.9 Chat Message Types

`MessageBlock.tsx` dispatches rendering based on message part type:

| Type | Component | Icon | Color | Behavior |
|------|-----------|------|-------|----------|
| User message | Inline | None | Right-aligned `--bg-4` pill | Static |
| Assistant text | Inline | None | Left-aligned markdown | Streaming |
| Thinking | `ThinkingBlock` | Brain (16px) | `--yellow` | Collapsible, mono preview |
| Tool call | `ToolCallRow` | Wrench (14px) | `--text-dimmer` | Collapsible I/O |
| Agent dispatch | `AgentBlock` | Bot (14px) | `--blue` | Description text |
| Skill activation | Inline | RefreshCw (14px) | `--text-dim` | Name + "activated" badge |
| Tool summary | `ToolSummary` | ChevronDown (14px) | `--text-dimmer` | Collapsible, stats + icon row |
| Error | Inline | AlertTriangle (14px) | `--red` | Static |

Each collapsible block: click to expand/collapse, 0.15s ease transition.
Thinking preview: truncated to ~80 chars, monospace, `--text-dimmer`.

### 5.10 Code Viewer

When Explorer is active:
- Sidebar: file tree with expand/collapse, file icons
- Main content: read-only code viewer with syntax highlighting
- Line numbers, current file path in breadcrumb
- Chat input still visible at bottom

Not a full editor. No editing, no IntelliSense. Just viewing code the agents work on. The existing `CodeViewer.tsx` component handles this.

---

## 6. Interaction Patterns

### Sidebar Context Switching

When user clicks an activity bar icon:
1. The icon gets the active indicator (2px left border)
2. The sidebar panel title changes
3. The sidebar content component swaps
4. The main content area navigates to the corresponding route
5. If Settings is clicked, sidebar collapses and settings fills main

This is a single state change (`activeView`) that drives both sidebar content and main route.

### Resize Handle

- Mousedown on sash: start tracking
- Mousemove: update `sidebarWidth`, clamped [170, window.innerWidth * 0.5]
- Mouseup: stop tracking, persist to localStorage
- Double-click: reset to default 240px

### Chat Input (always visible)

The input bar is always visible regardless of which view is active. When the user types and sends:
- If on Chat view: message appears in chat history above
- If on another view: navigates to Chat view, message appears there

This is the Conductor pattern -- zero-friction task start from any view.

### Model Switching

Click model name in model bar -> dropdown appears above with model list.
Select model -> updates session model, sends to server.
Model bar updates immediately (optimistic).

### Plan Mode Toggle

Click plan icon in model bar -> toggles plan mode.
When active: icon gets `--accent` color, "Plan" label shows.
Agent will propose a plan before executing. User approves/denies in chat.

### Thinking Toggle

Click brain icon -> toggles extended thinking.
When active: icon gets `--accent` color, "Thinking" label shows.
Server passes `--thinking adaptive` to claude CLI.

---

## 7. Keyboard Shortcuts

Preserved from current implementation:

| Keys | Action |
|------|--------|
| Cmd+` | Toggle terminal |
| Cmd+J | Toggle terminal |
| Cmd+K | Command palette |
| Cmd+Shift+P | Command palette |
| Cmd+B | Toggle sidebar |
| Cmd+L | Focus chat input |
| g s | Navigate to Chat |
| g f | Navigate to Files |
| g a | Navigate to Agents |
| g g | Navigate to Git |
| g r | Navigate to Run |
| g c | Navigate to Company |
| ? | Shortcuts help |
| Cmd+1-7 | Switch workspace (sidebar) |

New shortcuts:
| Keys | Action |
|------|--------|
| Cmd+Shift+E | Explorer |
| Cmd+Shift+G | Source Control |
| Cmd+Shift+A | Agents |
| Cmd+, | Settings |

---

## 8. Migration Plan

### Token Migration Strategy

The Grove tokens (`tokens.css`) replace the current ad-hoc CSS variables. Key changes:
- `--accent: #10b981` (emerald) -> `--accent: #3fb950` (Grove green)
- `--radius: 8px` -> `--radius: 4px`
- Background scale realigned to Grove `#0d1117` -> `#21262d`

All retained components use CSS custom properties, so swapping `tokens.css` applies the new palette globally. Components with hardcoded `rgba()` values (hover states, borders) get a token-alignment pass as part of this overhaul -- each retained component is touched minimally to replace hardcoded values with `var(--token)` references. This is not a rewrite of those components, just a find-and-replace of color literals.

### What gets deleted
- `Layout.tsx` (995 lines) -- replaced entirely by `Shell.tsx` + shell components
- `ActivitySidebar.tsx` (545 lines) -- replaced by `SessionsSidebar.tsx`
- `ChatPanel.tsx` -- superseded by `ChatMessages.tsx` + `ChatInputBar.tsx`
- `WorkspaceSidebar.tsx` -- superseded by `SessionsSidebar.tsx`

### What stays unchanged
- All page components (Home, Files, Git, Agents, Run, Swarm, Company, Governance, etc.)
- `ChatInputBar.tsx`
- `TerminalTabs.tsx`
- `CommandPalette.tsx`
- `ResizableDrawer.tsx`
- `ContextBar.tsx`
- All non-shell components (ScanProgress, DiffPanel, DiffViewer, ContextHeatmap, Skeleton, AgentCard, CheckpointPanel, XTerminal, Terminal, ProjectPicker, Toasts, etc.)
- All server code, all API routes
- `App.tsx` router (routes stay the same)
- Electron main process

### What gets enhanced
- `ChatMessages.tsx` -- add MessageBlock type dispatch for thinking/tool/agent blocks
- `App.tsx` -- swap `<Layout>` wrapper for `<Shell>`
- All retained components -- token-alignment pass (replace hardcoded rgba values with CSS custom properties)

### Inline components extracted from Layout.tsx before deletion
- `DiffDrawer` (Layout.tsx lines 62-142) -- extracted to `components/DiffDrawer.tsx`
- `BranchPicker` (Layout.tsx lines 832-917) -- extracted to `components/BranchPicker.tsx`
- `DriftBanner` / `DriftBadge` (Layout.tsx lines 560-735) -- extracted to `components/DriftIndicator.tsx`
- `ShortcutsHelp` (Layout.tsx lines 759-830) -- stays in CommandPalette or extracted
- `ProjectSwitcher` (Layout.tsx lines 919-994) -- extracted to `components/ProjectSwitcher.tsx`

### New files (18 components + 2 CSS)
- `styles/tokens.css`
- `styles/reset.css`
- `shell/Shell.tsx`
- `shell/Titlebar.tsx`
- `shell/ActivityBar.tsx`
- `shell/SidebarPanel.tsx`
- `shell/SidebarResize.tsx`
- `shell/StatusBar.tsx`
- `shell/ModelBar.tsx`
- `chat/MessageBlock.tsx`
- `chat/ToolCallRow.tsx`
- `chat/ThinkingBlock.tsx`
- `chat/AgentBlock.tsx`
- `chat/ToolSummary.tsx`
- `sidebar/SessionsSidebar.tsx`
- `shared/IconButton.tsx`
- `shared/Badge.tsx`
- `shared/ScrollToBottom.tsx`
- `DiffDrawer.tsx` (extracted from Layout.tsx)
- `BranchPicker.tsx` (extracted from Layout.tsx)
- `DriftIndicator.tsx` (extracted from Layout.tsx)
- `ProjectSwitcher.tsx` (extracted from Layout.tsx)

### State threading

`Shell.tsx` manages these state values and threads them to children:
- `activeView` -> ActivityBar, SidebarPanel
- `sidebarOpen` + `sidebarWidth` -> SidebarPanel, SidebarResize (persisted to localStorage)
- `termOpen` -> ResizableDrawer (persisted)
- `activeSessionId` -> ChatMessages, ChatInputBar, SessionsSidebar (persisted)
- `streaming` + `streamText` -> ChatMessages, ChatInputBar, StatusBar
- `info` (ProjectInfo) -> Titlebar, StatusBar
- `git` (GitStatus) -> Titlebar, StatusBar, SessionsSidebar
- `drift` (DriftResult) -> Titlebar (DriftBadge)

Sidebar auto-hides when route is `/settings` (checked via `location.pathname`).

---

## 9. Interaction Flows (exhaustive)

Based on UX flow audits of VS Code, Conductor, Cursor, and emdash.

### Flow 1: First Launch / Onboarding

**Trigger**: User opens hashmark studio for the first time (no project selected).

1. Window opens with `WorkspaceSetup` view (project picker)
2. Options: "Open Folder" (native dialog), recent projects list, CLI-launched path
3. If project has `.claude/agents/`: go to Chat view (home)
4. If no agents: empty state -- "No agents yet. Run a scan to build your AI company."
5. CTA button: "Generate Agents" -> navigates to `/generate`

**Empty state design**:
- Centered layout with hashmark logo
- Tagline: "Scan any codebase. Generate AI agents. Ship faster."
- Three action cards: "Open Project", "Scan Codebase", "View Demo"
- Recent projects list below (if any exist in config)

**State persistence**: Last-opened project stored in `~/.hashmark/studio-config.json`. On subsequent launches, auto-opens last project.

### Flow 2: Activity Bar Click Behavior

**From VS Code source** (exact behavior):

- **Click same active icon**: Toggles sidebar visibility (collapse/expand)
- **Click different icon**: Switches sidebar content to that view
- **Right-click**: Context menu with "Hide", position options (Default/Top/Bottom/Hidden)
- **Drag to reorder**: Supported via DnD with 40%/60% threshold for insertion position
- **Hover**: Tooltip appears after 300ms delay with action name + keybinding
- **Active indicator**: 2px solid `--accent` left border, full item height
- **Badge**: Positioned `top: 24px, right: 8px`, 9px font, 600 weight, 20px border-radius

**Our implementation**:
- Same toggle-on-same, switch-on-different behavior
- No drag reorder (not needed for fixed nav)
- Tooltip on hover (native `title` attribute initially, custom tooltip later)
- Badge support for: changes count on Source Control, running count on Run

### Flow 3: Sidebar Resize (Sash)

**From VS Code source** (exact CSS and behavior):

```css
/* Sash hit target */
.sash {
  position: absolute;
  z-index: 35;
  touch-action: none;
  /* width set via --vscode-sash-size: 4px */
}

/* Visual indicator (shown on hover/drag) */
.sash::before {
  content: '';
  pointer-events: none;
  position: absolute;
  width: var(--vscode-sash-hover-size);
  height: 100%;
  transition: background-color 0.1s ease-out;
  background: transparent;
}
.sash.hover::before,
.sash.active::before {
  background: var(--vscode-sash-hoverBorder);
}
```

**Hover delay**: 300ms before showing visual indicator (cancels if mouse leaves).

**Drag behavior**:
1. Pointer down: add `.active` class, lock cursor via dynamic stylesheet (`* { cursor: col-resize !important }`)
2. Pointer move: fire resize event with delta
3. Pointer up: remove `.active`, unlock cursor
4. Double-click: fire reset event (returns to default width)

**Constraints**: min 170px, snap-to-close below min, no max (capped at 50% in our impl).

**Cursor states**: `col-resize` normal, `e-resize` at min (can only grow), `w-resize` at max (can only shrink).

### Flow 4: Chat Interaction (sending a message)

**Trigger**: User types in input bar and presses Enter.

1. **Message created** in session_messages with `role: 'user'`, `sent_at: null` (queued)
2. **Input bar clears**, shows "Stop" button replacing "Send"
3. **Streaming begins**: SSE connection to `/api/sessions/:id/stream`
4. **Visual feedback during streaming**:
   - Status dot on session row turns yellow (active)
   - Model bar shows pulsing indicator
   - "Stop" button visible in input area
   - Chat auto-scrolls as new content appears
5. **Message parts stream in order**: thinking blocks, tool calls, text, agent dispatches
6. **Completion**: streaming stops, "Stop" reverts to "Send", status dot returns to idle

**Auto-scroll behavior**:
- Auto-scroll ON when user is at bottom (within 50px threshold)
- Auto-scroll OFF when user manually scrolls up
- "Scroll to bottom" sticky button appears when scrolled up (Conductor pattern):
  - Positioned above input bar, full-width
  - Shows chevron-down + "Scroll to bottom" + truncated preview of latest content
  - Click scrolls to bottom and re-enables auto-scroll

**Message queuing during streaming**:
- User can type while agent is responding
- New message queued (not sent until current stream completes)
- Or user can click "Stop" to interrupt, then send

### Flow 5: Session Lifecycle

**Creating a session**:
1. Click "+" in Sessions sidebar section header
2. New session created via `POST /api/sessions`
3. Session appears in sidebar, becomes active
4. Empty chat with welcome message

**Switching sessions**:
1. Click session row in sidebar
2. `activeSessionId` updates, chat history loads
3. Keyboard: Cmd+1/2/3 for quick switching (maps to session index, not workspace)

**Session states** (visual indicators):
- Idle: dim status dot (`--text-dimmer`)
- Active/selected: blue dot (`--blue`)
- Running (agent streaming): yellow pulsing dot (`--yellow`) with glow
- Error: red dot (`--red`)

**Deleting/archiving**: No delete in MVP. Sessions persist. Future: soft-delete via `is_hidden` flag.

### Flow 6: Workspace Management

**Adding a workspace**:
1. Click "+" in Workspaces section header
2. Native folder picker opens (`dialog.showOpenDialog`)
3. Selected folder added to config, workspace appears in sidebar

**Switching workspaces**:
1. Click workspace row in sidebar
2. Server reloads for new project directory
3. All views update (file tree, git status, agents, etc.)

**Multi-workspace** (future, not MVP):
- Multiple repos in sidebar simultaneously
- Each with nested sessions
- Independent git status per workspace

### Flow 7: File Explorer Interaction

**When Explorer is active in activity bar**:

Sidebar shows `FileTreeSidebar`:
- Recursive file tree with expand/collapse folders
- Single click: select file (highlight in tree)
- Double click: open in code viewer (main content area)
- File icons by language (use Lucide icons: FileCode, FileText, Folder, etc.)
- Search/filter: type to filter visible files

Main content shows code viewer:
- Read-only syntax-highlighted code (existing CodeViewer component)
- File path breadcrumb at top
- Line numbers
- Chat input still visible at bottom

**Empty state**: "No files found" or "Open a project to browse files"

### Flow 8: Source Control Interaction

**When Source Control is active in activity bar**:

Sidebar shows `GitSidebar`:
- Section: "Changes" with file count badge
- Each file: status badge (M/A/D), filename, +N/-N diff stats
- Click file: opens diff in main content area
- Stage button (+) per file
- "Stage All" button in section header
- Commit message input at bottom of sidebar
- "Commit" button below message

Main content shows diff viewer:
- Side-by-side or inline diff (existing DiffViewer component)
- Green additions, red deletions
- File navigation (prev/next changed file)

**Empty state**: "No changes" with checkmark icon

### Flow 9: Agent Run Flow

**When Run is active in activity bar**:

Sidebar shows `RunsSidebar`:
- Active runs with status (running/completed/failed)
- Run history (recent completed runs)
- Each run: agent name, task description, timestamp, status badge

Main content shows run output:
- Streaming output from agent execution
- Tool calls, file edits, terminal commands
- Diff summary on completion

**Starting a run**:
1. Navigate to Run view
2. Select agent from dropdown
3. Type task description
4. Click "Run" or press Enter
5. Agent executes in background, output streams in main content

### Flow 10: Model Selector (Conductor pattern)

**ModelBar component** (below input):

1. Click model name (e.g., "Sonnet 4.6")
2. Dropdown appears ABOVE the model bar:
   - Section: "Claude" with model list
   - Each row: model name, badges (NEW, default), checkmark for selected
   - Keyboard: 1-4 to select by index
3. Click model -> updates session, dropdown closes
4. Model bar updates immediately

**Available models** (from our server):
- Opus 4.6 (claude-opus-4-6)
- Opus 4.6 1M (claude-opus-4-6[1m])
- Sonnet 4.6 (claude-sonnet-4-6) -- default
- Haiku 4.5 (claude-haiku-4-5)

### Flow 11: Thinking Toggle

1. Click brain icon in model bar
2. Icon color: `--text-dimmer` (off) -> `--accent` (on)
3. "Thinking" label appears/disappears next to icon
4. Server passes `--thinking adaptive` or `--thinking disabled` to claude CLI
5. When active: thinking blocks appear in chat as collapsible amber sections

### Flow 12: Plan Mode Toggle

1. Click clipboard icon in model bar
2. Icon color: `--text-dimmer` (off) -> `--accent` (on)
3. "Plan" label appears next to icon
4. Agent proposes plan before executing
5. Plan appears in chat as a structured block
6. User sees approve/deny/feedback buttons below plan
7. Approve: agent executes, deny: agent stops, feedback: agent revises

### Flow 13: Branch Picker (with search)

1. Click branch name in titlebar
2. Dropdown opens below with search input at top
3. List of all branches (from `/api/files/git/branches`)
4. Current branch has checkmark
5. Type to filter branches (fuzzy match)
6. Click branch -> switches branch, page reloads
7. Escape or click outside -> closes dropdown

### Flow 14: Terminal Panel

**Toggle**: Cmd+` or Cmd+J

1. Terminal drawer slides up from bottom (ResizableDrawer)
2. Tab bar: "TERMINAL" | "OUTPUT" tabs
3. Active terminal with PTY connection
4. Multiple terminal tabs (existing TerminalTabs component)
5. Maximize button: terminal fills entire main area
6. Close button: hides terminal drawer

**Big terminal mode** (Conductor pattern):
- Terminal becomes the primary pane
- Chat input still visible below
- Toggle via a maximize button in terminal tab bar

### Flow 15: Command Palette

**Trigger**: Cmd+K or Cmd+Shift+P

**VS Code dimensions**: 600px wide, centered, border-radius 12px (cornerRadius-xLarge), shadow-xl, z-index 2550.

1. Overlay opens with dark backdrop
2. Search input auto-focused
3. Results grouped by: Navigation, Actions, Settings
4. Fuzzy matching with bold highlights on matched characters
5. Arrow keys to navigate, Enter to select, Escape to close
6. Max 20 visible items, scrollable

### Flow 16: Status Bar Interactions

**Click behavior** (from VS Code):
- Branch name: opens branch picker
- Error/warning counts: opens Problems panel
- Model name: opens model selector
- Each item has `cursor: pointer` and hover background (`rgba(0,0,0,0.12)`)

**Mac bottom radius**: 10px (16px on Tahoe+) -- rounds the bottom corners of the window.

### Flow 17: Empty States

| View | Empty State |
|------|-------------|
| Chat (no sessions) | Welcome message + suggested actions |
| Chat (session, no messages) | Model info + "Ask me anything" |
| Explorer (no project) | "Open a project" button |
| Explorer (project, no files) | "Empty directory" |
| Source Control (no changes) | Checkmark + "No changes" |
| Agents (no agents) | "Run a scan to generate agents" + CTA |
| Run (no runs) | "Select an agent and describe a task" |
| Generate (not scanned) | "Scan your codebase" + CTA |
| Governance (no policies) | "No policies configured" |
| Settings | Always has content |
| Sidebar (no workspace) | "Open a project" button |
| Terminal (no session) | Auto-creates default PTY |

### Flow 18: Loading States

| Context | Indicator |
|---------|-----------|
| Chat streaming | Pulsing status dot, "Stop" button, auto-scroll |
| Session loading | Skeleton lines in sidebar |
| File tree loading | Skeleton tree structure |
| Git status loading | Spinner in titlebar changes badge |
| Agent running | Yellow pulsing dot in sidebar |
| Scan in progress | Progress bar in Generate view |
| Branch switching | Page reload with brief flash |

### Flow 19: Error States

| Error | User Sees | Recovery |
|-------|-----------|----------|
| Claude CLI not found | Banner: "Claude Code not installed" + install link | Install claude CLI |
| Agent crash mid-stream | Error message in chat + red status dot | Send new message to retry |
| Network timeout | Toast: "Connection lost" | Auto-retry or manual refresh |
| Git operation conflict | Banner: "Git operation in progress" | Wait for completion |
| Database error | Toast: "Failed to save" | Retry action |
| Auth expired | Banner: "Claude auth expired" + re-auth link | Run `claude login` |

### Flow 20: Notifications/Toasts

**VS Code pattern**:
- Position: fixed, bottom-right (above status bar), z-index 2545
- Width: 320px (our spec), VS Code uses max 450px
- Animation: slide up from bottom, 300ms ease-out
- Auto-dismiss: info 10s, warning 12s, error 15s
- Pauses on hover/focus
- Max 3 visible at once
- Severity icons colored: error red, warning yellow, info blue

**Our implementation**: Existing `Toasts.tsx` component -- keep as-is, ensure it uses Grove tokens.

### Flow 21: Keyboard Focus Management

**Tab order**: Activity bar -> Sidebar -> Main content -> Terminal -> Input bar -> Model bar
**Escape chain**: Command palette -> Settings -> Diff drawer -> Terminal (unfocus) -> Input bar (unfocus)
**Focus shortcuts**:
- Cmd+L: Focus input bar
- Cmd+B: Toggle sidebar (focus shifts to sidebar or main)
- Cmd+`: Toggle terminal (focus shifts to terminal or main)

---

## 10. Server Streaming Upgrade

The chat message types (section 5.9) require structured data from the server. Currently the server uses `claude --print` which outputs plain text. This must be upgraded.

### Current flow (text-only)
```
User types -> POST /api/sessions/:id/message
Server spawns: claude --print "<prompt>"
Server streams stdout as SSE text events
Client renders plain text
```

### Target flow (structured streaming)
```
User types -> POST /api/sessions/:id/message
Server spawns: claude --output-format stream-json --verbose "<prompt>"
Server parses JSON events from stdout
Server forwards typed SSE events: { type: "thinking" | "text" | "tool_use" | "tool_result" | "agent" | "error", data: ... }
Client renders MessageBlock per event type
```

### Claude CLI `--output-format stream-json` events

From the Conductor audit, Claude Code with `--output-format stream-json` emits:
- `assistant` messages with `content` array of parts:
  - `type: "thinking"` -- extended thinking content
  - `type: "text"` -- regular text response
  - `type: "tool_use"` -- tool call with `name`, `input`
  - `type: "tool_result"` -- tool execution result
- `system` messages for session metadata
- `result` messages for completion

### Server changes required

**File: `server/routes/sessions.ts`**:
1. Change spawn from `claude --print` to `claude --output-format stream-json --verbose`
2. Parse incoming NDJSON lines from stdout
3. Map each JSON event to a typed SSE event:
   - `{ type: "thinking", content: "...", id: "..." }`
   - `{ type: "text", content: "...", id: "..." }`
   - `{ type: "tool_use", name: "Edit", input: {...}, id: "..." }`
   - `{ type: "tool_result", output: "...", id: "..." }`
   - `{ type: "agent", description: "...", id: "..." }`
   - `{ type: "error", message: "...", id: "..." }`
4. Store structured messages in `session_messages` (content as JSON array of parts)

**File: `server/routes/sessions.ts`** (message storage):
- `session_messages.content` changes from plain text to JSON: `[{ type: "text", content: "..." }, { type: "tool_use", name: "Edit", ... }]`
- Add `role` column values: `"user"`, `"assistant"`, `"system"`

### Client changes required

**File: `client/src/components/chat/ChatMessages.tsx`**:
1. Parse SSE events by type instead of concatenating text
2. Build message parts array: `MessagePart[]`
3. Render each part via `MessageBlock.tsx` dispatch

**Type definitions** (new file: `client/src/types/messages.ts`):
```typescript
type MessagePart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string; id: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown>; id: string }
  | { type: "tool_result"; output: string; id: string; isError?: boolean }
  | { type: "agent"; description: string; id: string }
  | { type: "skill"; name: string; id: string }
  | { type: "error"; message: string };
```

---

## 11. Gap Resolutions

### Gap 1: CSS for pseudo-classes/pseudo-elements

Add `client/src/styles/shell.css` for the ~15 rules that can't be inline:

```css
/* Sash resize handle indicator */
.sash::before { content: ''; position: absolute; width: 4px; height: 100%; transition: background-color 0.1s ease-out; }
.sash:hover::before, .sash.active::before { background: var(--border); }
.sash { cursor: col-resize; }
.sash.at-min { cursor: e-resize; }
.sash.at-max { cursor: w-resize; }

/* Status bar Mac bottom radius */
.status-bar { border-bottom-left-radius: 10px; border-bottom-right-radius: 10px; }

/* Activity bar hover */
.activity-item:hover { color: var(--text-dim); }

/* Scrollbar styling */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-dim); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--border); }
```

All other styling remains inline. This file is <30 lines.

### Gap 2: Side effects migration

Shell.tsx inherits these effects from Layout.tsx:

| Effect | Trigger | Action |
|--------|---------|--------|
| Fetch project info | Mount | `GET /api/info` |
| Fetch git status | Mount + poll during streaming | `GET /api/files/git` every 3s |
| Drift detection | Mount | `GET /api/drift/check` |
| Auto-create session | Mount (if no active session) | `POST /api/sessions` |
| Keyboard shortcuts | Mount | Register `g+key` nav, `Cmd+K`, `?` |
| Electron menu events | Mount | Wire `menu:navigate`, `menu:toggle-*` |
| Persist active session | activeSessionId change | `localStorage.setItem` |
| Persist sidebar state | sidebarOpen/Width change | `localStorage.setItem` |
| Persist terminal state | termOpen change | `localStorage.setItem` |
| Auto-open diff drawer | Streaming stops + files changed | `setDiffOpen(true)` |

These move 1:1 into Shell.tsx. Consider extracting to custom hooks if Shell.tsx exceeds 200 lines:
- `useProjectInfo()` -- fetches info + git + drift
- `useKeyboardNav()` -- keyboard shortcut registration
- `useElectronMenu()` -- Electron menu event wiring

### Gap 3: ContextBar placement

ContextBar renders between main content and ChatInputBar:

```
<main>{view content}</main>
<ContextBar sessionId={activeSessionId} streaming={streaming} />
<ChatInputBar ... />
<ModelBar ... />
```

Only visible when chat input is visible (hidden on `/settings` and `/setup`).

### Gap 4: Sidebar content mount strategy

All sidebar content components mount simultaneously, toggled with `display: none`:

```jsx
<div style={{ display: activeView === 'chat' ? 'flex' : 'none' }}>
  <SessionsSidebar />
</div>
<div style={{ display: activeView === 'files' ? 'flex' : 'none' }}>
  <FileTreeSidebar />
</div>
{/* etc */}
```

This preserves scroll position and expanded state when switching views. Same pattern as VS Code and Conductor.

### Gap 5: DiffDrawer and ProjectSwitcher placement

- **DiffDrawer**: Fixed position, right side, z-index 50. Same as current. Triggered by "Changes N" badge in titlebar.
- **ProjectSwitcher**: Rendered in StatusBar right section. Click opens dropdown above status bar.
- **DriftIndicator**: Rendered in Titlebar breadcrumb area (dot badge + popover).

### Gap 6: Sidebar toggle edge cases

| Sidebar State | Icon Clicked | Result |
|---------------|-------------|--------|
| Open, icon A active | Click A | Collapse sidebar |
| Open, icon A active | Click B | Switch to B content (stay open) |
| Collapsed, icon A was active | Click A | Expand sidebar (show A content) |
| Collapsed, icon A was active | Click B | Expand sidebar + switch to B content |

Implementation: `activeView` and `sidebarOpen` are independent states. Clicking any icon always sets `activeView`. If clicking the same icon AND sidebar is open, toggle `sidebarOpen`.

### Gap 7: File structure update (adding server + CSS files)

Updated new files list (25 files total):

**Styles (3 CSS files)**:
- `styles/tokens.css`
- `styles/reset.css`
- `styles/shell.css`

**Shell components (7)**:
- `shell/Shell.tsx`
- `shell/Titlebar.tsx`
- `shell/ActivityBar.tsx`
- `shell/SidebarPanel.tsx`
- `shell/SidebarResize.tsx`
- `shell/StatusBar.tsx`
- `shell/ModelBar.tsx`

**Chat components (4)**:
- `chat/MessageBlock.tsx`
- `chat/ToolCallRow.tsx`
- `chat/ThinkingBlock.tsx`
- `chat/ToolSummary.tsx`

**Sidebar components (1)**:
- `sidebar/SessionsSidebar.tsx`

**Shared components (3)**:
- `shared/IconButton.tsx`
- `shared/Badge.tsx`
- `shared/ScrollToBottom.tsx`

**Extracted from Layout.tsx (4)**:
- `DiffDrawer.tsx`
- `BranchPicker.tsx`
- `DriftIndicator.tsx`
- `ProjectSwitcher.tsx`

**Types (1)**:
- `types/messages.ts`

**Server changes (2 modified)**:
- `server/routes/sessions.ts` -- structured streaming
- `server/db.ts` -- message content schema (JSON parts)

---

## 12. What This Spec Does NOT Cover

These are future work, not part of this overhaul:

- Multi-workspace backend (multiple repos simultaneously)
- Git checkpoint system (per-turn undo)
- MCP tool injection (GetWorkspaceDiff, GetTerminalOutput)
- Multi-model support (Codex/Gemini integration)
- Plan mode backend (permission mode switching in claude CLI)
- Auto-updater
- Remote/SSH development
- Kanban board view
- Browser preview pane
- File tree sidebar content (uses existing Files page for now)
- Git sidebar content (uses existing SourceControl page for now)

The shell overhaul creates the structure. Sidebar content components (FileTreeSidebar, GitSidebar, AgentsSidebar, RunsSidebar) are stubs that render existing page components inline. Full sidebar-native implementations come later.

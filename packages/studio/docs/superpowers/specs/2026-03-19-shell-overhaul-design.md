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

## 9. What This Spec Does NOT Cover

These are future work, not part of this shell overhaul:

- Multi-workspace backend (adding multiple repos)
- Git checkpoint system (backend implementation)
- MCP tool injection (server-side)
- Multi-model support (Codex/Gemini integration)
- Plan mode backend (permission mode switching)
- Auto-updater
- Remote/SSH development
- Kanban board view
- Browser preview pane

The shell overhaul creates the frontend structure that these features will plug into later.

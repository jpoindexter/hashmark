# hashmark Tauri app — 1:1 demo match

## Context

The app has drifted from its design spec. `demo/cursor-demo-v2.html` is the agreed product vision. Prior work added tab bars, status bars, trust levels, MCP panels, routines, issues panels, focus mode, compact mode, notifications, prompt library, command palette, global search, session notes, and a chat-header bar that are not in the demo.

This plan strips the app down to match the demo 1:1 visually and structurally, while keeping the real Tauri/SQLite functionality (streaming, sessions, agents, git info, @file mentions, drafts).

**Design decisions:**
- User messages: full-width left-aligned card (demo style)
- Tool calls: flat rows with inline approval (demo style)
- Feature scope: strip everything not in demo, keep backend wiring

---

## What gets DELETED

**Components removed:**
- `CommandPalette`, `GlobalSearch`, `NotificationCenter`, `KeyboardHelp`, `MCPPanel`, `PromptLibrary`, `LinksPanel`, `RoutinesPanel`, `SessionNotes`, `SessionSearch`

**State fields removed from `appState`:**
- `commandPaletteOpen`, `globalSearchOpen`, `notificationsOpen`, `notifications`, `keyboardHelpOpen`, `mcpPanelOpen`, `promptLibraryOpen`, `linksPanelOpen`, `routinesOpen`, `focusMode`, `notesOpen`, `openTabs`, `replyToMessage`, `fileExplorerOpen`, `searchOpen`, `searchQuery`, `searchMatchIndex`, `focusCompose`

**Sidebar features removed:**
- Inline search bar + Cmd+F search
- Group-by cycle button (project grouping only)
- Compact mode (48px dot view)
- Session tooltips, time badges
- Notifications bell, keyboard help, focus mode, compact toggle in footer
- Status bar
- Date grouping (project-based only)

**Chat pane features removed:**
- `chat-header` (sidebar toggle, tools collapse, trust, notes, title)
- `tab-bar` (multi-session tabs)
- `status-bar` (model + tokens + cost)
- `context-bar` (token usage strip)
- Reply-to banner, date separators
- Expandable tool cards → flat `tool-row`
- Right-aligned user bubble → full-width left card

**Compose features removed:**
- Smart paste toast, URL detect banner, attachments strip
- Slash popover (deferred)
- Reply banner, 760px max-width, word/token count
- Agent popover in toolbar → replaced with popAgents

**Features kept but entry-point changed:**
- `Settings.svelte` → from `popSettings`
- `AgentsPage.svelte` → from `popAgents`
- `WorkflowsPanel.svelte` → from `popWorkflows`
- `Issues.svelte` → from `popIssues`

---

## Structural rewrites

### 1. Titlebar (`+page.svelte`)
```
div.titlebar [data-tauri-drag-region]
  div (64px spacer for traffic lights)
  button.icon-btn   sidebar toggle SVG
  button.icon-btn   search SVG (no-op)
  span.titlebar-title (absolute center) "hashmark"
  button.version-pill  "v0.1.0"  → popVersion
```

### 2. Sidebar (`Sidebar.svelte`) — full template rewrite
```
aside.sidebar
  div.sb-actions
    button.sb-btn.full  "+ New session"
  div.sb-actions-secondary
    button.sb-btn  "Agents"     → popAgents
    button.sb-btn  "Workflows"  → popWorkflows
    button.sb-btn  "More ›"     → expand inline (Issues / Browse files)
  div.session-list
    {#each groupedByProject}
      div.section-label
      {#each group.sessions}
        button.session-item  [dot] [title]
  div.sb-footer
    button.sb-user-btn  [avatar] [name]  → popUser
    button.icon-btn  gear               → popSettings
    button.icon-btn  sun/moon           → cycleTheme
```
Fixed width 224px. Project-based grouping. No resize handle.

### 3. Welcome (`Welcome.svelte`)
- Add `.hm-session-project` (basename of project_path) to recent session rows
- Remove `.hm-session-time`
- Session dot: hollow by default, filled only when running

### 4. Compose (`Compose.svelte`)
```
div.compose-breadcrumbs
  button  "Local"        → popLocal
  /
  button  {projectName}  → popProject
  /
  button.active  {branch}  → popBranch
  ● (green/yellow status)
  button  "+"            → popAdd

{#if composePills.length}
  div.compose-pills  [pills with × remove]

textarea  placeholder="How can I help?"  min-height:64px

div.compose-toolbar
  [agent btn] [+ btn] [@count]   |   [model btn] [stop/send]
```

### 5. Chat pane (`ChatPane.svelte`)
- Strip header, tab bar, status bar, context bar
- Full-width left user messages (no bubble)
- Flat tool rows: icon + label + allow/deny + time
- Worked row after tool group: "Worked Xs · checkpoint · restore"
- No 760px max-width; padding: 0 32px

### 6. CSS tokens (`app.css`)
- Dark: `--bg: #1a1a18`, `--text: #f5f4ef`, `--border-mid: rgba(234,221,216,0.22)` ✅ (done)
- Add `--blue` token ✅ (done)
- Compose box: `border: 1px solid var(--border-mid)`, `border-radius: 10px`, textarea `min-height: 64px`

---

## New files

- `app/src/components/Popover.svelte` — shared positioned popover
- `app/src/components/ComposePill.svelte` — pill with remove
- `app/src/lib/popovers.svelte.ts` — `openPopoverId`, position, anchor

## Popovers (12 total)

| id | trigger | content |
|----|---------|---------|
| version | titlebar pill | v1/v2 switcher stub |
| user | sidebar avatar | user info + Settings/Help |
| settings | sidebar gear | Providers / Agents / Workflows + theme |
| agents | sidebar btn + compose | agent list + New agent |
| workflows | sidebar btn | workflow list + New workflow |
| issues | More → Issues | 3 issues inline + New issue |
| files | More → Browse | root folders from list_dir |
| local | breadcrumb Local | Local ✓ / Cloud / SSH stubs |
| project | breadcrumb project | recent projects + Open folder |
| branch | breadcrumb branch | current branch (stub) |
| add | breadcrumb + / compose + | files / folder / GitHub issue / slash |
| model | compose model btn | Provider / Model / Effort + kbd hints |

---

## Execution phases

1. ✅ **Phase 1** — CSS tokens + dark text color
2. ✅ **Phase 2** — Delete unused components + prune appState
3. ✅ **Phase 3** — Titlebar rewrite
4. ✅ **Phase 4** — Sidebar rewrite
5. ✅ **Phase 5** — Welcome tweaks
6. ✅ **Phase 6** — Compose rewrite
7. ✅ **Phase 7** — Chat pane rewrite
8. ✅ **Phase 8** — Popover primitive consolidation

---

## Deferred

- Checkpoint/restore Rust backing
- Thinking content stream separation
- Branch list command (`get_git_branches`)
- Cloud / SSH in popLocal
- popVersion v1 switcher
- popUser real profile

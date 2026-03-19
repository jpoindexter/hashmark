# Handoff -- Studio Shell Overhaul
Generated: 2026-03-19 13:10
Project: hashmark studio (`/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/packages/studio`)
Branch: `feature/studio-shell-overhaul` (15 commits ahead of `feature/studio-electron`)

## What Was Accomplished

### Shell Overhaul (13 tasks, all complete)
- Replaced 995-line Layout.tsx god component with 7 focused shell components
- Built VS Code-exact shell: ActivityBar (48px), Titlebar (35px), StatusBar (22px), SidebarPanel (resizable), ModelBar
- Grove design system tokens across entire app (21 files token-aligned)
- Structured chat rendering: ThinkingBlock, ToolCallRow, MessageBlock dispatcher
- Server streaming: thinking event type added to `--output-format stream-json` parser
- SessionsSidebar: Conductor-style 22px rows, workspace groups, session list
- Custom hooks: useProjectInfo (git polling), useKeyboardNav (15+ shortcuts)
- Extracted 5 inline components from Layout.tsx before deletion

### UX Polish (49-item audit, all addressed)
- 3 P0 critical error handling fixes (input preservation, stream preservation, res.ok checks)
- Activity bar tooltips with keyboard shortcut hints
- Context menus on session rows, workspace rows, chat messages
- Model dropdown keyboard navigation (arrows, escape, 1/2/3 selection)
- Branch picker with search/filter input
- ConfirmDialog component (replaces native confirm/prompt)
- Focus-visible states, button press feedback, hover states
- Dropdown fade animations, sidebar collapse animation fix
- Complete ShortcutsHelp overlay (17 shortcuts in 5 groups)
- Visibility-based polling pause, debounced persistence
- 9 new command palette commands
- ScrollToBottom button in chat

### Sidebar Content (VS Code pattern)
- FileTreeSidebar: collapsible file tree from /api/files/tree
- GitSidebar: changed files with status badges, commit input
- AgentsSidebar: agents grouped by department
- All lazy-loaded with Suspense

### Project Open Fix
- Root cause: openWorkspace never called window.studio.setProjectDir() via IPC
- Now persists to ~/.hashmark/studio-config.json correctly

### Competitive Intelligence (extensive research)
- 4 exhaustive app audits: Conductor (916 lines), Warp (488), emdash (458), Cursor
- 4 UX flow audits (17+ flows each)
- SHELL-DELTA.md: 1,251-line cross-app comparison with 10 appendices
- Design spec: 1,151 lines, 12 sections, 21 interaction flows

## Files Changed

### Created (30+ files)
| File | What |
|------|------|
| `client/src/styles/tokens.css` | Grove design tokens |
| `client/src/styles/reset.css` | Base reset + utility classes |
| `client/src/styles/shell.css` | Pseudo-class rules |
| `client/src/types/messages.ts` | MessagePart types |
| `client/src/components/shell/Shell.tsx` | Root layout orchestrator (295 lines) |
| `client/src/components/shell/Titlebar.tsx` | 35px titlebar |
| `client/src/components/shell/ActivityBar.tsx` | 48px icon rail |
| `client/src/components/shell/SidebarPanel.tsx` | Resizable sidebar |
| `client/src/components/shell/SidebarResize.tsx` | Draggable sash |
| `client/src/components/shell/StatusBar.tsx` | 22px status bar |
| `client/src/components/shell/ModelBar.tsx` | Model selector + toggles |
| `client/src/components/shell/TerminalPanel.tsx` | Terminal drawer content |
| `client/src/components/chat/MessageBlock.tsx` | Message type dispatcher |
| `client/src/components/chat/ThinkingBlock.tsx` | Collapsible thinking |
| `client/src/components/chat/ToolSummary.tsx` | Tool call stats header |
| `client/src/components/sidebar/SessionsSidebar.tsx` | Workspace + sessions |
| `client/src/components/sidebar/FileTreeSidebar.tsx` | File tree |
| `client/src/components/sidebar/GitSidebar.tsx` | Changed files + commit |
| `client/src/components/sidebar/AgentsSidebar.tsx` | Agent roster |
| `client/src/components/shared/IconButton.tsx` | Ghost button |
| `client/src/components/shared/Badge.tsx` | Status badge |
| `client/src/components/shared/ScrollToBottom.tsx` | Scroll button |
| `client/src/components/shared/ContextMenu.tsx` | Right-click menu |
| `client/src/components/shared/ConfirmDialog.tsx` | Custom confirm/prompt |
| `client/src/components/DiffDrawer.tsx` | Extracted from Layout |
| `client/src/components/BranchPicker.tsx` | Extracted from Layout |
| `client/src/components/DriftIndicator.tsx` | Extracted from Layout |
| `client/src/components/ProjectSwitcher.tsx` | Extracted from Layout |
| `client/src/components/ShortcutsHelp.tsx` | Extracted from Layout |
| `client/src/hooks/useProjectInfo.ts` | Info/git/drift fetching |
| `client/src/hooks/useKeyboardNav.ts` | Keyboard shortcuts |

### Deleted (5 files, ~3,200 lines)
- `Layout.tsx`, `ActivitySidebar.tsx`, `ChatPanel.tsx`, `WorkspaceSidebar.tsx`, `StatusItem.tsx`

### Audit/Design Docs
- `docs/shell-reference/SHELL-DELTA.md` (1,251 lines)
- `docs/superpowers/specs/2026-03-19-shell-overhaul-design.md` (1,151 lines)
- `docs/superpowers/plans/2026-03-19-shell-overhaul.md` (795 lines)
- `CONDUCTOR_AUDIT.md`, `EMDASH_AUDIT.md`, `WARP_AUDIT.md`

## Current State
- Build status: PASSING (clean)
- Tests: 60 passing (4 test files)
- Uncommitted changes: NO
- Branch: `feature/studio-shell-overhaul`, pushed to remote

## What's NOT Done (user's latest request)

The user wants a comprehensive sweep of the ENTIRE app -- not just the shell, but every page, every interaction, everything skinned and polished. Specific items called out:

### 1. Layout Toggle Icons in Titlebar
- VS Code has panel layout buttons in the top-right (split editor, grid, side-by-side)
- We need similar icons for: toggle sidebar, toggle terminal, split view
- These should be in the titlebar right section

### 2. VS Code-Style Command Palette (Cmd+P)
- Current CommandPalette is basic (9 commands)
- VS Code's has: "Go to File" with file search, "Show and Run Commands >", "Search for Text %", recent files, symbol search @
- Need file search integration (fuzzy match against /api/files/list)
- Need recent files tracking
- Need keyboard shortcut badges on each row

### 3. Theme System
- Dark/light toggle exists in settings but does NOTHING
- Need: actual light theme tokens, theme switching that works
- Nice to have: VS Code theme import, custom theme editor
- At minimum: dark (current) + light theme that actually applies

### 4. Settings Not Hooked Up
- Appearance settings page exists but toggles don't do anything
- Font size, theme, terminal settings -- all decorative, not functional
- Need to wire every setting to actual behavior

### 5. Per-Page Audit Needed
Every page needs a full interaction audit:
- **Home**: Quick actions work? Stats accurate? Recent runs?
- **Files/Explorer**: File tree in sidebar works? Code viewer? Right-click?
- **Source Control**: Stage/unstage? Commit? Diff viewer?
- **Agents**: View/edit/delete agents? Run agent from card?
- **Run**: Start a run? See output? Stop?
- **Generate**: Scan wizard works? All steps?
- **Governance**: Create/edit/delete policies? Action log?
- **Settings**: Every toggle/input actually wired?
- **Swarm**: Multi-agent mode works?
- **Company**: Software company orchestration works?
- **History**: View past runs? Diffs?

### 6. Context Menus Everywhere
- File tree items: open, copy path, reveal in finder, delete
- Agent cards: run, edit, delete, duplicate
- Terminal: copy, paste, clear, split
- Code viewer: copy, select all
- Every list item everywhere needs right-click

### 7. Missing Native App Polish
- Window layout toggle buttons (like VS Code's split/grid icons)
- Proper Electron menu wiring (many menu items fire events nobody listens to)
- Auto-updater
- Dock badge for notifications

## Complete TODO List (Prioritized)

### P0 -- Broken / Blocking

- [ ] App title says "Electron" not "hashmark studio" -- set `app.setName("hashmark studio")` in electron/main.ts, update `title` in BrowserWindow config
- [ ] SIGKILL crash on close -- node-pty throws during Electron cleanup. Need graceful shutdown: listen for `before-quit`, kill PTY processes before exit
- [ ] Auto-detect AI CLIs (claude, codex, gemini, aider, amp, goose) -- server endpoint `/api/providers/detect` that checks PATH + common locations, returns installed status + version. Wire to ModelBar dropdown grouped by provider. AGENT BUILDING THIS NOW.
- [ ] Project open flow still broken in some cases -- test all paths: ProjectPicker, WorkspaceSetup, Electron menu "Open Project"

### P1 -- Core Missing Features

- [ ] Layout toggle icons in titlebar right section (sidebar toggle, terminal toggle, split editor icons -- like VS Code's panel layout buttons)
- [ ] Enhanced command palette (Cmd+P): file search with fuzzy match, recent files, ">" for commands, keyboard shortcut badges on each row, category headers
- [ ] Theme system that works: light theme tokens in tokens.css, `html[data-theme="light"]` selector, wire Settings toggle to apply class, persist to localStorage
- [ ] Wire ALL appearance settings: font size, theme, terminal font, terminal cursor style -- each setting must actually change behavior
- [ ] Electron menu parity: wire all existing menu events that fire but nobody listens to. Add missing items from VS Code menu structure.
- [ ] Terminal improvements: split terminal (Cmd+\), new terminal tab, kill terminal, clear terminal -- wire to Electron menu Terminal items
- [ ] Replace remaining native confirm() in CheckpointPanel.tsx and SourceControlPage.tsx with ConfirmDialog
- [ ] Context menus on: file tree items (open, copy path, reveal in finder, delete), agent cards (run, edit, delete, duplicate), terminal area (copy, paste, clear), code viewer (copy, select all)

### P2 -- Polish & Parity

- [ ] VS Code-style "Go to File" (Cmd+P) -- separate from command palette, fuzzy file search against /api/files/list
- [ ] Recent files tracking -- store in localStorage, show in command palette and welcome page
- [ ] VS Code theme import -- parse .json theme files, map to Grove CSS variables
- [ ] Custom theme editor -- color pickers for each token
- [ ] Vibrancy/transparency on sidebar and titlebar (Electron vibrancy option)
- [ ] Auto-updater (electron-updater)
- [ ] Dock badge for notifications (agent completion, errors)
- [ ] Window state persistence (position, size, maximized -- Electron windowStateKeeper)
- [ ] "About hashmark studio" dialog (custom, not native)
- [ ] Check for Updates menu item wired
- [ ] Notification system (toast for agent completion, errors, updates)

### Per-Page Audit TODO

- [ ] **Home page**: verify quick actions work, stats load, recent runs display
- [ ] **Files/Explorer**: file tree sidebar clicks open code viewer, right-click context menu, breadcrumb navigation
- [ ] **Source Control**: stage/unstage buttons work, commit from sidebar, diff viewer opens on file click
- [ ] **Agents**: view/edit/run/delete agents, department grouping, agent detail panel
- [ ] **Run**: start a run from UI, see streaming output, stop button, completion summary
- [ ] **Generate**: scan wizard all 4 steps work, progress streaming, output format selection
- [ ] **Governance**: create/edit/delete policies, action log displays, JSONL export
- [ ] **Settings**: every toggle/input wired to actual behavior, model defaults persist, env vars
- [ ] **Swarm**: multi-agent mode works end-to-end, worker status, merge results
- [ ] **Company**: software company orchestration, task decomposition, parallel agents
- [ ] **History**: past runs display, diffs reviewable, status badges accurate
- [ ] **Git**: commit history, branch info, ahead/behind count
- [ ] **WorkspaceSetup**: folder picker works, recent projects, framework detection

### Missing from Competitor Apps (see DELTA-V2.md for full 147-item list)

- [ ] Conductor: checkpoint undo UI, PR creation button, workspace archiving, big terminal mode, Lottie animations
- [ ] Cursor: composer (Cmd+I), inline edit (Cmd+K), tab completion, codebase indexing, @context system
- [ ] emdash: multi-agent parallel, kanban board, browser preview, SSH remote dev, 23 agent support
- [ ] VS Code: full menu bar parity, editor tabs, minimap, breadcrumbs, problems panel, find/replace
- [ ] t3code: examine github.com/pingdotgg/t3code.git for patterns

### Libraries to Integrate

- [ ] just-bash (npm install just-bash): Virtual bash for agent sandboxing. Agents run in isolated in-memory filesystem. Source: github.com/vercel-labs/just-bash.git

### Additional Items from Session

- [ ] App bundleID still says com.github.Electron -- need electron-builder config
- [ ] PTY crash on exit -- pkill fix applied, may need electron-rebuild
- [ ] Menu bar event handlers missing for: Terminal items, Selection items, Go items, Run items
- [ ] CodeViewer needs syntax highlighting (Prism/Shiki)
- [ ] Monaco editor for real file editing (biggest gap per DELTA-V2.md)
- [ ] Check for Updates menu item needs electron-updater
- [ ] Recent projects merge (Electron IPC + localStorage)

## Key Decisions Made
1. **Approach C (design system first)**: Full Grove design system with CSS custom properties, then shell components built on top
2. **Sidebar only for views with content**: Chat, Files, Source Control, Agents get sidebar. Other pages are self-contained.
3. **No Tailwind/CSS modules**: Inline styles only with var(--token) references. Only shell.css for pseudo-classes.
4. **Server already uses stream-json**: Discovered during planning -- just needed thinking block support added
5. **ChatInputBar owns send logic**: ModelBar only has model/thinking/plan toggles, no send button. Props flow from Shell.

## Context That's Easy to Lose
- The project uses `inline styles only` -- no CSS modules, no Tailwind. This is in the studio-frontend.md agent spec.
- The `.tsx` extension is required in imports (Vite convention in this project)
- `window.studio` API is the Electron IPC bridge (defined in preload.cjs)
- The server spawns `claude --output-format stream-json --verbose --no-interactive` for chat
- `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1"` is set in the spawn env
- Prompts are sent via stdin, not CLI args
- Build command: `npm run build` from `packages/studio`
- Launch: `npm run electron` from `packages/studio`
- The `DESIGN.md` file has the Grove design system spec
- The `PRODUCT_BRIEF.md` has the product vision
- The `FLOWS.md` has 11 user flows with gaps documented

## Continuation Prompt

---
I'm continuing work on hashmark studio's shell overhaul. The project is at `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/packages/studio` on branch `feature/studio-shell-overhaul`.

**What's done**: Full VS Code shell structure (ActivityBar, Titlebar, SidebarPanel, StatusBar, ModelBar), Grove design tokens, structured chat rendering, context menus, custom dialogs, 3 sidebar content components (FileTree, Git, Agents), 49 UX audit items fixed. See the design spec at `docs/superpowers/specs/2026-03-19-shell-overhaul-design.md` and the competitive delta at `docs/shell-reference/SHELL-DELTA.md`.

**What to do now**: The user wants a COMPREHENSIVE audit and fix of the entire app. Every page, every interaction, every flow. Specific priorities:

1. **Layout toggle icons** in titlebar right section (split view, panel toggles like VS Code)
2. **Enhanced command palette** with file search (Cmd+P), recent files, keyboard badges
3. **Theme system** that actually works (dark/light switching, wire up settings)
4. **Wire up ALL settings** -- appearance, terminal, model defaults
5. **Full per-page audit**: test every click, every form, every API call on all 13 pages
6. **Context menus** on file tree items, agent cards, terminal, code viewer
7. **Replace remaining confirm/prompt** calls in CheckpointPanel.tsx, SourceControlPage.tsx with ConfirmDialog

**Rules**: Inline styles only (no Tailwind/CSS modules). Import with `.tsx` extension. Use Grove design tokens from `styles/tokens.css`. Build: `npm run build`, test: `npm run electron`. Read DESIGN.md for the design system, PRODUCT_BRIEF.md for vision, and the studio-frontend.md agent spec at `.claude/agents/studio/studio-frontend.md` for coding patterns.
---

### Research: TDAD (Test-Driven Agentic Development) -- arxiv.org/pdf/2603.17973
- [ ] Dependency graph for multi-agent conflict detection (Company/Swarm mode)
- [ ] Selective test execution based on change impact analysis
- [ ] Regression alerts when parallel agents modify overlapping code
- [ ] Visual impact graph in the UI showing which tests are affected
- [ ] Smart merge ordering based on dependency analysis


### Session 4 TODOs (2026-03-19 evening)

- [ ] **Welcome/landing page** -- NOT a Cursor copy but a clean opening screen with: hashmark logo, "Open Project" / "Scan Codebase" / "Recent Projects" cards, recent projects list. Shows when Chat view has no messages. User has asked for this MULTIPLE times.
- [ ] **Shift+click multi-select** -- can't select multiple items (files, agents, etc.) with shift-click
- [ ] **electron-builder codesigning** -- user fixed duplicate Apple Dev identity, `npm run dist:mac` should work now
- [ ] **Chat --no-interactive removed** -- was breaking Claude CLI spawn
- [ ] **handleNewSession before init** -- was causing black screen, fixed by moving declaration
- [ ] Continue full per-page flow testing
- [ ] Test light theme across all pages visually
- [ ] Test voice input (mic button)
- [ ] Test image paste in chat
- [ ] Test model auto-routing (select Auto, send messages of different lengths)
- [ ] Test plan mode approve/deny/feedback flow

### Session 5 TODOs (2026-03-19 evening)

- [ ] **Titlebar redesign** -- current titlebar doesn't match Conductor/Cursor pattern. Need:
  - Conductor style: `[traffic lights] [sidebar toggle] [edit/copy icons] > [repo/branch breadcrumb] > [origin/branch dropdown] [changes count badge] [refresh]` RIGHT: `[worktree path] [Open dropdown] [layout icons]`
  - Tab bar below titlebar: `[chat icon] [sparkle "Untitled"] [+]` for session tabs
  - Our current titlebar is too cluttered and doesn't flow like the references
- [ ] **Welcome/landing page** -- STILL NOT DONE. User has asked 4+ times. Need clean page with hashmark logo, action cards, recent projects when chat is empty.
- [ ] **Repo restructure done** -- Studio is now root, SaaS moved to ../hashmark-saas. Build with `npm run build && npm run electron` from root.

- [ ] **Syntax highlighting in code viewer** -- currently all one color (white text). Need Shiki or Prism for proper colored syntax highlighting like VS Code. FileContentViewer.tsx renders plain `<pre>` with no language-aware coloring.
- [ ] **Git status indicators in file tree** -- Explorer sidebar should show which files are modified (M), added (A), untracked (?), deleted (D) with colored labels/icons like VS Code. Files modified = yellow/orange, added = green, untracked = green with U, deleted = red strikethrough.

### MASSIVE UX GAP LIST from Conductor/VS Code comparison (Session 6)

**CHAT UX:**
- [ ] Chat messages should NOT go edge-to-edge -- need max-width container (like Conductor ~900px centered)
- [ ] Chat input box should be a rounded card with padding, not flush to edges
- [ ] Response time badge (e.g., "3.6s") with loading dots animation
- [ ] Tool call summary: "9 tool calls, 1 message" with expand chevron + copy/branch icons
- [ ] Thinking block with monospace preview inline
- [ ] File read blocks with colored file badges (e.g., "dakar/GRIPE_PLAN.md" in orange pill)
- [ ] Code blocks with proper syntax highlighting in chat responses
- [ ] "Scroll to bottom" pill button (Conductor style -- centered, dark bg)
- [ ] "Add a follow up" placeholder text instead of our generic one
- [ ] "Unsent message" banner is stuck -- need to fix/dismiss
- [ ] User message should be a right-aligned pill (we have this but styling differs)

**RIGHT SIDEBAR (Conductor has this, we don't):**
- [ ] Right sidebar with tabs: "All files" / "Changes 0" / "Checks"
- [ ] File tree in right sidebar with search + filter
- [ ] Terminal tabs in right sidebar bottom: "Setup" / "Run" / "Terminal" / "+"
- [ ] Working directory selector popup (search with checkboxes)

**SETTINGS PAGE (Conductor's is much richer):**
- [ ] Settings should be a full-page overlay with sidebar nav (not inline page)
- [ ] Settings sidebar categories: Chat, Appearance, Git, Env, Claude Code, Account
- [ ] "More" section: Experimental, Feedback, Check for updates, Changelog, Docs, Advanced
- [ ] Repositories section listing connected repos
- [ ] Per-repo settings: Root path, Workspaces path, Branch config, Remote origin, Preview URL
- [ ] Scripts section: Setup script, Run script, Archive script
- [ ] Preferences: Code review, Create PR, Branch rename, General preferences
- [ ] "Remove repository" danger button
- [ ] Version info in help menu: "Conductor v0.40.1 • Claude Code v2.1.75 • Codex v0.107.0"

**TERMINAL (VS Code level features we're missing):**
- [ ] Terminal tab bar: shell name + PID + split/trash/fullscreen/close icons
- [ ] New Terminal dropdown: bash, zsh, tmux, JavaScript Debug, GitHub Copilot CLI, etc.
- [ ] Terminal context menu: Split, Move to Editor, Move to New Window, Change Color, Change Icon, Rename, Kill
- [ ] Terminal "..." menu: Scroll to Prev/Next Command, Clear, Run Active File, Run Selected Text, Start Dictation, Go to Recent Directory, Run Recent Command
- [ ] Terminal font size controls: A- A+ CLR
- [ ] Terminal process info popup: PID, Command line, Shell integration status
- [ ] Green underline on active terminal tab

**COMMAND PALETTE (VS Code level):**
- [ ] "Search files by name (append : to go to line or @ to go to symbol)" placeholder
- [ ] "Go to File" as first option with Cmd+P badge
- [ ] "Show and Run Commands >" with Cmd+Shift+P badge
- [ ] "Search for Text %" option
- [ ] "Open Quick Chat" with Cmd+Shift+L badge
- [ ] "Go to Symbol in Editor @" with Cmd+Shift+O badge
- [ ] "Start Debugging" with "debug" label
- [ ] "Run Task" with "task" label
- [ ] "More ?" option
- [ ] Recently opened section at bottom

**ACTIVITY PAGE (Conductor's workspace overview):**
- [ ] Workspace activity list with "Filter workspaces..." search
- [ ] "Today 2" date grouping
- [ ] Each workspace row: repo icon + repo name > session name + branch + date + "Go to" arrow

**HELP MENU (Conductor):**
- [ ] Help icon (?) in sidebar bottom opens: Keyboard shortcuts, Docs, Best practices, Changelog, Send feedback, Submit a prompt, Open debug tools

**NEED BRUTAL AUDIT:**
- [ ] Run another full brutal audit of every route, click, context menu, tooltip
- [ ] Test every page flow end-to-end
- [ ] Fix all broken routes and dead clicks
- [ ] Document everything that's missing vs Conductor screenshots above

**CHROME / TITLEBAR POLISH:**
- [ ] Titlebar too tight/cramped -- needs more breathing room, better spacing
- [ ] Remove "<" chevron for sidebar toggle -- looks bad. Use a proper sidebar icon like Conductor (panel layout icon)
- [ ] Duplicate icons: same source control icon appears in both activity bar AND titlebar right -- confusing
- [ ] Titlebar right section has too many icons crammed together -- space them out, group logically
- [ ] PR button style is fine but the layout icons next to it look random

**COLOR SCHEME UNIFICATION:**
- [ ] Inconsistent accent colors: green (accent), blue (links/active), red (errors/deletions) are mixed without clear hierarchy
- [ ] Status bar is green, changes badge is red/green, active states are blue, tooltips show blue outlines -- pick ONE accent and use it consistently
- [ ] Conductor uses a single muted palette -- mostly gray with subtle warm tones, no bright colors except for status
- [ ] Our diff stats show bright green/red (+35673 -24847) which is too loud in the sidebar -- should be muted
- [ ] Context bar "1% of context used" uses blue which clashes with green accent
- [ ] Need a color hierarchy: primary accent (green), secondary (blue for links only), semantic only (red=error, yellow=warning, green=success)

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

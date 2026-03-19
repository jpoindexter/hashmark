# Shell Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 995-line Layout.tsx god component with a VS Code shell structure + Conductor agent-first workflow, built on the Grove design system.

**Architecture:** Decompose the shell into 7 focused components (Shell, Titlebar, ActivityBar, SidebarPanel, SidebarResize, StatusBar, ModelBar) that each own one responsibility. Extract 4 inline components from Layout.tsx before deletion. Enhance server streaming to include thinking blocks. Build structured chat message rendering.

**Tech Stack:** React 19, Vite 6, Hono, Electron 41, Lucide icons, xterm.js, better-sqlite3, inline styles with CSS custom properties (NO Tailwind/shadcn).

**Spec:** `docs/superpowers/specs/2026-03-19-shell-overhaul-design.md` (1151 lines, 12 sections)

**IMPORTANT:** This project uses inline styles only. No CSS modules, no Tailwind. Components use `style={{}}` objects referencing `var(--token)` values. The only CSS files are `tokens.css`, `reset.css`, and `shell.css` for global rules and pseudo-classes.

**IMPORTANT:** Do NOT write tests. Build first. User will request tests separately.

---

## File Map

### New files (25)

| File | Responsibility | Lines (est) |
|------|---------------|-------------|
| `client/src/styles/tokens.css` | Grove design tokens (CSS custom properties) | 60 |
| `client/src/styles/reset.css` | Base reset, body, scrollbar, animations | 80 |
| `client/src/styles/shell.css` | Pseudo-class rules (sash, status bar radius, hover) | 30 |
| `client/src/types/messages.ts` | MessagePart union type | 20 |
| `client/src/components/shell/Shell.tsx` | Root layout orchestrator | 200 |
| `client/src/components/shell/Titlebar.tsx` | 35px titlebar, three-column | 120 |
| `client/src/components/shell/ActivityBar.tsx` | 48px icon rail | 100 |
| `client/src/components/shell/SidebarPanel.tsx` | Resizable sidebar wrapper | 80 |
| `client/src/components/shell/SidebarResize.tsx` | Draggable sash | 80 |
| `client/src/components/shell/StatusBar.tsx` | 22px status bar | 60 |
| `client/src/components/shell/ModelBar.tsx` | Model selector + thinking + plan | 150 |
| `client/src/components/chat/MessageBlock.tsx` | Message part type dispatcher | 80 |
| `client/src/components/chat/ThinkingBlock.tsx` | Collapsible thinking block | 60 |
| `client/src/components/chat/ToolSummary.tsx` | Tool call summary header | 50 |
| `client/src/components/sidebar/SessionsSidebar.tsx` | Workspaces + sessions list | 200 |
| `client/src/components/shared/IconButton.tsx` | Ghost button (Grove tokens) | 40 |
| `client/src/components/shared/Badge.tsx` | Status badge | 30 |
| `client/src/components/shared/ScrollToBottom.tsx` | Sticky scroll button | 50 |
| `client/src/components/DiffDrawer.tsx` | Extracted from Layout.tsx | 90 |
| `client/src/components/BranchPicker.tsx` | Extracted from Layout.tsx | 100 |
| `client/src/components/DriftIndicator.tsx` | Extracted from Layout.tsx | 180 |
| `client/src/components/ProjectSwitcher.tsx` | Extracted from Layout.tsx | 80 |
| `client/src/components/ShortcutsHelp.tsx` | Extracted from Layout.tsx | 80 |
| `client/src/hooks/useProjectInfo.ts` | Fetches info + git + drift | 60 |
| `client/src/hooks/useKeyboardNav.ts` | Keyboard shortcut registration | 80 |

### Modified files (5)

| File | Change |
|------|--------|
| `client/src/App.tsx` | Swap `<Layout>` for `<Shell>`, remove Layout import |
| `client/src/components/ChatMessages.tsx` | Add MessageBlock dispatch for thinking/tool blocks |
| `client/src/components/ChatInputBar.tsx` | Remove inline ModelPill (moved to ModelBar), remove ProviderSelector |
| `server/routes/sessions.ts` | Add thinking event type to stream parsing |
| `client/src/index.css` | Replace with imports of tokens.css + reset.css + shell.css |

### Deleted files (4)

| File | Replaced by |
|------|-------------|
| `client/src/components/Layout.tsx` | `shell/Shell.tsx` + shell components |
| `client/src/components/ActivitySidebar.tsx` | `sidebar/SessionsSidebar.tsx` |
| `client/src/components/ChatPanel.tsx` | Already superseded |
| `client/src/components/WorkspaceSidebar.tsx` | `sidebar/SessionsSidebar.tsx` |

---

## Task 1: Grove Design Tokens + CSS Foundation

**Files:**
- Create: `client/src/styles/tokens.css`
- Create: `client/src/styles/reset.css`
- Create: `client/src/styles/shell.css`
- Modify: `client/src/index.css`

This task replaces the current ad-hoc CSS variables with the Grove design system tokens and sets up the CSS foundation.

- [ ] **Step 1: Create `client/src/styles/tokens.css`**

All Grove design tokens from DESIGN.md. Every color, font, spacing, radius value the shell uses.

```css
:root {
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

  /* Typography */
  --font:    'JetBrains Mono', 'Fira Code', Menlo, monospace;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Border Radius */
  --radius:    4px;
  --radius-sm: 3px;
  --radius-lg: 6px;

  /* Spacing constants */
  --titlebar-height: 35px;
  --activity-bar-width: 48px;
  --status-bar-height: 22px;
  --sidebar-default-width: 240px;
  --sidebar-min-width: 170px;
}
```

- [ ] **Step 2: Create `client/src/styles/reset.css`**

Base reset, body styles, Google Fonts import, scrollbar, animations. Move the non-variable parts from current `index.css`.

- [ ] **Step 3: Create `client/src/styles/shell.css`**

Pseudo-class rules that can't be inline (sash, status bar radius, hover states, scrollbar). Keep under 30 lines.

```css
.sash { cursor: col-resize; position: relative; }
.sash::before {
  content: ''; position: absolute; top: 0; bottom: 0;
  width: 4px; left: -2px;
  transition: background-color 0.1s ease-out;
}
.sash:hover::before, .sash.active::before { background: var(--border); }
.sash.at-min { cursor: e-resize; }
.sash.at-max { cursor: w-resize; }
.status-bar { border-bottom-left-radius: 10px; border-bottom-right-radius: 10px; }
.activity-item:hover { color: var(--text-dim) !important; }
```

- [ ] **Step 4: Replace `client/src/index.css`**

Replace the entire file with three imports:
```css
@import './styles/tokens.css';
@import './styles/reset.css';
@import './styles/shell.css';
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Builds successfully. The app should look slightly different (new token colors) but not broken.

- [ ] **Step 6: Commit**

```bash
git add client/src/styles/ client/src/index.css
git commit -m "feat(studio): Grove design token system -- tokens.css, reset.css, shell.css"
```

---

## Task 2: Shared Components + Types

**Files:**
- Create: `client/src/types/messages.ts`
- Create: `client/src/components/shared/IconButton.tsx`
- Create: `client/src/components/shared/Badge.tsx`
- Create: `client/src/components/shared/ScrollToBottom.tsx`

Small reusable components used by the shell. Build these first since everything depends on them.

- [ ] **Step 1: Create `client/src/types/messages.ts`**

```typescript
export type MessagePart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string; id: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown>; id: string }
  | { type: "tool_result"; output: string; id: string; isError?: boolean }
  | { type: "agent"; description: string; id: string }
  | { type: "skill"; name: string; id: string }
  | { type: "progress"; text: string }
  | { type: "error"; message: string };

export interface StructuredMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}
```

- [ ] **Step 2: Create `client/src/components/shared/IconButton.tsx`**

Grove ghost button: 22x22, no bg, `--text-dimmer`, hover `rgba(255,255,255,0.08)`, radius 3px. Uses `onMouseEnter`/`onMouseLeave` for hover state (inline styles, no CSS).

- [ ] **Step 3: Create `client/src/components/shared/Badge.tsx`**

Pill badge: font-size 9px, weight 600, min-width 12px, border-radius 20px, padding 0 4px. Variants: default, green, blue, yellow, red.

- [ ] **Step 4: Create `client/src/components/shared/ScrollToBottom.tsx`**

Sticky button above input bar. Shows chevron-down + "Scroll to bottom". Appears when user scrolls up past 80px threshold. Click scrolls to bottom.

- [ ] **Step 5: Commit**

```bash
git add client/src/types/ client/src/components/shared/
git commit -m "feat(studio): shared components -- IconButton, Badge, ScrollToBottom, MessagePart types"
```

---

## Task 3: Extract Inline Components from Layout.tsx

**Files:**
- Create: `client/src/components/DiffDrawer.tsx`
- Create: `client/src/components/BranchPicker.tsx`
- Create: `client/src/components/DriftIndicator.tsx`
- Create: `client/src/components/ProjectSwitcher.tsx`
- Create: `client/src/components/ShortcutsHelp.tsx`
- Modify: `client/src/components/Layout.tsx` (import extracted components)

Layout.tsx has 5 inline components that must be extracted BEFORE deletion. Extract each to its own file, then update Layout.tsx to import them. This keeps the app working throughout the migration.

- [ ] **Step 1: Read Layout.tsx fully**

Read the complete file to identify exact line ranges for each inline component.

- [ ] **Step 2: Extract DiffDrawer (Layout.tsx lines 62-142)**

Move the `DiffDrawer` component to `components/DiffDrawer.tsx`. Export as default. Keep all props and internal state. Replace hardcoded colors with Grove token vars.

- [ ] **Step 3: Extract BranchPicker (Layout.tsx lines 832-917)**

Move `BranchPicker` to `components/BranchPicker.tsx`. Add searchable input at top of dropdown (currently missing -- the spec requires it). Export as default.

- [ ] **Step 4: Extract DriftIndicator (Layout.tsx lines 560-735)**

Move `DriftBadge`, `DriftBanner`, and `signalLabel` to `components/DriftIndicator.tsx`. Export both `DriftBadge` and `DriftBanner` as named exports.

- [ ] **Step 5: Extract ProjectSwitcher (Layout.tsx lines 919-994)**

Move `ProjectSwitcher` to `components/ProjectSwitcher.tsx`. Export as default.

- [ ] **Step 6: Extract ShortcutsHelp (Layout.tsx lines 759-830)**

Move `ShortcutsHelp` to `components/ShortcutsHelp.tsx`. Export as default.

- [ ] **Step 7: Update Layout.tsx imports**

Replace inline component definitions in Layout.tsx with imports from the new files. Verify the app still works.

- [ ] **Step 8: Build and verify**

Run: `npm run build && npm run electron`
Expected: App works identically to before extraction.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/DiffDrawer.tsx client/src/components/BranchPicker.tsx \
  client/src/components/DriftIndicator.tsx client/src/components/ProjectSwitcher.tsx \
  client/src/components/ShortcutsHelp.tsx client/src/components/Layout.tsx
git commit -m "refactor(studio): extract 5 inline components from Layout.tsx"
```

---

## Task 4: Custom Hooks (extracted from Layout.tsx effects)

**Files:**
- Create: `client/src/hooks/useProjectInfo.ts`
- Create: `client/src/hooks/useKeyboardNav.ts`

Extract the side effects from Layout.tsx into reusable hooks. Shell.tsx will use these instead of inline useEffects.

- [ ] **Step 1: Create `client/src/hooks/useProjectInfo.ts`**

Extracts these effects from Layout.tsx:
- Fetch `/api/info` on mount -> `info` state
- Fetch `/api/files/git` on mount + poll every 3s during streaming -> `git` state
- Fetch `/api/drift/check` on mount -> `drift` state
- Auto-open diff drawer when streaming stops and files changed

Returns: `{ info, git, drift, changedFiles, refreshGit }`

- [ ] **Step 2: Create `client/src/hooks/useKeyboardNav.ts`**

Extracts keyboard shortcut registration:
- `g+key` navigation (g s, g f, g a, g g, g r, g c)
- `?` shortcuts overlay toggle
- Cmd+K, Cmd+Shift+P command palette toggle
- Cmd+`, Cmd+J terminal toggle

Takes: `navigate` function, state setters.
Returns: nothing (side effect only).

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/
git commit -m "refactor(studio): extract useProjectInfo and useKeyboardNav hooks"
```

---

## Task 5: Shell Components -- StatusBar, Titlebar, ActivityBar

**Files:**
- Create: `client/src/components/shell/StatusBar.tsx`
- Create: `client/src/components/shell/Titlebar.tsx`
- Create: `client/src/components/shell/ActivityBar.tsx`

Build the three simplest shell components. These are leaf components with no children to manage.

- [ ] **Step 1: Create StatusBar.tsx**

22px height, `--accent` background, `rgba(0,0,0,0.8)` text. Font: 12px `--font-ui`, `font-variant-numeric: tabular-nums`. CSS class `status-bar` for Mac bottom radius.

Props: `{ branch, changedFiles, projectName, modelName }`. Left: branch + changes. Right: model + project name. Each item is a clickable div with hover `rgba(0,0,0,0.12)`.

- [ ] **Step 2: Create Titlebar.tsx**

35px height, `--bg-2` background. Three-column flexbox. `paddingLeft: 70px` for traffic lights. `WebkitAppRegion: drag` on container, `no-drag` on children.

Props: `{ projectName, git, drift, sidebarOpen, onToggleSidebar, changedFiles, onDiffOpen, streaming, routeTitle }`.

Left: sidebar toggle + project name + separator + BranchPicker + changes badge.
Center: empty (future command center).
Right: route badge.

Import `BranchPicker` and `DriftBadge` from extracted components.

- [ ] **Step 3: Create ActivityBar.tsx**

48px width, `--bg-2` background. Vertical flexbox with `justify-content: space-between`.

Props: `{ activeView, onViewChange, sidebarOpen, onToggleSidebar }`.

Each icon is a `NavLink` with:
- Height 48px, width 48px
- 20px Lucide icon
- Active: `border-left: 2px solid var(--accent)`, `color: var(--text)`
- Inactive: `border-left: 2px solid transparent`, `color: var(--text-dimmer)`
- CSS class `activity-item` for hover state

Click behavior: if clicking same icon AND sidebar open, call `onToggleSidebar()`. Otherwise call `onViewChange(view)` and ensure sidebar is open.

Top icons: MessageSquare, FolderTree, GitCompare, Bot, PlayCircle, Zap, Shield.
Bottom: Settings.

- [ ] **Step 4: Build and verify components render**

Create a temporary test page that renders all three. Verify styles match spec.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/shell/
git commit -m "feat(studio): shell components -- StatusBar, Titlebar, ActivityBar"
```

---

## Task 6: SidebarPanel + SidebarResize

**Files:**
- Create: `client/src/components/shell/SidebarPanel.tsx`
- Create: `client/src/components/shell/SidebarResize.tsx`

- [ ] **Step 1: Create SidebarResize.tsx**

A 1px-wide draggable sash. Uses `onMouseDown` to start tracking, `document.addEventListener('mousemove')` to update width, `mouseup` to stop. CSS class `sash` for cursor/pseudo-element. Double-click resets to 240px.

Props: `{ onResize: (width: number) => void, onReset: () => void }`.

During drag: dispatches `onResize(newWidth)` clamped to [170, window.innerWidth * 0.5]. Locks cursor via inline style on a full-screen overlay div (avoids iframes stealing events).

- [ ] **Step 2: Create SidebarPanel.tsx**

Container div with `width`, `overflow: hidden`, `transition: width 0.18s ease`. Renders a 35px header with uppercase title, then delegates to content component based on `activeView`.

Props: `{ activeView, width, open, sessionsSidebar, onToggle }`.

Content mount strategy: all sidebar components mount simultaneously, toggled with `display: none`. For now, only SessionsSidebar is real. Others are stubs showing the page component inline or a "Coming soon" message.

```tsx
<div style={{ display: activeView === 'chat' ? 'flex' : 'none', ... }}>
  {sessionsSidebar}
</div>
<div style={{ display: activeView === 'files' ? 'flex' : 'none', ... }}>
  <div style={{ padding: 16, color: 'var(--text-dimmer)', fontSize: 12 }}>File explorer -- renders in main content</div>
</div>
{/* etc for each view */}
```

Header title changes per view: Chat->"Sessions", Explorer->"Explorer", Source Control->"Source Control", etc.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shell/SidebarPanel.tsx client/src/components/shell/SidebarResize.tsx
git commit -m "feat(studio): SidebarPanel with resize sash"
```

---

## Task 7: SessionsSidebar (replaces ActivitySidebar)

**Files:**
- Create: `client/src/components/sidebar/SessionsSidebar.tsx`

- [ ] **Step 1: Create SessionsSidebar.tsx**

Replaces ActivitySidebar.tsx. Follows Conductor pattern with 22px rows.

Props: `{ activeSessionId, onSessionSelect, git }`.

Structure:
- Section header "Sessions" (22px, bold uppercase) with "+" button
- Workspace row (22px): collapse chevron, 16x16 letter avatar, workspace name, branch, diff stats
- Session rows (22px, indented 28px): status dot, title (single line), keyboard shortcut on hover
- No bottom action bar

Port the data fetching from ActivitySidebar.tsx (fetch /api/sessions, /api/info, /api/agents, /api/files/git). Keep the same polling intervals.

Use `IconButton` from shared components.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/sidebar/SessionsSidebar.tsx
git commit -m "feat(studio): SessionsSidebar -- Conductor-style workspace + sessions list"
```

---

## Task 8: ModelBar

**Files:**
- Create: `client/src/components/shell/ModelBar.tsx`

- [ ] **Step 1: Create ModelBar.tsx**

32px height, `--bg-2` background, border-top `1px solid var(--border-dim)`.

Props: `{ selectedModel, onModelChange, thinking, onToggleThinking, planMode, onTogglePlan, onAttach, onSend, canSend }`.

Left section:
- Sparkle icon + model label (click opens dropdown above)
- Brain icon + "Thinking" label (toggle, `--accent` when active)
- Clipboard icon + "Plan" label (toggle)

Right section:
- "+" button (attach, future)
- Send button (ArrowUp in circle, `--accent` bg when `canSend`)

Model dropdown: positioned absolutely above the bar. Lists models from `MODELS` array (already defined in ChatInputBar.tsx -- reuse that). Checkmark on selected.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/shell/ModelBar.tsx
git commit -m "feat(studio): ModelBar -- model selector, thinking toggle, plan mode"
```

---

## Task 9: Chat Message Enhancements

**Files:**
- Create: `client/src/components/chat/MessageBlock.tsx`
- Create: `client/src/components/chat/ThinkingBlock.tsx`
- Create: `client/src/components/chat/ToolSummary.tsx`
- Modify: `client/src/components/ChatMessages.tsx`
- Modify: `server/routes/sessions.ts`

- [ ] **Step 1: Add thinking event to server streaming**

In `server/routes/sessions.ts`, find the Claude CLI stdout parser (the `line-by-line JSON parsing` section). Currently it handles `assistant` events with `content[]` blocks of type `text`, `tool_use`, `tool_result`. Add handling for `thinking` type:

```typescript
// In the content block iteration:
if (block.type === "thinking") {
  send({ type: "thinking", content: block.thinking, id: block.id || randomUUID() });
}
```

- [ ] **Step 2: Create ThinkingBlock.tsx**

Collapsible block: brain icon (16px, `--yellow`), "Thinking" label, monospace preview truncated to 80 chars. Click to expand/collapse full thinking text.

```tsx
export default function ThinkingBlock({ content, id }: { content: string; id: string }) {
  const [expanded, setExpanded] = useState(false);
  // ... render brain icon + label + preview/full text
}
```

- [ ] **Step 3: Create ToolSummary.tsx**

Collapsible header showing tool call count, message count, subagent count. Chevron-down icon. Click to expand/collapse the full execution trace below it.

- [ ] **Step 4: Create MessageBlock.tsx**

Type dispatcher that renders the correct component based on `MessagePart.type`:

```tsx
export default function MessageBlock({ part }: { part: MessagePart }) {
  switch (part.type) {
    case "thinking": return <ThinkingBlock content={part.content} id={part.id} />;
    case "tool_use": return <ToolUseBlock block={{ type: "tool_use", tool: part.name, input: part.input }} />;
    case "text": return <AssistantContent text={part.content} />;
    case "progress": return <div style={{ color: "var(--text-dimmer)", fontStyle: "italic", fontSize: 12 }}>{part.text}</div>;
    case "error": return <div style={{ color: "var(--red)", fontSize: 12 }}>{part.message}</div>;
    default: return null;
  }
}
```

Import `ToolUseBlock` and `AssistantContent` from ChatMessages.tsx (these need to be exported from there).

- [ ] **Step 5: Update ChatMessages.tsx**

Export `AssistantContent` and `ToolUseBlock` so MessageBlock can use them.

In `StreamingBubble`, use `MessageBlock` for each block in `state.blocks`:
```tsx
{state.blocks.map((block, i) => (
  <MessageBlock key={i} part={blockToMessagePart(block)} />
))}
```

Add a `blockToMessagePart` converter that maps existing `ContentBlock` types to the new `MessagePart` union.

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Builds successfully. Existing chat still works. If Claude sends thinking blocks (when thinking is enabled), they now render as collapsible amber sections.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/chat/ server/routes/sessions.ts client/src/components/ChatMessages.tsx
git commit -m "feat(studio): structured chat -- ThinkingBlock, ToolSummary, MessageBlock dispatcher"
```

---

## Task 10: Shell.tsx Orchestrator

**Files:**
- Create: `client/src/components/shell/Shell.tsx`

This is the big one. Shell.tsx replaces Layout.tsx as the root layout component.

- [ ] **Step 1: Create Shell.tsx**

Read Layout.tsx carefully. Shell.tsx must:

1. Import all shell components (Titlebar, ActivityBar, SidebarPanel, SidebarResize, StatusBar, ModelBar)
2. Import existing components (ChatMessages, ChatInputBar, ContextBar, TerminalTabs, ResizableDrawer, CommandPalette)
3. Import extracted components (DiffDrawer, ShortcutsHelp)
4. Import hooks (useProjectInfo, useKeyboardNav)
5. Import SessionsSidebar
6. Use `Outlet` from react-router-dom for page content

State (ported from Layout.tsx):
- `activeView` -- which activity bar icon is selected (derived from route)
- `sidebarOpen` + `sidebarWidth` -- persisted to localStorage
- `termOpen` + `termBig` -- persisted
- `activeTab` (TERMINAL/OUTPUT)
- `activeSessionId` -- persisted
- `streamText`, `streaming`, `streamingState`
- `terminalCwd`
- `diffOpen`, `driftDismissed`
- `cmdOpen`, `shortcutsOpen`

Effects (via hooks):
- `useProjectInfo(streaming)` -> `{ info, git, drift, changedFiles, refreshGit }`
- `useKeyboardNav(navigate, setCmdOpen, setShortcutsOpen, setTermOpen)`
- Electron menu events (inline useEffect)
- Active session persistence (inline useEffect)
- Auto-create session (inline useEffect)

Render structure:
```tsx
<div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
  <Titlebar ... />
  <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
    <ActivityBar activeView={activeView} onViewChange={handleViewChange} ... />
    <SidebarPanel activeView={activeView} width={sidebarWidth} open={sidebarOpen} sessionsSidebar={<SessionsSidebar ... />} />
    <SidebarResize onResize={setSidebarWidth} onReset={() => setSidebarWidth(240)} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Main content */}
      <div style={{ flex: termBig ? 0 : 1, display: termBig ? "none" : "flex", flexDirection: "column" }}>
        {isHome ? <ChatMessages ... /> : <div style={{ flex: 1, overflow: "auto" }}><Outlet /></div>}
      </div>
      {/* Terminal drawer */}
      <ResizableDrawer open={termOpen} onToggle={() => setTermOpen(v => !v)} defaultHeight={280}>
        {/* terminal tabs + content, same as Layout.tsx */}
      </ResizableDrawer>
      {/* Chat bar (hidden on settings/setup) */}
      {showChatBar && <>
        <ContextBar ... />
        <ChatInputBar ... />
        <ModelBar ... />
      </>}
    </div>
  </div>
  <StatusBar ... />
  <CommandPalette ... />
  {shortcutsOpen && <ShortcutsHelp ... />}
  <DiffDrawer ... />
</div>
```

- [ ] **Step 2: Build and verify Shell.tsx compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shell/Shell.tsx
git commit -m "feat(studio): Shell.tsx -- root layout orchestrator replacing Layout.tsx"
```

---

## Task 11: Wire Shell into App.tsx + Delete Old Files

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/ChatInputBar.tsx`
- Delete: `client/src/components/Layout.tsx`
- Delete: `client/src/components/ActivitySidebar.tsx`

- [ ] **Step 1: Update App.tsx**

Change the import from `Layout` to `Shell`:
```tsx
// Before:
import Layout from "./components/Layout.tsx";
// After:
import Shell from "./components/shell/Shell.tsx";
```

Change the route element:
```tsx
// Before:
<Route path="/" element={<Layout />}>
// After:
<Route path="/" element={<Shell />}>
```

- [ ] **Step 2: Update ChatInputBar.tsx**

Remove the inline `ModelPill` component and `ProviderSelector` import -- these are now handled by `ModelBar`. ChatInputBar should:
- Keep the textarea, slash commands, mention picker, agent chips
- Remove the model selector from the bottom of the input area
- Remove thinking badge from input area (moved to ModelBar)
- Export `selectedModel`, `thinking`, `planMode` state so Shell can pass them to ModelBar, OR lift these to Shell.tsx

Best approach: Lift `selectedModel`, `thinking`, `planMode` to Shell.tsx. ChatInputBar receives them as props.

- [ ] **Step 3: Build and verify**

Run: `npm run build && npm run electron`
Expected: App runs with new shell. Activity bar on left, sidebar panel, titlebar at top, status bar at bottom, model bar below input.

- [ ] **Step 4: Delete old files**

Only after verifying the new shell works:
```bash
rm client/src/components/Layout.tsx
rm client/src/components/ActivitySidebar.tsx
```

Check if `ChatPanel.tsx` and `WorkspaceSidebar.tsx` exist and delete if so:
```bash
ls client/src/components/ChatPanel.tsx client/src/components/WorkspaceSidebar.tsx 2>/dev/null
```

- [ ] **Step 5: Build and verify after deletion**

Run: `npm run build`
Expected: Clean build. No references to deleted files.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(studio): swap Layout for Shell, delete old components"
```

---

## Task 12: Token Alignment Pass

**Files:**
- Modify: Multiple existing components (find-and-replace)

- [ ] **Step 1: Find all hardcoded color values in retained components**

Search for `rgba(255`, `#10b981`, `#111`, `#181818`, `"rgba(` in all .tsx files under `client/src/components/` (excluding the new shell/ directory).

- [ ] **Step 2: Replace hardcoded values with var(--token) references**

Common replacements:
- `#10b981` -> `var(--accent)` (old emerald accent)
- `rgba(255,255,255,0.08)` -> `var(--accent-bg)` or `rgba(255,255,255,0.08)` (keep if it's a hover state)
- `#111` -> `var(--bg-2)`
- `#181818` -> `var(--bg-2)`
- `rgba(255,255,255,0.06)` -> `var(--border-dim)` equivalent
- `rgba(255,255,255,0.07)` -> use `var(--border-dim)`

Only touch color values that reference the old palette. Don't change structural code.

- [ ] **Step 3: Build and verify**

Run: `npm run build && npm run electron`
Expected: Consistent color palette across all components. No old emerald green visible.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style(studio): token alignment -- replace hardcoded colors with Grove vars"
```

---

## Task 13: Final Polish + Verification

- [ ] **Step 1: Verify all 21 interaction flows from the spec**

Walk through each flow from spec section 9 and verify it works:
1. First launch (open without project)
2. Activity bar click (toggle same, switch different)
3. Sidebar resize (drag sash, double-click reset)
4. Chat (send message, streaming, auto-scroll)
5. Session switching (click sidebar, Cmd+1)
6. Keyboard shortcuts (g+s, Cmd+K, Cmd+`, ?)
7. Terminal (toggle, resize, tabs)
8. Model selector (dropdown, switch)
9. Thinking toggle (on/off)
10. Branch picker (dropdown)
11. Status bar (clickable items)
12. Empty states (no sessions, no project)
13. Navigate to all 7 activity bar views

- [ ] **Step 2: Fix any issues found**

Address visual bugs, interaction issues, missing features.

- [ ] **Step 3: Final build + electron test**

Run: `npm run build && npm run electron`
Expected: Full shell working with all views accessible.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(studio): shell overhaul polish -- interaction fixes"
```

- [ ] **Step 5: Push branch**

```bash
git push origin feature/studio-shell-overhaul
```

# Conductor UI Component Specification

Extracted from `assets_main-DwjO71wj.js` (9.4MB, 3854 lines) and `assets_main-BEusvwrI.css` (200KB).
All classNames are exact production Tailwind classes from the minified bundle.

---

## FOUNDATIONS

### Fonts
```
--font-sans: "SF Pro", system-ui, sans-serif
--font-mono: "Geist Mono"
--font-heading: var(--font-sans)
```

### Base Radius
```
radius: "0.5rem" (default theme)
```

### Color Palette (HSL values)

#### Accent (warm neutral/terracotta)
```
accent-25:  58 100% 100%
accent-50:  28 33% 97%
accent-100: 24 33% 93%
accent-200: 25 38% 86%
accent-300: 22 39% 78%
accent-400: 19 35% 69%
accent-600: 9 17% 57%
accent-700: 4 12% 46%
accent-800: 360 13% 31%
accent-900: 360 15% 22%
accent-950: 5 19% 14%
```

#### Gray (warm gray)
```
gray-0:    30 0% 100%
gray-25:   30 10% 98%
gray-50:   30 9% 95%
gray-100:  30 8% 91%
gray-200:  24 7% 81%
gray-300:  20 6% 72%
gray-400:  23 5% 63%
gray-500:  22 4% 54%
gray-600:  23 5% 44%
gray-700:  24 6% 35%
gray-800:  25 7% 26%
gray-900:  25 8% 16%
gray-950:  24 9% 12%
gray-1000: 24 10% 7%
```

#### Transparent White
```
tw-100: 0 0% 100% / 0.9
tw-400: 0 0% 100% / 0.6
tw-800: 0 0% 100% / 0.2
tw-900: 0 0% 100% / 0.1
tw-950: 0 0% 100% / 0.05
```

#### Transparent Black
```
tb-50:  4 14% 7% / 0.05
tb-100: 4 14% 7% / 0.1
tb-500: 4 14% 7% / 0.5
tb-700: 4 14% 7% / 0.7
tb-800: 4 14% 7% / 0.8
```

#### Green
```
green-50:  138 76% 97%
green-300: 142 77% 73%
green-400: 142 69% 58%
green-500: 142 71% 45%
green-600: 142 76% 36%
green-700: 142 72% 29%
green-950: 144 48% 15%
```

#### Red
```
red-50:  0 86% 97%
red-300: 0 94% 82%
red-400: 0 91% 71%
red-500: 0 84% 60%
red-600: 0 72% 51%
red-700: 0 74% 60%
red-950: 0 60% 26%
```

#### Blue
```
blue-300: 212 96% 78%
blue-400: 213 94% 68%
blue-500: 217 91% 60%
blue-600: 221 83% 53%
```

#### Yellow
```
yellow-300: 50 100% 84%
yellow-400: 50 100% 75%
yellow-500: 50 100% 69%
yellow-600: 50 100% 59%
yellow-800: 50 100% 44%
yellow-900: 50 100% 36%
```

#### Cyan
```
cyan-300: 187 92% 73%
cyan-400: 188 85% 59%
cyan-500: 189 94% 43%
cyan-600: 192 90% 36%
```

#### Fuchsia
```
fuchsia-300: 292 100% 78%
fuchsia-400: 292 100% 66%
fuchsia-500: 292 100% 54%
fuchsia-600: 292 100% 46%
```

### Light Theme Semantic Tokens
```
highlight:                accent-50 (28 33% 97%)
unread:                   accent-600 (9 17% 57%)
special:                  accent-400 (19 35% 69%)
highlight-foreground:     accent-800 (360 13% 31%)
border-highlight:         accent-600 (9 17% 57%)
highlight-muted:          accent-400 (19 35% 69%)
accent:                   gray-25 (30 10% 98%)
accent-foreground:        gray-900 (25 8% 16%)
background:               gray-0 (30 0% 100%)
border:                   gray-100 (30 8% 91%)
card:                     gray-0 (30 0% 100%)
card-foreground:          gray-950 (24 9% 12%)
destructive:              red-600 (0 72% 51%)
destructive-foreground:   red-50 (0 86% 97%)
success:                  green-600 (142 76% 36%)
success-foreground:       green-50 (138 76% 97%)
foreground:               gray-900 (25 8% 16%)
input:                    transparentBlack-100 (4 14% 7% / 0.1)
muted:                    gray-25 (30 10% 98%)
muted-foreground:         gray-500 (22 4% 54%)
primary:                  accent-900 (360 15% 22%)
primary-foreground:       gray-50 (30 9% 95%)
ring:                     gray-900 (25 8% 16%)
secondary:                gray-25 (30 10% 98%)
secondary-foreground:     gray-900 (25 8% 16%)
input-border:             transparentBlack-100 (4 14% 7% / 0.1)
positive:                 green-600 (142 76% 36%)
positive-muted:           green-50 (138 76% 97%)
positive-foreground:      green-50 (138 76% 97%)
helper:                   gray-400 (23 5% 63%)
link:                     accent-50 (28 33% 97%)
link-foreground:          accent-600 (9 17% 57%)
link-elevated:            accent-100 (24 33% 93%)
overlay:                  0 0% 0%
separator:                gray-100 (30 8% 91%)
faint:                    gray-400 (23 5% 63%)
composer-background:      gray-25 / 0.5
popover:                  gray-0 (30 0% 100%)
popover-accent:           transparentBlack-50 (4 14% 7% / 0.05)
popover-foreground:       gray-950 (24 9% 12%)
popover-ring:             gray-950 / 0.05
```

### Light Theme Sidebar Tokens
```
sidebar-foreground:         transparentBlack-700 (4 14% 7% / 0.7)
sidebar-background:         gray-25 (30 10% 98%)
sidebar-primary:            gray-900 (25 8% 16%)
sidebar-primary-foreground: gray-50 (30 9% 95%)
sidebar-muted-foreground:   transparentBlack-500 (4 14% 7% / 0.5)
sidebar-accent:             transparentBlack-50 (4 14% 7% / 0.05)
sidebar-accent-foreground:  transparentBlack-800 (4 14% 7% / 0.8)
sidebar-border:             transparentBlack-100 (4 14% 7% / 0.1)
sidebar-ring:               gray-400 (23 5% 63%)
sidebar-blue:               blue-600 (221 83% 53%)
```

### Light Theme Git Colors
```
git-green:   green-600 (142 76% 36%)
git-red:     red-600 (0 72% 51%)
git-yellow:  yellow-600 (50 100% 59%)
git-gray:    gray-400 (23 5% 63%)
```

### Light Theme Terminal Colors
```
terminal-black:          gray-900
terminal-red:            red-600
terminal-green:          green-600
terminal-yellow:         yellow-600
terminal-blue:           blue-600
terminal-magenta:        fuchsia-600
terminal-cyan:           cyan-600
terminal-white:          gray-100
terminal-bright-black:   gray-600
terminal-bright-red:     red-500
terminal-bright-green:   green-500
terminal-bright-yellow:  yellow-500
terminal-bright-blue:    blue-500
terminal-bright-magenta: fuchsia-500
terminal-bright-cyan:    cyan-500
terminal-bright-white:   gray-50
```

### Dark Theme Semantic Tokens
```
highlight:                accent-950 (5 19% 14%)
unread:                   accent-400 (19 35% 69%)
special:                  accent-400 (19 35% 69%)
highlight-foreground:     accent-100 (24 33% 93%)
border-highlight:         accent-400 (19 35% 69%)
highlight-muted:          accent-300 (22 39% 78%)
accent:                   gray-900 (25 8% 16%)
accent-foreground:        gray-50 (30 9% 95%)
background:               gray-1000 (24 10% 7%)
border:                   transparentWhite-900 (0 0% 100% / 0.1)
card:                     gray-900 (25 8% 16%)
card-foreground:          gray-50 (30 9% 95%)
destructive:              red-400 (0 91% 71%)
destructive-foreground:   red-50 (0 86% 97%)
success:                  green-400 (142 69% 58%)
success-foreground:       green-50 (138 76% 97%)
foreground:               gray-100 (30 8% 91%)
input:                    transparentWhite-800 (0 0% 100% / 0.2)
muted:                    gray-950 (24 9% 12%)
muted-foreground:         gray-400 (23 5% 63%)
primary:                  gray-50 (30 9% 95%)
primary-foreground:       gray-900 (25 8% 16%)
ring:                     gray-300 (20 6% 72%)
secondary:                gray-950 (24 9% 12%)
secondary-foreground:     gray-50 (30 9% 95%)
input-border:             transparentWhite-800 (0 0% 100% / 0.2)
positive:                 green-400 (142 69% 58%)
positive-muted:           green-950 (144 48% 15%)
positive-foreground:      green-50 (138 76% 97%)
faint:                    gray-600 (23 5% 44%)
composer-background:      gray-950 (24 9% 12%)
popover:                  gray-900 (25 8% 16%)
popover-accent:           transparentWhite-950 (0 0% 100% / 0.05)
popover-foreground:       gray-100 (30 8% 91%)
popover-ring:             transparentWhite-900 (0 0% 100% / 0.1)
```

### Dark Theme Sidebar Tokens
```
sidebar-foreground:         transparentWhite-100 (0 0% 100% / 0.9)
sidebar-background:         gray-950 (24 9% 12%)
sidebar-primary:            gray-100 (30 8% 91%)
sidebar-primary-foreground: gray-0 (30 0% 100%)
sidebar-muted-foreground:   transparentWhite-400 (0 0% 100% / 0.6)
sidebar-accent:             transparentWhite-950 (0 0% 100% / 0.05)
sidebar-accent-foreground:  transparentWhite-100 (0 0% 100% / 0.9)
sidebar-border:             transparentWhite-900 (0 0% 100% / 0.1)
sidebar-ring:               gray-300 (20 6% 72%)
sidebar-blue:               blue-400 (213 94% 68%)
```

### Dark Theme Git Colors
```
git-green:   green-400 (142 69% 58%)
git-red:     red-400 (0 91% 71%)
git-yellow:  yellow-400 (50 100% 75%)
git-gray:    gray-400 (23 5% 63%)
```

### Radix Color Scales (from CSS)
Blue, Slate, Grass, Cyan, Amber, Red -- all 12-step scales in both light and dark with P3 gamut variants. Used primarily in the diff viewer and markdown editor.

### Special Tokens
```
--user-dot:         217 91% 75%
--todo-in-progress: 217 91% 60%  (blue-500)
--todo-completed:   142 76% 36%  (green-600)
--todo-pending:     28 6% 40%
```

### Switch Colors
```
light: switch-background: gray-900, switch-foreground: gray-0
dark:  switch-background: gray-100, switch-foreground: gray-900
```

### Tip Colors (Light)
```
tip:                   accent-25
tip-border:            accent-50
tip-secondary:         accent-25
tip-secondary-border:  accent-50
tip-muted:             accent-600
tip-foreground:        accent-900
plan-border:           accent-400
```

### Warning Colors (Light)
```
warning:                     accent-50
warning-foreground:          accent-800
warning-foreground-secondary: accent-600
warning-border:              accent-200
```

---

## 1. APP SHELL / LAYOUT

### Root Structure
The app uses `react-resizable-panels` (ResizablePanelGroup) for layout.

#### Outer horizontal split
```
ResizablePanelGroup
  orientation: "horizontal"
  className: "h-full bg-background"
  resizeTargetMinimumSize: { coarse: 15, fine: 4 }

  ResizablePanel (id="main-content")
    defaultSize: "70" (with right panel) or "100" (without)
    minSize: "30"

  ResizableHandle

  ResizablePanel (id="right-panel")
    defaultSize: "35"
    minSize: "30"
    className: "shadow-lg dark:shadow-2xl"
```

#### Right panel vertical split (inside right-panel)
```
ResizablePanelGroup
  orientation: "vertical"
  className: "h-full relative"
  resizeTargetMinimumSize: { coarse: 30, fine: 20 }

  ResizablePanel (id="git-panel")
    defaultSize: "50"
    minSize: "0"

  ResizableHandle

  ResizablePanel (id="terminal-panel")
    defaultSize: "50"
    minSize: "20"
    collapsedSize: "3.5"
    collapsible: true
```

#### ResizableHandle styling
```
className: "relative flex items-center justify-center border-l !border-separator
  after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2
  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
```

#### Main content area
The sidebar is NOT part of the ResizablePanelGroup. It lives outside at the app shell level with a fixed width. The sidebar is rendered separately from the resizable panel layout.

### Sidebar (positioned left, outside panels)
```
className: "w-64 bg-sidebar pt-[41px] pb-3 px-1.5 border-r flex flex-col"
```
- Width: `w-64` (256px)
- Top padding: `pt-[41px]` (41px for titlebar height)
- Bottom padding: `pb-3`
- Horizontal padding: `px-1.5`
- Border right separator
- Flex column layout

---

## 2. TITLEBAR / TOP BAR

The titlebar is 41px tall (inferred from `pt-[41px]` sidebar padding).

It contains a `data-tauri-drag-region` attribute for window dragging.

### TopBar Component (tab bar area, below titlebar)
```
className: "p-1 pl-3 bg-background flex items-center gap-2 sticky py-2"
```

This TopBar sits at the top of the main-content panel and contains:
1. File badge (when viewing a file)
2. Diff/Edit mode toggle buttons
3. Right-aligned action buttons (Viewed toggle, copy, revert, split/unified view)

### Session-viewing mode positioning
When viewing a session:
```
className: "absolute top-0 left-0 right-0 z-20"
```
When viewing other tabs (file, notes):
```
className: "z-20"
```

### MainWorkspaceContent wrapper
```
className: "h-full flex flex-col relative"
```
Inner content area:
```
className: "flex-1 min-h-0 flex flex-col"
```

---

## 3. SIDEBAR (Left)

### Container
```
className: "w-64 bg-sidebar pt-[41px] pb-3 px-1.5 border-r flex flex-col"
```

### Sidebar Header
```
className: "flex justify-between items-center pl-4 pr-2 py-2 h-10 bg-sidebar-background relative border-b border-border-highlight"
```
or for Git panel header:
```
className: "@container flex items-center justify-between pl-4 pr-2 h-10 min-h-10 bg-sidebar-background border-b !border-sidebar-border"
```
- Height: `h-10` (40px)
- Background: `bg-sidebar-background`
- Bottom border: `border-b !border-sidebar-border`

### Sidebar Section Header
```
className: "sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-sidebar-background border-b border-border-highlight flex-shrink-0"
```

### Workspace Item
```
className: "group rounded-md py-2 hover:bg-sidebar-accent cursor-pointer relative
  text-sidebar-foreground data-[active=true]:bg-sidebar-accent
  data-[active=true]:text-sidebar-accent-foreground pr-1.5
  w-[calc(100%-2px)] pl-5"
```
(When in grouped repo mode: `pl-[6px]` instead of `pl-5`)

Inner structure:
```
"flex items-start gap-1.5 w-full min-w-0"
  -- status icon: "flex-shrink-0 mr-0.5 mt-0.5" -> "size-4 flex items-center justify-center"
  -- content column: "flex flex-col min-w-0 flex-1"
    -- title row: "flex items-center gap-1.5 w-full min-w-0 h-5"
      -- title span: "font-sans min-w-0 truncate"
        -- when unread: "font-semibold text-sidebar-foreground"
        -- when normal: "font-450 text-sidebar-muted-foreground"
      -- flex spacer: "flex-1"
      -- right indicators: "relative flex items-center flex-shrink-0 gap-1.5"
```

### Workspace Branch Badge (right side of workspace row)
```
className: "flex items-center gap-1 text-2xs text-sidebar-blue lowercase truncate max-w-[100px]
  group-hover:opacity-0
  group-has-[.workspace-hover-action-trigger[data-state=delayed-open]]:opacity-0
  group-has-[.workspace-hover-action-trigger[data-state=instant-open]]:opacity-0"
```

### Unread Count Badge
```
className: "text-2xs font-medium text-sidebar-muted-foreground tabular-nums px-1
  group-hover:opacity-0
  group-has-[.workspace-hover-action-trigger[data-state=delayed-open]]:opacity-0
  group-has-[.workspace-hover-action-trigger[data-state=instant-open]]:opacity-0"
```

### Workspace Hover Actions (fade-in on hover, gradient overlay)
```
className: "absolute inset-y-0 -left-5 right-0 w-8
  bg-gradient-to-r from-sidebar-accent/0 via-sidebar-accent/90 to-sidebar-accent
  pointer-events-none"
```

### Session Item (nested under workspace)
```
className: "flex items-center px-1.5 py-1.5 gap-2 hover:bg-sidebar-accent group
  w-full min-w-0 cursor-pointer rounded-md data-[active=true]:bg-sidebar-accent"
```
- Session icon: `size-3 text-sidebar-muted-foreground mb-[1px]`
- Session title: `text-sidebar-foreground`

### Sidebar Footer
```
className: "px-4 pt-3 flex justify-between items-center border-t !border-sidebar-border"
```

### Sidebar Icons (common)
```
h-4 w-4 text-sidebar-muted-foreground hover:text-foreground  (settings)
size-3 text-sidebar-muted-foreground  (section icons)
h-3 w-3 text-sidebar-muted-foreground  (item actions)
```

### Sidebar Icon Button
```
className: "inline-flex items-center justify-center h-7 w-7 rounded-md
  text-sidebar-muted-foreground hover:bg-accent hover:text-accent-foreground"
```

### Sidebar Filter Input
Search field appearance:
```
className: "mr-2 flex items-center gap-1 rounded-md border border-sidebar-border px-2 py-1
  text-2xs text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
```

### Sidebar Drag Overlay
```
className: "h-full bg-sidebar-background/60 select-none relative"
```

### New Workspace Button
```
className: "w-full pl-1.5 py-1.5 mt-1 text-sm text-sidebar-muted-foreground
  hover:text-sidebar-foreground text-left"
```

---

## 4. SESSION TABS

### TabsList (horizontal tab bar)
```
className: "bg-transparent h-10 p-0 gap-2 flex min-w-0 items-center overflow-hidden
  max-w-full rounded-none justify-center text-foreground font-[350]"
```
- Height: `h-10` (40px)
- Background: transparent
- Gap: `gap-2`
- Font weight: `font-[350]`

### TabsTrigger (individual tab)
```
className: "ring-offset-background focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-ring focus-visible:ring-offset-2 select-none
  flex items-center justify-center relative group overflow-hidden
  h-10 min-w-0
  py-0 pt-0.5 whitespace-nowrap
  text-sm font-medium text-muted-foreground
  !bg-transparent
  border-b-2 !border-b-transparent
  disabled:pointer-events-none disabled:opacity-50
  data-[state=active]:bg-background data-[state=active]:text-foreground
  data-[state=active]:border-b-2 data-[state=active]:!border-b-highlight-muted"
```
- Height: `h-10` (40px)
- Active state: bottom border `border-b-highlight-muted` (accent-400/accent-300)
- Active text: `text-foreground`
- Inactive text: `text-muted-foreground`

### TabsTriggerText (text inside tab)
```
className: "flex items-center gap-2 select-none
  px-2 text-xs font-medium truncate min-w-0
  group-hover:[background-image:linear-gradient(to_right,currentColor_calc(100%-28px),transparent_calc(100%-20px))]
  group-hover:[background-clip:text]
  group-hover:[-webkit-background-clip:text]
  group-hover:[-webkit-text-fill-color:transparent]"
```
- Text size: `text-xs`
- On hover: text fades to transparent on the right (gradient mask) to show close button

### TabsTriggerCloseButton
```
outer: "absolute right-0 pl-2 h-full flex items-center pointer-events-none
  group-hover:opacity-100 opacity-0"

button: "h-5 w-5 pointer-events-auto p-0 text-muted-foreground
  hover:text-foreground hover:bg-accent
  focus-visible:text-foreground focus-visible:bg-accent/80"

icon (X): "size-3"
```
- Hidden by default (`opacity-0`), shown on tab hover
- Position: absolute right of tab

### TabsTriggerEditButton (rename)
```
outer: "absolute right-5 h-full flex items-center pointer-events-none
  group-hover:opacity-100 opacity-0"

button: same as close button
icon (Pencil): "size-3"
```

### Streaming Indicator
On active streaming tab, a dot is placed near the tab text. There is a CSS-based `animate-equalizer` animation for voice/streaming indicators.

### Session Tab Title States
```
truncate min-w-0 border !border-transparent rounded-sm  (normal)
text-unread truncate block  (unread session)
truncate block  (read session)
```

---

## 5. CHAT MESSAGES

### Message Container (VirtuosoMessageList)
The message list uses `@virtuoso.dev/message-list` for virtualized rendering.

Messages are rendered inside:
```
className: "flex-1 flex flex-col bg-background h-full mx-auto w-full relative"
```

Empty state:
```
className: "text-center mt-56 mb-12"
```

### Onboarding cards (when empty):
```
className: "animate-in fade-in duration-1000 max-w-4xl mx-auto w-full px-8"
```
Card:
```
className: "cursor-pointer transition-colors bg-secondary hover:bg-secondary/80
  border p-4 h-32 flex flex-col justify-between shadow-none rounded-lg"
```

### User Message
```
outer: "flex justify-end" + className prop

inner wrapper: "relative min-w-0 max-w-full" (with onMouseEnter/Leave for hover actions)

message bubble: "max-w-xl lg:max-w-3xl p-3 rounded px-4 break-words overflow-hidden"
  -- normal:  "bg-highlight text-highlight-foreground"
  -- queued:  "bg-muted text-muted-foreground"

text content: "text-sm break-words whitespace-pre-wrap select-text"
```
- Max width: `max-w-xl lg:max-w-3xl` (~576px, 768px on lg)
- Padding: `p-3 px-4`
- Border radius: `rounded` (0.25rem)
- Background: `bg-highlight` (accent-50 light / accent-950 dark)
- Text: `text-highlight-foreground` (accent-800 light / accent-100 dark)
- Right-aligned: `flex justify-end`

### User Message Hover Actions
```
className: "absolute -top-2 right-2 flex items-center gap-1"
```
Contains copy button and delete button (for queued messages).

### Assistant Message
```
outer: "flex justify-start relative" + className prop

inner: "flex flex-col w-full max-w-xl lg:max-w-3xl space-y-1 break-words"
```
- Left-aligned: `flex justify-start`
- Same max-width as user messages
- Vertical spacing between blocks: `space-y-1`

### ContentBlock Types

#### Text Block
```
className: "my-1"
```
Rendered via `MessageMarkdown` component.

#### Thinking Block
Rendered as a `ToolView` with name "Thinking". Uses `CollapsibleRow` (see Tool Cards below).

#### Tool Use Block
Rendered as a `ToolView` component (see Tool Cards below).

### MessageMarkdown
```
className: "prose prose-sm prose-invert antialiased select-text text-pretty
  prose-headings:text-balance"
```
When muted (e.g. inside tool results):
```
"prose prose-sm prose-invert antialiased select-text text-pretty
  prose-headings:text-balance
  prose-headings:text-muted-foreground prose-p:text-muted-foreground
  prose-strong:text-muted-foreground prose-em:text-muted-foreground
  prose-blockquote:text-muted-foreground prose-code:text-muted-foreground
  prose-pre:text-muted-foreground prose-ol:text-muted-foreground
  prose-ul:text-muted-foreground prose-li:text-muted-foreground
  prose-table:text-muted-foreground prose-th:text-muted-foreground
  prose-td:text-muted-foreground prose-a:text-muted-foreground
  prose-hr:border-muted"
```

### Code Block
```
outer: "relative w-full group/code-block not-prose text-sm
  select-text text-foreground rounded-md
  overflow-auto
  min-h-[35px]
  bg-muted"
  style: fontVariantLigatures: "none"

code area: "relative max-h-[500px] w-full overflow-auto px-3 py-2.5"

copy button: "absolute right-2.5 top-2.5 invisible group-hover/code-block:visible
  transition-all inline-flex items-center text-muted-foreground"
```
- Background: `bg-muted`
- Border radius: `rounded-md`
- Max height: `max-h-[500px]`
- Padding: `px-3 py-2.5`
- Copy button appears on hover

### System Message (compact boundary, status)
```
outer: "flex justify-center"
inner: "text-xs text-muted-foreground bg-muted/30 px-3 py-1 rounded-full"
```
- Centered
- Pill shape: `rounded-full`
- Background: `bg-muted/30`

### Compacting indicator
```
"inline-flex items-center gap-2 py-1"
icon: ConductorLoader with className "text-muted-foreground"
text: "text-sm" -- "Compacting chat..."
```

### Summary Message
```
outer: "flex justify-start pb-4"
inner: "w-full max-w-xl lg:max-w-3xl break-words"
```

### Error Badge
```
Badge variant="destructive"
className: "flex flex-col items-start gap-1 py-1.5 w-fit normal-case select-text"
```

### Bottom gradient overlay (new message indicator area)
```
className: "absolute bottom-0 left-0 right-0 h-10
  bg-gradient-to-t from-background to-transparent pointer-events-none"
```

---

## 6. CHAT INPUT BAR (Composer)

### Composer Container
```
className: "relative px-4 py-3 min-h-36 bg-composer-background
  focus-within:ring-0 focus-within:outline-none cursor-text select-none
  rounded-lg border"
```
Dynamic additions:
- When tabs above: `rounded-t-none`
- When in plan mode: `rounded-t-none !border-t-0`
- Border color: `hsl(var(--border))` normal, `transparent` in plan mode
- Outline: dashed, 2px, offset -1, `hsl(var(--plan-border))` in plan mode
- Box shadow: `0 1px 2px 0 rgb(0 0 0 / 0.05)` normal, `none` in plan mode
- Transitions: 200ms cubic-bezier(0.25, 0.1, 0.25, 1)

### Tiptap Editor
```
className: "composer-tiptap"
editor attributes class: "composer-tiptap-editor"
```
Editor config: spellCheck false, autocomplete/autocorrect/autocapitalize off.

CSS for editor area:
```css
.composer-tiptap .ProseMirror { outline: none }
```

### Text Input Area
```
className: "min-h-[80px] max-h-[200px] overflow-y-auto select-text py-1 -my-1"
```
- Min height: 80px
- Max height: 200px (scrolls after)
- Grows as user types

### Mention Pill (inline)
```
className: "inline-flex h-5 items-center gap-1 border border-input
  bg-background rounded-sm px-1.5 text-xs font-medium leading-none align-text-bottom"
```
In composer mode:
```
"!h-5 !gap-1 !rounded-sm !px-1.5 !py-0 align-text-bottom leading-none -translate-y-[0.06em]"
```

### Attachment Badges (above input)
```
className: "flex flex-wrap gap-2 mb-2"
```

### Focus Hint
```
className: "absolute top-2 right-2 text-xs text-faint bg-composer-background rounded-full px-2 py-1"
```
Shows `KeybindingLabel` for "chat.focus" command.

### Bottom Action Bar (inside composer, absolute bottom)
```
className: "absolute bottom-3 right-3 flex items-center gap-2.5 flex-shrink-0 h-7"
```

Contains (right to left):
1. **Send button**: Icon button
2. **Attachment/Plus button**: `variant="ghost" size="iconXs" className="text-muted-foreground"`
3. **Context usage indicator** (when >70%): HoverCard
4. **Voice input button**: Dynamic styling based on state

### Model Picker
```
Popover trigger: "h-5 px-1.5 text-xs font-normal hover:bg-muted max-w-[200px]"
ChevronsUpDown: "size-3 text-muted-foreground flex-shrink-0 ml-1"
```

### Model Picker Dropdown Item
```
className: "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs
  hover:bg-popover-accent cursor-default"
```

### Thinking Toggle (below composer)
Button style:
```
"h-6 flex items-center rounded-md px-2 py-0.5"
-- active: "bg-link hover:bg-link/80 text-link-foreground"
-- inactive: "hover:bg-accent text-muted-foreground hover:text-foreground"
```

### Plan Mode Toggle
Same button pattern as thinking toggle.

### Fast Mode Toggle
Same pattern, with `Zap` icon.

### Voice Input Button States
```
idle:       "rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
recording:  "rounded-full bg-foreground text-background"
connecting: "rounded-full bg-foreground text-background"
processing: "rounded-md text-foreground"
```
Container: `"flex items-center justify-center size-6"`

### Equalizer Animation (voice recording)
```
className: "w-[2px] rounded-full bg-current animate-equalizer"
style: animationDelay: `${i * -0.2}s`  (4 bars, i=0..3)
```

### Plan Mode Actions Bar (above composer)
```
className: "flex items-center justify-between gap-2 px-4 py-2 bg-background rounded-t-lg"
```
With conditional border:
```
${!inPlan ? "!border !border-input-border" : ""}
```

### Approve Plan Button
```
className: "h-6 px-3 text-xs bg-foreground text-background border-foreground hover:bg-foreground/90"
```

### Hand Off Button
```
className: "h-6 px-3 text-xs"
variant: "ghost"
```

---

## 7. TOOL CARDS

### Tool Component Primitives

#### Tool (outer card)
```
className: "flex flex-col w-full min-w-0 text-sm border rounded-lg border-border"
```
- Full width, flex column
- Text: `text-sm`
- Border: `border rounded-lg border-border`

#### ToolHeader
```
className: "flex items-center gap-1 font-mono w-full font-extralight"
```
- Font: monospace, extra light weight

#### ToolTitle
```
className: "text-xl font-medium leading-none tracking-tight"
```

#### ToolDescription
```
className: "text-sm text-muted-foreground"
```

#### ToolContent
```
className: "w-full overflow-y-scroll"
```

#### ToolFooter
```
className: "flex items-center p-6 pt-0"
```

### CollapsibleRow (primary tool card renderer)

This is the actual component used to render all tool use blocks.

#### Header Row
```
className: "inline-flex items-center gap-2 py-1 px-1.5 -mx-1.5 rounded-sm
  group/collapsible max-w-full hover:bg-muted/50"
```
When collapsible with content: adds `cursor-pointer`

#### Collapse Icons
```
Plus (collapsed):  "size-3 text-muted-foreground hidden group-hover/collapsible:block
                    group-has-[.filebadge:hover]/collapsible:hidden"
Minus (expanded):  same pattern
```
On hover of the row, the tool icon is replaced by Plus/Minus.

#### Left Content (tool name/description)
```
className: "text-sm truncate"
```

#### Right Content (file path, stats)
```
className: "font-mono font-medium text-xs truncate max-w-[400px] text-muted-foreground"
```
Only visible when collapsed or `alwaysShowRightContent=true`.

#### Expanded Content Area
```
default (non-code): "mt-2 font-mono text-xs font-medium whitespace-pre-wrap break-words
  text-accent-foreground bg-accent p-3 rounded-md border border-border"

code block: uses custom contentClassName
```

### Specific Tool Renderers

#### BashTool
- Icon: `ToolIcon name="Bash"`
- Left: description or "Bash"
- Right: the command text
- Content: syntax-highlighted bash transcript
- Content class: `"mt-2 font-mono text-xs font-medium text-accent-foreground bg-accent p-3 rounded-md border border-border"`

#### ReadTool
- Icon: `ToolIcon name="Read"`
- Left: "Read N lines" or "Reading" or "Read image"
- Right: `FileBadge` component
- Content: CodeViewer with line numbers

#### EditTool
- Icon: `ToolIcon name="Edit"`
- Left: "Edit"
- Right: `FileBadge` + `DiffStats` (green/red line counts)
- Content: `InlinePierreDiff` (inline diff viewer)

#### GrepTool
- Icon: `ToolIcon name="Grep"`
- Left: `grep for 'pattern'` with path/include info
- Right: "N matches"
- Content: `GrepResultsWithLinks`

#### ThinkingTool
- Icon: `ToolIcon name="Thinking"` (or Garry's avatar in garry mode)
- Left: "Thinking"
- Right: truncated thinking text
- Default collapsed: true (expanded in garry mode)

#### GenericTool
- Shows Input and Output in a `space-y-3` layout
- Input: `"text-xs font-medium text-muted-foreground mb-1"` label + `"m-0 p-0 text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground"` pre
- Output: same pattern without muted text

### ToolError
```
icon: CircleX "size-3"
iconColor: "text-destructive"
mainColor: "text-destructive"
content: "font-mono text-xs font-medium whitespace-pre-wrap break-words text-destructive
  bg-destructive/10 p-3 rounded-md border border-destructive/20"
```
Error badge inline:
```
"text-xs font-mono font-medium bg-destructive/10 px-1 py-0.5 rounded-md select-text"
```

### DiffStats / LineChangeIndicator
```
className: "text-3xs font-mono font-medium flex-shrink-0
  flex items-center gap-1
  border !border-input rounded-sm px-1.5 py-1"
```
Added: `"text-git-green"` (+N)
Removed: `"text-git-red"` (-N)

### FileBadge
Badge with file icon and filename:
```
Button variant="outline" size="xs"
icon: FileIcon with "size-3" + color based on file type
label: filename (last path segment)
```
When removable (split into two buttons):
```
left button: "rounded-r-none border-r-0 px-1.5" (icon + X on hover)
right button: "rounded-l-none px-2" (label)
```

### File Badge HoverCard
```
className: "w-[36rem] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
```

---

## 8. RIGHT PANEL (Changes/Files)

### Panel Container
Inside the right ResizablePanel (id="right-panel"):
```
className: "shadow-lg dark:shadow-2xl"
```

### Tab Bar (top of git panel)
```
className: "flex items-center justify-between gap-1 px-2 py-2 min-w-0 overflow-hidden"
```

Tabs: "All files", "Changes", "Checks", plus a "Review" button.

#### Tab Buttons
```
Button variant="ghost" size="sm"
-- inactive: "text-muted-foreground"
-- active: "text-foreground bg-accent"
```

#### Review Button
```
Button variant="ghost" size="xs"
className: "text-unread mr-1.5 select-none"
```

### Git Panel Header
```
className: "@container flex items-center justify-between pl-4 pr-2 h-10 min-h-10
  bg-sidebar-background border-b !border-sidebar-border"
```
- Height: `h-10 min-h-10` (40px)
- Background: `bg-sidebar-background`

State-dependent backgrounds:
```
in_sync:      "bg-positive-muted"
out_of_sync:  "bg-highlight"
merged:       "bg-purple-500/10 dark:bg-purple-400/15"
```

### PR Badge Text
```
className: "text-sm font-medium truncate min-w-0 mr-3 text-sidebar-muted-foreground"
```

### File Tree Items
```
className: "flex h-7 items-center gap-2 px-3 mx-2 rounded transition-colors
  hover:bg-muted cursor-pointer group"
```
- Height: `h-7` (28px)
- Folder icon: `h-3.5 w-3.5 text-muted-foreground flex-shrink-0` (VscFolderOpened/VscFolder)
- File icon: `h-3.5 w-3.5` (FileIcon with language color)

### File Status Badges
```
className: "h-4 w-4 flex-shrink-0 rounded-sm flex items-center justify-center
  text-[10px] font-medium ${bg} ${text}"
```
Status colors are dynamic per badge type (U=untracked, M=modified, A=added, D=deleted).

### Diff Viewer
Uses `pierre-diff` library with CSS variables:
```
--diffs-bg: #fff (light) / dark variant
--diffs-font-fallback: 'SF Mono', Monaco, Consolas, 'Ubuntu Mono', 'Liberation Mono', 'Courier New', monospace
--diffs-added-light: #0dbe4e
--diffs-added-dark: #5ecc71
--diffs-modified-light: #009fff
--diffs-modified-dark: #69b1ff
--diffs-deleted-light: #ff2e3f
--diffs-deleted-dark: #ff6762
```

### Diff Toolbar
```
className: "p-3 pb-4 font-sans [contain:inline-size]"
```

### Notes Panel (side tab)
```
header: "flex items-center gap-2 px-4 pt-4 pb-2 border-b"
title: "font-medium text-sm"
subtitle: "text-xs text-muted-foreground truncate"
body: "flex-1 overflow-y-auto p-4 notes-editor"
empty state: "text-muted-foreground text-sm italic"
```

---

## 9. TERMINAL PANEL (Bottom)

### Panel Configuration
```
ResizablePanel (id="terminal-panel")
  defaultSize: "50"     (50% of right panel)
  minSize: "20"
  collapsedSize: "3.5"
  collapsible: true
```

### Terminal Panel Tabs
```
Tabs className: "flex flex-col h-full"

TabsTrigger: "h-8 flex items-center justify-center text-muted-foreground
  rounded-none data-[state=active]:border-b-2
  data-[state=active]:!border-b-highlight-muted flex-shrink-0"
```
Tab height: `h-8` (32px)

### Terminal Tab Close Button
```
className: "h-3.5 w-3.5"
```

### Setup Button
```
className: "absolute bottom-3 right-3 z-10 bg-background/80"
```

### Terminal Empty States
```
"flex items-center justify-center text-center gap-2 h-full w-full text-muted-foreground"
```

### Resize Handle
```
className: "z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border"
```

---

## 10. SETTINGS

### Settings Page Shell
```
outer: "fixed inset-0 w-full h-full overflow-hidden flex flex-col bg-background"
inner: "h-full flex"
```
Full-screen overlay.

### Settings Sidebar
```
className: "w-64 bg-sidebar pt-[41px] pb-3 px-1.5 border-r flex flex-col"
data-tauri-drag-region: true
```
- Same `w-64` (256px) as main sidebar

### Back Button
```
className: "flex items-center gap-2 px-2 py-1.5 mb-4 text-sm text-muted-foreground
  hover:text-foreground transition-colors flex-shrink-0"
```
Icon: `ArrowLeft` with `w-4 h-4`

### Settings Nav Item
```
className: "w-full flex items-center gap-3 px-2 py-1.5 text-sm text-left rounded-md
  transition-all group
  hover:bg-sidebar-accent
  focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

-- active: "bg-sidebar-accent font-medium"
-- inactive: "text-muted-foreground"
```
Icon: `w-4 h-4 shrink-0 group-hover:text-foreground transition-colors`

### Section Labels
```
className: "px-2 py-1.5 text-xs text-muted-foreground"
```

### Settings Content Area
```
className: "h-full overflow-y-auto px-6 pt-[41px]"
inner: "flex justify-center pb-14"
```

### Settings Header
```
title: "text-2xl font-medium mb-2"
description: "text-sm text-muted-foreground"
```

### Settings Row (toggle/input rows)
```
section separator: "border-t pt-4"
label: "text-sm text-muted-foreground"
description below: "text-xs text-muted-foreground mt-1"
```

### Settings Toggle (Switch component)
```
className: "peer inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full
  border border-transparent transition-colors duration-150
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  focus-visible:ring-offset-2 focus-visible:ring-offset-background
  disabled:cursor-not-allowed disabled:opacity-50
  data-[state=checked]:bg-switch-background
  data-[state=unchecked]:bg-input"

Thumb: "pointer-events-none block h-4 w-4 rounded-full bg-switch-foreground
  ring-0 shadow-lg transition-transform duration-150
  data-[state=checked]:translate-x-[21px]
  data-[state=unchecked]:translate-x-[1px]"
```
- Track: `h-5 w-10` (20px x 40px)
- Thumb: `h-4 w-4` (16px)

### Settings Input
```
className: "flex h-8 rounded-md w-full text-sm bg-background px-3 py-2 outline-none
  !border !border-input focus:!border-1 focus:!border-special focus:outline-none
  disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground"
```
- Height: `h-8` (32px)
- Focus border: `!border-special`

### Settings Textarea
```
className: "flex min-h-[60px] rounded-md bg-background px-3 py-2
  placeholder:text-muted-foreground outline-none
  !border !border-input focus:!border-1 focus:!border-special focus:outline-none
  disabled:cursor-not-allowed disabled:opacity-50"
```

### Settings Slider
```
Track: "relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20"
Thumb: "block h-4 w-4 rounded-full border border-primary/50 bg-background shadow
  transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
  disabled:pointer-events-none disabled:opacity-50"
```

### Appearance Grid (theme picker)
```
className: "grid grid-cols-2 gap-3"
```

---

## 11. DIALOGS / MODALS

### Dialog Overlay
```
className: "fixed inset-0 z-50 bg-overlay backdrop-blur-sm
  data-[state=open]:animate-in data-[state=closed]:animate-out
  data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
```
- Background: `bg-overlay` (0 0% 0%)
- Backdrop blur: `backdrop-blur-sm`
- z-index: 50

### DialogContent (standard modal)
```
className: "fixed left-[50%] top-[50%] rounded-md z-50 grid w-full max-w-lg
  translate-x-[-50%] translate-y-[-50%]
  gap-4 border bg-background p-6 shadow-lg duration-200
  data-[state=open]:animate-in data-[state=closed]:animate-out
  data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
  data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
  data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]
  data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]
  focus:outline-none"
```
- Max width: `max-w-lg` (512px)
- Padding: `p-6`
- Border radius: `rounded-md`
- Animation: zoom + slide + fade

### DialogHeader
```
className: "flex flex-col space-y-1.5 text-center sm:text-left"
```

### DialogFooter
```
className: "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
```

### DialogTitle
```
className: "text-xl font-medium leading-none tracking-tight"
```

### DialogDescription
```
className: "text-muted-foreground"
```

### Common Dialog Sizes
```
AppDialog: "sm:max-w-[525px] p-4"
AppDialog (large): "max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
AppDialog (small): "sm:max-w-md"
```

### Fullscreen Dialog (Settings, World Map)
```
className: "fixed inset-0 max-w-none w-full h-full translate-x-0 translate-y-0
  left-0 top-0 rounded-none p-0 overflow-hidden flex flex-col border-0
  !duration-0 !animate-none"
```

---

## 12. COMMAND PALETTE

### CommandDialog Shell
```
Content: "overflow-hidden p-0 shadow-xl max-w-xl absolute left-1/2 top-1/2
  transform -translate-x-1/2 -translate-y-[250px] w-full max-h-[500px]
  flex flex-col bg-sidebar-background/50 z-50 rounded-md focus:outline-none border"
style: WebkitBackdropFilter: "blur(7px)"
```
- Max width: `max-w-xl` (576px)
- Max height: `max-h-[500px]`
- Position: centered horizontally, 250px above center vertically
- Background: `bg-sidebar-background/50` with blur
- Border radius: `rounded-md`

### Command wrapper
```
className: "[&_[cmdk-group-heading]]:px-2
  [&_[cmdk-group-heading]]:font-medium
  [&_[cmdk-group-heading]]:text-muted-foreground
  [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0
  [&_[cmdk-group]]:px-2
  [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5
  [&_[cmdk-input]]:h-12
  [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3
  [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5
  flex flex-col h-full"
```

### CommandInput
```
wrapper: "flex items-center border-b px-3 bg-transparent flex-shrink-0"
search icon: "mr-2 !h-4 !w-4 shrink-0 opacity-50"
input: "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none
  placeholder:text-muted-foreground placeholder:text-sm
  disabled:cursor-not-allowed disabled:opacity-50"
```
- Input height: `h-11` (44px)
- Placeholder: `"Type a command or search..."`

### CommandList
```
className: "flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-2"
```

### CommandEmpty
```
className: "py-6 text-center text-sm tracking-wider uppercase font-[350]
  text-muted-foreground font-mono"
```

### CommandGroup
```
className: "overflow-hidden px-1 pt-0 pb-1.5 last:pb-0 text-foreground
  [&_[cmdk-group-heading]]:px-2
  [&_[cmdk-group-heading]]:py-1.5
  [&_[cmdk-group-heading]]:text-xs
  [&_[cmdk-group-heading]]:text-muted-foreground"
```

### CommandItem
```
className: "relative flex cursor-pointer gap-2 select-none items-center rounded-sm
  px-2 py-1 outline-none weight-medium
  data-[disabled=true]:pointer-events-none
  data-[selected='true']:bg-sidebar-accent
  data-[selected=true]:text-accent-foreground
  data-[disabled=true]:opacity-50
  [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
```

### CommandHint (keyboard shortcut label)
```
className: "ml-auto opacity-0 group-data-[selected=true]:opacity-100
  text-xs text-muted-foreground"
```

### Command Palette Search Result Item
```
className: "group rounded-md px-2 py-2 text-sm cursor-pointer
  data-[selected=true]:border-border"
```
Layout:
- Icon + content + metadata (time ago, action count)
- Session title: `"w-36 truncate flex-shrink-0"`
- Chevron: `"size-3 text-muted-foreground flex-shrink-0"`
- Time ago: `"text-xs text-muted-foreground w-16 text-right group-data-[selected=true]:hidden"`
- Action label: `"text-xs text-muted-foreground w-20 text-right hidden group-data-[selected=true]:inline"`

### Command Palette Sidebar Variant (workspace picker)
```
className: "top-2 -translate-y-0 max-w-2xl
  [&_[cmdk-item]]:py-[5px]
  [&_[cmdk-item]_svg]:size-3
  [&_[cmdk-input]]:h-8
  bg-sidebar-background"
```

---

## 13. SHARED UI COMPONENTS

### Button Variants
```
variant:
  default:            "bg-foreground text-background hover:bg-foreground/90 font-medium"
  destructive:        "bg-destructive text-destructive-foreground hover:bg-destructive/90 font-medium"
  outline:            "border !border-input bg-background hover:bg-accent hover:text-accent-foreground font-450"
  outlineDestructive: "border text-destructive !border-input bg-background hover:bg-accent font-450"
  secondary:          "bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium"
  ghost:              "text-foreground/90 hover:bg-sidebar-accent hover:text-accent-foreground font-450"
  link:               "text-foreground/70 hover:!text-foreground font-450"

size:
  default: "h-8 px-3 py-3 text-sm gap-2 rounded-md"
  xs:      "h-6 px-2 text-xs gap-1.5 rounded-sm"
  sm:      "h-7 px-2.5 text-xs gap-1.5 rounded-md"
  lg:      "h-11 px-8 rounded-lg"
  icon:    "h-8 w-8 [&_svg]:shrink-0 text-sm justify-center rounded-md"
  iconSm:  "h-7 w-7 [&_svg]:shrink-0 text-xs justify-center rounded-md"
  iconXs:  "h-6 w-6 [&_svg]:shrink-0 text-xs justify-center rounded-sm"

base: "inline-flex px-2 items-center justify-center gap-2 whitespace-nowrap
  rounded-md ring-offset-background focus-visible:outline-none focus-visible:ring-none
  disabled:pointer-events-none disabled:opacity-50
  [&_svg]:pointer-events-none [&_svg]:shrink-0"
```

### Badge
Standard `Badge` component from shadcn/ui pattern. Variants: `default`, `destructive`, `outline`, `secondary`.

### Tooltip
Radix tooltip, wraps `TooltipTrigger` + `TooltipContent`. Content styling:
```
common: "font-mono px-3 py-2" (on some)
or: "text-xs" (on most)
or: "flex items-center gap-1"
```

### Keyboard Shortcut Label
```
className: "inline-flex items-center justify-center px-1 py-0.5 text-2xs font-medium
  bg-muted text-muted-foreground rounded border border-border"
```

### ScrollArea
Custom scroll area with styled scrollbar:
```
ScrollAreaScrollbar: "relative flex-1 rounded-full bg-foreground/10 hover:bg-foreground/50"
```

### Popover
Standard Radix Popover. Content examples:
```
"w-[300px] p-0"
"w-56 p-1 rounded-lg"
"max-w-96 p-1"
```

### DropdownMenu
Standard Radix DropdownMenu. Content examples:
```
"min-w-[180px]"
"max-w-80 max-h-[80vh]"
"p-2 flex items-center justify-center"
```

### ContextMenu
Standard Radix ContextMenu. Content:
```
"min-w-[200px]"
"min-w-[180px]"
```

### Separator
Uses Radix Separator with custom styling.

---

## 14. ICONS & ASSETS

### Component Icons (from lucide-react)
```
Settings, ArrowLeft, ArrowRight, ArrowUpRight, ArrowDown, ArrowUp
Plus, Minus, X, Check, Copy, Pencil
Eye, EyeOff, FileText, FileCode, FolderOpen, FolderSymlink
GitBranch, GitPullRequest, GitPullRequestArrow, GitPullRequestDraft, GitMerge, GitMergeConflict
CircleCheck, CircleAlert, CircleDot, Circle, CircleX
ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown
Play, Trash2, RotateCcw, RefreshCw, Handshake
Mic, Terminal, Columns2, Zap, FastForward
Brain, Bot, BookText, StickyNote, MessageSquare
ClipboardList, ScrollText, FlaskConical, Lock, Plug
SquarePlus, SquareMinus, SquareDot, SquareDashed, SquareArrowRight
Castle, Landmark, Building2, TicketsPlane, Palette
TriangleAlert, Triangle, Archive, LogOut, Ban, Clock
ListChevronsDownUp, Search
```

### File Type Icons (from react-icons)
```
SiTypescript, SiJavascript, SiReact, SiNextdotjs, SiPython, SiRust, SiGo
SiDocker, SiGit, SiGnubash, SiNodedotjs, SiBun, SiDeno
SiC, SiCplusplus, SiSharp, SiSwift, SiKotlin, SiRuby, SiPhp
SiHtml, SiCss, SiSass, SiMarkdown, SiYaml
SiVite, SiWebpack, SiEslint, SiPrettier, SiTerraform
SiApachemaven, SiGradle, SiPoetry
SiClaude, SiOpenai
DiJava
VscFolderOpened, VscFolder, VscJson, VscSettingsGear
FaFile, FaFileAlt, FaFileArchive, FaFileAudio, FaFileCode
FaFileCsv, FaFileImage, FaFilePdf, FaFileVideo
FaCheckCircle, FaCircleXmark
```

### ConductorLoader
Custom loading indicator component. Types: "typing", "compact".
```
className: "text-muted-foreground" (common)
or: "size-3 text-muted-foreground"
or: "size-3.5 text-muted-foreground"
```

### RadialProgress
Custom circular progress indicator component.

---

## 15. REGISTERED COMPONENT NAMES (displayName)

All components with explicit displayName in the bundle:
```
Alert, AlertDescription, AlertDialogFooter, AlertDialogHeader, AlertTitle
Annotation, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
CodeBlockMemoized, CommandHint, ComposableMap, ContextMenuShortcut
DialogFooter, DialogHeader, Geographies, Geography, Graticule, Group
Input, Line, Lowlight, Marker, NotAButton, NuqsAdapterContext
Panel, PopoverMenu, Presence, RadialProgress, ReactNodeView
Separator, SimpleCopyButton, Sphere, TabsCloseButton, TabsEditButton
Textarea, Tiptap, Tiptap.Content, TiptapContext
Tool, ToolContent, ToolDescription, ToolFooter, ToolHeader, ToolTitle
TruncatedText, VirtuosoMessageList, ZoomableGroup
```

---

## 16. PLACEHOLDER STRINGS

These reveal specific input fields and their contexts:
```
"Add a comment for the AI"
"Add custom instructions for all agents working in this repo."
"Describe what you'd like to see built..."
"Enter font name..."
"Enter path or click to select"
"Enter todo..."
"Filter workspaces..."
"Find"
"Find in file"
"Find in top-level messages"
"Leave empty for default"
"PR description"
"PR title"
"Search files..."
"Search icons"
"Search issues..."
"Search repositories..."
"Search shortcuts..."
"Search working directories to include or exclude..."
"Search workspaces..."
"Select a workspace..."
"Select remote..."
"Select target branch..."
"Type a command or search..."
"Type something..."
"Use this as a scratchpad. Reference with @notes."
"Write something..."
"e.g. feature/ or myname/"
"e.g., npm install"
"e.g., npm run dev"
"e.g., rm -rf node_modules"
"my-awesome-project"
```

---

## 17. ANIMATION / TRANSITION PATTERNS

### Animate-in/out (dialog, popover)
```
data-[state=open]:animate-in data-[state=closed]:animate-out
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
```

### Slide variants
```
data-[side=bottom]:slide-in-from-top-2
data-[side=left]:slide-in-from-right-2
data-[side=right]:slide-in-from-left-2
data-[side=top]:slide-in-from-bottom-2
```

### Duration
```
duration-150 (buttons, switches)
duration-200 (dialogs, popovers)
duration-1000 (onboarding fade-in)
!duration-0 (fullscreen dialogs - no animation)
```

### Transitions
```
transition-colors (common for hover states)
transition-all (copy buttons, size changes)
transition-transform (switch thumb)
```

### Custom animations
- `animate-equalizer`: voice recording bars
- `animate-pulse`: clock icon for in-progress todos
- `animate-spin`: loading spinners

---

## 18. TYPOGRAPHY SCALE

### Font Sizes Used
```
text-2xl:  2rem (settings headers)
text-xl:   1.25rem (dialog titles, tool titles)
text-lg:   1.125rem (large content)
text-sm:   0.875rem (body text, buttons, messages)
text-xs:   0.75rem (secondary text, badges, metadata)
text-2xs:  custom (very small, keyboard shortcuts, badges)
text-3xs:  custom (micro text, line change indicators)
text-[10px]: explicit 10px (timestamps, version info, monospace labels)
text-[12px]: explicit 12px (custom slider labels)
```

### Font Weights
```
font-[350]:      tabs
font-extralight: tool header
font-450:        button variants (outline, ghost, link)
font-medium:     titles, active states, labels (500)
font-semibold:   unread workspace titles (600)
font-bold:       not commonly used
```

### Font Families
```
font-sans:       "SF Pro", system-ui, sans-serif (default body)
font-mono:       "Geist Mono" (code, tools, technical)
font-geist-mono: alias for "Geist Mono" (used in specific spots)
```

---

## 19. SPACING & SIZE CONSTANTS

### Key Dimensions
```
Sidebar width:          w-64 (256px)
Titlebar height:        41px (inferred from pt-[41px])
Tab bar height:         h-10 (40px)
Terminal tab height:    h-8 (32px)
Git panel header:       h-10 min-h-10 (40px)
Button default:         h-8 (32px)
Button xs:              h-6 (24px)
Button sm:              h-7 (28px)
Button lg:              h-11 (44px)
Input height:           h-8 (32px)
Switch track:           h-5 w-10 (20x40px)
Switch thumb:           h-4 w-4 (16px)
File tree item:         h-7 (28px)
Session item:           py-2 (auto height)
Command input:          h-11 (44px)
Command palette:        max-w-xl max-h-[500px]
Dialog:                 max-w-lg (512px)
Code block max:         max-h-[500px]
Message max-width:      max-w-xl lg:max-w-3xl
Composer min-height:    min-h-36 (144px)
Composer input:         min-h-[80px] max-h-[200px]
```

### Common Icon Sizes
```
size-3:    12px (most inline icons)
size-3.5:  14px (status icons)
size-4:    16px (standard icons in buttons)
size-6:    24px (large action icons)
h-3 w-3:  12px
h-4 w-4:  16px
h-5 w-5:  20px (command palette icons)
```

---

## 20. Z-INDEX LAYERS

```
z-10:    resize handles, floating buttons, gradient overlays
z-20:    top bar when floating
z-50:    dialogs, modals, command palette, overlay
z-[9999]: fixed floating elements (rare)
```

---

## 21. THIRD-PARTY LIBRARIES IDENTIFIED

- `react-resizable-panels` (It$7, Ot$5, Nt$7) - panel layout
- `@virtuoso.dev/message-list` (VirtuosoMessageList) - virtualized message list
- `@tiptap/react` (Tiptap) - rich text editor for composer
- `cmdk` (_e$1) - command palette (Command)
- `@radix-ui/*` - Dialog, Popover, Tooltip, ContextMenu, DropdownMenu, Tabs, Switch, ScrollArea, AlertDialog, HoverCard, Collapsible
- `lowlight` / `highlight.js` - code syntax highlighting (100+ languages registered)
- `sonner` - toast notifications
- `react-simple-maps` (ComposableMap, Geographies, Geography, Marker, ZoomableGroup) - world map feature
- `pierre-diff` / `diffs-container` - diff viewer
- `@tauri-apps/api` - desktop app framework
- `class-variance-authority` (cva) - component variant system
- `tailwind-merge` (cn$4) - class merging utility
- `react-markdown` - markdown rendering
- `rehype-highlight`, `rehype-raw`, `remark-gfm` - markdown plugins
- `retext-smartypants` - typography in markdown
- `@mdxeditor/editor` - MDX editor (for notes)
- `fuzzysort` - fuzzy search in command palette
- `nuqs` - URL query state management
- `xterm.js` - terminal emulator (inferred from terminal panel)
- `posthog-js` - analytics

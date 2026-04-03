# Hashmark Studio Shell -- Delta Analysis

> Comparing our shell against VS Code, emdash, and Conductor.
> Based on source code examination + live screenshot analysis (2026-03-19).
> Reference repos cloned to /tmp/vscode-shell-ref and /tmp/emdash-shell-ref.

---

## 1. Overall Layout Structure

### VS Code
```
[VERTICAL]
  Titlebar (35px)
  Banner (hidden by default)
  [HORIZONTAL middle section]
    ActivityBar (48px wide)
    Sidebar (resizable, min 170px)
    Editor + Panel (flex)
    AuxiliaryBar (optional)
  StatusBar (22px)
```
- Grid system: `SerializableGrid` with pixel-based stored sizes
- Font: `-apple-system, BlinkMacSystemFont, sans-serif` (Mac)
- Base font: `body: 11px`, `.monaco-workbench: 13px; line-height: 1.4em`

### emdash
```
[VERTICAL]
  Titlebar (36px, fixed, z-80)
  [HORIZONTAL, pt-36px]
    ResizablePanel LEFT (16-30%, collapsible)
    ResizableHandle (1px + 4px hit area)
    ResizablePanel MAIN (min 30%)
    ResizableHandle
    ResizablePanel RIGHT (16-50%, collapsible)
```
- Panel system: `react-resizable-panels` with percentage sizing
- Font: `-apple-system, BlinkMacSystemFont, Segoe UI...` (same system stack)
- No status bar at all
- No activity bar / icon rail

### Ours (current)
```
[VERTICAL]
  Titlebar (35px)
  [HORIZONTAL]
    Sidebar (240px, collapsible to 0)
    [VERTICAL Main]
      Chat content (flex)
      Terminal drawer (resizable)
  Input bar (full-width)
  Model info bar
  StatusBar (22px)
```
- Flexbox only, no grid/panel system
- Font: `-apple-system, system-ui, sans-serif` (titlebar), rest uses CSS vars
- Sidebar fixed width, no resize handle
- No activity bar / icon rail

### Delta: Layout Architecture

| Feature | VS Code | emdash | Ours | Gap |
|---------|---------|-------|------|-----|
| Grid/panel system | SerializableGrid | react-resizable-panels | None (flexbox) | MISSING: No resize handles, no drag-to-resize sidebar |
| Sidebar resizable | Yes (sash handles) | Yes (ResizableHandle) | No (fixed 240px) | MISSING |
| Panel size persistence | Pixel values in localStorage | Percentages in localStorage | Open/closed boolean only | MISSING: Width not persisted |
| Activity bar (icon rail) | 48px, vertical icons | None | None | VS Code feature, intentionally omitted |
| Right sidebar | AuxiliaryBar (optional) | ResizablePanel (16-50%) | None | Not needed for chat app |
| Input bar | N/A (editor-based) | In main content area | Full-width below main | Unique to our app |
| Bottom panel | Panel part (terminal, output) | In right sidebar (vertical split) | ResizableDrawer | OK -- different approach |

---

## 2. Titlebar

### VS Code (Mac)
| Property | Value |
|----------|-------|
| Height | **35px** (with command center) / **30px** (without) |
| Background | `#3C3C3C` (dark) |
| Border bottom | `1px solid` when border color set |
| Box shadow | `0 0 6px rgba(0,0,0,0.08)` |
| Layout | `flex-direction: row-reverse` (Mac) |
| Traffic light zone | **70px** wide (Mac native) |
| Title font | `12px`, `line-height: 22px` |
| Toolbar gap | `4px` |
| Inactive state | `opacity: 0.6` on all children |
| Drag region | `position: absolute; width: 100%; height: 100%` overlay |
| Three-column | left (20%, flex-grow: 2) / center (60%, fit-content) / right (20%, flex-grow: 2) |
| Command center | `22px` tall, `38vw` wide (max 600px), `6px` border-radius |
| Menubar | Inside titlebar left, `padding: 0 8px`, `border-radius: 5px` |

### emdash
| Property | Value |
|----------|-------|
| Height | **36px** (CSS variable `--tb`) |
| Background | `bg-muted` / `bg-background` |
| Border bottom | `inset box-shadow` (1px inset border) |
| Box shadow | None |
| Layout | `flex items-center` |
| titleBarStyle | `hiddenInset` (macOS default traffic light position) |
| Drag region | `-webkit-app-region: drag` on entire header |
| Center content | Project/task breadcrumb, `opacity: 0 -> 1` on hover (200ms) |
| Center width | `min(60vw, 720px)` |
| Center font | `13px, font-medium` |
| Right buttons | `h-8 w-8` (32x32px), icons `h-4 w-4` (16x16px) |
| Right gap | `gap-1` (4px) |

### Ours (screenshot)
| Property | Value |
|----------|-------|
| Height | **38px** (screenshot) / **35px** (code after edit) |
| Background | `#111` |
| Border bottom | `1px solid rgba(255,255,255,0.07)` |
| Box shadow | None |
| Layout | `flex row` (flat, single row) |
| titleBarStyle | `hidden` with `trafficLightPosition: { x: 13, y: 8 }` |
| Traffic light clearance | `paddingLeft: 76px` (screenshot) / `70px` (code after edit) |
| Drag region | `WebkitAppRegion: drag` on titlebar div, `no-drag` on children |
| Content | sidebar toggle + back/forward + breadcrumb + branch picker + refresh + route badge |
| Font | `12px` |
| Gap | `6px` |

### Delta: Titlebar

| Issue | VS Code | emdash | Ours | Severity |
|-------|---------|-------|------|----------|
| Three-column layout | left/center/right with flex-grow | center content with flex | Single flat row, no centering | HIGH -- content looks unbalanced |
| Background color | `#3C3C3C` | theme-based | `#111` (too dark, no contrast with sidebar #181818) | MEDIUM |
| Box shadow | Yes (0 0 6px) | No | No | LOW |
| Command center | 22px search bar, 38vw, 6px radius | Breadcrumb with hover reveal | None -- breadcrumb only | MEDIUM -- missing primary interaction |
| Back/forward buttons | None in titlebar | None | Yes (chevrons) | UNIQUE to us |
| Branch picker | In status bar (source control) | None in titlebar | In titlebar | OK -- intentional |
| Route badge | None | None | "Chat" pill on right | Not in references |
| Inactive opacity | 0.6 on blur | Not specified | Not implemented | LOW |
| Sidebar toggle in titlebar | Explorer icon in activity bar | Toggle button in titlebar right | ChevronLeft in titlebar left | Different approach |
| Refresh button | None in titlebar | None | RotateCcw icon | Not in references |

### Key Titlebar Fixes Needed
1. **Three-column layout**: Left section (sidebar toggle + nav) / Center (project name or command center) / Right (actions)
2. **Background**: Consider `#1e1e1e` or `#252526` (VS Code sidebar) for better contrast
3. **Remove route badge**: Not a pattern in any reference app
4. **Remove back/forward buttons**: Not a VS Code/emdash pattern -- use keyboard shortcuts only
5. **Remove refresh button**: Internal action, not titlebar material

---

## 3. Sidebar

### VS Code
| Property | Value |
|----------|-------|
| Min width | **170px** |
| Preferred width | **300px** |
| Background | `#252526` (dark) |
| Title height | **35px** |
| Title h2 | `text-transform: uppercase; font-size: 11px; font-weight: normal` |
| Title label padding | `padding-left: 12px` |
| Title actions | Right-aligned, `margin-right: 4px` per item |
| Section header height | **22px** |
| Section header actions | `width: 28px; height: 22px` |
| Tree item height | **22px** (compact tree) |
| Content font | **13px** |
| Active indicator | 2px border-left on activity bar item |
| Collapse | Activity bar remains, sidebar width goes to 0 |
| Border right | `1px solid` programmatic |

### emdash
| Property | Value |
|----------|-------|
| Width | **16-30%** of window (percentage, collapsible to 0) |
| Background | `bg-gray-50` (light) / `bg-muted/10` (dark) |
| Border | `border-r border-border` (1px) |
| Header padding | `px-3 py-3` (~12px 12px) |
| Nav items | `px-2 py-1.5` (8px 6px), `rounded-md`, icons `h-4 w-4` |
| Active state | `bg-black/[0.06]` (light) / `bg-white/[0.08]` (dark) |
| Section labels | `text-xs font-semibold uppercase tracking-wide text-muted-foreground/70` |
| Project items | `py-1.5 pl-1 pr-1` with `h-4 w-4` folder icon |
| Task items | `py-1.5 pl-1 pr-2 rounded-md` |
| Tap animation | `whileTap: { scale: 0.97 }` (framer-motion) |
| Collapse | Width 0, `duration-200 ease-linear` |
| Mobile | Fixed overlay, `bg-black/20 backdrop-blur-sm` |

### Ours (screenshot)
| Property | Value |
|----------|-------|
| Width | **220px** (screenshot) / **240px** (code after edit) |
| Background | `#181818` |
| Title ("ACTIVITY") | height: 35px, 11px, weight 400, uppercase, letter-spacing 0.08em |
| Title buttons | AlignJustify (hamburger) + Plus, each 22x22px |
| Section header ("WORKSPACES") | height: 22px, 11px, weight 700, uppercase |
| Workspace row | ~28px, purple avatar (20x20, radius 4) + name + diff counts |
| Branch label | Below workspace row, 10px, dim |
| Session rows | ~32px (screenshot), two lines: title (12px) + "0 msgs" (10px) |
| Session row elements | StatusDot + title + subtitle + "+0" green badge + shortcut |
| Bottom bar | 36px, "+Add" button + Help icon + Settings icon |
| Collapse | CSS width transition 0.18s ease |
| Border right | `1px solid rgba(255,255,255,0.06)` when open |

### Delta: Sidebar

| Issue | VS Code | emdash | Ours | Severity |
|-------|---------|-------|------|----------|
| Width system | Pixel, resizable sash | Percentage, ResizableHandle | Fixed pixel, no resize | HIGH -- can't resize |
| Background | `#252526` | `bg-muted/10` | `#181818` | LOW -- stylistic |
| Title font weight | `normal` (400) | N/A | 400 | OK |
| Title padding-left | `12px` | `12px` | `16px` | Minor -- VS Code is 12px |
| Tree item height | **22px** | ~28px | **32px** (screenshot) | HIGH -- rows too tall |
| Tree item font | **13px** | `text-sm` (14px) | 12px | Should be 13px |
| Two-line session rows | N/A (single-line file names) | Single-line task names | Two lines: title + "0 msgs" | HIGH -- bloated, not matching any reference |
| "+0" badge on every row | None | None | Yes, green "+0" on every row | HIGH -- noisy, meaningless when 0 |
| Workspace avatar | None (file/folder icons) | Folder icon `h-4 w-4` | 20x20 letter avatar | Stylistic -- OK but large |
| Section header "WORKSPACES" | "EXPLORER" (sidebar view name) | Section labels like "Projects" | "WORKSPACES" | Rename to match context |
| Bottom action bar | None | None | 36px with Add/Help/Settings | NOT in any reference -- remove |
| Collapse chevron direction | None (sash resize) | None (resize handle) | ChevronLeft rotates 180 | Unique to us |
| Active item highlight | `bg-white/[0.06]` | `bg-white/[0.08]` | `rgba(255,255,255,0.06)` | OK |
| Hover | `rgba(255,255,255,0.05)` | `hover:bg-accent` | `rgba(255,255,255,0.03-0.04)` | OK |
| Status dot | None | None | 6px circle, yellow glow when recent | UNIQUE -- not in any ref |

### Key Sidebar Fixes Needed
1. **Add resize handle**: Sash/drag-to-resize like VS Code and emdash
2. **22px tree item rows**: Single-line, 13px font, no subtitle
3. **Remove "+0" badges**: Only show non-zero counts, and use VS Code's badge style
4. **Remove bottom action bar**: Settings goes in titlebar right actions, Add is already in section header
5. **Smaller avatar**: 16x16 like emdash folder icons, not 20x20
6. **No branch label below workspace**: Fold into the workspace row or status bar

---

## 4. Status Bar

### VS Code
| Property | Value |
|----------|-------|
| Height | **22px** |
| Font size | **12px** |
| Line height | **22px** |
| Background | `#007ACC` (blue, with workspace) / `#68217A` (purple, no folder) |
| Foreground | `#FFFFFF` |
| Layout | `flex`, left-items (flex-grow: 1) + right-items (flex-direction: row-reverse) |
| Item padding | `0 5px` with `margin: 0 3px` |
| Item max-width | `40vw` |
| Hover | `white@12%` (dark) / `black@12%` (light) overlay |
| Transition | `0.15s ease-out` on background-color |
| Mac corner radius | `10px` (pre-Tahoe) / `16px` (Tahoe+) |
| Font variant | `tabular-nums` |
| First item | `padding-left: 2px` |
| Last item | `padding-right: 2px` |
| Prominent items | Custom bg/fg for warning, error, remote, offline |

### emdash
No status bar.

### Ours
| Property | Value |
|----------|-------|
| Height | **22px** |
| Font size | **11px** |
| Background | `#10b981` (emerald green) |
| Foreground | `rgba(0,0,0,0.8)` |
| Layout | `flex`, branch button left + spacer + project name right |
| Item padding | `0 4px` |
| Hover | None |
| Transition | None |
| Mac corner radius | None |

### Delta: Status Bar

| Issue | VS Code | emdash | Ours | Severity |
|-------|---------|-------|------|----------|
| Font size | **12px** | N/A | **11px** | MEDIUM -- should be 12px |
| Background color | `#007ACC` (branded blue) | None | `#10b981` (emerald) | Stylistic -- OK but unconventional |
| Hover on items | 12% overlay | N/A | None | MEDIUM -- missing interactive feedback |
| Font variant | `tabular-nums` | N/A | Not set | LOW -- nice polish |
| Mac bottom radius | `10px`/`16px` | N/A | None | MEDIUM -- native feel |
| Transition | `0.15s ease-out` | N/A | None | LOW |
| Left/right sections | Proper left-items + right-items structure | N/A | Flat flex with spacer | LOW |
| Content density | ~8 items (branch, errors, warnings, encoding, line/col, spaces, language, notifications) | N/A | 2 items (branch, project name) | OK for MVP |

---

## 5. Electron Window Config

| Property | VS Code | emdash | Ours |
|----------|---------|-------|------|
| `titleBarStyle` | `hidden` (Mac) | `hiddenInset` | `hidden` |
| `trafficLightPosition` | Not set (OS default for hidden) | Not set (OS default for hiddenInset) | `{ x: 13, y: 8 }` |
| `width` | 1024 | 1400 | 1400 |
| `height` | 768 | 900 | 900 |
| `minWidth` | 400 | 700 | 900 |
| `minHeight` | 270 | 500 | 600 |
| `vibrancy` | None | None | `under-window` |
| `backgroundColor` | `#1e1e1e` (dark) | Not set | `#09090b` |
| `frame` (Win/Linux) | `false` | `false` | Default (true) |

### Key Electron Config Differences
1. **VS Code uses `hidden` without explicit trafficLightPosition** -- OS places traffic lights at default position
2. **emdash uses `hiddenInset`** -- content area is inset, traffic lights are inside window chrome area
3. **We explicitly set trafficLightPosition** -- works but is non-standard; consider matching VS Code's approach
4. **`vibrancy: "under-window"`** -- neither VS Code nor emdash uses this; may cause rendering issues
5. **Min dimensions** -- ours are too large (900x600). VS Code allows 400x270, emdash 700x500.

---

## 6. Typography

| Property | VS Code | emdash | Ours |
|----------|---------|-------|------|
| System font | `-apple-system, BlinkMacSystemFont, sans-serif` | Same + more fallbacks | `-apple-system, system-ui, sans-serif` (titlebar only) |
| Base font size | `13px` (workbench), `11px` (body) | `text-sm` (14px) with custom `13px` code size | Mixed -- CSS vars with no clear base |
| Monospace | `Menlo, Monaco...` (codicon system) | `Menlo, Monaco, Consolas...` | `var(--font)` |
| Title font size | `12px` | `13px` | `12px` |
| Code font size | `13px` (editor default) | `13px` (`text-code`) | Variable |
| Letter spacing | None globally | `tracking-wide` on labels | `0.06-0.08em` on headers |
| Line height | `1.4em` (workbench base) | `1.2-1.3` (code/tiny) | Not consistently set |

---

## 7. Color System

| Token | VS Code Dark | emdash Dark | emdash Dark-Black | Ours |
|-------|-------------|-------------|-------------------|------|
| Background (main) | `#1e1e1e` | `hsl(215,28%,17%)` ~`#1f2937` | `#000000` | `var(--bg)` (undefined in analysis) |
| Sidebar bg | `#252526` | `bg-muted/10` | `#262626` at 10% | `#181818` |
| Titlebar bg | `#3C3C3C` | `bg-muted` / `bg-background` | `#000000` | `#111` |
| Status bar bg | `#007ACC` | N/A | N/A | `#10b981` |
| Border | `#3C3C3C` implied | `hsl(217,17%,32%)` | `#333333` | `rgba(255,255,255,0.06-0.07)` |
| Text primary | `#CCCCCC` | `hsl(220,9%,96%)` | `#f2f2f2` | `rgba(255,255,255,0.85)` |
| Text secondary | 60% of primary | `hsl(220,9%,70%)` | `#a6a6a6` | `rgba(255,255,255,0.55)` |
| Text dim | -- | -- | `#737373` | `rgba(255,255,255,0.2-0.35)` |
| Accent | `#007ACC` (blue) | N/A | N/A | `#10b981` (emerald) |
| Corner radius | `2-12px` scale | `4-8px` (--radius: 0.5rem) | Same | `0-4px` (mostly 3-4px) |

---

## 8. Interaction Patterns

### Button/Action Sizes

| Context | VS Code | emdash | Ours |
|---------|---------|-------|------|
| Titlebar action | 22x22 (toolbar) | 32x32 (h-8 w-8) | Variable (padding-based, ~20px) |
| Sidebar action | 28x22 (collapsible header) | 28x28 (h-7 w-7, icon-sm) | 22x22 |
| Status bar item | line-height 22, padding 0 5px | N/A | padding 0 4px |
| Toolbar icon | 16px (codicon) | 16x16 (h-4 w-4) | 11-14px (lucide) |
| Button border-radius | 6px (cornerRadius-medium) | 6px (md) / 8px (lg) | 3px |

### Hover States

| Context | VS Code | emdash | Ours |
|---------|---------|-------|------|
| Toolbar | `var(--toolbar-hoverBackground)` | `hover:bg-transparent` | Inline `rgba(255,255,255,0.07)` |
| Tree item | `listHoverBackground` | `hover:bg-accent` | `rgba(255,255,255,0.03-0.05)` |
| Status bar | `white@12%` overlay | N/A | None |
| Window close | `rgba(232,17,35,0.9)` | `bg-red-600` | N/A |
| Button radius on hover | 6px | Inherited from rounded-md | 3px |

### Transitions & Animation

| Effect | VS Code | emdash | Ours |
|--------|---------|-------|------|
| Status bar bg | `0.15s ease-out` | N/A | None |
| Sidebar collapse | Instant (grid resize) | `200ms linear` | `180ms ease` |
| Hover color | Not specified (instant) | `150ms cubic-bezier(0.4, 0, 0.2, 1)` | `100ms` (inline) |
| Press feedback | None | `whileTap: { scale: 0.97 }` | None |
| Menu appear | Instant | `160ms [0.22, 1, 0.36, 1]` | None |

---

## 9. UX Flow Comparison

### Opening the App

| Step | VS Code | emdash | Ours |
|------|---------|-------|------|
| 1 | Welcome tab with recent projects | Last workspace restored | Welcome screen with suggested actions |
| 2 | Activity bar shows file explorer active | Left sidebar shows project tree | Sidebar shows sessions list |
| 3 | Titlebar shows workspace name | Titlebar shows project/task breadcrumb (on hover) | Titlebar shows project name + branch |
| 4 | Status bar shows branch, line/col, encoding | No status bar | Status bar shows branch + project name |

### Sidebar Navigation

| Action | VS Code | emdash | Ours |
|--------|---------|-------|------|
| Switch views | Click activity bar icon | Click sidebar nav items (Home, Skills, MCP) | Only one view (sessions list) |
| Collapse | Click active activity bar icon | Toggle button in titlebar | Toggle button in titlebar |
| Resize | Drag sash between sidebar and editor | Drag ResizableHandle | Not possible |
| Tree expand/collapse | Click chevron or double-click | Click row | Click workspace row |
| Create new | Context menu or toolbar button | Plus button in section | Plus buttons in header + bottom bar |

### Session Management

| Action | VS Code (tabs) | emdash (tasks) | Ours (sessions) |
|--------|---------------|---------------|-----------------|
| Switch | Click tab | Click task in sidebar | Click session in sidebar |
| New | Cmd+N or tab bar + | Plus button in project section | Plus button (in 3 places!) |
| Close | X on tab or Cmd+W | Archive task | Not visible in UI |
| Visual indicator | Active tab highlighted | `bg-white/[0.08]` highlight | `bg 0.06` + bold text + yellow dot |
| Keyboard shortcut | Cmd+1-9 for tab positions | None visible | Cmd+1-9 (shown as overlay) |

---

## 10. Critical Gaps (Priority Order)

### P0 -- Broken / Visually Wrong

1. **Session rows are bloated** (screenshot: 32px with two lines + badge vs. VS Code 22px single-line)
   - Remove "0 msgs" subtitle
   - Remove "+0" green badge (meaningless when 0)
   - Match 22px row height

2. **Sidebar has a bottom action bar** that no reference app has
   - Settings belongs in a menu/settings page, not sidebar footer
   - Help icon adds no value
   - "+Add" duplicates the section header "+"

3. **Titlebar is a flat dumping ground** -- no structure
   - VS Code uses three-column (left/center/right) with `flex-grow: 2` on sides
   - Back/forward arrows, refresh button, route badge don't exist in any reference

### P1 -- Missing Core UX

4. **Sidebar not resizable** -- every reference app has resize handles
5. **No command center / search** -- VS Code has a 22px search bar in titlebar center
6. **No resize persistence** -- sidebar width should be stored and restored
7. **Three places to create a session** (header "+", section "+", bottom bar "+Add") -- should be ONE

### P2 -- Visual Polish

8. **Font inconsistency**: Titlebar, sidebar, and content use different font stacks
9. **Status bar font**: 11px should be 12px per VS Code
10. **Mac bottom corner radius** on status bar: should be 10px (or 16px on Tahoe)
11. **No hover states on status bar items**
12. **Button border-radius**: 3px everywhere, VS Code uses 6px for toolbar actions
13. **No press/tap feedback**: emdash has `whileTap: { scale: 0.97 }` on interactive items
14. **Background color gap**: Titlebar (#111) too close to sidebar (#181818) -- no visual separation
15. **Status bar transition**: Should animate bg-color changes (0.15s ease-out)

### P3 -- Nice to Have

16. **Window blur/inactive state**: VS Code dims to 60% opacity
17. **`vibrancy: "under-window"`**: Neither reference uses this, may cause rendering issues
18. **Min window dimensions**: 900x600 too large -- VS Code allows 400x270

---

## 11. Recommended Target Dimensions

Based on the three references, here are the exact values to target:

```
TITLEBAR
  height:            35px
  background:        #252526 (match sidebar) or #3C3C3C (VS Code distinct)
  padding-left:      70px (Mac traffic light zone)
  padding-right:     8px
  border-bottom:     1px solid rgba(255,255,255,0.07)
  font-size:         12px
  line-height:       22px
  toolbar-gap:       4px
  three-column:      left 20% | center 60% | right 20%
  action-btn-size:   22x22px (VS Code toolbar)
  action-icon-size:  16px
  action-radius:     6px
  action-hover-bg:   rgba(255,255,255,0.1)

SIDEBAR
  min-width:         170px
  default-width:     260px (stored in localStorage)
  max-width:         50% of window
  background:        #252526
  title-height:      35px
  title-h2:          11px, uppercase, font-weight: normal, padding-left: 12px
  section-header:    22px tall, 11px, bold, uppercase
  tree-item-height:  22px
  tree-item-font:    13px, single line
  tree-item-padding: 0 8px 0 28px (indented)
  hover-bg:          rgba(255,255,255,0.05)
  active-bg:         rgba(255,255,255,0.06)
  border-right:      1px solid rgba(255,255,255,0.07)
  resize-handle:     1px visible + 4px invisible hit area
  collapse-transition: 200ms linear (emdash) or 180ms ease (ours)

STATUS BAR
  height:            22px
  font-size:         12px
  line-height:       22px
  background:        #007ACC (VS Code blue) or #10b981 (our emerald)
  foreground:        #FFFFFF
  item-padding:      0 5px
  item-margin:       0 3px
  hover-bg:          rgba(255,255,255,0.12)
  transition:        0.15s ease-out (bg-color)
  mac-bottom-radius: 10px (16px on Tahoe+)
  font-variant:      tabular-nums
```

---

## Appendix A: Reference File Locations

### VS Code (cloned to /tmp/vscode-shell-ref)
- Layout: `src/vs/workbench/browser/layout.ts`
- Titlebar CSS: `src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css`
- Titlebar TS: `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`
- Activity bar CSS: `src/vs/workbench/browser/parts/activitybar/media/activitybarpart.css`
- Activity bar actions: `src/vs/workbench/browser/parts/activitybar/media/activityaction.css`
- Sidebar CSS: `src/vs/workbench/browser/parts/sidebar/media/sidebarpart.css`
- Status bar CSS: `src/vs/workbench/browser/parts/statusbar/media/statusbarpart.css`
- Base styles: `src/vs/workbench/browser/media/style.css`
- Part base: `src/vs/workbench/browser/media/part.css`
- Corner radii: `src/vs/platform/theme/common/sizes/baseSizes.ts`

### emdash (cloned to /tmp/emdash-shell-ref)
- Window config: `src/main/app/window.ts`
- Titlebar: `src/renderer/components/titlebar/Titlebar.tsx`
- Layout constants: `src/renderer/constants/layout.ts`
- Workspace layout: `src/renderer/views/Workspace.tsx`
- Left sidebar: `src/renderer/components/sidebar/LeftSidebar.tsx`
- Right sidebar: `src/renderer/components/RightSidebar.tsx`
- Sidebar UI primitive: `src/renderer/components/ui/sidebar.tsx`
- Button sizes: `src/renderer/components/ui/button.tsx`
- Theme CSS: `src/renderer/index.css`
- Tailwind config: `tailwind.config.js`

### Conductor (/Applications/Conductor.app -- Tauri binary, CSS not extractable)
- Binary: Native Tauri v2 app (Rust + WKWebView), NOT Electron
- Frontend assets compiled into binary -- exact CSS not extractable without devtools
- Window state: `~/Library/Application Support/com.conductor.app/.window-state.json`
- Database: SQLite at `conductor.db`
- Architecture data extracted from binary strings and config files

### Ours
- Electron main: `packages/studio/electron/main.ts`
- Layout: `packages/studio/client/src/components/Layout.tsx`
- Sidebar: `packages/studio/client/src/components/ActivitySidebar.tsx`

---

## Appendix B: Conductor Architecture (Tauri -- CSS not extractable)

Conductor is a **Tauri v2** app (Rust backend, WKWebView frontend), version 0.40.1.
CSS/pixel values are compiled into the binary and not extractable via static analysis.
Architectural findings only:

### Window Configuration
- Uses `setTitlebarAppearsTransparent` (Objective-C bridge) -- transparent/overlay titlebar
- `NSVisualEffectView` vibrancy via `window-vibrancy` crate (v0.5.3)
- `data-tauri-drag-region` for custom titlebar drag areas
- `trafficLightPosition` is configurable
- `hiddenTitle` support
- Double-click on drag region triggers `internal_toggle_maximize`
- Window state persisted: position, size, decorated, maximized, fullscreen

### Shell Layout
- **Three-panel layout**: left sidebar + main content + right sidebar
- Left sidebar toggle: `Cmd+B` (emits `toggle_left_sidebar` to frontend)
- Right sidebar toggle: `Cmd+Alt+B` (emits `toggle_right_sidebar` to frontend)

### View Types (enum)
- `Editor` -- code/file editor
- `Viewer` -- read-only
- `Shell` -- terminal (PTY: `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`)
- `QL` -- Quick Look preview
- `Generator` -- content generation
- `None` -- empty

### Key Backend Commands
- Terminal: `pty_spawn` / `pty_write` / `pty_resize` / `pty_kill`
- File tree: `list_file_tree` with `standardFilters`
- Fuzzy search: `fuzzy_filter_files` with `fileCache`, `query`, `workspacePath`
- Shell: `execute_shell_command`
- Sidecar: `ensure_sidecar_started`, `rpc_to_sidecar`, `configure_sidecar_inspect`
- Mac: `set_dock_badge`, `update_window_vibrancy`, `resize_image`

### Database Schema (SQLite)
- `workspaces`: `big_terminal_mode` (terminal as main pane), `unread` indicator
- `sessions`: `unread_count`, `pending_message`, `context_token_count`, `notes`, `model`, `is_compacting`
- Also: `repos`, `session_messages`, `settings`, `attachments`, `diff_comments`

### Bundled CLI Tools (/Contents/Resources/bin/)
- `claude` (190MB), `codex` (77MB), `node` (110MB), `gh` (53MB), `watchexec` (7MB)
- `checkpointer.sh` -- git checkpoint save/restore/diff
- `spotlighter.sh` -- file watcher for checkpoint sync
- `git-busy-check.sh` -- detects in-progress git operations

### Key Architectural Differences from Our App
| Feature | Conductor | Ours |
|---------|-----------|------|
| Runtime | Tauri (Rust + WKWebView) | Electron (Node.js + Chromium) |
| Database | SQLite (persistent) | In-memory / JSON files |
| Terminal | PTY via Rust commands | PTY via node-pty |
| File tree | `list_file_tree` Tauri command | `/api/files` HTTP endpoint |
| Sidebar toggles | `Cmd+B` / `Cmd+Alt+B` events | State in React + localStorage |
| Vibrancy | `window-vibrancy` crate, dynamic | Electron `vibrancy: "under-window"` |
| CLI bundling | claude, codex, node, gh bundled | None bundled |
| Window state | JSON file with full state | localStorage for sidebar only |
| Checkpointing | Git checkpoint scripts | None |

---

## Appendix C: Navigation Audit -- Orphaned Pages

### All Routes (13 pages + 2 redirects)

| Route | Page | Reachable from sidebar? | Reachable from activity bar? | Other access |
|-------|------|------------------------|------------------------------|--------------|
| `/` | Chat/Home | YES (session click) | YES (Chat icon) | Always visible |
| `/files` | File Explorer | NO | YES (Explorer icon) | `g f`, Cmd+Shift+E, command palette |
| `/git` | Git Log | NO | NO | `g g` keyboard shortcut only |
| `/source-control` | Source Control | NO | NO | Cmd+Shift+G (conflicts with Find Previous), command palette |
| `/agents` | Agent List | NO | YES (Agents icon) | `g a`, Cmd+Shift+A, command palette |
| `/generate` | Scan/Generate | NO | YES (Generate icon) | Home quick action, drift banner |
| `/run` | Agent Runner | NO | YES (Run icon) | `g r`, Home quick action, agent card button |
| `/swarm` | Multi-Agent Swarm | NO | NO | Home quick action only |
| `/history` | Run History | NO | NO | Home quick action, Home "View all runs" |
| `/company` | Company Mode | NO | NO | `g c` keyboard shortcut only |
| `/governance` | Policy Management | NO | NO | **COMPLETELY ORPHANED** -- no link, no shortcut, no menu |
| `/settings` | Settings | NO (bottom gear icon) | YES (Settings icon) | Cmd+, |
| `/setup` | Workspace Setup | NO (sidebar "+" buttons) | NO | Multiple "+" buttons |
| `/sessions` | Redirect to `/` | N/A | N/A | Legacy redirect |

**Result: 5 pages completely unreachable from persistent navigation.**
- `/git` -- keyboard only
- `/source-control` -- menu/palette only
- `/swarm` -- Home quick action only
- `/history` -- Home quick action only
- `/company` -- keyboard only
- `/governance` -- ORPHANED

### Conductor vs Ours: Sidebar Content

**Conductor sidebar** (from screenshot):
- "Activity" title
- "Workspaces" section with filter + add buttons
- Multiple workspaces (brutal, gripe, datacut, Chennai) each with:
  - Letter avatar + workspace name
  - Nested sessions with: status dot + title + diff stats (+1661 -186) + branch name + keyboard shortcut
- Bottom bar: Add, info, settings

**Our sidebar** (from screenshot):
- "ACTIVITY" title (was "EXPLORER" after edit, but screenshot shows old)
- "WORKSPACES" section
- Single workspace with:
  - Letter avatar + workspace name + branch below
  - Sessions with: status dot + title + "0 msgs" subtitle + "+0" badge + shortcut
- Bottom bar: Add, help, settings

### Key UX Flow Gaps vs Conductor

| Flow | Conductor | Ours | Gap |
|------|-----------|------|-----|
| **Multi-workspace** | Multiple repos in sidebar, each collapsible | Single workspace only | Need multi-workspace support |
| **Session diff stats** | Shows real +/- line counts per session | Shows "+0" always | Wire real diff data into sessions |
| **Tab bar** | Secondary tab bar below titlebar (document icon, "Plan tabs") | None | Add tabbed views for plans, code, etc. |
| **Branch in titlebar** | `user/repo > origin/branch` with dropdown | `projectName > branch` with dropdown | Similar, needs polish |
| **Model selector** | Bottom bar: model icon + "Sonnet 4.6" + "Thinking" status | None in shell (in chat input area) | Move model info to visible status area |
| **Thinking indicator** | Brain icon + "Thinking" text in bottom bar | Streaming state exists but not shown in shell | Surface thinking/streaming state |
| **Branch picker** | Searchable dropdown with all branches | Basic dropdown (no search in our screenshot) | Add search to branch picker |
| **Open/Close actions** | "Open" dropdown in titlebar right | None | Add workspace open action |
| **Message metadata** | "14s" timestamp + copy + branch icon per message | Exists in ChatMessages | OK |

### What the VS Code Activity Bar Should Contain

Based on our 13 pages, the activity bar should map to these primary views:

```
TOP ICONS (primary navigation):
  MessageSquare  -> /           Chat (home/sessions)
  FolderTree     -> /files      File Explorer
  GitBranch      -> /source-control  Source Control (merge /git into this)
  Bot            -> /agents     Agents
  PlayCircle     -> /run        Run / Swarm / History (grouped)
  Zap            -> /generate   Generate / Scan
  Shield         -> /governance Governance (currently orphaned)

BOTTOM ICONS (utility):
  Settings       -> /settings   Settings
```

This gives every page a home. `/company` and `/swarm` can be tabs within `/run` or `/agents`.
`/setup` is a modal/wizard, not a nav destination. `/history` is a tab within `/run`.

### Keyboard Shortcut Conflicts

| Shortcut | Conflict |
|----------|----------|
| `Cmd+Shift+G` | Edit > Find Previous AND View > Source Control |
| `Cmd+Shift+O` | File > Open Project AND Go > Go to Symbol |

These need to be resolved. VS Code uses `Cmd+Shift+G` for Source Control and `Cmd+Shift+H` for Find and Replace.

---

## Appendix D: Conductor UX Deep Dive (from screenshot)

### Conductor Titlebar Anatomy (left to right)

```
[traffic lights] [<] [>] [panel-toggle] [panel-toggle] "Activity" label
         CENTER: git-icon "jpoindexter/chennai" > "origin/feat/product-direction" [v]
         RIGHT: "/ chennai1" [Open v] [PR button]
```

- Height: ~35px, transparent titlebar (`setTitlebarAppearsTransparent`)
- Back/forward arrows after traffic lights
- Two layout toggle icons (left sidebar, right sidebar)
- "Activity" label (sidebar title reference)
- Center: owner/repo > branch breadcrumb with searchable branch picker
- Right: worktree path badge + "Open" dropdown + "Create PR" button

### Conductor Tab Bar (below titlebar)

```
[chat-icon] [sparkle "Plan tabs"]
```

- Secondary tab bar in main content area, ~35px
- Tabs: Chat view, Plan view (shows structured task breakdown)
- Plan mode toggle via `Shift+Tab`

### Conductor Sidebar Structure

```
"Activity"                    [title]
"Workspaces"           [=] [+]  [section header]
  B  brutal                      [workspace]
     * Fix todo                  [session]
       port-louis          Cmd+1 [branch + shortcut]
  G  gripe                       [workspace]
     * Finish gri... +1661 -186  [session with diff stats]
       dalat               Cmd+2
  D  datacut                     [workspace, collapsed]
     * Chennai      +457 -69     [session with diff stats]
       chennai             Cmd+3
---bottom bar---
  + Add       (?)  [gear]
```

Key patterns:
- **Multi-workspace**: Multiple repos, each collapsible
- **Session = agent task**: Session title IS the task description
- **Diff stats inline**: +additions -deletions shown per session (not per workspace)
- **Branch per session**: Each session runs on its own branch/worktree
- **Status dots**: Orange = running/recent, Blue = active/selected
- **Keyboard shortcuts**: Cmd+1/2/3 for quick workspace switching

### Conductor Model/Status Bar

```
LEFT:  [sparkle] Sonnet 4.6  [brain] Thinking  [plan-icon]
RIGHT: [+] [send]
```

- Below input bar, spans full width
- Model selector (click to switch between Opus/Sonnet/Haiku/Codex)
- Thinking toggle (brain icon, active = colored)
- Plan mode toggle (document icon)
- Attach button (+) and Send button on right

### Agent-First Workflow (Conductor)

1. Select workspace (sidebar click or Cmd+1/2/3)
2. Type task in always-visible input bar (Cmd+L to focus)
3. Optionally enable plan mode (Shift+Tab) or thinking (brain icon)
4. Optionally switch model (click model name)
5. Send (Enter or arrow button)
6. Agent executes, status dot turns orange, pre-checkpoint created
7. Review changes in right panel diff view
8. Iterate or "Create PR" from titlebar

**Zero-friction start**: Input bar always visible. No modals, no wizards.

### Conductor Patterns We Should Adopt

| Pattern | What Conductor Does | What We Should Do |
|---------|-------------------|-------------------|
| Model selector | Visible in status area, click to switch | Add model selector to our model info bar |
| Thinking toggle | Brain icon, active state visible | Surface thinking/streaming state in status |
| Plan mode | Shift+Tab toggle, plan tab appears | Already have plan views, need toggle |
| Diff stats in sidebar | +N -M per session | Wire real diff data to session rows |
| Multi-workspace | Multiple repos in sidebar | Support multiple project dirs |
| Worktree path | Shown in titlebar right | Show worktree path in titlebar |
| Branch per session | Each session = branch + worktree | Already support worktree branches |
| Checkpointing | Pre/post git checkpoints per turn | Add checkpoint system |
| "Create PR" button | Titlebar right action | Add PR creation action |
| Terminal in right panel | Setup/Run/Terminal tabs | We have bottom terminal, keep it |
| @mention files | Input bar supports @file references | Already in our input bar |

---

## Appendix E: Target Architecture -- VS Code Shell + Conductor Workflow

### The Hybrid

**Shell structure = VS Code** (exact dimensions, exact behavior):
```
TITLEBAR (35px) ─────────────────────────────────────
│ [traffic lights 70px] │ breadcrumb center │ actions │
├────────────────────────────────────────────────────│
│ ACTIVITY │ SIDEBAR PANEL │ MAIN CONTENT AREA       │
│ BAR      │ (240px,       │                          │
│ (48px,   │  resizable)   │  Chat / Files / Agents   │
│ vertical │               │  / Source Control / etc.  │
│ icons)   │  Sessions     │                          │
│          │  grouped by   │  ──────────────────────  │
│          │  workspace    │  Terminal drawer (bottom) │
│          │               │  ──────────────────────  │
│ [Settings│               │  Input bar (full-width)   │
│  at      │  [bottom:     │  Model bar               │
│  bottom] │   Add/Help/   │                          │
│          │   Settings]   │                          │
├──────────┴───────────────┴──────────────────────────│
STATUS BAR (22px, 12px font, colored background) ─────
```

### Activity Bar Icons (VS Code style, 48px wide)

```
TOP (primary navigation):
  MessageSquare  /           Chat (sessions home)
  FolderTree     /files      File Explorer
  GitCompare     /source-control  Source Control
  Bot            /agents     Agents
  PlayCircle     /run        Run / History
  Zap            /generate   Generate / Scan
  Shield         /governance Governance

BOTTOM (utility):
  Settings       /settings   Settings
```

- 48x48px click targets, 20px icon size
- 2px left border on active (VS Code active indicator)
- VS Code colors: active = white, inactive = 40% opacity

### Sidebar Panel Content (Conductor workflow)

The sidebar panel changes based on the active activity bar icon:

| Activity Icon | Sidebar Shows |
|--------------|---------------|
| Chat | Workspaces + sessions (Conductor pattern) |
| Explorer | File tree |
| Source Control | Changed files list + staged/unstaged |
| Agents | Agent roster grouped by department |
| Run | Active runs + run history |
| Generate | Scan targets + output format picker |
| Governance | Policy rules list |

### Titlebar (VS Code three-column)

```
LEFT (flex-grow: 2):
  [sidebar toggle] [breadcrumb: projectName > branch]

CENTER (flex, fit-content):
  [Command center search bar, 22px, 38vw max 600px] (optional, future)

RIGHT (flex-grow: 2, justify: flex-end):
  [model selector badge] [thinking indicator] [actions]
```

### Status Bar (22px, VS Code style)

```
LEFT:
  [branch icon] main +3  [errors icon] 0  [warnings icon] 2

RIGHT:
  [model name] Sonnet 4.6  [thinking status]  [project name]
```

### Model Bar (below input, Conductor pattern)

```
LEFT: [model-icon] Sonnet 4.6  [brain] Thinking  [plan-icon] Plan
RIGHT: [+] attach  [send] arrow-up
```

---

## Appendix F: Conductor Agent Execution UX (second screenshot)

Source: Screenshot 2026-03-19 at 9.09.57 AM -- shows a live agent session with tool calls, thinking, subagents.

### Tab Bar Detail

```
[chat-icon]  [sparkle "Plan tabs"]  "Codex"  [+]
```

- **Chat icon** (speech bubble outline) -- switches to raw chat view
- **Plan tabs** (sparkle + label) -- currently active, shows structured execution view
- **Codex** -- separate tab for GPT/Codex agent running in same workspace
- **+** -- add new tab (file, agent, etc.)

Multi-model tabs: you can have Claude AND Codex tabs open simultaneously in the same workspace.

### Chat Message Types (in execution order)

The main content renders these distinct message types:

**1. User message** (right-aligned dark pill):
```
"i thought the design for this was supposed to be like the buzz about / gummy search"
```
- Right-aligned, dark background pill
- User's natural language instruction

**2. Tool call summary** (collapsible header):
```
v  23 tool calls, 22 messages, 2 subagents  [icon] [icon] [icon] [icon] ...
```
- Chevron-down to collapse/expand the full execution trace
- Stats: tool calls count, message count, subagent count
- Row of small icons (12px-ish) representing each tool call type as a visual timeline
- Icons vary: clipboard, copy, wrench, search, code, lock -- each type gets a distinct icon

**3. Thinking block** (brain icon + "Thinking" + monospace preview):
```
(brain) Thinking  The user is saying the design should match BuzzAbout/...
```
- Brain icon (circle with brain) in orange/amber
- "Thinking" label in amber text
- Truncated monospace preview of the thinking content
- Collapsible -- click to expand full thinking text

**4. Agent/subagent dispatch** (robot icon + "Agent" + description):
```
(robot) Agent  Screenshot current app state
(robot) Agent  Screenshot BuzzAbout for reference
```
- Robot/agent icon in blue/teal
- "Agent" label
- Description of what the subagent is doing
- These represent parallel subagent dispatches

**5. Plain text response** (left-aligned, no icon):
```
Let me check the design skill to understand what we're supposed to be working with:
```
- Regular assistant text, rendered with markdown
- No special icon prefix

**6. Skill activation** (circular arrow icon + name + badge):
```
(refresh) Gripe Design  Skill activated
```
- Circular arrow / refresh icon
- Skill name in bold
- "Skill activated" as a dim badge/label

**7. MCP tool call** (wrench icon + full tool name):
```
(wrench) toolsearch
(wrench) mcp__plugin_playwright_playwright__browser_navigate
(wrench) mcp__plugin_playwright_playwright__browser_take_screenshot
(wrench) mcp__plugin_playwright_playwright__browser_click
```
- Wrench/tool icon
- Full qualified tool name (MCP server prefix + tool name)
- Each tool call is its own row, collapsible to show input/output

**8. "Scroll to bottom" button** (sticky, appears when scrolled up):
```
v  Scroll to bottom  [...partial text of latest response...]
```
- Chevron-down + "Scroll to bottom" label
- Shows a preview of the latest content as motivation to scroll
- Sticky positioned above the input bar

### Visual Language for Tool Types

| Type | Icon | Color | Label |
|------|------|-------|-------|
| Thinking | Brain circle | Amber/orange | "Thinking" |
| Agent dispatch | Robot | Blue/teal | "Agent" |
| Skill | Circular arrow | Gray/neutral | "Skill activated" |
| MCP tool | Wrench | Gray/neutral | Full tool name |
| Tool summary | Chevron | Dim | "N tool calls, N messages, N subagents" |
| User message | None | -- | Right-aligned dark pill |
| Assistant text | None | -- | Left-aligned markdown |

### What Our Chat Needs to Render

Our `ChatMessages` component must handle these message part types:

1. **User messages** -- right-aligned pills (we probably have this)
2. **Tool call summary** -- collapsible header with stats + icon timeline
3. **Thinking blocks** -- collapsible with brain icon, amber color, monospace preview
4. **Subagent dispatches** -- robot icon with description
5. **Skill activations** -- refresh icon with skill name
6. **MCP tool calls** -- wrench icon with full tool name, collapsible input/output
7. **Plain text** -- markdown rendered assistant responses
8. **Scroll to bottom** -- sticky button when scrolled up

### Model Bar Detail (from both screenshots)

```
[sparkle] Sonnet 4.6    [brain] Thinking    [plan-icon]         [+]  [arrow-up]
|-- model selector --|  |-- thinking ---| |-- plan mode --|  |attach| |send|
```

- **Model selector**: Click sparkle + model name to open dropdown. Dropdown shows:
  - Claude section: Opus 4.6 1M (NEW), Opus 4.6, Sonnet 4.6 (starred), Haiku 4.5
  - Codex section: GPT-5.4 (NEW), GPT-5.3-Codex-Spark, GPT-5.3-Codex, GPT-5.2-Codex
  - Each row: icon, name, badges (NEW, star, checkmark), keyboard number (1-8)
- **Thinking toggle**: Brain icon + "Thinking" text. Pink/magenta when active. Toggles extended thinking.
- **Plan mode toggle**: Document/clipboard icon. Toggles plan-before-execute mode. Shortcut: Shift+Tab.
- **Attach button**: "+" to add files/context
- **Send button**: Up-arrow in circle

### Right Sidebar (partially visible)

A thin scrollbar/panel indicator is visible on the far right edge, suggesting:
- Right sidebar is collapsed but available
- Toggle: `Cmd+Alt+B`
- When open: shows file changes, terminal tabs (Setup/Run/Terminal/+)

---

### Key Implementation Priorities

**Phase 1 -- Shell Structure (VS Code exact)**
1. Activity bar: 48px, 48x48 items, 2px active indicator, VS Code colors
2. Titlebar: 35px, three-column, 70px traffic light zone
3. Status bar: 22px, 12px font, colored bg, left/right items, mac bottom radius
4. Sidebar: resizable (add drag handle), min 170px

**Phase 2 -- Conductor Workflow**
5. Session rows: 22px, single-line, real diff stats (+N -M)
6. Remove sidebar bottom bar (settings in activity bar, add in section header)
7. Model selector in model bar (below input)
8. Thinking/streaming indicator visible in model bar
9. Branch picker with search in titlebar

**Phase 3 -- Full Navigation**
10. Wire sidebar panel content to activity bar selection
11. File tree in sidebar when Explorer active
12. Changed files in sidebar when Source Control active
13. Agent roster in sidebar when Agents active

---

## Appendix G: Conductor Full Audit Summary

Full audit: `CONDUCTOR_AUDIT.md` (916 lines, 23 sections)

### Architecture
- Tauri v2 (Rust) + Node.js sidecar (844KB) + WebView frontend
- Sidecar communicates via Unix domain socket (`/tmp/conductor-sidecar-<PID>.sock`) using JSON-RPC
- Bundled: Claude CLI (190MB), Codex CLI (77MB), Node.js (110MB), gh (53MB), watchexec (7MB)
- SQLite database with 6 tables, ~50 migrations

### Database Schema (key tables)
- `repos`: git repos with custom prompts, setup scripts, run scripts, icons, display ordering
- `workspaces`: git worktrees with 5-state lifecycle (initializing > setting_up > ready > archiving > archived), pinning, notes, linked workspaces, PR metadata, big terminal mode
- `sessions`: per-workspace chat sessions with agent_type (claude/codex), per-session model, thinking toggle, fast mode, permission mode, context tracking, compaction state, pending message safety
- `session_messages`: individual messages with turn_id grouping, sent_at/cancelled_at tracking, per-message model override, SDK message ID
- `attachments`: file attachments with draft state, session linkage
- `diff_comments`: code review comments with threads, multi-line ranges, resolution tracking

### Agent Integration
- Claude: via Claude Code SDK with `--output-format stream-json`, `--permission-mode`, `--resume`, hooks for checkpointing
- Codex: via `codex app-server --listen stdio://` JSON-RPC, supports `thread/start`, `turn/start`, `turn/interrupt`
- Both support plan mode (Claude: ExitPlanMode tool, Codex: collaborationMode parameter)
- MCP server injected: `GetWorkspaceDiff`, `DiffComment`, `GetTerminalOutput`
- Idle sweep: max 5 concurrent sessions, 30min idle timeout, 60s check interval

### Git Checkpoint System
- `checkpointer.sh`: save (non-disruptive, stores HEAD + index + worktree as git refs), restore (destructive, git reset --hard), diff
- Checkpoints stored as `refs/conductor-checkpoints/<id>`
- Pre/post checkpoint per user turn for undo capability

### Model Support
- Claude: opus, opus-1m, sonnet, haiku (with Bedrock/Vertex API mappings)
- Codex: gpt-5.4, gpt-5.3-codex, gpt-5.2-codex (legacy)
- Per-session model override, per-message model tracking, in-flight model switching

### Key Patterns for Us to Adopt
1. **JSON-RPC sidecar**: Clean separation between UI and agent orchestration
2. **Git checkpointing**: Non-disruptive save, destructive restore per turn
3. **MCP tool injection**: GetWorkspaceDiff, DiffComment, GetTerminalOutput
4. **5-state workspace lifecycle**: initializing > setting_up > ready > archiving > archived
5. **Idle sweep**: Automatic session eviction after 30min
6. **Pending message safety**: Store message before sending to prevent data loss on crash
7. **Custom repo prompts**: Per-repo system prompts for general, code review, PR creation
8. **Turn-based grouping**: Messages grouped by turn_id for checkpoint alignment

---

## Appendix H: Warp Terminal Audit Summary

Full audit: `WARP_AUDIT.md` (488 lines)

### Architecture
- Pure native Rust binary (no Electron, no WebView)
- Custom GPU-accelerated terminal renderer
- GraphQL API to Warp backend for AI features, team sync
- Skills system (YAML-based command templates)

### AI Features (5 agent categories)
- `agentMode`: Full agentic coding in terminal
- `planning`: Reasoning before execution
- `coding`: Code generation/editing
- `cliAgent`: Headless CLI agent
- `computerUseAgent`: Browser automation

### UX Patterns Relevant to Us
- **Block-based terminal**: Each command = a collapsible block with input, output, timing
- **Command palette**: Rich command palette with categories
- **Skills system**: YAML-defined reusable command templates with variables
- **Warp Drive**: Cloud-synced notebooks, workflows, snippets for teams
- **Multi-pane**: Split panes within tabs (horizontal/vertical)
- **AI suggestions**: Inline command suggestions as you type
- **Agent mode**: Natural language to terminal commands with plan-then-execute

### Shell Structure
- Custom titlebar with tab bar integrated
- No sidebar (terminal-first, not IDE-first)
- Command block history (scrollable)
- Bottom input area with AI toggle
- Status bar with git branch, CWD, time

### Relevant Design Patterns
1. **Block-based history**: Each agent turn could be a "block" (collapsible, with timing)
2. **Inline AI toggle**: Switch between terminal mode and AI mode in the same input
3. **Skills/templates**: Reusable prompts/workflows (we have agents, similar concept)
4. **Command suggestions**: Auto-suggest based on context

---

## Appendix I: Emdash Full Audit Summary

Full audit: `EMDASH_AUDIT.md` (458 lines)

### Architecture
- Electron 30.5 + Vite + React 18 + TypeScript + Tailwind + SQLite (Drizzle ORM)
- 27 IPC modules, 10 React context providers
- Supports Claude, Codex, Gemini, custom OpenAI-compatible providers
- SSH remote development support

### Database Schema
- `projects`: local or remote folders with git remote, GitHub repo link, SSH connection
- `tasks`: work units within a project (branch, agent, worktree flag, archived)
- `conversations`: multi-chat per task (provider, isActive, displayOrder)
- `messages`: chat history with sender, content, timestamp
- `line_comments`: inline code review comments (file path, line number)
- `workspace_instances`: remote workspace provisioning

### Multi-Provider Agent System
- Provider registry: Claude, Codex, Gemini, OpenRouter, custom OpenAI-compat
- Each provider has: spawn(), send(), stop(), isHealthy(), getSlashCommands()
- Provider-specific auth (Anthropic key, OpenAI key, Google key, custom base URL)
- Health check system: heartbeat interval, auto-reconnect on failure

### View System (no router -- state-driven)
- Single Workspace view with resizable three-panel layout
- Left sidebar: navigation (Home, Skills, MCP), project tree, task list
- Main content: conversation/chat, editor, kanban board, diff viewer, settings
- Right sidebar: file changes, terminal tabs (Setup/Run/Terminal/+)
- Content switching via task selection and view mode toggles

### Key Features
- **Multi-agent parallel**: Multiple agents working on different tasks simultaneously
- **Task = branch + worktree**: Each task gets isolated git worktree
- **Kanban board**: Visual task management (columns: New, In Progress, Review, Done)
- **Browser preview**: Built-in browser for previewing web apps (`hostPreviewIpc`)
- **SSH remote dev**: Full remote development via SSH tunneling
- **MCP server support**: Connect to external MCP servers for tools
- **Plan lock**: Prevents execution until user approves plan
- **Skills system**: Reusable prompt templates
- **Linear/Jira/GitLab/Gitea integrations**: Issue tracking integrations

### Chat Message Rendering
- Streaming text with markdown
- Tool calls shown with icons and descriptions
- Thinking/reasoning blocks (collapsible)
- Code blocks with syntax highlighting
- File diffs inline
- Message actions: copy, retry, branch conversation

### Patterns for Us to Adopt
1. **Multi-provider**: Support Claude + Codex + Gemini from same interface
2. **Task = worktree**: Each task gets full git isolation
3. **Three-panel layout**: Left sidebar, main content, right sidebar (all resizable)
4. **Kanban view**: Visual task management alongside chat
5. **Browser preview**: Built-in preview for web apps
6. **Line comments**: Inline code review on diffs
7. **Health check**: Heartbeat monitoring for agent connections
8. **Skills system**: Reusable prompt templates

---

## Appendix J: Cross-App Feature Matrix

| Feature | VS Code | Conductor | Emdash | Warp | Hashmark Studio |
|---------|---------|-----------|--------|------|-----------------|
| **Shell** | Custom (grid-based) | Tauri + WebView | Electron + React | Native Rust | Electron + React |
| **Activity bar** | 48px icon rail | No (inline in titlebar) | No (sidebar nav) | No (tabs only) | 48px icon rail |
| **Sidebar** | Resizable, context-switching | Collapsible, sessions | Resizable 3-panel | No sidebar | Collapsible, sessions |
| **Status bar** | 22px, colored | No | No | Custom bottom bar | 22px, colored |
| **Terminal** | Integrated panel | PTY (Tauri commands) | PTY (node-pty) | IS the terminal | PTY (node-pty) |
| **AI chat** | Extensions | Native (Claude+Codex) | Native (multi-provider) | Native (multi-model) | Native (Claude) |
| **Multi-model** | N/A | Claude + Codex | Claude+Codex+Gemini+custom | 5 agent categories | Claude only |
| **Plan mode** | N/A | Yes (both agents) | Yes (plan lock) | Yes (planning agent) | No |
| **Git checkpoints** | N/A | Yes (per-turn) | No | No | No |
| **Worktree isolation** | N/A | Yes (per-workspace) | Yes (per-task) | N/A | No |
| **MCP tools** | Extensions | 3 custom tools | External MCP servers | N/A | No |
| **Code review** | Extensions | Diff comments (DB) | Line comments (DB) | N/A | No |
| **Multi-workspace** | Multi-window | Yes (sidebar) | Yes (projects+tasks) | Tabs | Single workspace |
| **File explorer** | Full tree | Right panel | Right panel | N/A | Basic page |
| **Diff viewer** | Built-in | Inline + stat | Inline + side-by-side | N/A | Basic drawer |
| **Branch picker** | Source control | Titlebar (searchable) | N/A | Git in prompt | Titlebar (basic) |
| **Keyboard nav** | Full | Cmd+1/2/3 workspaces | N/A | Block-based | g+key combos |
| **Database** | N/A | SQLite (sqlx) | SQLite (Drizzle) | Plist prefs | JSON files |
| **Remote dev** | SSH extension | N/A | SSH tunneling | SSH | No |
| **Kanban** | N/A | N/A | Yes (task columns) | N/A | No |
| **Browser preview** | Live Server ext | N/A | Built-in | N/A | No |
| **Auto-update** | Built-in | Tauri updater | electron-updater | Built-in | No |
| **Analytics** | Telemetry | PostHog | PostHog | Sentry + custom | No |

### Critical Gaps (our app vs. competitors)

**Must-have for parity:**
1. Git checkpoints (Conductor pattern -- per-turn undo)
2. Multi-model support (at minimum Claude + Codex)
3. Plan mode (plan-then-execute with user approval)
4. Worktree isolation (each task = own branch + worktree)
5. MCP tool injection (workspace diff, terminal output, diff comments)
6. SQLite database (replace JSON files for persistence)
7. Resizable sidebar with drag handle

**Should-have for competitive edge:**
8. Chat message types (thinking, tool calls, subagents, skills -- all with icons)
9. Multi-workspace (multiple repos in sidebar)
10. Model selector in UI (visible, one-click switching)
11. Context tracking (token count, usage percentage)
12. Idle session sweep (automatic resource cleanup)
13. Searchable branch picker
14. Custom repo prompts

**Nice-to-have:**
15. Browser preview for web apps
16. Kanban task view
17. SSH remote development
18. Line-level diff comments
19. Lottie animations for loading states
20. Auto-updater

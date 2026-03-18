# hashmark studio — Grove Design System

> The design language for hashmark studio. Named "Grove" — dark environment, green growth.
> Reference point: VSCode shell (open source at `_reference/vscode`).

---

## Name & Concept

**Grove** — a dark forest floor with green life breaking through. Maps directly to the product:
- `#0d1117` background = night in the forest
- `#3fb950` accent = the green pushing through
- Mono font = terminal, precision, craft
- Clean chrome = tools get out of the way

---

## Color Tokens

```css
/* Backgrounds — darkest to lightest */
--bg:          #0d1117;   /* body, editor, terminal */
--bg-2:        #161b22;   /* sidebar, activity bar, panel headers */
--bg-3:        #1c2128;   /* inputs, hovered items, secondary panels */
--bg-4:        #21262d;   /* badges, button fills, selected rows */

/* Borders */
--border:      #30363d;   /* primary border */
--border-dim:  #21262d;   /* subtle dividers */

/* Text */
--text:        #e6edf3;   /* primary text */
--text-dim:    #8b949e;   /* secondary, labels */
--text-dimmer: #484f58;   /* hints, placeholders, disabled */

/* Brand green (hashmark accent) */
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
```

Source: GitHub Dark Default theme (`workbench.colorTheme: "GitHub Dark Default"`)

---

## Typography

```css
--font:    'JetBrains Mono', 'Fira Code', Menlo, monospace;
--font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Where each font applies:**
- `--font-ui` → all UI chrome: buttons, labels, menus, breadcrumbs, tooltips, badges
- `--font` → code, terminal output, file paths, inputs (text/search), timestamps, token counts

**Sizes:**
| Use | Size | Weight |
|-----|------|--------|
| Section headers (uppercase) | 11px | 600 |
| Body / labels | 12px | 400 |
| Message text | 13px | 400 |
| Large headings | 14px | 600 |

---

## Spacing & Layout

From VSCode source (`workbench/browser`):

| Component | Height | Notes |
|-----------|--------|-------|
| Status bar | 22px | `STATUSBAR_HEIGHT = 22` |
| Title bar | 35px | `DEFAULT_CUSTOM_TITLEBAR_HEIGHT = 35` |
| Editor tabs | 35px | `--editor-group-tab-height` |
| Panel tab bar | 29–30px | Terminal/output section header |
| Activity bar icons | 40px each | VSCode default |
| Sidebar section headers | 26–28px | |
| Input height | 26px | `padding: 5px 10px` + 1px border × 2 |

---

## Border Radius

From VSCode button.css + notification CSS:

| Token | Value | Used for |
|-------|-------|----------|
| `--radius`    | 4px | Buttons, inputs, dropdowns, notification toasts |
| `--radius-sm` | 3px | Badges, small tags, icon buttons |
| `--radius-lg` | 6px | Cards, modals, large containers |

> VSCode uses `border-radius: 4px` on all buttons (`.monaco-text-button`).
> Our current `--radius-sm: 3px` on buttons is off — should align to 4px.

---

## Buttons

**Primary (`.btn-primary`):**
```
background: --accent
border: 1px solid --accent
color: #fff
font-weight: 600
padding: 4px 10px
border-radius: 4px
font-size: 12px
```

**Secondary (`.btn`):**
```
background: --bg-4
border: 1px solid --border
color: --text-dim
padding: 4px 10px
border-radius: 4px
font-size: 12px
```

**Ghost (toolbar icon buttons):**
```
background: none
border: none
color: --text-dimmer
width: 22px height: 22px
border-radius: 3px
hover: background rgba(255,255,255,0.08)
```

**Danger hover:** `background: rgba(248,81,73,0.15)`, `color: --red`

---

## Components

### Notification Toasts
From VSCode notification CSS (`notifications.css`):
- Position: `fixed`, `bottom: 29px` (above status bar), `right: 7px`
- Width: `320px`
- Border-radius: `4px`
- Border: `1px solid --border`
- Shadow: `0 8px 32px rgba(0,0,0,0.5)`
- Padding: `12px 16px`
- Variants: info (`--blue` icon), warning (`--yellow`), error (`--red`)
- Action buttons: secondary style, right-aligned
- Dismiss X: top-right, ghost button

### Tabs (editor / panel)
- Height: `35px` (editor), `29px` (panel)
- Active: `border-bottom: 1px solid --accent`, `background: --bg-3`
- Inactive: `color: --text-dimmer`, `background: transparent`
- Close X: visible only on hover/active, `16×16px`, `border-radius: 3px`

### Sidebar rows
- Height: `28–32px`
- Active: `border-left: 2px solid --accent`, `background: rgba(63,185,80,0.08)`
- Hover: `background: rgba(255,255,255,0.04)`
- Indent levels: `14px` base, `+14px` per level

### Inputs
- `background: --bg-3`
- `border: 1px solid --border`
- `border-radius: 4px` (align to VSCode)
- `padding: 5px 10px`
- `font-family: --font` (mono)
- Focus: `border-color: --blue`, `box-shadow: 0 0 0 3px rgba(56,139,253,0.12)`

---

## Terminal

xterm.js theme (GitHub Dark Default ANSI):
```js
background:  "#0d1117"
foreground:  "#e6edf3"
cursor:      "#3fb950"
black:       "#21262d"   brightBlack:   "#6e7681"
red:         "#f85149"   brightRed:     "#ff7b72"
green:       "#3fb950"   brightGreen:   "#56d364"
yellow:      "#d29922"   brightYellow:  "#e3b341"
blue:        "#388bfd"   brightBlue:    "#79c0ff"
magenta:     "#bc8cff"   brightMagenta: "#d2a8ff"
cyan:        "#39c5cf"   brightCyan:    "#56d4dd"
white:       "#b1bac4"   brightWhite:   "#ffffff"
```

---

## Tone

Grove is **purposeful and invisible**. The shell disappears so the code and agents come forward.

- No gradients in chrome
- No decorative shadows (only functional depth)
- Green accent only on active/selected states — not decoration
- Uppercase only for section headers, never body text
- Icons from Lucide (consistent stroke width 1.5)

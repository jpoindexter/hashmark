# Conductor App v0.45.0 - Complete Web Asset Analysis

## App Info
- Bundle ID: `com.conductor.app`
- Version: 0.45.0
- Framework: Tauri 2.x (Rust) + React + TypeScript + Vite
- URL Scheme: `conductor://`
- Dev Server: `http://localhost:1420/`
- Update CDN: `https://cdn.crabnebula.app/update/melty/conductor/`

## Extraction Summary
- 475 assets extracted from binary (brotli-compressed in PHF map)
- Main CSS: 200,220 bytes (`/assets/main-BEusvwrI.css`)
- Main JS: 9,382,739 bytes (`/assets/main-DwjO71wj.js`)
- 412 JS files (syntax highlighting grammars, code-split chunks)
- 59 font files (KaTeX, Geist, Geist Mono, iA Writer Mono)
- 2 SVG files (puzzle icon, tauri logo)
- Files at `/tmp/conductor-assets/extracted/`

## Typography

### Font Stack
```css
--font-sans: "SF Pro", system-ui, sans-serif;
--font-mono: "Geist Mono";
--font-heading: var(--font-sans);
--font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
```

### Bundled Fonts
- **Geist** (variable, 300-700 weight) - from `/fonts/Geist-VariableFont_wght.ttf`
- **Geist Mono** (variable, 300-700 weight) - from `/fonts/GeistMono-VariableFont_wght.ttf`
- **iA Writer Mono** (variable, 100-900 weight) - from `/fonts/iAWriterMonoV.ttf`
- **KaTeX** fonts (AMS, Caligraphic, Fraktur, Main, Math, SansSerif, Script, Size1-4, Typewriter)

### Text Sizes
```css
--text-xxs: .6rem;
--text-xs: .75rem;
--text-sm: .875rem;
--text-base: 1rem;
```

### Base Body Style
```css
body {
  cursor: default;
  user-select: none;
  font-size: .875rem;       /* 14px */
  line-height: 1.25rem;     /* 20px */
  letter-spacing: 0em;
  color: hsl(var(--foreground));
  font-feature-settings: "rlig" 1, "calt" 1;
  -webkit-font-smoothing: antialiased;
}
```

### Sidebar Label Style
```css
.sidebar-label {
  font-family: Geist Mono, monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .6px;
}
```

## Color System

### Custom Color Palette (Warm/Earthy Tones)
```javascript
const colorPalette = {
  accent: {
    25:  "58 100% 100%",   // near-white warm
    50:  "28 33% 97%",     // cream
    100: "24 33% 93%",     // light tan
    200: "25 38% 86%",     // light brown
    300: "22 39% 78%",     // medium tan
    400: "19 35% 69%",     // warm brown
    600: "9 17% 57%",      // muted brown
    700: "4 12% 46%",      // dark brown
    800: "360 13% 31%",    // deep brown
    900: "360 15% 22%",    // very dark brown
    950: "5 19% 14%",      // near-black warm
  },
  gray: {
    0:    "30 0% 100%",    // pure white (warm)
    25:   "30 10% 98%",    // off-white
    50:   "30 9% 95%",     // light gray
    100:  "30 8% 91%",     // border gray
    200:  "24 7% 81%",     // medium-light gray
    300:  "20 6% 72%",     // medium gray
    400:  "23 5% 63%",     // neutral gray
    500:  "22 4% 54%",     // muted text gray
    600:  "23 5% 44%",     // dark gray
    700:  "24 6% 35%",     // darker gray
    800:  "25 7% 26%",     // very dark gray
    900:  "25 8% 16%",     // near-black
    950:  "24 9% 12%",     // darker near-black
    1000: "24 10% 7%",     // darkest background
  },
  transparentWhite: {
    100: "0 0% 100% / 0.9",
    400: "0 0% 100% / 0.6",
    800: "0 0% 100% / 0.2",
    900: "0 0% 100% / 0.1",
    950: "0 0% 100% / 0.05",
  },
  transparentBlack: {
    50:  "4 14% 7% / 0.05",
    100: "4 14% 7% / 0.1",
    500: "4 14% 7% / 0.5",
    700: "4 14% 7% / 0.7",
    800: "4 14% 7% / 0.8",
  },
  green:   { 50:"138 76% 97%", 300:"142 77% 73%", 400:"142 69% 58%", 500:"142 71% 45%", 600:"142 76% 36%", 700:"142 72% 29%", 950:"144 48% 15%" },
  red:     { 50:"0 86% 97%", 300:"0 94% 82%", 400:"0 91% 71%", 500:"0 84% 60%", 600:"0 72% 51%", 700:"0 74% 60%", 950:"0 60% 26%" },
  blue:    { 300:"212 96% 78%", 400:"213 94% 68%", 500:"217 91% 60%", 600:"221 83% 53%" },
  yellow:  { 300:"50 100% 84%", 400:"50 100% 75%", 500:"50 100% 69%", 600:"50 100% 59%", 800:"50 100% 44%", 900:"50 100% 36%" },
  orange:  { 50:"33 100% 96%", 400:"27 96% 61%", 600:"20 90% 48%", 950:"12 68% 26%" },
  cyan:    { 300:"187 92% 73%", 400:"188 85% 59%", 500:"189 94% 43%", 600:"192 90% 36%" },
  fuchsia: { 300:"292 100% 78%", 400:"292 100% 66%", 500:"292 100% 54%", 600:"292 100% 46%" },
};
```

### Radix Color Scales (in CSS, used for admonitions)
- **slate** (1-12): Light and dark mode, used for base/neutral
- **blue** (1-12): Light and dark mode, used for accent
- **amber** (1-12): Caution/warning admonitions
- **red** (1-12): Danger/destructive states
- **grass** (1-12): Info/success states
- **cyan** (1-12): Tip admonitions

## Theme Tokens

### Light Theme (Resolved HSL Values)
```css
--background: 30 0% 100%           /* pure white */
--foreground: 25 8% 16%            /* near-black warm */
--card: 30 0% 100%
--card-foreground: 24 9% 12%
--popover: 30 0% 100%
--popover-foreground: 24 9% 12%
--popover-accent: 4 14% 7% / 0.05
--popover-ring: 24 9% 12% / 0.05
--primary: 360 15% 22%             /* deep brown */
--primary-foreground: 30 9% 95%
--secondary: 30 10% 98%
--secondary-foreground: 25 8% 16%
--muted: 30 10% 98%
--muted-foreground: 22 4% 54%
--accent: 30 10% 98%
--accent-foreground: 25 8% 16%
--destructive: 0 72% 51%
--destructive-foreground: 0 86% 97%
--success: 142 76% 36%
--success-foreground: 138 76% 97%
--border: 30 8% 91%
--border-highlight: 9 17% 57%
--input: 4 14% 7% / 0.1
--input-border: 4 14% 7% / 0.1
--ring: 25 8% 16%
--separator: 30 8% 91%
--highlight: 28 33% 97%
--highlight-foreground: 360 13% 31%
--highlight-muted: 19 35% 69%
--link: 28 33% 97%
--link-foreground: 9 17% 57%
--link-elevated: 24 33% 93%
--faint: 23 5% 63%
--special: 19 35% 69%
--unread: 9 17% 57%
--overlay: 0 0% 0%
--positive: 142 76% 36%
--positive-muted: 138 76% 97%
--positive-foreground: 138 76% 97%
--sidebar-background: 30 10% 98%
--sidebar-foreground: 4 14% 7% / 0.7
--sidebar-primary: 25 8% 16%
--sidebar-accent: 4 14% 7% / 0.05
--sidebar-accent-foreground: 4 14% 7% / 0.8
--sidebar-border: 4 14% 7% / 0.1
--sidebar-muted-foreground: 4 14% 7% / 0.5
--sidebar-ring: 23 5% 63%
--sidebar-blue: 221 83% 53%
--composer-background: 30 10% 98% / 0.5
--tip: 58 100% 100%
--tip-border: 28 33% 97%
--tip-foreground: 360 15% 22%
--tip-muted: 9 17% 57%
--switch-background: 25 8% 16%
--switch-foreground: 30 0% 100%
--warning: 28 33% 97%
--warning-foreground: 360 13% 31%
--warning-border: 25 38% 86%
--plan-border: 19 35% 69%
--git-green: 142 76% 36%
--git-red: 0 72% 51%
--git-yellow: 50 100% 59%
--git-gray: 23 5% 63%
--status-backlog: 22 4% 54%
--status-in-progress: 50 100% 44%
--status-in-review: 142 76% 36%
--status-done: 19 35% 69%
--status-canceled: 23 5% 63%
--todo-in-progress: 221 83% 53%
--todo-completed: 142 76% 36%
--todo-pending: 23 5% 44%
--prose-border: 24 7% 81%
```

### Dark Theme (Resolved HSL Values)
```css
--background: 24 10% 7%            /* very dark warm black */
--foreground: 30 8% 91%            /* light gray */
--card: 25 8% 16%
--card-foreground: 30 9% 95%
--popover: 25 8% 16%
--popover-foreground: 30 8% 91%
--popover-accent: 0 0% 100% / 0.05
--popover-ring: 0 0% 100% / 0.1
--primary: 30 9% 95%
--primary-foreground: 25 8% 16%
--secondary: 24 9% 12%
--secondary-foreground: 30 9% 95%
--muted: 24 9% 12%
--muted-foreground: 23 5% 63%
--accent: 25 8% 16%
--accent-foreground: 30 9% 95%
--destructive: 0 91% 71%
--destructive-foreground: 0 86% 97%
--success: 142 69% 58%
--success-foreground: 138 76% 97%
--border: 0 0% 100% / 0.1
--border-highlight: 19 35% 69%
--input: 0 0% 100% / 0.2
--input-border: 0 0% 100% / 0.2
--ring: 20 6% 72%
--separator: 25 8% 16%
--highlight: 5 19% 14%
--highlight-foreground: 24 33% 93%
--highlight-muted: 22 39% 78%
--link: 5 19% 14%
--link-foreground: 19 35% 69%
--link-elevated: 360 15% 22%
--faint: 23 5% 44%
--special: 19 35% 69%
--unread: 19 35% 69%
--overlay: 0 0% 0%
--positive: 142 69% 58%
--positive-muted: 144 48% 15%
--positive-foreground: 138 76% 97%
--sidebar-background: 24 9% 12%
--sidebar-foreground: 0 0% 100% / 0.9
--sidebar-primary: 30 8% 91%
--sidebar-accent: 0 0% 100% / 0.05
--sidebar-accent-foreground: 0 0% 100% / 0.9
--sidebar-border: 0 0% 100% / 0.1
--sidebar-muted-foreground: 0 0% 100% / 0.6
--sidebar-ring: 20 6% 72%
--sidebar-blue: 213 94% 68%
--composer-background: 24 9% 12%
--tip: 360 15% 22%
--tip-border: 360 13% 31%
--tip-foreground: 58 100% 100%
--tip-muted: 22 39% 78%
--switch-background: 30 8% 91%
--switch-foreground: 25 8% 16%
--warning: 360 15% 22%
--warning-foreground: 24 33% 93%
--warning-border: 360 13% 31%
--plan-border: 4 12% 46%
--git-green: 142 69% 58%
--git-red: 0 91% 71%
--git-yellow: 50 100% 75%
--git-gray: 23 5% 63%
--status-backlog: 22 4% 54%
--status-in-progress: 50 100% 59%
--status-in-review: 142 69% 58%
--status-done: 19 35% 69%
--status-canceled: 23 5% 63%
--todo-in-progress: 213 94% 68%
--todo-completed: 142 69% 58%
--todo-pending: 23 5% 63%
--prose-border: 25 7% 26%
```

## Spacing System
```css
--spacing-0: 0px
--spacing-px: 1px
--spacing-0_5: (0.125rem)
--spacing-1: .25rem       /* 4px */
--spacing-1_5: (0.375rem)
--spacing-2: .5rem        /* 8px */
--spacing-3: .75rem       /* 12px */
--spacing-4: 1rem         /* 16px */
--spacing-5: 1.25rem      /* 20px */
--spacing-6: 1.5rem       /* 24px */
--spacing-7: 1.75rem
--spacing-8: 2rem
--spacing-9: 2.25rem
--spacing-10: 2.5rem
--spacing-11: 2.75rem
--spacing-12: 3rem
--spacing-14: 3.5rem
--spacing-16: 4rem
/* ...continues to --spacing-96: 24rem */
```

## Border Radius
```css
--radius: 0.5rem          /* default from theme config */
--radius-none: 0px
--radius-small: var(--spacing-0_5)   /* 2px */
--radius-base: var(--spacing-1)      /* 4px */
--radius-medium: var(--spacing-1_5)  /* 6px */
--radius-large: var(--spacing-2)     /* 8px */
--radius-extra-large: var(--spacing-3) /* 12px */
--radius-full: 9999px
```

## Layout Structure
- Routes: `/login`, `/settings`
- Entry point: `index-BzC7T89y.js` (tiny, loads main chunk)
- Main bundle: `main-DwjO71wj.js` (9.4MB decompressed)
- Sidebar + main content layout with resizable panels
- Uses `react-resizable-panels` for layout

## Key React Components (displayName)
Alert, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, 
CodeBlockMemoized, CommandHint, Input, NotAButton, Panel, PopoverMenu, Presence, 
RadialProgress, ReactNodeView, Separator, SimpleCopyButton, TabsCloseButton, 
TabsEditButton, Textarea, Tiptap, TruncatedText, VirtuosoMessageList, Tool, ToolContent, 
ToolDescription, ToolFooter, ToolHeader, ToolTitle

## Key Custom Hooks (493 total, notable ones)
- useTheme, useWorkspace, useWorkspaces, useSession, useSessions
- useConductorNavigate, useConductorConfig, useConductorApiToken
- useGitPanelState, useGitPull, useGitPush, useFilesChanged
- useComposerAttachment, useFileContents, useFuzzyFileSearch
- useChatSearch, useSessionMessages, useRevertToTurn
- useSpeechToText, useTerminalCore, useTerminalPty
- useKeyboardShortcuts, useShortcutsRegistry
- useCodexProvider, useCodexApiKey, useCodexMessageLog
- useClaudeAuthResult, useConductorLoaderAnimation

## Tauri IPC Commands (45)
plugin:fs (read/write/mkdir/remove/watch), plugin:shell (execute/spawn/kill),
plugin:http (fetch/send), plugin:sql (load/select/execute/close),
plugin:dialog (open/save), plugin:updater (check/download/install),
plugin:opener (open_url/open_path), plugin:process (restart)

## Custom Animations
```css
@keyframes synthesisPulse    /* dots pulsing down */
@keyframes synthesisMerge    /* merge animation */
@keyframes shimmer           /* gradient text shimmer (brown/gold) */
@keyframes equalizer         /* audio equalizer bars */
@keyframes enter/exit        /* Tailwind animate-in/out */
@keyframes pulse, spin       /* standard */
```

## Shimmer Effect (Brand Signature)
```css
.shimmer {
  background-image: linear-gradient(to right, #cda174, hsl(var(--foreground)) 40%, #cda174);
  background-size: 200% auto;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 5s infinite linear;
}
```
The gold/brown shimmer color is `#cda174` - a warm copper/gold tone.

## Scrollbar Styling
```css
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: hsl(var(--foreground) / .2); border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: hsl(var(--foreground)); }
```

## Code Syntax Highlighting
Uses highlight.js with custom light/dark themes via CSS variables:
- `--code-background-light/dark`
- `--code-foreground-light/dark`
- `--code-comment-light/dark`
- `--code-keyword-light/dark`
- `--code-tag-light/dark`
- `--code-operator-light/dark`
- `--code-string-light/dark`
- `--code-number-light/dark`
- `--code-function-light/dark`
- `--code-class-light/dark`

## Database
- SQLite database: `sqlite:conductor.db`
- LocalStorage origin: `tauri://localhost`

## Sidecar Binaries
- `claude` (203MB) - Claude CLI
- `codex` (77MB) - OpenAI Codex CLI
- `gh` (53MB) - GitHub CLI
- `node` (110MB) - Node.js runtime
- `watchexec` (7MB) - File watcher
- `internal.bundled.js` (2.8MB, 69k lines) - Main sidecar process
- `index.bundled.js` (1.1MB) - Entry sidecar
- `debug-proxy.bundled.js` (1.4MB) - Debug proxy

# Design Token Audit -- AI/Coding/Productivity Apps (2026-04-03)

Extracted from 10 apps installed on this Mac. Raw CSS, theme files, and design tokens.

---

## Per-App Token Extraction

### 1. Claude Desktop (Electron, Vite)
**Source**: `/Applications/Claude.app/Contents/Resources/app.asar` -> `.vite/renderer/main_window/window-shared.css`

**Light theme**:
- Background: `#faf9f5` (warm off-white, yellow undertone)
- Foreground: `black`
- Text-100: `#29261b` (warm near-black)
- Text-200: `#3d3929` (warm dark gray)
- Text-400: `#656358` (warm medium gray)
- Secondary: `#737163` (warm muted gray)
- Border: `#706b5740` (warm gray at 25% opacity)
- Accent/Brand: `hsl(15, 63.1%, 59.6%)` = `#d97757` (clay/terracotta)

**Dark theme**:
- Background: `#262624` (warm near-black)
- Foreground: `white`
- Text-100: `#f5f4ef` (warm off-white)
- Text-200: `#e5e5e2`
- Text-400: `#b8b5a9`
- Text-500: `#a6a39b`
- Secondary: `#a6a39a`
- Border: `#eaddd81a` (warm at 10% opacity)
- Border-300: `#6c6a6040`

**Fonts**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif`
**Named colors**: clay `#d97757`, kraft `hsl(25, 49.7%, 66.5%)`, book-cloth `hsl(15, 52.3%, 58%)`, manilla `hsl(40, 54%, 82.9%)`

---

### 2. Emdash (Electron, Tailwind v3, shadcn/ui)
**Source**: `/Applications/Emdash.app/Contents/Resources/app.asar`

**Light theme** (`:root`, HSL values):
- Background: `0 0% 100%` = `#ffffff`
- Foreground: `0 0% 3.9%` = `#0a0a0a`
- Primary: `0 0% 9%` = `#171717`
- Muted: `0 0% 96.1%` = `#f5f5f5`
- Muted-foreground: `0 0% 45.1%` = `#737373`
- Border: `0 0% 89.8%` = `#e5e5e5`
- Destructive: `0 84.2% 60.2%`
- Radius: `0.5rem` (8px)

**Dark theme** (`.dark`):
- Background: `215 28% 17%` = `#1f2937` (blue-gray, NOT pure black)
- Foreground: `220 9% 96%` = `#f3f4f6`
- Primary: `220 9% 96%`
- Secondary: `217 23% 27%` = `#2d3a4e`
- Muted: `217 23% 27%`
- Muted-foreground: `220 9% 70%`
- Border: `217 17% 32%` = `#3d4a5c`
- Ring: `220 9% 70%`

**AMOLED-black theme** (`.dark-black`):
- Background: `0 0% 0%` = `#000000` (true black)
- Card: `0 0% 4%` = `#0a0a0a`
- Popover: `0 0% 8%` = `#141414`
- Secondary: `0 0% 12%` = `#1f1f1f`
- Muted: `0 0% 15%` = `#262626`
- Muted-foreground: `0 0% 65%`
- Border: `0 0% 20%` = `#333333`

**Fonts**: `-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif`
**Mono**: `Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace`

**Font sizes**: xs=0.75rem, sm=0.875rem, base=1rem, lg=1.125rem, xl=1.25rem, 2xl=1.5rem
**Custom sizes**: code=13px, tiny=11px, micro=10px

**Shadows**:
- sm: `0 1px 2px 0 rgb(0 0 0 / .05)`
- md: `0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)`
- lg: `0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)`
- xl: `0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)`

---

### 3. T3 Code (Electron, Tailwind v4, shadcn/ui)
**Source**: `/Applications/T3 Code (Alpha).app/Contents/Resources/app.asar`

**Light theme**:
- Background: `#ffffff`
- Foreground: `neutral-800` (oklch)
- Border: `color-mix(in oklab, black 8%, transparent)` = ~`#00000014`
- Input: `color-mix(in oklab, black 10%, transparent)` = ~`#0000001a`
- Primary: `oklch(48.8% .217 264)` (blue)
- Muted: `color-mix(in oklab, black 4%, transparent)`
- Muted-foreground: `color-mix(srgb, neutral-500 90%, black)` = ~`#686868`
- Radius: `0.625rem` (10px)
- Destructive: `red-500`

**Dark theme**:
- Background: `color-mix(in srgb, neutral-950 95%, white)` = ~`#161616`
- Foreground: `neutral-100` = `#f5f5f5`
- Border: `color-mix(in oklab, white 6%, transparent)` = ~`#ffffff0f`
- Input: `color-mix(in oklab, white 8%, transparent)` = ~`#ffffff14`
- Primary: `oklch(58.8% .217 264)` (blue, slightly lighter)
- Muted: `color-mix(in oklab, white 4%, transparent)` = ~`#ffffff0a`

**Fonts**:
- Sans: `ui-sans-serif, system-ui, sans-serif`
- Mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- Body override: `DM Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif`
- Code: `SF Mono, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace`

**Button shadow pattern** (dark): `0 -1px color-mix(in oklab, white 2%, transparent)` (subtle top-edge highlight)

---

### 4. Cursor (Electron/VSCode fork)
**Source**: `/Applications/Cursor.app/Contents/Resources/app/extensions/theme-cursor/themes/cursor-dark-color-theme.json`

**Dark theme**:
- Editor background: `#181818`
- Sidebar background: `#141414`
- Panel background: `#141414`
- Terminal background: `#141414`
- Tab active: `#181818`
- Tab inactive: `#141414`
- Foreground: `#E4E4E4EB` (~92% opacity)
- Sidebar foreground: `#E4E4E48D` (~55%)
- Status bar foreground: `#E4E4E45E` (~37%)
- Titlebar foreground: `#E4E4E484` (~52%)
- Input background: `#E4E4E40A` (~4%)
- Input border: `#E4E4E413` (~7%)
- Button background: `#81A1C1` (Nord-blue accent)
- Button foreground: `#191c22`
- Badge: `#88C0D0` (teal)
- Focus border: `#E4E4E426` (~15%)
- List hover: `#E4E4E411` (~7%)
- List active: `#E4E4E41E` (~12%)
- Widget shadow: `#00000066`

**Pattern**: Uses single base color (#E4E4E4) at different opacities for entire text hierarchy. Minimal, elegant.

---

### 5. Littlebird (Electron, Tailwind v3)
**Source**: `/Applications/Littlebird.app/Contents/Resources/app.asar`

**Tokens**: Uses same shadcn/ui token system as Emdash -- identical light/dark/dark-black values (they share the template).

**Fonts**:
- Sans: `BacktickFallback, Sohne` (custom fonts bundled: Sohne-Buch, Sohne-Kraftig, Sohne-Halbfett)
- Mono: `PP Neue Montreal Mono` (full weight range: Thin through Bold)
- Also: `Meraki-Regular` (display font)

**Custom theme in JS**:
- Light: foreground `#2b2233` (purple-tinted dark), background `#ffffff`
- Dark: foreground `#ebe6ef` (purple-tinted light), background `#29232f` (dark purple)

---

### 6. Ghostty Terminal Themes
**Source**: `/Applications/Ghostty.app/Contents/Resources/ghostty/themes/`

**Tokyo Night**:
- Background: `#1a1b26`, Foreground: `#c0caf5`
- Selection: `#33467c`, Cursor: `#c0caf5`

**Catppuccin Mocha**:
- Background: `#1e1e2e`, Foreground: `#cdd6f4`
- Selection: `#585b70`, Cursor: `#f5e0dc`

**Nord**:
- Background: `#2e3440`, Foreground: `#d8dee9`
- Selection: `#eceff4`, Cursor: `#eceff4`

**Dracula**:
- Background: `#282a36`, Foreground: `#f8f8f2`
- Selection: `#44475a`, Cursor: `#f8f8f2`

---

### 7. OpenCode (SolidJS + Tauri, cloned repo)
**Source**: `packages/ui/src/styles/theme.css`, `packages/ui/src/theme/themes/*.json`

**Light theme (OC-2 fallback)**:
- Background-base: `#f8f8f8`
- Background-weak: `#f3f3f3`
- Background-strong: `#fcfcfc`
- Text-strong: `#171717`
- Text-base: `#6f6f6f`
- Text-weak: `#8f8f8f`
- Text-weaker: `#c7c7c7`
- Border-base: `rgba(0, 0, 0, 0.162)` (~16%)
- Border-weak: `#e5e5e5`
- Button-primary: `#171717`
- Input-base: `#fcfcfc`
- Surface-base: `rgba(0, 0, 0, 0.031)` (~3%)

**OpenCode default dark**:
- neutral: `#0a0a0a`, ink: `#eeeeee`
- primary: `#fab283` (warm orange)
- accent: `#9d7cd8` (purple)
- text-weak: `#808080`

**Cursor theme in OpenCode** (dark):
- neutral: `#181818`, ink: `#e4e4e4`
- primary: `#88c0d0` (teal)
- accent: `#88c0d0`
- text-weak: `#e4e4e45e`

**Vercel theme** (dark):
- neutral: `#000000` (true black)
- ink: `#EDEDED`
- primary: `#0070F3` (Vercel blue)
- text-weak: `#878787`

**Fonts**:
- Sans: `Inter` (with ss03 feature)
- Mono: `IBM Plex Mono` (with ss01 feature)
- Font-size-small: 13px
- Font-size-base: 14px
- Font-size-large: 16px

**Radius**: xs=2px, sm=4px, md=6px, lg=8px, xl=10px

**Shadows** (light-dark adaptive):
- xs: `0 1px 2px -0.5px hsl(0 0% 0% / 0.04), 0 0.5px 1.5px 0 hsl(0 0% 0% / 0.025), 0 1px 3px 0 hsl(0 0% 0% / 0.05)`
- md: `0 6px 12px -2px ... 0.075, 0 4px 8px -2px ... 0.075, 0 1px 2px ... 0.1`
- lg: `0 16px 48px -6px ... 0.05, 0 6px 12px -2px ... 0.025, 0 1px 2.5px ... 0.025`

---

### 8. Warp (Native Rust/Metal)
**Source**: `/Applications/Warp.app/Contents/Resources/`
Native app, no extractable CSS. Theme files live in `~/.warp/themes/`. Built-in themes are compiled into the binary.

### 9. Conductor (Native macOS)
**Source**: `/Applications/Conductor.app/`
Pure native macOS app (ARM64 binary). No CSS, JSON, or extractable theme data. Uses native AppKit/SwiftUI theming.

### 10. LM Studio (Electron/Webpack)
**Source**: `/Applications/LM Studio.app/Contents/Resources/app/`
Webpack-bundled, no standalone CSS files (bundled into JS). No extractable theme tokens.

### 11. Paper (Electron wrapper)
**Source**: `/Applications/Paper.app/Contents/Resources/app.asar`
Thin Electron shell that loads web app from remote URL. No local CSS -- all rendering happens server-side.

### 12. Spacedrive (Tauri)
**Source**: `/Applications/Spacedrive.app/`
Only `icon.icns` in Resources. All UI is compiled into the Tauri binary. No extractable assets.

---

## Consolidated Analysis

### Dark Theme Background Colors

| App | Background | Category |
|-----|-----------|----------|
| Cursor | `#181818` / `#141414` (sidebar) | Near-black neutral |
| T3 Code | `#161616` | Near-black neutral |
| OpenCode | `#0a0a0a` (default) / `#181818` (cursor theme) | Near-black to true-black |
| Claude | `#262624` | Warm near-black |
| Emdash | `hsl(215, 28%, 17%)` = ~`#1f2937` | Blue-gray |
| Emdash (black) | `#000000` | True black |
| Littlebird | `#29232f` | Purple-tinted dark |
| Ghostty Tokyo Night | `#1a1b26` | Blue-tinted dark |
| Ghostty Catppuccin | `#1e1e2e` | Blue-tinted dark |
| Ghostty Dracula | `#282a36` | Blue-tinted dark |
| Ghostty Nord | `#2e3440` | Blue-gray |
| Vercel (OpenCode) | `#000000` | True black |

**Consensus**: The majority cluster around `#141414` to `#1e1e2e`. The "standard modern dark" background is **`#161616` to `#181818`** (neutral, near-black). Terminal themes tend slightly bluer (`#1a1b26`). Claude stands alone with warm undertones. True black (`#000000`) is offered as an AMOLED option, not default.

### Text Color Hierarchy

| Level | Typical Value | Opacity Pattern |
|-------|--------------|-----------------|
| Primary | `#e4e4e4` to `#f5f5f5` | 90-95% white |
| Secondary | `#a0a0a0` to `#b8b5a9` | 60-70% white |
| Tertiary/Muted | `#737373` to `#808080` | 40-50% white |
| Disabled/Hint | `#505050` to `#656358` | 30-37% white |

**Cursor's approach** is the cleanest: single color `#E4E4E4` at varying opacities (EB=92%, 8D=55%, 84=52%, 5E=37%, 26=15%). This is the dominant modern pattern.

### Border Colors and Styles

| App | Dark Border |
|-----|------------|
| Cursor | `#E4E4E413` (white at ~7%) |
| T3 Code | `white 6% transparent` |
| OpenCode | `rgba(255,255,255,0.06)` |
| Emdash | `hsl(217, 17%, 32%)` = ~`#3d4a5c` |
| Claude | `#eaddd81a` (warm at 10%) |

**Consensus**: **White at 6-10% opacity** for subtle borders in dark mode. Emdash uses an opaque blue-gray. Claude uses warm-tinted transparent.

### Font Families

| Role | Most Common |
|------|------------|
| Sans | System stack: `-apple-system, BlinkMacSystemFont, system-ui, sans-serif` |
| Sans (custom) | `Inter` (OpenCode), `DM Sans` (T3), `Sohne` (Littlebird) |
| Mono | `SF Mono / SFMono-Regular, Menlo, Monaco, Consolas, monospace` |
| Mono (custom) | `IBM Plex Mono` (OpenCode), `PP Neue Montreal Mono` (Littlebird) |

**Consensus**: System font stack is default. Apps that want brand identity use `Inter` or `DM Sans`. Mono is universally `SF Mono -> Menlo -> Monaco -> Consolas`.

### Font Sizes

| Level | OpenCode | Emdash | T3 Code | Consensus |
|-------|---------|--------|---------|-----------|
| Small | 13px | 12px (0.75rem) | 12px | **12-13px** |
| Base | 14px | 16px (1rem) | 16px | **14-16px** |
| Large | 16px | 18px (1.125rem) | 18px | **16-18px** |
| Code | 13px | 13px | 13px | **13px** |

**Consensus**: Base is 14px for code-heavy, 16px for chat-heavy apps. Code blocks are always **13px**. Small text is **12-13px**.

### Border Radius

| App | Value |
|-----|-------|
| Emdash / Littlebird | `0.5rem` (8px) |
| T3 Code | `0.625rem` (10px) |
| OpenCode | xs=2px, sm=4px, md=6px, lg=8px, xl=10px |
| Cursor | `2px` (Monaco widgets), `5px` (action bar), `10px` (drag image) |

**Consensus**: Base radius is **6-8px** for cards/containers, **4px** for small elements, **10-12px** for larger panels. Full-round (9999px) for pills/badges.

### Shadow Styles

**Light mode** (Tailwind-style consensus):
- sm: `0 1px 2px 0 rgb(0 0 0 / .05)`
- md: `0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)`
- lg: `0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)`

**Dark mode**: Shadows are heavier (2-3x opacity) or replaced with border-based elevation. T3 Code uses a subtle top-edge `inset 0 1px white/6%` highlight for buttons.

**OpenCode's approach** is the most refined: multi-layer shadows with `light-dark()` function, plus `box-shadow` border-simulating tokens (`0 0 0 1px border-color`).

### Button Patterns

| App | Primary Button | Height |
|-----|---------------|--------|
| Cursor | bg `#81A1C1`, fg `#191c22` | Standard VSCode |
| Emdash | Primary text on primary-bg | `h-9` (36px) based on shadcn |
| T3 Code | oklch blue | shadcn default |
| OpenCode | `#171717` (light), theme-accent (dark) | -- |
| Claude | Clay/terracotta accent | -- |

**Consensus**: Buttons use `height: 32-36px` for default, `28px` for compact. Ghost buttons (transparent bg, visible on hover) are universal. Primary buttons are brand-colored, secondary are `surface + border`.

### Accent/Brand Color Usage

| App | Accent |
|-----|--------|
| Claude | `#d97757` -- clay/terracotta (warm, unique) |
| Cursor | `#81A1C1` / `#88C0D0` -- Nord teal-blue |
| OpenCode | `#fab283` (warm orange) / `#9d7cd8` (purple) |
| Vercel | `#0070F3` -- Vercel blue |
| T3 Code | oklch blue (~`#3b82f6`) |
| Emdash | Neutral (achromatic primary) |

**Consensus**: Most use **blue** as primary interactive color. Differentiators go warm (Claude's clay, OpenCode's orange). Purple is rising as secondary accent.

---

## Key Takeaways for Hashmark

1. **Dark background**: `#161616` to `#181818` is the sweet spot. Warmer than pure black, but neutral.
2. **Text hierarchy via opacity**: Use a single light color (`#e4e4e4`) at different opacities rather than separate gray hex values. Cursor's pattern is the most elegant.
3. **Border**: White at 6-8% opacity in dark mode. Never opaque gray.
4. **Radius**: 6-8px base. 4px small. 10-12px large panels.
5. **Font**: System stack default, `Inter` or `DM Sans` if you want brand. Mono is always `SF Mono -> Menlo`.
6. **Base font size**: 14px for the app chrome, 13px for code/terminal.
7. **Shadows**: Multi-layer, very low opacity in dark mode. Consider `box-shadow: 0 0 0 1px border-color` for elevation.
8. **Button shadow trick**: T3 Code's `inset 0 1px white/6%` top-edge highlight is a nice touch for dark mode buttons.
9. **Three dark variants**: Standard (blue-gray ~17% lightness), Neutral (~9% lightness), AMOLED (true black). Offer at least two.
10. **Accent**: Green/emerald is already distinctive vs the blue sea. Keep it.

# Feature Gap Analysis -- hashmark studio vs competitors

Based on extracting design tokens and patterns from: Claude Desktop, Cursor, Emdash, T3 Code, Littlebird, OpenCode, Ghostty, Warp, Conductor, Spacedrive.

## Architecture Gaps (from Emdash + OpenCode source)

### Multi-project without server restart
- **OpenCode**: One server, `x-opencode-directory` header per request. Lazy instance caching in a Map. Zero downtime.
- **Emdash**: No HTTP API at all. Pure Electron IPC. Project context is a per-call argument.
- **Hashmark**: One server per project. Switching requires kill + restart. Token invalidation breaks everything.
- **Fix**: Add `x-hashmark-project` header pattern. Lazy-init project instances server-side.

### Auth pattern
- **OpenCode**: HTTP Basic Auth. UUID password generated at startup, passed from Rust to JS via Tauri command.
- **Emdash**: No auth (IPC is inherently trusted).
- **Cursor**: Token-based, regenerated each session.
- **Hashmark**: Bearer token from file, injected at build time. Fragile.
- **Fix**: Generate token at server startup, expose via `/api/health`. Client fetches dynamically. (DONE)

### Sidecar bundling
- **OpenCode**: CLI bundled as `externalBin` sidecar. Spawned through user's login shell for PATH inheritance.
- **Hashmark**: Node server spawned via `Command::new("node")`. PATH issues possible.
- **Fix**: Use `$SHELL -lc` wrapper for node spawn.

## Design System Gaps

### Consensus dark theme values (from 7 apps)
| Token | Consensus | Hashmark (current) |
|-------|-----------|-------------------|
| Background | #171717 | #171717 (fixed) |
| Text primary | white at 92% | 93% (close) |
| Text secondary | white at 55% | 55% (matches) |
| Border | white at 7% | 10% (still high) |
| Radius | 6-8px | 6/4/8px (matches) |
| Font size | 14px | 14px (matches) |
| Mono font | SF Mono > Menlo | JetBrains Mono (fine) |

### Claude Desktop specific tokens (warm palette)
- Brand: `#d97757` (clay/terra cotta)
- Warning: `#a87532`
- Text primary: `#e8e1d4` (warm white, not pure)
- Bg: `#1e1d1b` (warm dark, not pure grey)

### Cursor specific patterns
- Single hue at varying opacities for all surfaces
- Editor bg: `#1e1e1e`, sidebar: `#181818`
- Selection: blue at 30% opacity
- Very subtle shadows

### T3 Code specific patterns
- `DM Sans` for UI text
- 10px border radius (more rounded)
- oklch color space for precise color math
- Green accent: `oklch(0.723 0.219 149.579)`

## Feature Gaps

### Home screen / Welcome (Critical)
- **OpenCode**: Logo + server status + recent projects + "Open Project" button
- **Emdash**: Logo shimmer + tagline + 4 quick-action grid + first-launch welcome overlay
- **Hashmark**: Project name + branch + quick actions + recent sessions + suggestions (DONE, needs polish)

### Theme system (v2)
- **OpenCode**: 38 themes, seed-based palette generation, runtime switching
- **Ghostty**: 463 terminal themes
- **Hashmark**: 2 themes (dark/light)

### Session tabs (v2)
- **OpenCode**: Sortable tabs across top, drag-and-drop
- **Emdash**: Tasks in sidebar with Kanban board
- **Conductor**: Browser-style session tabs
- **Hashmark**: Sidebar list (functional, hidden by default now)

### Diff review panel (v2)
- **Emdash**: Monaco DiffEditor, side-by-side + unified, staging checkboxes, 120+ file virtualizing
- **OpenCode**: Review panel with file tabs, resize handle
- **Hashmark**: Inline EditPreview only

### Shell mode (v2)
- **OpenCode**: `!` prefix or Shift+X toggles between chat and shell mode. Spring-animated transitions.
- **Hashmark**: Separate terminal panel only

### Worktree support (v2)
- **OpenCode**: First-class git worktrees. Create, delete, reset, branch naming. Worktree selector in new session view.
- **Emdash**: Each task = isolated worktree branch
- **Hashmark**: No worktree support

### Content-visibility optimization
- **OpenCode**: `content-visibility: auto` + `contain-intrinsic-size: auto 500px` on inactive messages. NOT virtualized. Staged rendering (10 initial, 8-turn batches on scroll).
- **Hashmark**: @tanstack/react-virtual (works but more complex)

### Remote server support
- **OpenCode**: Add any HTTP server URL, SSH tunnel support
- **Hashmark**: localhost only

### Onboarding
- **Emdash**: First-launch welcome overlay tracked in localStorage
- **OpenCode**: First project prompt with directory picker
- **Cursor**: Import settings wizard
- **Hashmark**: Nothing

## Priority order for next session

1. Verify auth fix works (this session)
2. Lower border opacity from 10% to 7%
3. Onboarding flow (first-launch detection)
4. Multi-project without restart (x-hashmark-project header)
5. Theme system (seed-based palette)
6. Session tabs
7. Diff review panel
8. Shell mode
9. Worktree support

Design a desktop app called "hashmark studio" — a PM console for AI coding agents.

**Concept:** You are the PM. Agents are your engineers. hashmark lets you brief agents before they start, run multiple in parallel, and audit their output when done. It is NOT an IDE or a chat app. It is a mission dispatch board.

**Design language:**
- Near-black background: `#0e0e0f`
- Surface: `#141415`, `#1a1a1b`
- Borders: very subtle, `#2a2a2c`
- Accent: emerald green `#00d084`
- Text: `#e8e8e8` primary, `#888` secondary, `#555` dimmer
- Font: monospace throughout (like JetBrains Mono or similar)
- Radius: 6px max, prefer sharp
- No gradients, no glassmorphism, no shadows
- Flat, dense, terminal-adjacent aesthetic

**Layout structure (every screen):**
- Far left: 52px vertical rail with icon buttons (no labels). Icons for: home/missions, agents, settings
- Rail has a `#` logo at top in emerald green
- Everything else is canvas — no persistent sidebars

**Generate these 8 screens:**

**Screen 1 — Mission Board (home, empty state)**
Full canvas. Big centered empty state: `no active missions` in dim monospace. Below it one button: `+ new mission` in emerald. Rail on left. Nothing else.

**Screen 2 — Mission Board (active state)**
Canvas shows a grid of mission cards (2 columns). Two cards marked "running" with a pulsing green dot, elapsed time, model name (e.g. "Sonnet 4.6"), and two actions: `view` and `stop`. One card marked "done" in dim text with "3 files changed" and two actions: `review` and `audit`. Bottom right: `+ new mission` button.

**Screen 3 — New Mission Compose**
A modal/sheet slides up or overlays center. Fields: mission title (optional placeholder: "auto-generated from prompt"), large textarea for the prompt, model selector dropdown (Sonnet 4.6 selected), and a "briefing" toggle row showing `attach codebase context` with a green toggle. Below the toggle: a chip showing `2 security findings · auth.ts · ~1.2k tokens` in small dim text. Two buttons: `cancel` and `dispatch mission` (emerald).

**Screen 4 — Active Mission View (canvas)**
Left: thin session/mission list (160px) showing the 3 missions from Screen 2 as rows with status dots. Right: full chat conversation view. Agent messages show streaming output, tool use blocks (file edits, terminal commands) in dark blocks with monospace code. Bottom: chat input bar with `+ attach`, model badge, and a briefing chip showing `briefing active · 3 findings`. Send button is emerald.

**Screen 5 — Terminal Drawer (open)**
Same mission view as Screen 4 but a terminal drawer has slid up from the bottom taking about 40% of screen height. Terminal shows real shell output in green-on-black monospace. Drag handle at top of drawer. Close X in top right of drawer. Chat is still visible above it, slightly compressed.

**Screen 6 — Audit Report**
After a mission completes. Full canvas split: left shows the mission summary (agent's explanation of what it did, in chat format). Right panel shows: "Audit Report" header, then a list of findings:
- `3 files changed`
- `+1 security finding` (in amber/yellow with warning icon)
- `complexity: auth.ts up +12 (now 89)` (red)
- `complexity: login.ts down -8 (now 34)` (green)
- `session cost: ~2,400 tokens`
Bottom of right panel: two buttons `request revision` (outlined) and `approve changes` (emerald filled).

**Screen 7 — Pre-flight Briefing Expanded**
Same as Screen 4 mission view but the briefing chip is expanded into a panel that slides up above the input. Shows: "Attached Context" header, then a list of items:
- `security/auth.ts — SQL injection risk (line 47)`
- `complexity/auth.ts — cyclomatic: 23, cognitive: 31`
- `anti-patterns/auth.ts — raw string concatenation in query`
Each row has a small icon, file path in emerald, and description in dim text. A small `x` to remove individual items. Toggle at top: `briefing on`. Total token cost shown: `~1,847 tokens attached`.

**Screen 8 — Settings**
Simple single-column settings page. Sections: `agent defaults` (default model dropdown, auto-briefing toggle, auto-accept edits toggle), `api keys` (Claude API key input, masked), `scanner config` (checkboxes: security, complexity, anti-patterns, dependencies — all checked), `appearance` (theme: dark selected). Monospace labels, subtle section dividers. No sidebar — full canvas with 600px max-width centered content.

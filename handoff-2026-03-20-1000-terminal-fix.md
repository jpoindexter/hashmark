# Handoff -- Terminal Fix + Design
Generated: 2026-03-20 10:00
Project: hashmark studio (`/Users/jasonpoindexter/Documents/GitHub/_active/hashmark`)
Branch: `feature/studio-shell-overhaul`

## CRITICAL: Terminal doesn't work

The terminal panel shows the tab bar ("$ zsh") and toolbar but the xterm canvas area is completely empty. No shell prompt, can't type, can't click into it.

### What's been tried:
1. Fixed xterm v5/v6 mismatch (was importing from "xterm", now "@xterm/xterm")
2. Added containerReady state to wait for non-zero dimensions
3. Rebuilt node-pty for Electron
4. Tested WebSocket endpoint directly - works fine (data flows)
5. Tested node-pty directly - works fine (shell spawns)

### Root cause analysis:
The WebSocket server works. node-pty works. The client-side xterm instance likely isn't initializing because:
- The `containerReady` check might not be triggering (ResizeObserver might not fire)
- The `useEffect` dependency array might be missing `containerReady`
- OR the xterm CSS might not be loading (`@xterm/xterm/css/xterm.css`)

### How to debug:
1. Open Electron devtools Console tab
2. Check for any errors related to xterm, WebSocket, or CSS
3. Run in console: `document.querySelectorAll('.xterm-screen').length` - if 0, xterm never mounted
4. Run: `document.querySelectorAll('canvas').length` - xterm uses canvas for rendering
5. Check if the xterm CSS loaded: look for `.xterm` styles in the Elements > Styles panel

### Files involved:
- `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/client/src/components/Terminal.tsx` - main terminal component
- `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/client/src/components/TerminalTabs.tsx` - tab management, lazy loads Terminal
- `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/client/src/components/shell/TerminalPanel.tsx` - panel wrapper
- `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark/server/routes/terminal.ts` - WebSocket PTY server

## ALSO: Terminal design needs VS Code styling

User wants the terminal to look like VS Code's terminal:
- Single row tab bar: shell icon + "node" label + dropdown arrow on left, compact icons on right (+, split, trash, ..., maximize, close)
- NO big text buttons like "A- A+ CLR"
- NO chunky toolbar row
- Slim, minimal, everything in one row
- The tab and toolbar should be ONE row, not two separate rows

### VS Code terminal reference (from screenshot):
```
[>] node  +v  []  []  ...  []  X
```
- Shell icon + name + dropdown on the left
- Small icon buttons on the right (no text labels)
- Everything in a single 28-30px row
- No separate "TERMINAL / OUTPUT" tabs - those are in the panel header above

## Continuation Prompt

---
Continue hashmark studio at `/Users/jasonpoindexter/Documents/GitHub/_active/hashmark` on branch `feature/studio-shell-overhaul`.

TWO BLOCKERS:

1. TERMINAL DOESN'T WORK - xterm canvas is empty, no shell prompt. WebSocket + node-pty work fine standalone. The issue is client-side xterm initialization. Check Terminal.tsx containerReady logic, verify useEffect deps include containerReady, check if @xterm/xterm/css/xterm.css actually loads. Debug by checking `document.querySelectorAll('.xterm-screen').length` in devtools.

2. TERMINAL DESIGN IS JANKY - needs VS Code styling. Merge the "TERMINAL/OUTPUT" panel tabs and the "$ zsh" tab + toolbar into ONE slim row. Remove text labels (A-, A+, CLR) and use small icon-only buttons. Reference VS Code: `[>] node +v [] [] ... [] X` all in ~28px height.

KEY CONTEXT:
- 30+ commits this session, all pushed
- Monaco editor integrated (lazy-loaded)
- All TODOs cleared except terminal
- Audit score: 7.6/10 (up from 6.1)
- Inline styles only, no Tailwind
- @xterm/xterm v6 (NOT "xterm" v5)
---

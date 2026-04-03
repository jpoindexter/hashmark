# hashmark studio

> The AI-native IDE. VSCode layout + Conductor chat + Paperclip issue tracking + hashmark codebase intelligence.

## Vision

Set up your AI software company in minutes:

1. Run `hashmark studio` — opens as a native desktop app (Electron)
2. Scan your codebase — hashmark analyzes structure, imports, complexity, patterns
3. Generate your agent team — engineering, product, design, marketing, ops departments
4. Agents work through issues like a real team — Paperclip-style heartbeat runs, checkout locks, cost tracking
5. Chat with Claude always visible in the right panel — Conductor-style multi-turn sessions
6. Terminal always available at the bottom — real PTY, not fake

## Killer Feature

**Retroactive agent application**: scan any existing codebase, generate a full AI company around it, and have agents start working on issues immediately. The company adapts to the code, not the other way around.

## Reference Apps

| App | What we take from it |
|---|---|
| **Conductor** | Multi-turn Claude chat, git checkpointing, session management, terminal |
| **Paperclip** | Issue tracking, heartbeat runs, org hierarchy, cost tracking, agent delegation |
| **emdash** | Electron desktop app, parallel agents in git worktrees, provider-agnostic |
| **hashmark** | Codebase scanning, agent generation, AGENTS.md format |

## Architecture

```
packages/studio/
  electron/
    main.ts          Electron main process, starts Hono server, creates window
    preload.ts       IPC bridge (show-in-finder, open-external)
  server/
    index.ts         Hono server (port 3200)
    db.ts            SQLite via better-sqlite3 (.hashmark/studio.db)
    runner.ts        Task runner — spawns claude CLI, streams output
    routes/
      agents.ts      GET/PUT .claude/agents/* (list + edit)
      generate.ts    POST generate — SSE stream calling hashmark agents CLI
      scan.ts        POST scan — runs hashmark codebase scan
      sessions.ts    Multi-turn Claude chat via claude CLI (no API key needed)
      tasks.ts       Single-turn agent task runs with SSE streaming
      terminal.ts    WebSocket PTY bridge via node-pty
  client/src/
    components/
      Layout.tsx     VSCode-style shell: activity bar + workspace + chat panel + terminal
      ChatPanel.tsx  Permanent right-rail Claude chat (session list + streaming messages)
      Terminal.tsx   xterm.js connected to node-pty via WebSocket
    pages/
      Home.tsx       Dashboard stats
      Agents.tsx     Agent list + editor
      Generate.tsx   4-step generation wizard
      Sessions.tsx   Full session management
      Settings.tsx   Project settings
```

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ # hashmark  [project path]                    [─][□][×]     │ ← titlebar (draggable)
├────┬──────────────────────────────────────┬────┬────────────┤
│    │                                      │    │            │
│ ⌂  │  MAIN WORKSPACE                      │ ◀  │ CLAUDE     │
│ ◈  │  (agents / issues / generate / home) │    │ CHAT       │
│ ▣  │                                      │    │ PANEL      │
│ ⟳  │                                      │    │            │
│    │                                      │    │ session ≡  │
│ ⚙  ├──────────────────────────────────────┤    │ messages   │
│    │ TERMINAL (xterm.js + node-pty)        │    │            │
│ ⌨  │ $                                    │    │ [input ↵]  │
│ ◈  └──────────────────────────────────────┘    │            │
└────┴──────────────────────────────────────┴────┴────────────┘
     activity bar  main content              drag  chat panel
```

- Activity bar: icon-only nav + terminal toggle + chat toggle
- Main workspace: routes render here, draggable bottom terminal
- Chat panel: always-visible Claude, resizable with drag handle
- Titlebar: macOS native (hiddenInset style, traffic lights preserved)

## Key Technical Decisions

### No API key needed
Everything runs through the local `claude` CLI (reuses Claude Code OAuth auth). Same as Conductor and Paperclip. The binary is found at:
1. `node_modules/.bin/claude`
2. `/Applications/Conductor.app/Contents/Resources/bin/claude`
3. `/usr/local/bin/claude`
4. `claude` (PATH fallback)

**Critical**: spawn with `stdio: ['ignore', 'pipe', 'pipe']` — otherwise inherited terminal stdin blocks the process.

### Multi-turn chat via history injection
`claude --print` is single-turn. We implement multi-turn by prepending full conversation history:
```
Prior conversation:
Human: [msg1]
Assistant: [response1]
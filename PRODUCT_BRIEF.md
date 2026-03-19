# hashmark studio — Product Brief

**One-line:** The AI-native IDE that turns any codebase into a running AI software company in minutes.

---

## The Problem

Every team trying to use AI agents hits the same wall: setup is painful, context is lost between sessions, agents don't know your codebase, and there's no coherent way to track what the AI is actually doing. Conductor is great chat but no task tracking. Paperclip has great task tracking but no deep codebase intelligence. Cursor/emdash are great for individual coding but not for running an autonomous agent team.

Nobody has combined: **codebase understanding + agent generation + persistent chat + task tracking + terminal** in one app.

---

## The Solution

**hashmark studio** is a desktop app (Electron) that opens your codebase, scans it, generates a full AI agent company tailored to your stack, and then lets you orchestrate those agents like a team.

### The Killer Workflow

```
1. Open any repo in hashmark studio
2. Click "Scan" — analyzes your codebase (files, imports, complexity, patterns, stack)
3. Click "Generate Company" — AI generates 15-25 agents across departments:
   Engineering Lead, Frontend Dev, Backend Dev, QA Engineer,
   Product Manager, Designer, Marketing, Sales, Operations...
   All agents know your specific codebase.
4. Create an issue — "Refactor the auth module" / "Write tests for billing"
5. Assign to an agent — they pick it up, check it out (atomic lock), do the work
6. Chat with Claude in the right panel — full multi-turn context, always visible
7. Open terminal — real shell in your project dir, always one click away
```

---

## What Makes It Different

### vs Cursor / emdash
They're coding assistants for individual developers. hashmark studio runs an autonomous agent team that works on your backlog while you do other things.

### vs Conductor
Conductor is excellent for chat. No issue tracking, no agent team, no codebase scanning, no generation. It's a conversation UI, not an orchestration platform.

### vs Paperclip
Paperclip needs a Postgres server, Docker, and a lot of setup. No built-in codebase intelligence. hashmark studio works instantly with any local repo — SQLite, no infrastructure.

### vs hiring AI agents manually
No API key configuration. No model selection per task. No prompt engineering per role. hashmark scans your code and generates agents that already know your conventions, stack, and architecture.

---

## Core Features

### Codebase Intelligence
- Full AST scan: file tree, imports, exports, complexity metrics (cyclomatic, cognitive, Halstead)
- Detects: framework, stack, patterns, test coverage, security issues, latent hooks
- Output used to generate hyper-relevant agent instructions

### Agent Company Generation
- Select company type: SaaS, AI Product, Agency, Design Studio, etc.
- AI generates agents with role-specific instructions grounded in YOUR codebase
- Saves to `.claude/agents/` — immediately usable by Claude Code
- 15-25 agents across 5-7 departments

### Persistent Claude Chat (Conductor parity)
- Multi-turn sessions with full context
- No API key — reuses Claude Code's existing auth
- Sessions persisted in SQLite — survive restarts
- Always visible in right panel — not a separate screen
- Streaming responses with STOP button

### Issue Tracking (Paperclip parity)
- Linear-style issues with identifiers (PROJ-17)
- Statuses: backlog → todo → in progress → in review → done
- Atomic checkout — one agent per issue, no double work
- Full run history per issue
- Comments, work products, approvals

### Real Terminal
- xterm.js + node-pty — actual PTY, not simulated
- Opens in your project directory
- Always one click from the bottom bar
- Draggable to any height

### VSCode-Style Layout
- Activity bar (icons only, compact)
- Main workspace (agents, issues, generate, home)
- Right panel: Claude chat, always visible, resizable
- Bottom panel: terminal, draggable
- macOS native titlebar (hiddenInset, traffic lights preserved)

---

## Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Desktop | Electron | Native app, dock icon, menus, OS integrations |
| UI | React + Vite | Fast, component-based, xterm.js support |
| Server | Hono (Node.js) | Lightweight, runs inside Electron main process |
| DB | SQLite (better-sqlite3) | Zero infrastructure, instant setup |
| Terminal | xterm.js + node-pty | Real PTY, same as VSCode |
| Agent execution | claude CLI | Reuses Claude Code auth, no API key needed |
| Codebase scanning | hashmark CLI | Our own AST scanner |

---

## Roadmap

### Phase 1 — Core Shell (Done)
- [x] Hono server + SQLite
- [x] Multi-turn chat via claude CLI (no API key)
- [x] Task runner (single-turn agent execution)
- [x] Agent listing + editing
- [x] Agent generation wizard
- [x] VSCode-style layout
- [x] Permanent chat panel
- [x] Terminal (xterm.js)
- [x] Electron wrapper

### Phase 2 — Issues + Runs
- [ ] Issues page (Paperclip-style, HAS-N identifiers)
- [ ] Atomic checkout for agents
- [ ] Run history + live output streaming per issue
- [ ] Agent assignment + delegation

### Phase 3 — Intelligence
- [ ] Costs dashboard (token usage + cost per session/agent)
- [ ] Git worktrees (isolated workspace per task, like emdash)
- [ ] Git checkpointing (save state per chat turn, like Conductor)
- [ ] Scan → generate in one flow from UI
- [ ] Session compaction

### Phase 4 — Polish
- [ ] Org chart visualization
- [ ] Agent config editor
- [ ] Multi-repo support
- [ ] Export/import agent teams
- [ ] electron-builder DMG for distribution

---

## How to Run

```bash
# Install
cd packages/studio && npm install

# Build
npm run build

# Run as web app (browser)
node dist/bin.js

# Run as Electron desktop app
npm run electron
```

The app auto-detects the claude CLI, loads env files from the project dir, and opens at localhost:3200 (or as a native window in Electron mode).

---

## Key Files

```
packages/studio/
  STUDIO.md              Technical architecture
  PRODUCT_BRIEF.md       This file
  electron/main.ts       Electron entry point
  server/db.ts           SQLite schema
  server/routes/
    sessions.ts          Multi-turn chat (the Conductor feature)
    tasks.ts             Agent task execution
    agents.ts            Agent CRUD
    generate.ts          Agent generation stream
    terminal.ts          PTY WebSocket bridge
  client/src/components/
    Layout.tsx            Main app shell (VSCode layout)
    ChatPanel.tsx         Permanent Claude chat
    Terminal.tsx          xterm.js terminal
```

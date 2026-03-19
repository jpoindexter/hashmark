# hashmark studio — Spec

A visual agent orchestration app. Mix of Conductor (task execution, real-time monitoring) and Paperclip (company structure, issue tracking, agent management).

**Start with:** `npx hashmark studio` → opens localhost:3200 in browser
**Ship as:** Tauri desktop app once the web version is stable

---

## The Product

One command spins up a local server + opens a browser UI. You see your project, your agent company, can spin up tasks, watch agents run in real-time, and manage everything visually — without ever touching a config file.

---

## Screens

### 1. Home — Project Dashboard
- Detected project name, framework, stack summary
- Agent company overview (how many agents, by department)
- Recent task history
- Quick actions: "Generate agents", "New task", "Re-scan"

### 2. Agents — The Company
Paperclip-style company view:
- Agents grouped by department (engineering, product, marketing, etc.)
- Each agent card shows: name, role, description, last active
- Click agent → see their full .md file, edit it
- "Generate with AI" button per agent to regenerate from current scan
- Status badges: active / idle / running

### 3. Tasks — Conductor-style
- Create a task: describe what you want done → pick which agent → run it
- Task queue: pending / running / done / failed
- Real-time output: stream Claude Code's stdout/stderr into the UI
- Parallel execution: run multiple agents simultaneously
- Kill a running task
- Copy task output

### 4. Generate — Wizard
Visual version of `hashmark agents`:
- Step 1: Scan (progress bar, live file count)
- Step 2: Pick company type (card grid: SaaS, Agency, Design Studio, etc.)
- Step 3: AI provider (auto-detected, or pick from list)
- Step 4: Watch agents generate in real-time (one card per agent, streams in as it's written)
- Step 5: Review and save

### 5. Settings
- Project path
- AI provider + key (or hashmark cloud if logged in)
- Default company type
- Excluded paths (respects .hashmarkignore)

---

## Architecture

```
packages/studio/
├── server/
│   ├── index.ts          ← Express server, port 3200
│   ├── routes/
│   │   ├── scan.ts       ← POST /api/scan
│   │   ├── agents.ts     ← GET/POST /api/agents
│   │   ├── tasks.ts      ← GET/POST/DELETE /api/tasks
│   │   └── generate.ts   ← POST /api/generate (SSE stream)
│   └── runner.ts         ← Spawns Claude Code processes, streams output
├── client/
│   ├── app/              ← Next.js App Router
│   │   ├── page.tsx      ← Home dashboard
│   │   ├── agents/
│   │   ├── tasks/
│   │   ├── generate/
│   │   └── settings/
│   └── components/
│       ├── AgentCard.tsx
│       ├── TaskStream.tsx ← Real-time output viewer
│       ├── GenerateWizard.tsx
│       └── ...
└── bin.ts                ← `hashmark studio` entrypoint
```

### Server
- Express (or Hono) on port 3200
- SSE for streaming (scan progress, agent generation, task output)
- Spawns `claude` CLI processes via `child_process.spawn`
- State: in-memory for tasks, disk for agents (reads .claude/agents/)

### Client
- Next.js static export, served from the local server
- shadcn/ui with terminal aesthetic (dark, monospace, emerald accent)
- Real-time via SSE (no WebSocket needed for MVP)
- SWR for data fetching

### Runner (the Conductor part)
The key piece. Spawns Claude Code processes and streams their output:
```ts
spawn('claude', ['--print', task.prompt], {
  cwd: projectDir,
  env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: '1' }
})
```
Streams stdout/stderr to SSE → client renders in real-time.

---

## Task Execution Flow

1. User creates task: "Refactor the auth module"
2. Studio picks agent (security-engineer) or user selects manually
3. Runner spawns: `claude --print "You are the Security Engineer at hashmark. Refactor the auth module..."` in project dir
4. stdout/stderr streamed via SSE to the TaskStream component
5. Task marked complete when process exits 0, failed otherwise
6. Output saved to task history

---

## Agent Generation Flow (SSE)

1. POST /api/generate { companyType, provider, projectDir }
2. Server runs hashmark scan
3. For each agent role, calls AI API
4. Streams each completed agent file via SSE:
   ```json
   { "event": "agent", "role": "frontend-developer", "dept": "engineering", "content": "---\nname:..." }
   ```
5. Client renders each card as it arrives — live generation effect
6. POST /api/generate/save → writes all files to .claude/agents/

---

## What Makes It Different from Conductor + Paperclip

| Feature | Conductor | Paperclip | hashmark studio |
|---------|-----------|-----------|-----------------|
| Codebase-aware agents | ✗ | ✗ | ✓ (from scan) |
| AI-generated agent files | ✗ | ✗ | ✓ (Claude writes them) |
| Company type presets | ✗ | ✓ | ✓ (SaaS, Agency, etc.) |
| Task execution | ✓ | ✓ | ✓ |
| Real-time output | ✓ | partial | ✓ |
| Local web server | ✗ | ✓ | ✓ |
| Desktop app | ✓ | ✗ | later (Tauri) |
| Works with any AI | ✗ | ✗ | ✓ (Claude, GPT, Gemini, etc.) |

---

## Build Order

1. `packages/studio/bin.ts` — starts server, opens browser
2. Express server + SSE infrastructure
3. Scan API route
4. Agents API route (read .claude/agents/ directory)
5. Generate API route with SSE streaming
6. Runner (spawn Claude Code, stream output)
7. Tasks API + state management
8. Frontend: layout + Home
9. Frontend: Agents screen
10. Frontend: Generate wizard
11. Frontend: Tasks screen with live output
12. Frontend: Settings

---

## MVP Cut

For the first working version:

- ✓ `npx hashmark studio` starts server + opens browser
- ✓ Home shows project info + agent list
- ✓ Generate wizard (visual, with real-time AI generation)
- ✓ Agent viewer (browse .claude/agents/ files)
- ✗ Task execution (Phase 2 — the Conductor part)
- ✗ Tauri packaging (Phase 3)

Phase 1 = the Paperclip half
Phase 2 = add the Conductor half (task execution)
Phase 3 = wrap in Tauri for native desktop

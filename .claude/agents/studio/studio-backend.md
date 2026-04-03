---
name: studio-backend
description: Agent for working on hashmark studio's Hono server, SQLite persistence, API routes, WebSocket terminal, and CLI subprocess integration. Use this for any task that involves server-side code in packages/studio/server/.
type: project
---

# hashmark studio — Backend Agent

You are working on the server-side code for **hashmark studio**, an Electron app that wraps a local Hono HTTP server. The server runs on **port 3200**, serves the React SPA as static files, and exposes a JSON API + one WebSocket endpoint.

---

## Stack

| Layer | Tech | Version |
|---|---|---|
| HTTP framework | Hono | 4.x |
| HTTP server | @hono/node-server | 1.x |
| Database | better-sqlite3 | 9.x |
| Terminal PTY | node-pty | 1.x |
| WebSocket | ws | 8.x |
| Runtime | Node.js 20+ | ESM |
| Build tool | tsup | 8.x |
| Language | TypeScript 5 | strict |

**No Express. No Fastify. Hono only.**

---

## File Structure

```
packages/studio/
├── server/
│   ├── index.ts          createServer() -- app entry, mounts all routes
│   ├── db.ts             SQLite singleton via better-sqlite3 + migrate()
│   └── routes/
│       ├── agents.ts     GET/PUT .claude/agents/*.md files
│       ├── files.ts      GET /tree, /read, /git (file browser + git status)
│       ├── generate.ts   POST generate context files via hashmark CLI
│       ├── scan.ts       POST/GET run hashmark scan, stream results
│       ├── sessions.ts   Full chat sessions: CRUD + SSE streaming via claude CLI
│       ├── tasks.ts      CRUD for manual task tracking (issues table)
│       └── terminal.ts   WebSocket PTY terminal via node-pty
├── electron/
│   ├── main.ts           Electron main process, loads server, opens BrowserWindow
│   └── preload.ts        Minimal preload (CJS), exposes ipcRenderer
└── package.json          "type": "module", tsup builds server + electron separately
```

---

## How createServer() Works

`server/index.ts` exports `createServer(opts: ServerOptions)`:

```typescript
interface ServerOptions {
  projectDir: string;   // absolute path to the user's project being analyzed
  staticDir: string;    // absolute path to dist/public (compiled React app)
  port: number;         // 3200 by default
}
```

It:
1. Creates a `new Hono()` app with `cors({ origin: "*" })`
2. Registers one inline route: `GET /api/info` (project name + dir)
3. Mounts route modules: `app.route("/api/scan", scanRoutes(projectDir))`
4. Serves static files via `serveStatic({ root: staticDir })`
5. SPA fallback: catches `*` and serves `index.html`
6. Calls `serve({ fetch: app.fetch, port, hostname: "localhost" })`
7. Calls `attachTerminalWS(server, projectDir)` to add WebSocket

**Every route factory takes `projectDir: string` as its only argument.**

---

## Database -- db.ts

### Getting the DB

```typescript
import { getDb } from "../db.js";

// Inside any route handler:
const dataDir = `${projectDir}/.hashmark`;
const db = getDb(dataDir);
```

`getDb` is a singleton -- it creates `$projectDir/.hashmark/studio.db` on first call, runs migrations, then returns the same instance every call. WAL mode + foreign keys enabled.

### Schema

```sql
-- Chat sessions
sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Session',
  agent_id TEXT,          -- optional: which agent this session uses
  agent_name TEXT,        -- agent display name for system prompt
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  status TEXT NOT NULL DEFAULT 'idle',  -- 'idle' | 'streaming'
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,  -- Unix ms
  updated_at INTEGER NOT NULL
)

-- Messages within sessions
session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at INTEGER NOT NULL
)

-- Issue/task tracker
issues (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL UNIQUE,   -- e.g. "HASH-1", "HASH-2"
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'in_progress' | 'done' | 'cancelled'
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'low' | 'medium' | 'high' | 'urgent'
  agent_id TEXT,
  agent_name TEXT,
  assignee TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)

-- Agent run history
runs (
  id TEXT PRIMARY KEY,
  issue_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'done' | 'failed'
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
)
```

### Adding a Migration

Migrations run inside `migrate(db)` in `db.ts`. They use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` -- idempotent, no version tracking. To add a new column to an existing table:

```typescript
// In migrate(), AFTER the existing CREATE TABLE blocks:
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN worktree_path TEXT`);
} catch {
  // Column already exists -- ignore
}
```

**Never drop tables or remove columns in migrations.** Only additive changes.

---

## Route Patterns

### Standard JSON Route

```typescript
// routes/example.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getDb } from "../db.js";

export function exampleRoutes(projectDir: string) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono();

  app.get("/", (c) => {
    const db = getDb(dataDir);
    const rows = db.prepare("SELECT * FROM issues ORDER BY created_at DESC").all();
    return c.json({ items: rows });
  });

  app.post("/", async (c) => {
    const body = await c.req.json<{ title: string; description?: string }>();
    if (!body.title) return c.json({ error: "title required" }, 400);

    const db = getDb(dataDir);
    const id = randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO issues (id, identifier, title, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, `HASH-${id.slice(0, 4)}`, body.title, body.description ?? null, now, now);

    const item = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
    return c.json({ item }, 201);
  });

  return app;
}
```

Register in `server/index.ts`:
```typescript
import { exampleRoutes } from "./routes/example.js";
// ...
app.route("/api/example", exampleRoutes(opts.projectDir));
```

### SSE Streaming Route (like sessions chat)

```typescript
app.post("/:id/stream", async (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Do async work, call send() for each event
      send({ type: "progress", message: "Starting..." });
      // ...
      send({ type: "done", success: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
```

**SSE event format**: always `data: {...JSON...}\n\n`. The client reads with `EventSource` or `fetch` + `response.body.getReader()`. Event types used in sessions: `text`, `progress`, `error`, `done`.

### File System Reads

Use Node.js `fs` module directly. Always validate paths are within `projectDir`:

```typescript
import { join } from "path";
const fullPath = join(projectDir, relPath);
if (!fullPath.startsWith(projectDir)) return c.json({ error: "forbidden" }, 403);
```

### Git Commands

Use `execFile` (not `exec`) to prevent shell injection:

```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execAsync = promisify(execFile);

const { stdout } = await execAsync("git", ["status", "--porcelain"], { cwd: projectDir });
```

Current git routes (in `files.ts`):
- `GET /api/files/git` -- returns `{ branch, files: [{status, file}], commits: [{hash, message}] }`
- `GET /api/files/tree` -- returns file tree with depth limit 4
- `GET /api/files/read?path=...` -- returns file content

---

## Sessions -- Chat with Claude CLI

**Critical architecture**: The studio uses `claude --print <prompt>` as a subprocess. It does NOT use the Anthropic API directly. This means:
- No API key needed -- reuses Claude Code's authentication
- Conversation history is rebuilt into a single text prompt each call (no native multi-turn)
- `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1"` is set so the subprocess doesn't prompt for confirmations

### Finding the Claude Binary

```typescript
function findClaudeBin(projectDir: string): string {
  const candidates = [
    join(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude",  // fallback: PATH
  ];
  return candidates.find((p) => {
    try { return existsSync(p); } catch { return false; }
  }) ?? "claude";
}
```

### Spawning Claude

```typescript
import { spawn } from "child_process";

const proc = spawn(
  claudeBin,
  ["--print", fullPrompt],
  {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1",
    },
  }
);
```

- stdout: Claude's response text, streamed as it arrives
- stderr: Claude CLI status messages (box-drawing lines) -- filtered before sending to client
- exit code 0 = success, null/130/143 = killed/interrupted (still valid)

### Interrupting

Active processes are tracked in `Map<sessionId, { kill: () => void }>`. The `POST /api/sessions/:id/interrupt` endpoint calls `proc.kill("SIGTERM")`.

---

## WebSocket Terminal -- terminal.ts

Uses raw `ws.WebSocketServer` (not `@hono/node-server/ws` -- that module isn't properly exported). Attached after HTTP server starts:

```typescript
attachTerminalWS(server as Parameters<typeof attachTerminalWS>[0], opts.projectDir);
```

The WS endpoint is at `ws://localhost:3200/api/terminal/ws`.

**Message protocol** (client to server):
```typescript
// Resize terminal
{ type: "resize", cols: 80, rows: 24 }

// Send keystrokes
{ type: "input", data: "\x03" }  // Ctrl-C

// Plain string fallback (also written directly to PTY)
"ls -la\r"
```

**Server to client**: Raw PTY output as strings (not JSON) -- xterm.js handles it directly.

Each WebSocket connection spawns its own PTY process (`node-pty`), killed on disconnect.

---

## Agents Routes -- agents.ts

Reads `.claude/agents/` recursively, parses YAML frontmatter:

```typescript
interface AgentFile {
  id: string;          // path-based: "studio/studio-frontend"
  name: string;        // from frontmatter: name: ...
  description: string; // from frontmatter: description: ...
  department: string;  // inferred from parent dir name
  path: string;        // relative to .claude/agents/: "studio/studio-frontend.md"
  content: string;     // full file content
}
```

Routes:
- `GET /api/agents` -- list all agents
- `GET /api/agents/:id` -- single agent by id
- `PUT /api/agents/:id` -- write updated content to file

---

## Build System

`packages/studio/package.json` uses tsup for three separate outputs:

```json
{
  "scripts": {
    "build:server": "tsup server/index.ts --format esm --out-dir dist/server",
    "build:electron": "tsup electron/main.ts --format cjs --out-dir dist/electron",
    "build:preload": "tsup electron/preload.ts --format cjs --out-dir dist/electron",
    "build:client": "vite build"
  }
}
```

**Important**: The preload script MUST be built as CJS (`--format cjs`). Electron sandboxed preloads don't support ESM. The server is ESM. The client is Vite (also ESM).

All server imports use `.js` extension (even for `.ts` files) because Node.js ESM requires explicit extensions.

---

## Error Handling Conventions

```typescript
// 400 for bad input
if (!body.title) return c.json({ error: "title required" }, 400);

// 404 for not found
if (!item) return c.json({ error: "Not found" }, 404);

// 403 for path traversal
if (!fullPath.startsWith(projectDir)) return c.json({ error: "forbidden" }, 403);

// 201 for creation
return c.json({ item }, 201);

// 200 for success (implicit)
return c.json({ ok: true });
```

Always return `{ error: string }` for error responses. Never throw inside route handlers -- catch and return JSON.

---

## Adding a New Route File

1. Create `server/routes/myroute.ts`
2. Export `myRoutes(projectDir: string)` returning a `Hono` instance
3. In `server/index.ts`, import and mount:
   ```typescript
   import { myRoutes } from "./routes/myroute.js";
   // ...
   app.route("/api/myroute", myRoutes(opts.projectDir));
   ```

No registration anywhere else needed. The Hono router handles sub-app mounting.

---

## Rules

1. **Hono only** -- no Express, Fastify, or http module directly for routes
2. **better-sqlite3 is synchronous** -- no async/await in DB calls
3. **All server imports use `.js` extension** even for `.ts` source files (ESM requires it)
4. **Never read files outside projectDir** -- always check `fullPath.startsWith(projectDir)`
5. **SSE format is strict**: `data: {...}\n\n` -- two newlines, no exceptions
6. **`execFile` not `exec`** for shell commands -- prevents injection
7. **DB singleton** -- always use `getDb(dataDir)`, never `new Database()` directly
8. **Migrations are additive only** -- no DROP, no column removal
9. **WebSocket server uses raw `ws`** -- not `@hono/node-server/ws`
10. **Keep route files under 200 lines** -- split into multiple files if growing beyond that

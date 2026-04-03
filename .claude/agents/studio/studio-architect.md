---
name: studio-architect
description: Architect agent for the three Opus-level hashmark studio tasks: checkpoint system (task #11), MCP tools injection (task #10), and multi-agent software company mode (task #22). Use this agent when assigned those tasks -- it has the deep architectural context needed for each. Requires Opus 4.6.
type: project
---

# hashmark studio -- Architect Agent

**This agent handles three complex architectural tasks. Each section below is a complete spec.**

You are working on **hashmark studio**, an Electron + Hono + React app. Before reading any individual task spec, internalize this shared context:

**Project dir**: `packages/studio/` in the hashmark monorepo
**Server**: Hono on port 3200 (`server/index.ts`)
**DB**: better-sqlite3, singleton via `getDb(dataDir)` in `server/db.ts`
**Client**: React 19 + Vite, inline styles only (NO Tailwind), JetBrains Mono font
**Claude CLI**: The app spawns `claude --print <prompt>` as a subprocess -- no direct API
**Agent files**: `.claude/agents/` directory in the user's project

Read `studio-backend.md` and `studio-frontend.md` before starting any task.

---

## Task #10: MCP Tools Injection into Claude Sessions

**Status**: blocked by task #9 (run scripts per workspace)
**Goal**: Inject three MCP tools into every Claude chat session in studio, giving Claude awareness of the workspace state: current diff, file contents, and terminal output.

### What Conductor Does (reference implementation)

Conductor injects three MCP tools into every Claude session via a local MCP server it spawns:
- `GetWorkspaceDiff` -- returns `git diff HEAD` for the current worktree
- `DiffComment` -- lets Claude add inline comments to diff hunks (future, skip for now)
- `GetTerminalOutput` -- returns the last N lines of terminal buffer output

These tools appear in Claude's context so it can read the actual code state without the user having to paste it.

### Implementation Plan

#### Step 1: Create a local MCP server

Create `server/mcp/server.ts` -- a stdio-based MCP server using `@modelcontextprotocol/sdk`:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { join } from "path";

const execAsync = promisify(execFile);
const projectDir = process.env.HASHMARK_PROJECT_DIR ?? process.cwd();

const server = new Server(
  { name: "hashmark-studio", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "GetWorkspaceDiff",
      description: "Returns the current git diff (staged and unstaged changes) in the workspace",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "GetFileContent",
      description: "Returns the content of a file in the workspace",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative file path" } },
        required: ["path"],
      },
    },
    {
      name: "GetTerminalOutput",
      description: "Returns recent terminal output from the studio terminal",
      inputSchema: {
        type: "object",
        properties: { lines: { type: "number", description: "Number of lines to return (default 50)" } },
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};

  if (name === "GetWorkspaceDiff") {
    try {
      const { stdout } = await execAsync("git", ["diff", "HEAD"], { cwd: projectDir });
      return { content: [{ type: "text", text: stdout || "No changes" }] };
    } catch {
      return { content: [{ type: "text", text: "Not a git repo or git not available" }] };
    }
  }

  if (name === "GetFileContent") {
    const relPath = String(args.path ?? "");
    const fullPath = join(projectDir, relPath);
    if (!fullPath.startsWith(projectDir)) {
      return { content: [{ type: "text", text: "Error: path outside workspace" }], isError: true };
    }
    try {
      const content = await readFile(fullPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return { content: [{ type: "text", text: `Error: file not found: ${relPath}` }], isError: true };
    }
  }

  if (name === "GetTerminalOutput") {
    // Terminal output is stored in a shared buffer file
    const bufferPath = join(projectDir, ".hashmark", "terminal-buffer.txt");
    try {
      const content = await readFile(bufferPath, "utf-8");
      const lines = content.split("\n");
      const count = Number(args.lines ?? 50);
      return { content: [{ type: "text", text: lines.slice(-count).join("\n") }] };
    } catch {
      return { content: [{ type: "text", text: "No terminal output available" }] };
    }
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Step 2: Update sessions.ts to spawn the MCP server

When spawning `claude --print`, add `--mcp-server` flag pointing to the MCP server binary:

```typescript
// In sessions.ts, update the spawn call:
const mcpServerPath = join(dirname(fileURLToPath(import.meta.url)), "mcp-server.js");

const proc = spawn(
  claudeBin,
  [
    "--print",
    "--mcp-server", `node ${mcpServerPath}`,
    fullPrompt,
  ],
  {
    cwd: projectDir,
    env: {
      ...process.env,
      CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1",
      HASHMARK_PROJECT_DIR: projectDir,
    },
  }
);
```

Check the Claude CLI docs/help for the exact flag: `claude --help | grep mcp`. It may be `--mcp-server` or a config-based approach.

#### Step 3: Terminal buffer persistence

To make `GetTerminalOutput` work, the terminal WebSocket handler needs to write PTY output to `.hashmark/terminal-buffer.txt`. In `terminal.ts`:

```typescript
import { appendFileSync } from "fs";
import { join } from "path";

// In wss.on("connection"):
const bufferPath = join(projectDir, ".hashmark", "terminal-buffer.txt");

ptyProcess.onData((data) => {
  try { ws.send(data); } catch {}
  // Keep last 10KB of output
  try {
    const stripped = data.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI
    appendFileSync(bufferPath, stripped);
  } catch {}
});
```

Optionally add a rotation: if file > 50KB, truncate to last 10KB.

#### Step 4: Build the MCP server as a separate tsup entry

In `package.json`, add:
```json
"build:mcp": "tsup server/mcp/server.ts --format esm --out-dir dist/server/mcp"
```

#### Dependencies

```bash
cd packages/studio
npm install @modelcontextprotocol/sdk
```

---

## Task #11: Checkpoint System (Undo Agent Turns)

**Status**: independent
**Goal**: Let users save named snapshots of their codebase at any point and restore them. This is the "undo" mechanism for when an agent makes bad changes. Based on Conductor's implementation.

### How Conductor Does It (reverse engineered from checkpointer.sh)

Conductor uses **git plumbing** to save checkpoints without creating commits or moving HEAD:

```bash
# Save checkpoint:
TREE=$(git write-tree)           # write working tree as a tree object (includes uncommitted)
COMMIT=$(git commit-tree $TREE -p HEAD -m "checkpoint: $NAME")  # create orphan commit
git update-ref refs/conductor-checkpoints/$NAME $COMMIT  # store ref, no HEAD movement

# Restore checkpoint:
COMMIT=$(git rev-parse refs/conductor-checkpoints/$NAME)
git reset --hard $COMMIT         # restore files
git clean -fd                    # remove untracked files
```

Key insight: `git write-tree` captures the **entire working tree** including uncommitted changes. The ref lives under `refs/conductor-checkpoints/` so it never appears in `git log` or `git branch`.

### Implementation

#### Database schema (add to migrate() in db.ts)

```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  git_ref TEXT NOT NULL,        -- "refs/studio-checkpoints/{id}"
  git_tree TEXT NOT NULL,       -- SHA of the tree object
  git_commit TEXT NOT NULL,     -- SHA of the commit object
  branch TEXT NOT NULL,         -- branch at save time
  file_count INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,              -- which session triggered this, if any
  created_at INTEGER NOT NULL
);
```

#### Create `server/checkpoints.ts`

```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { getDb } from "./db.js";

const execAsync = promisify(execFile);

interface CheckpointResult {
  ok: boolean;
  checkpointId?: string;
  error?: string;
}

export async function saveCheckpoint(
  projectDir: string,
  dataDir: string,
  name: string,
  description?: string,
  sessionId?: string
): Promise<CheckpointResult> {
  try {
    // 1. Get current branch
    const { stdout: branchOut } = await execAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectDir });
    const branch = branchOut.trim();

    // 2. Stage everything (write-tree needs index to be up to date)
    await execAsync("git", ["add", "-A"], { cwd: projectDir });

    // 3. Write working tree to a tree object
    const { stdout: treeOut } = await execAsync("git", ["write-tree"], { cwd: projectDir });
    const tree = treeOut.trim();

    // 4. Create a commit object (doesn't move HEAD)
    const { stdout: parentOut } = await execAsync("git", ["rev-parse", "HEAD"], { cwd: projectDir });
    const parent = parentOut.trim();
    const { stdout: commitOut } = await execAsync(
      "git",
      ["commit-tree", tree, "-p", parent, "-m", `studio checkpoint: ${name}`],
      { cwd: projectDir }
    );
    const commitSha = commitOut.trim();

    // 5. Store ref
    const id = randomUUID();
    const ref = `refs/studio-checkpoints/${id}`;
    await execAsync("git", ["update-ref", ref, commitSha], { cwd: projectDir });

    // 6. Count files
    const { stdout: countOut } = await execAsync("git", ["ls-tree", "-r", "--name-only", tree], { cwd: projectDir });
    const fileCount = countOut.trim().split("\n").filter(Boolean).length;

    // 7. Persist to DB
    const db = getDb(dataDir);
    db.prepare(`
      INSERT INTO checkpoints (id, name, description, git_ref, git_tree, git_commit, branch, file_count, session_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, description ?? null, ref, tree, commitSha, branch, fileCount, sessionId ?? null, Date.now());

    return { ok: true, checkpointId: id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function restoreCheckpoint(
  projectDir: string,
  dataDir: string,
  checkpointId: string
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb(dataDir);
  const checkpoint = db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(checkpointId) as {
    git_ref: string; git_commit: string;
  } | undefined;

  if (!checkpoint) return { ok: false, error: "Checkpoint not found" };

  try {
    // Restore working tree to checkpoint state
    await execAsync("git", ["reset", "--hard", checkpoint.git_commit], { cwd: projectDir });
    await execAsync("git", ["clean", "-fd"], { cwd: projectDir });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function deleteCheckpoint(
  projectDir: string,
  dataDir: string,
  checkpointId: string
): Promise<{ ok: boolean }> {
  const db = getDb(dataDir);
  const checkpoint = db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(checkpointId) as {
    git_ref: string;
  } | undefined;

  if (checkpoint) {
    try {
      await execAsync("git", ["update-ref", "-d", checkpoint.git_ref], { cwd: projectDir });
    } catch {}
    db.prepare("DELETE FROM checkpoints WHERE id = ?").run(checkpointId);
  }

  return { ok: true };
}
```

#### Create `server/routes/checkpoints.ts`

```typescript
import { Hono } from "hono";
import { getDb } from "../db.js";
import { saveCheckpoint, restoreCheckpoint, deleteCheckpoint } from "../checkpoints.js";

export function checkpointsRoutes(projectDir: string) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono();

  app.get("/", (c) => {
    const db = getDb(dataDir);
    const checkpoints = db.prepare("SELECT * FROM checkpoints ORDER BY created_at DESC").all();
    return c.json({ checkpoints });
  });

  app.post("/", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; sessionId?: string }>();
    if (!body.name) return c.json({ error: "name required" }, 400);
    const result = await saveCheckpoint(projectDir, dataDir, body.name, body.description, body.sessionId);
    if (!result.ok) return c.json({ error: result.error }, 500);
    const db = getDb(dataDir);
    const checkpoint = db.prepare("SELECT * FROM checkpoints WHERE id = ?").get(result.checkpointId);
    return c.json({ checkpoint }, 201);
  });

  app.post("/:id/restore", async (c) => {
    const result = await restoreCheckpoint(projectDir, dataDir, c.req.param("id"));
    if (!result.ok) return c.json({ error: result.error }, 500);
    return c.json({ ok: true });
  });

  app.delete("/:id", async (c) => {
    await deleteCheckpoint(projectDir, dataDir, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
```

Register in `server/index.ts`:
```typescript
import { checkpointsRoutes } from "./routes/checkpoints.js";
app.route("/api/checkpoints", checkpointsRoutes(opts.projectDir));
```

#### Auto-checkpoint before agent runs

In `sessions.ts`, before spawning claude for a chat turn, auto-save a checkpoint:

```typescript
// Auto-checkpoint at start of each chat turn
const autoCheckpointName = `Before: ${body.message.slice(0, 40)}`;
saveCheckpoint(projectDir, dataDir, autoCheckpointName, undefined, sessionId)
  .catch(() => {}); // fire and forget, don't block the response
```

#### Client UI

Add a `CheckpointPanel` component to the right sidebar (below git diff). Shows:
- List of checkpoints with name, timestamp, file count
- "Save checkpoint" button with text input
- "Restore" button per checkpoint (with confirmation dialog)
- Auto-checkpoints shown with different style (dimmed, labeled "auto")

---

## Task #22: Multi-Agent Software Company Mode

**Status**: blocked by tasks #4, #14, #20, #21
**Goal**: Let users describe a feature or task in plain language, and have the studio orchestrate multiple specialized Claude agents working in parallel to implement it -- like a small software team.

### Architecture

This is a three-layer system:

```
User request
    |
    v
Orchestrator session (claude --print as planner)
    |
    v
Task breakdown (JSON list of subtasks)
    |
    v
[Agent A: Frontend]  [Agent B: Backend]  [Agent C: Tests]
     |                    |                    |
     v                    v                    v
  worktree-A          worktree-B          worktree-C
     |                    |                    |
     v                    v                    v
  (done)              (done)              (done)
     |                    |                    |
     v
Merge phase (orchestrator picks best, merges conflicts)
    |
    v
Single clean commit on main branch
```

### Step 1: Add worktrees support to DB schema

```sql
CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,           -- absolute path to worktree
  agent_name TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'done' | 'failed'
  result_summary TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
```

### Step 2: Create `server/orchestrator.ts`

The orchestrator breaks down a high-level request into subtasks, then runs each in a separate git worktree via separate `claude --print` invocations.

```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";
import { findClaudeBin } from "./utils.js";
import { getDb } from "./db.js";

const execAsync = promisify(execFile);

export interface OrchestratorTask {
  id: string;
  agentName: string;
  description: string;
  systemPrompt: string;
}

// Phase 1: Ask Claude to break the request into subtasks
export async function planTasks(
  projectDir: string,
  userRequest: string,
  claudeBin: string
): Promise<OrchestratorTask[]> {
  const { spawn } = await import("child_process");

  const planPrompt = `You are a software engineering team lead. Break this task into parallel subtasks for specialized agents.

Task: ${userRequest}

Output ONLY valid JSON array (no markdown, no explanation):
[
  {
    "agentName": "frontend-developer",
    "description": "What this agent should implement",
    "systemPrompt": "You are a frontend developer. Your task: ..."
  }
]

Rules:
- Maximum 3 parallel agents
- Each task must be independently completable
- Tasks should not edit the same files
- agentName must be one of: frontend-developer, backend-developer, test-engineer, documentation-writer`;

  return new Promise((resolve) => {
    let output = "";
    const proc = spawn(claudeBin, ["--print", planPrompt], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
    });
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.on("close", () => {
      try {
        const match = output.match(/\[[\s\S]*\]/);
        if (match) {
          const tasks = JSON.parse(match[0]) as Array<{ agentName: string; description: string; systemPrompt: string }>;
          resolve(tasks.map(t => ({ ...t, id: randomUUID() })));
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

// Phase 2: Run a single agent in an isolated git worktree
export async function runAgentInWorktree(
  projectDir: string,
  dataDir: string,
  runId: string,
  task: OrchestratorTask,
  claudeBin: string,
  onProgress: (msg: string) => void
): Promise<{ ok: boolean; summary: string }> {
  const db = getDb(dataDir);
  const worktreeId = randomUUID();
  const branchName = `studio-agent/${runId}/${task.id.slice(0, 8)}`;
  const worktreePath = join(projectDir, ".hashmark", "worktrees", worktreeId);

  mkdirSync(join(projectDir, ".hashmark", "worktrees"), { recursive: true });

  // Register worktree in DB
  db.prepare(`
    INSERT INTO worktrees (id, run_id, branch, path, agent_name, task_description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(worktreeId, runId, branchName, worktreePath, task.agentName, task.description, Date.now());

  try {
    // Create git worktree on a new branch
    await execAsync("git", ["worktree", "add", "-b", branchName, worktreePath], { cwd: projectDir });

    db.prepare("UPDATE worktrees SET status = 'running' WHERE id = ?").run(worktreeId);
    onProgress(`[${task.agentName}] worktree created at ${worktreePath}`);

    // Build the agent prompt
    const agentPrompt = `${task.systemPrompt}

Project: ${projectDir}
Your working directory: ${worktreePath}

IMPORTANT:
- Work only in: ${worktreePath}
- Make all your changes, then commit with: git add -A && git commit -m "feat: <description>"
- After committing, output a JSON summary: {"changed_files": ["list"], "summary": "what you did"}

Task: ${task.description}`;

    // Run the agent
    const result = await new Promise<{ ok: boolean; summary: string }>((resolve) => {
      const { spawn } = require("child_process");
      let output = "";
      const proc = spawn(claudeBin, ["--print", agentPrompt], {
        cwd: worktreePath,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
      });
      proc.stdout.on("data", (d: Buffer) => {
        const text = d.toString();
        output += text;
        onProgress(`[${task.agentName}] ${text.slice(0, 100)}`);
      });
      proc.on("close", (code: number | null) => {
        const match = output.match(/\{[\s\S]*\}/);
        const summary = match ? match[0] : output.slice(-500);
        resolve({ ok: code === 0, summary });
      });
      proc.on("error", (err: Error) => resolve({ ok: false, summary: err.message }));
    });

    db.prepare(`
      UPDATE worktrees SET status = ?, result_summary = ?, completed_at = ? WHERE id = ?
    `).run(result.ok ? "done" : "failed", result.summary, Date.now(), worktreeId);

    return result;
  } catch (err) {
    db.prepare("UPDATE worktrees SET status = 'failed', completed_at = ? WHERE id = ?")
      .run(Date.now(), worktreeId);
    // Clean up worktree
    try { await execAsync("git", ["worktree", "remove", "--force", worktreePath], { cwd: projectDir }); } catch {}
    return { ok: false, summary: String(err) };
  }
}

// Phase 3: Merge all agent branches back to current branch
export async function mergeAgentBranches(
  projectDir: string,
  dataDir: string,
  runId: string,
  onProgress: (msg: string) => void
): Promise<{ ok: boolean; message: string }> {
  const db = getDb(dataDir);
  const worktrees = db.prepare(
    "SELECT * FROM worktrees WHERE run_id = ? AND status = 'done'"
  ).all(runId) as Array<{ branch: string; path: string; agent_name: string }>;

  if (worktrees.length === 0) return { ok: false, message: "No successful agents to merge" };

  for (const wt of worktrees) {
    onProgress(`Merging ${wt.agent_name} branch: ${wt.branch}`);
    try {
      await execAsync("git", ["merge", "--no-ff", wt.branch, "-m", `merge: ${wt.agent_name} changes`], { cwd: projectDir });
    } catch {
      // Conflict -- report but continue
      onProgress(`Merge conflict in ${wt.branch} -- manual resolution needed`);
    }
    // Remove worktree
    try {
      await execAsync("git", ["worktree", "remove", "--force", wt.path], { cwd: projectDir });
    } catch {}
  }

  return { ok: true, message: `Merged ${worktrees.length} agent branches` };
}
```

### Step 3: Create `server/routes/company.ts`

```typescript
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getDb } from "../db.js";
import { planTasks, runAgentInWorktree, mergeAgentBranches } from "../orchestrator.js";
import { findClaudeBin } from "../utils.js";

export function companyRoutes(projectDir: string) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono();

  // POST /api/company/run -- start a multi-agent run
  app.post("/run", async (c) => {
    const body = await c.req.json<{ request: string; mode?: "plan_only" | "full" }>();
    if (!body.request) return c.json({ error: "request required" }, 400);

    const db = getDb(dataDir);
    const runId = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO runs (id, agent_name, status, started_at)
      VALUES (?, 'orchestrator', 'running', ?)
    `).run(runId, now);

    // SSE stream for progress
    const stream = new ReadableStream({
      start: async (controller) => {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        try {
          const claudeBin = findClaudeBin(projectDir);

          send({ type: "phase", phase: "planning", message: "Breaking down task..." });
          const tasks = await planTasks(projectDir, body.request, claudeBin);

          if (tasks.length === 0) {
            send({ type: "error", message: "Failed to break down task" });
            controller.close();
            return;
          }

          send({ type: "tasks", tasks: tasks.map(t => ({ id: t.id, agentName: t.agentName, description: t.description })) });

          if (body.mode === "plan_only") {
            send({ type: "done", runId, success: true });
            controller.close();
            return;
          }

          send({ type: "phase", phase: "running", message: `Running ${tasks.length} agents in parallel...` });

          // Run all agents in parallel
          await Promise.all(tasks.map(task =>
            runAgentInWorktree(projectDir, dataDir, runId, task, claudeBin, (msg) => {
              send({ type: "progress", agentId: task.id, message: msg });
            })
          ));

          send({ type: "phase", phase: "merging", message: "Merging agent changes..." });
          const mergeResult = await mergeAgentBranches(projectDir, dataDir, runId, (msg) => {
            send({ type: "progress", message: msg });
          });

          db.prepare("UPDATE runs SET status = 'done', ended_at = ? WHERE id = ?")
            .run(Date.now(), runId);

          send({ type: "done", runId, success: mergeResult.ok, message: mergeResult.message });
        } catch (err) {
          send({ type: "error", message: String(err) });
          db.prepare("UPDATE runs SET status = 'failed', ended_at = ? WHERE id = ?")
            .run(Date.now(), runId);
        }

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

  app.get("/runs", (c) => {
    const db = getDb(dataDir);
    const runs = db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT 20").all();
    return c.json({ runs });
  });

  app.get("/runs/:id/worktrees", (c) => {
    const db = getDb(dataDir);
    const worktrees = db.prepare("SELECT * FROM worktrees WHERE run_id = ?").all(c.req.param("id"));
    return c.json({ worktrees });
  });

  return app;
}
```

Register in `server/index.ts`:
```typescript
import { companyRoutes } from "./routes/company.js";
app.route("/api/company", companyRoutes(opts.projectDir));
```

### Client UI -- SoftwareCompanyPanel

A full-screen panel activated from the nav bar (icon: `<Bot size={20} />`). Three views:

1. **Input view**: Large textarea "Describe what you want to build...", "Plan first" / "Run now" buttons
2. **Running view**: Shows each agent as a card with name, current task, streaming log output, status badge
3. **Results view**: Summary of changes made, which agents succeeded/failed, merge status, "View diff" link

---

## Shared Utilities

Create `server/utils.ts` to avoid code duplication between modules:

```typescript
import { existsSync } from "fs";
import { join } from "path";

export function findClaudeBin(projectDir: string): string {
  const candidates = [
    join(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude",
  ];
  return candidates.find((p) => {
    try { return existsSync(p); } catch { return false; }
  }) ?? "claude";
}
```

Import in `sessions.ts`, `orchestrator.ts`, and `company.ts`.

---

## Rules for This Agent

1. **Read `studio-backend.md` and `studio-frontend.md` first** -- all conventions are there
2. **All git operations use `execFile`** not `exec` or shell strings
3. **Worktrees live in `.hashmark/worktrees/`** -- always clean up on failure
4. **MCP server is a separate process** communicating via stdio, not an HTTP endpoint
5. **Multi-agent runs are non-destructive** -- work on branches, merge is explicit
6. **Auto-checkpoint before any destructive operation** (restore, merge)
7. **SSE progress events** for all long-running operations -- never leave client polling
8. **These are Opus-level tasks** -- take time to reason about edge cases before writing code

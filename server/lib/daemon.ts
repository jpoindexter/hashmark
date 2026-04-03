/**
 * Daemon Mode -- run Claude sessions in the background.
 *
 * Users can dispatch long-running tasks that continue even if
 * they navigate away from the page. Results are stored in the DB
 * and can be reviewed later.
 *
 * Unlike regular runs (which stream via SSE and die when the connection
 * closes), daemons run fully detached -- output accumulates in memory
 * and gets flushed to the runs table on completion.
 */

import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { getDb } from "../db.js";
import { findClaudeBin, buildClaudeArgs } from "./bin-resolver.js";
import { getPermissionMode } from "./permissions.js";
import { loadAgents } from "./agents.js";
import { loadToolPlugins, buildToolPluginPrompt } from "./tool-plugins.js";
import { checkUsage, recordInvocation } from "./claude-usage.js";
import { createStreamParser, type StudioEvent } from "./claude-stream.js";
import { logAgentAction, parseActionsFromOutput } from "./action-log.js";
import { withRetry, isRetryableExit, NonRetryableError } from "./retry.js";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DaemonInfo {
  id: string;
  task: string;
  agentId: string | null;
  agentName: string | null;
  status: "running" | "complete" | "error" | "cancelled";
  output: string;
  costUsd: number;
  startedAt: number;
  endedAt: number | null;
  branch: string | null;
  hasChanges: boolean;
}

interface ActiveDaemon {
  proc: ChildProcess | null;
  output: string;
  costUsd: number;
  sessionId: string | null;
  branch: string;
  worktreeDir: string;
}

// ---------------------------------------------------------------------------
// State -- in-memory tracker for running daemons
// ---------------------------------------------------------------------------

const active = new Map<string, ActiveDaemon>();

const DAEMON_TIMEOUT_MS = 30 * 60 * 1000; // 30 min -- longer than regular runs

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StartDaemonOpts {
  task: string;
  agentId?: string;
  projectDir: string;
  dataDir: string;
}

/**
 * Start a daemon. Returns the run ID immediately.
 * The Claude process runs in the background -- poll GET /api/daemon/:id for status.
 */
export function startDaemon(opts: StartDaemonOpts): { id: string } | { error: string } {
  const usage = checkUsage();
  if (!usage.allowed) {
    return { error: usage.reason ?? "Rate limited" };
  }

  const { task, agentId, projectDir, dataDir } = opts;
  const claudeBin = findClaudeBin(projectDir);
  const runId = randomUUID().slice(0, 8);
  const branchName = `studio-daemon-${runId}`;
  const worktreeDir = join(tmpdir(), branchName);

  // Persist run record
  const db = getDb(dataDir);
  const agents = loadAgents(projectDir);
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const agentDef = agentId ? agentMap.get(agentId) : undefined;

  db.prepare(
    `INSERT INTO runs (id, task, status, worktree_branch, is_daemon, started_at)
     VALUES (?, ?, 'running', ?, 1, ?)`
  ).run(runId, task, branchName, Date.now());

  if (agentDef) {
    db.prepare("UPDATE runs SET agent_name = ? WHERE id = ?").run(agentDef.name, runId);
  }

  // Track in memory
  const daemon: ActiveDaemon = {
    proc: null,
    output: "",
    costUsd: 0,
    sessionId: null,
    branch: branchName,
    worktreeDir,
  };
  active.set(runId, daemon);

  // Fire and forget -- the async work runs detached
  runDaemon(runId, daemon, {
    task,
    agentDef,
    claudeBin,
    branchName,
    worktreeDir,
    projectDir,
    dataDir,
  }).catch((err) => {
    console.error(`[daemon ${runId}] fatal:`, err);
    try {
      getDb(dataDir)
        .prepare("UPDATE runs SET status = 'error', ended_at = ?, output = ? WHERE id = ?")
        .run(Date.now(), daemon.output + `\n\nFATAL: ${err}`, runId);
    } catch {}
    active.delete(runId);
  });

  return { id: runId };
}

/**
 * Cancel a running daemon.
 */
export function stopDaemon(id: string, dataDir: string): boolean {
  const d = active.get(id);
  if (!d) return false;
  if (d.proc) {
    try { d.proc.kill("SIGTERM"); } catch {}
  }
  try {
    getDb(dataDir)
      .prepare("UPDATE runs SET status = 'cancelled', ended_at = ?, output = ?, cost_usd = ? WHERE id = ?")
      .run(Date.now(), d.output, d.costUsd, id);
  } catch {}
  active.delete(id);
  return true;
}

/**
 * Get daemon info. Checks in-memory state first (for live output), falls back to DB.
 */
export function getDaemon(id: string, dataDir: string): DaemonInfo | null {
  const d = active.get(id);
  if (d) {
    // Running -- return live state
    const db = getDb(dataDir);
    const row = db.prepare("SELECT task, agent_name, started_at FROM runs WHERE id = ?").get(id) as
      | { task: string; agent_name: string | null; started_at: number } | undefined;
    if (!row) return null;
    return {
      id,
      task: row.task,
      agentId: null,
      agentName: row.agent_name,
      status: "running",
      output: d.output,
      costUsd: d.costUsd,
      startedAt: row.started_at,
      endedAt: null,
      branch: d.branch,
      hasChanges: false,
    };
  }

  // Not active -- read from DB
  const db = getDb(dataDir);
  const row = db.prepare(
    `SELECT id, task, agent_name, status, output, cost_usd, worktree_branch,
            started_at, ended_at
     FROM runs WHERE id = ? AND is_daemon = 1`
  ).get(id) as {
    id: string; task: string; agent_name: string | null;
    status: string; output: string; cost_usd: number;
    worktree_branch: string | null; started_at: number; ended_at: number | null;
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    task: row.task,
    agentId: null,
    agentName: row.agent_name,
    status: row.status as DaemonInfo["status"],
    output: row.output,
    costUsd: row.cost_usd,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    branch: row.worktree_branch,
    hasChanges: false,
  };
}

/**
 * List all daemons (running + historical). Running ones get live output.
 */
export function listDaemons(dataDir: string): DaemonInfo[] {
  const db = getDb(dataDir);
  const rows = db.prepare(
    `SELECT id, task, agent_name, status, output, cost_usd, worktree_branch,
            started_at, ended_at
     FROM runs WHERE is_daemon = 1
     ORDER BY started_at DESC LIMIT 50`
  ).all() as Array<{
    id: string; task: string; agent_name: string | null;
    status: string; output: string; cost_usd: number;
    worktree_branch: string | null; started_at: number; ended_at: number | null;
  }>;

  return rows.map((row) => {
    const d = active.get(row.id);
    return {
      id: row.id,
      task: row.task,
      agentId: null,
      agentName: row.agent_name,
      status: (d ? "running" : row.status) as DaemonInfo["status"],
      output: d ? d.output : row.output,
      costUsd: d ? d.costUsd : row.cost_usd,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      branch: row.worktree_branch,
      hasChanges: false,
    };
  });
}

/**
 * Kill all active daemons. Called on server shutdown.
 */
export function killAllDaemons(): void {
  for (const [, d] of active) {
    if (d.proc) {
      try { d.proc.kill("SIGTERM"); } catch {}
    }
  }
  active.clear();
}

// ---------------------------------------------------------------------------
// Internal -- the actual background work
// ---------------------------------------------------------------------------

interface RunDaemonOpts {
  task: string;
  agentDef?: { id: string; name: string; content: string; tools?: string[] };
  claudeBin: string;
  branchName: string;
  worktreeDir: string;
  projectDir: string;
  dataDir: string;
}

async function runDaemon(runId: string, daemon: ActiveDaemon, opts: RunDaemonOpts) {
  const { task, agentDef, claudeBin, branchName, worktreeDir, projectDir, dataDir } = opts;

  // Create worktree
  try {
    await execFile("git", ["worktree", "add", worktreeDir, "-b", branchName], { cwd: projectDir });
    logAgentAction(dataDir, {
      timestamp: Date.now(), runId, agentId: agentDef?.id ?? "general",
      action: "worktree_create", target: branchName, outcome: "success",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAgentAction(dataDir, {
      timestamp: Date.now(), runId, agentId: agentDef?.id ?? "general",
      action: "worktree_create", target: branchName, outcome: "failure", detail: msg,
    });
    throw new Error(`Worktree failed: ${msg}`);
  }

  // Build prompt
  const agentContext = agentDef
    ? `You are operating as the agent defined below. Follow its instructions exactly.\n\n---AGENT DEFINITION---\n${agentDef.content}\n---END AGENT DEFINITION---\n\n`
    : "";
  const toolPlugins = loadToolPlugins(projectDir);
  const toolContext = buildToolPluginPrompt(toolPlugins);
  const prompt = `${agentContext}${toolContext}${task}\n\nWork in the current directory. Make the necessary code changes, create or modify files as needed.`;

  // Build CLI args
  const db = getDb(dataDir);
  const permMode = getPermissionMode(db);
  const { args: cliArgs, permissionEnv } = buildClaudeArgs({
    permissionMode: permMode,
    agentTools: agentDef?.tools,
  });

  const runEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...permissionEnv,
  };

  recordInvocation();

  const MAX_RETRIES = 3;

  await withRetry(
    () => new Promise<void>((resolve, reject) => {
      const proc = spawn(claudeBin, cliArgs, {
        cwd: worktreeDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: runEnv,
      });
      daemon.proc = proc;

      proc.stdin.write(prompt + "\n");
      proc.stdin.end();

      const timeout = setTimeout(() => {
        try { proc.kill("SIGTERM"); } catch {}
      }, DAEMON_TIMEOUT_MS);

      const parser = createStreamParser();

      proc.stdout.on("data", (chunk: Buffer) => {
        for (const ev of parser.push(chunk)) {
          handleEvent(daemon, ev);
        }
      });

      proc.stderr.on("data", () => {
        // stderr from Claude CLI -- ignore (box-drawing, status lines)
      });

      proc.on("close", (code: number | null, signal: string | null) => {
        clearTimeout(timeout);
        daemon.proc = null;

        for (const ev of parser.flush()) {
          handleEvent(daemon, ev);
        }

        if (code === 0 || code === null || signal === "SIGTERM") {
          resolve();
          return;
        }
        if (isRetryableExit(code, signal)) {
          reject(new Error(`Claude exited with code ${code}`));
          return;
        }
        reject(new NonRetryableError(`Claude exited with code ${code}`));
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timeout);
        daemon.proc = null;
        reject(new NonRetryableError(err.message));
      });
    }),
    {
      maxRetries: MAX_RETRIES,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      onRetry: (attempt, error) => {
        daemon.output += `\n[retry ${attempt}/${MAX_RETRIES + 1}: ${error}]\n`;
      },
    },
  );

  // Parse and log file write / bash events from agent output
  const actionEvents = parseActionsFromOutput(daemon.output, runId, agentDef?.id ?? "general");
  for (const ev of actionEvents) logAgentAction(dataDir, ev);

  // Commit changes if any
  let hasChanges = false;
  try {
    const { stdout: statusOut } = await execFile("git", ["status", "--porcelain"], { cwd: worktreeDir });
    hasChanges = statusOut.trim().length > 0;
    if (hasChanges) {
      await execFile("git", ["add", "-A"], { cwd: worktreeDir });
      await execFile("git", ["commit", "--no-verify", "-m", `feat(daemon/${runId}): ${task.slice(0, 72)}`], { cwd: worktreeDir });
      logAgentAction(dataDir, {
        timestamp: Date.now(), runId, agentId: agentDef?.id ?? "general",
        action: "git_commit", target: branchName, outcome: "success",
      });
    }
  } catch (err) {
    daemon.output += `\n[commit error: ${err instanceof Error ? err.message : String(err)}]\n`;
  }

  // Remove worktree, keep branch for review
  try {
    await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
    logAgentAction(dataDir, {
      timestamp: Date.now(), runId, agentId: agentDef?.id ?? "general",
      action: "worktree_remove", target: branchName, outcome: "success",
    });
  } catch {}

  // Persist final state to DB
  try {
    getDb(dataDir).prepare(
      `UPDATE runs SET status = 'complete', ended_at = ?, output = ?,
       cost_usd = ?, claude_session_id = ? WHERE id = ?`
    ).run(Date.now(), daemon.output, daemon.costUsd, daemon.sessionId, runId);
  } catch {}

  active.delete(runId);
}

function handleEvent(daemon: ActiveDaemon, ev: StudioEvent) {
  switch (ev.type) {
    case "text":
      daemon.output += ev.text;
      break;
    case "cost":
      daemon.costUsd = ev.totalUsd;
      break;
    case "session_id":
      daemon.sessionId = ev.sessionId;
      break;
    case "error":
      daemon.output += `\n[error: ${ev.message}]\n`;
      break;
    // Other events (tool_use, thinking, etc.) -- skip for daemon output.
    // The output field stores the assistant's text response only.
  }
}

/**
 * /api/swarm — multi-agent parallel run orchestrator
 * Spawns one claude process per task, each in its own git worktree.
 * Streams SSE events tagged with agentIndex so the client can fan out.
 */

import { Hono } from "hono";
import { spawn, execFile as execFileCb } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { tmpdir } from "os";
import { logAgentAction } from "../lib/action-log.js";
import { detectConflicts } from "../lib/dep-graph.js";
import { getDb, getStudioSetting } from "../db.js";
import { findClaudeBin, buildClaudeArgs } from "../lib/bin-resolver.js";
import { z } from "zod";
import type { WorkspaceCtx } from "./workspaces.js";

const MAX_CONCURRENT_CLAUDE = 2;

const SwarmBodySchema = z.object({
  tasks: z.array(z.object({
    task: z.string().min(1).max(8000),
    agentId: z.string().max(200).optional(),
  })).min(1).max(3),
  mode: z.enum(["plan", "build"]).optional(),
});

const execFile = promisify(execFileCb);

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentDef {
  id: string;
  name: string;
  description: string;
  content: string;
}

type AgentStatus = "pending" | "running" | "done" | "failed" | "cancelled";

interface SwarmAgent {
  workerIndex: number;
  task: string;
  agentId?: string;
  status: AgentStatus;
  output: string;
  branch: string;
}

interface SwarmRun {
  swarmId: string;
  mode: "plan" | "build";
  agents: SwarmAgent[];
  cancelled: boolean;
  controllers: AbortController[];
}

// ─── In-memory swarm registry ─────────────────────────────────────────────────

const swarms = new Map<string, SwarmRun>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadAgents(projectDir: string): AgentDef[] {
  const agentsDir = join(projectDir, ".claude", "agents");
  if (!existsSync(agentsDir)) return [];

  const agents: AgentDef[] = [];

  function walk(dir: string) {
    let entries: import("fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join(dir, entry.name);
        const relPath = relative(agentsDir, fullPath);
        try {
          const content = readFileSync(fullPath, "utf-8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          agents.push({
            id: relPath.replace(/\.md$/, "").replace(/\//g, "-"),
            name: nameMatch?.[1]?.trim() ?? relPath,
            description: descMatch?.[1]?.trim() ?? "",
            content,
          });
        } catch {}
      }
    }
  }

  walk(agentsDir);
  return agents;
}

// ─── Internal event system ────────────────────────────────────────────────────

type SwarmEventType = "chunk" | "status" | "complete" | "committed" | "merged" | "merge_conflict" | "ready_to_merge";

interface SwarmEvent {
  type: SwarmEventType;
  data?: string;
  branch?: string;
  filesChanged?: number;
}

interface SwarmRunWithEmitter extends SwarmRun {
  _listeners?: Array<(agentIndex: number, event: SwarmEvent) => void>;
}

function emit(swarm: SwarmRun, agentIndex: number, event: SwarmEvent) {
  const s = swarm as SwarmRunWithEmitter;
  for (const fn of s._listeners ?? []) {
    try { fn(agentIndex, event); } catch {}
  }
}

// ─── Single agent executor ────────────────────────────────────────────────────

async function runAgent(
  swarm: SwarmRun,
  agentIndex: number,
  projectDir: string,
  dataDir: string,
  claudeBin: string,
  agentMap: Map<string, AgentDef>
) {
  if (swarm.cancelled) return;

  const agent = swarm.agents[agentIndex];
  const { branch } = agent;
  const worktreeDir = join(tmpdir(), branch);

  agent.status = "running";
  emit(swarm, agentIndex, { type: "status", data: "running" });

  try {
    getDb(dataDir)
      .prepare("UPDATE swarm_workers SET status = 'running', started_at = ? WHERE run_id = ? AND worker_id = ?")
      .run(Date.now(), swarm.swarmId, agent.workerIndex);
  } catch {}

  try {
    await execFile("git", ["worktree", "add", worktreeDir, "-b", branch], { cwd: projectDir });
    logAgentAction(dataDir, {
      timestamp: Date.now(),
      runId: swarm.swarmId,
      agentId: agent.agentId ?? "general",
      action: "worktree_create",
      target: branch,
      outcome: "success",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agent.status = "failed";
    agent.output += `\n[worktree error] ${msg}`;
    emit(swarm, agentIndex, { type: "status", data: "failed" });
    emit(swarm, agentIndex, { type: "chunk", data: `[worktree error] ${msg}` });
    try {
      getDb(dataDir)
        .prepare("UPDATE swarm_workers SET status = 'failed', ended_at = ? WHERE run_id = ? AND worker_id = ?")
        .run(Date.now(), swarm.swarmId, agent.workerIndex);
    } catch {}
    return;
  }

  const agentDef = agent.agentId ? agentMap.get(agent.agentId) : undefined;
  const agentContext = agentDef
    ? `You are operating as the agent defined below. Follow its instructions exactly.\n\n---AGENT DEFINITION---\n${agentDef.content}\n---END AGENT DEFINITION---\n\n`
    : "";

  const planPrefix =
    swarm.mode === "plan"
      ? `You are operating in PLAN MODE. Read files and produce analysis only. Do NOT write or modify files.\n\n`
      : "";

  const prompt = `${planPrefix}${agentContext}${agent.task}\n\nWork in the current directory. Make the necessary code changes, create or modify files as needed.`;

  const ctrl = swarm.controllers[agentIndex];

  const skipPerms = getStudioSetting(getDb(dataDir), "dangerousSkipPermissions", "false") === "true";
  const swarmEnv: Record<string, string> = { ...process.env as Record<string, string> };
  if (skipPerms) swarmEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";

  await new Promise<void>((resolve) => {
    if (ctrl.signal.aborted) { resolve(); return; }

    const proc = spawn(claudeBin, buildClaudeArgs(prompt), {
      cwd: worktreeDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: swarmEnv,
    });

    ctrl.signal.addEventListener("abort", () => {
      try { proc.kill("SIGTERM"); } catch {}
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      if (swarm.cancelled) return;
      const text = chunk.toString();
      agent.output += text;
      emit(swarm, agentIndex, { type: "chunk", data: text });
    });

    proc.stderr.on("data", () => {});

    proc.on("close", (code: number | null) => {
      if (code !== 0 && code !== null && !swarm.cancelled) {
        const msg = `[claude exited with code ${code}]`;
        agent.output += `\n${msg}`;
        emit(swarm, agentIndex, { type: "chunk", data: msg });
      }
      resolve();
    });

    proc.on("error", (err: Error) => {
      agent.output += `\n[spawn error] ${err.message}`;
      emit(swarm, agentIndex, { type: "chunk", data: `[spawn error] ${err.message}` });
      resolve();
    });
  });

  if (swarm.cancelled || ctrl.signal.aborted) {
    agent.status = "cancelled";
    emit(swarm, agentIndex, { type: "status", data: "cancelled" });
    try { await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir }); } catch {}
    try { await execFile("git", ["branch", "-D", branch], { cwd: projectDir }); } catch {}
    return;
  }

  if (swarm.mode === "plan") {
    agent.status = "done";
    emit(swarm, agentIndex, { type: "status", data: "done" });
    emit(swarm, agentIndex, { type: "complete", data: "plan" });
    try {
      getDb(dataDir)
        .prepare("UPDATE swarm_workers SET status = 'done', ended_at = ? WHERE run_id = ? AND worker_id = ?")
        .run(Date.now(), swarm.swarmId, agent.workerIndex);
    } catch {}
    try { await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir }); } catch {}
    try { await execFile("git", ["branch", "-D", branch], { cwd: projectDir }); } catch {}
    checkSwarmComplete(swarm, dataDir);
    return;
  }

  let hasChanges = false;
  try {
    const { stdout } = await execFile("git", ["status", "--porcelain"], { cwd: worktreeDir });
    hasChanges = stdout.trim().length > 0;
    if (hasChanges) {
      await execFile("git", ["add", "-A"], { cwd: worktreeDir });
      await execFile(
        "git",
        ["commit", "-m", `feat(swarm/${swarm.swarmId}): ${agent.task.slice(0, 72)}`],
        { cwd: worktreeDir }
      );
      emit(swarm, agentIndex, { type: "committed", data: branch });
      logAgentAction(dataDir, {
        timestamp: Date.now(),
        runId: swarm.swarmId,
        agentId: agent.agentId ?? "general",
        action: "git_commit",
        target: branch,
        outcome: "success",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agent.output += `\n[commit error] ${msg}`;
    emit(swarm, agentIndex, { type: "chunk", data: `\n[commit error] ${msg}` });
  }

  // Count files and notify client to review before merging
  if (hasChanges) {
    let filesChanged = 0;
    try {
      const { stdout: nameOnly } = await execFile(
        "git", ["diff-tree", "--no-commit-id", "-r", "--name-only", "HEAD"],
        { cwd: worktreeDir }
      );
      filesChanged = nameOnly.trim().split("\n").filter(Boolean).length;
    } catch {}
    emit(swarm, agentIndex, { type: "ready_to_merge", branch, filesChanged });
  }

  // Remove worktree but keep branch — user triggers merge via POST /api/swarm/:id/agents/:index/merge
  try { await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir }); } catch {}

  agent.status = "done";
  emit(swarm, agentIndex, { type: "status", data: "done" });
  emit(swarm, agentIndex, { type: "complete", data: swarm.mode });

  try {
    getDb(dataDir)
      .prepare("UPDATE swarm_workers SET status = 'done', ended_at = ? WHERE run_id = ? AND worker_id = ?")
      .run(Date.now(), swarm.swarmId, agent.workerIndex);
  } catch {}

  checkSwarmComplete(swarm, dataDir);
}

function checkSwarmComplete(swarm: SwarmRun, dataDir: string) {
  const allDone = swarm.agents.every(
    (a) => a.status === "done" || a.status === "failed" || a.status === "cancelled"
  );
  if (allDone) {
    try {
      getDb(dataDir)
        .prepare("UPDATE swarm_runs SET status = 'complete', ended_at = ? WHERE id = ?")
        .run(Date.now(), swarm.swarmId);
    } catch {}
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function swarmRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // POST /api/swarm
  app.post("/", async (c) => {
    const parsed = SwarmBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
    }
    const body = parsed.data;
    const mode: "plan" | "build" = body.mode ?? "build";
    const swarmId = randomUUID().slice(0, 8);

    const agents: SwarmAgent[] = body.tasks.map((t, i) => ({
      workerIndex: i,
      task: t.task.trim(),
      agentId: t.agentId,
      status: "pending" as AgentStatus,
      output: "",
      branch: `swarm-${swarmId}-${randomUUID().slice(0, 6)}`,
    }));

    const swarm: SwarmRun = {
      swarmId,
      mode,
      agents,
      cancelled: false,
      controllers: agents.map(() => new AbortController()),
    };
    swarms.set(swarmId, swarm);

    try {
      const db = getDb(ctx.dataDir);
      const now = Date.now();
      db.prepare(
        "INSERT INTO swarm_runs (id, task, mode, status, worker_count, created_at, started_at) VALUES (?, '', ?, 'running', ?, ?, ?)"
      ).run(swarmId, mode, agents.length, now, now);
      for (const agent of agents) {
        db.prepare(
          "INSERT INTO swarm_workers (run_id, worker_id, title, task, agent_id, agent_name, status, branch) VALUES (?, ?, ?, ?, ?, '', 'pending', ?)"
        ).run(swarmId, agent.workerIndex, agent.task.slice(0, 72), agent.task, agent.agentId ?? "", agent.branch);
      }
    } catch {}

    const claudeBin = findClaudeBin(ctx.projectDir);
    const agentDefs = loadAgents(ctx.projectDir);
    const agentMap = new Map(agentDefs.map((a) => [a.id, a]));

    // Run agents in batches of MAX_CONCURRENT_CLAUDE to avoid spawning too many
    // Claude processes at once. Each batch waits for all its agents to finish
    // before the next batch starts.
    async function runBatched() {
      for (let i = 0; i < agents.length; i += MAX_CONCURRENT_CLAUDE) {
        const batch = agents
          .slice(i, i + MAX_CONCURRENT_CLAUDE)
          .map((_, j) => runAgent(swarm, i + j, ctx.projectDir, ctx.dataDir, claudeBin, agentMap));
        await Promise.allSettled(batch);
        if (swarm.cancelled) break;
      }
    }
    runBatched().catch(() => {});

    return c.json(
      { swarmId, agents: agents.map(({ workerIndex, task, status }) => ({ id: workerIndex, task, status })) },
      202
    );
  });

  // GET /api/swarm/:id
  app.get("/:id", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);

    return c.json({
      swarmId: swarm.swarmId,
      mode: swarm.mode,
      cancelled: swarm.cancelled,
      agents: swarm.agents.map(({ workerIndex, task, agentId, status, output, branch }) => ({
        id: workerIndex, task, agentId, status, output, branch,
      })),
    });
  });

  // GET /api/swarm/:id/conflicts — detect file-level overlaps between workers
  app.get("/:id/conflicts", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);

    // Only check workers that have branches (running or done, not pending)
    const activeWorkers = swarm.agents
      .filter((a) => a.branch && a.status !== "pending")
      .map((a) => ({ id: String(a.workerIndex), branch: a.branch }));

    if (activeWorkers.length < 2) {
      return c.json({
        hasConflicts: false,
        conflicts: [],
        summary: "Need at least 2 active workers to detect conflicts",
      });
    }

    // Detect which base to diff against -- worktree branches fork from HEAD at spawn time
    const report = detectConflicts(ctx.projectDir, activeWorkers, "HEAD");
    return c.json(report);
  });

  // GET /api/swarm/:id/stream
  app.get("/:id/stream", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        for (let i = 0; i < swarm.agents.length; i++) {
          const agent = swarm.agents[i];
          send({ agentIndex: i, type: "status", data: agent.status });
          if (agent.output) {
            send({ agentIndex: i, type: "chunk", data: agent.output });
          }
        }

        const s = swarm as SwarmRunWithEmitter;
        s._listeners ??= [];
        s._listeners.push((agentIndex: number, event: SwarmEvent) => {
          send({ agentIndex, ...event });
        });

        const interval = setInterval(() => {
          const allDone = swarm.agents.every(
            (a) => a.status === "done" || a.status === "failed" || a.status === "cancelled"
          );
          if (allDone || swarm.cancelled) {
            send({ type: "swarm_complete", swarmId: swarm.swarmId });
            clearInterval(interval);
            try { controller.close(); } catch {}
          }
        }, 500);
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

  // POST /api/swarm/:id/agents/:index/merge — user-triggered merge for a single agent's branch
  app.post("/:id/agents/:index/merge", async (c) => {
    const id = c.req.param("id");
    const index = parseInt(c.req.param("index"), 10);
    const swarm = swarms.get(id);
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);
    const agent = swarm.agents[index];
    if (!agent) return c.json({ error: "Agent not found" }, 404);
    const { branch } = agent;
    if (!branch) return c.json({ error: "No branch for this agent" }, 400);

    try {
      await execFile(
        "git",
        ["merge", branch, "--no-ff", "-m", `feat(swarm): merge ${branch}`],
        { cwd: ctx.projectDir }
      );
      logAgentAction(ctx.dataDir, {
        timestamp: Date.now(),
        runId: id,
        agentId: agent.agentId ?? "general",
        action: "git_merge",
        target: branch,
        outcome: "success",
      });
      try { await execFile("git", ["branch", "-d", branch], { cwd: ctx.projectDir }); } catch {}
      return c.json({ ok: true });
    } catch (err) {
      try { await execFile("git", ["merge", "--abort"], { cwd: ctx.projectDir }); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      logAgentAction(ctx.dataDir, {
        timestamp: Date.now(),
        runId: id,
        agentId: agent.agentId ?? "general",
        action: "git_merge",
        target: branch,
        outcome: "failure",
        detail: "merge conflict",
      });
      return c.json({ error: "Merge conflict — resolve manually", branch, detail: msg }, 409);
    }
  });

  // DELETE /api/swarm/:id
  app.delete("/:id", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);

    swarm.cancelled = true;
    for (const ctrl of swarm.controllers) {
      try { ctrl.abort(); } catch {}
    }
    for (const agent of swarm.agents) {
      if (agent.status === "pending" || agent.status === "running") {
        agent.status = "cancelled";
      }
    }

    try {
      getDb(ctx.dataDir)
        .prepare("UPDATE swarm_runs SET status = 'cancelled', ended_at = ? WHERE id = ?")
        .run(Date.now(), swarm.swarmId);
    } catch {}

    return c.json({ ok: true, swarmId: swarm.swarmId });
  });

  return app;
}

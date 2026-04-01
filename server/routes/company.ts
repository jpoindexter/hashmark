/**
 * /api/company — multi-agent swarm orchestrator
 * Decomposes tasks into subtasks, runs agents in parallel git worktrees,
 * injecting each agent's definition as system context, then merges results.
 */

import { Hono } from "hono";
import { spawn, execFile as execFileCb } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { tmpdir } from "os";
import { z } from "zod";
import { getDb, getStudioSetting } from "../db.js";
import { logAgentAction, parseActionsFromOutput } from "../lib/action-log.js";
import { loadAgents } from "../lib/agents.js";
import { findClaudeBin, buildClaudeArgs } from "../lib/bin-resolver.js";
import { createStreamParser } from "../lib/claude-stream.js";
import type { WorkspaceCtx } from "./workspaces.js";

const execFile = promisify(execFileCb);

const MAX_CONCURRENT_CLAUDE = 2;
const MAX_WORKERS = 3;

const CompanyPlanSchema = z.object({
  task: z.string().min(1).max(8000),
  companyType: z.string().max(200).optional(),
  projectName: z.string().max(200).optional(),
});

const CompanyRunSchema = z.object({
  task: z.string().min(1).max(8000),
  plan: z.array(z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    agentId: z.string(),
  })).min(1).max(10),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subtask {
  id: number;
  title: string;
  description: string;
  agentId: string;          // matches AgentDef.id; "general" = no specific agent
}

let activeRun = false;

// ─── Routes ───────────────────────────────────────────────────────────────────

export function companyRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/company/status
  app.get("/status", (c) => {
    return c.json({ active: activeRun });
  });

  // GET /api/company/agents — list available agents for the UI
  app.get("/agents", (c) => {
    const agents = loadAgents(ctx.projectDir).map(({ id, name, description }) => ({ id, name, description }));
    return c.json({ agents });
  });

  // POST /api/company/plan — use Claude to decompose task + assign to available agents
  app.post("/plan", async (c) => {
    const parsed = CompanyPlanSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
    }
    const body = parsed.data;
    const claudeBin = findClaudeBin(ctx.projectDir);
    const agents = loadAgents(ctx.projectDir);

    const agentList = agents.length > 0
      ? agents.map(a => `  - id: "${a.id}" | name: "${a.name}" | ${a.description}`).join("\n")
      : `  - id: "general" | name: "General" | general purpose agent`;

    const prompt = `You are a software project manager. Decompose this task into 2-${Math.min(MAX_WORKERS, 4)} concrete, parallel subtasks. Each subtask must be independent and map to one of the available agents.

Task: ${body.task}

Available agents:
${agentList}

Rules:
- Each subtask MUST use one of the agent IDs listed above exactly as shown
- Subtasks must be truly parallel (no subtask should depend on another)
- If agents are irrelevant or only 1-2 are relevant, use fewer subtasks
- If no specific agent fits, use "general" as agentId

Respond with ONLY a JSON array, no markdown, no explanation:
[{"id":1,"title":"short title under 50 chars","description":"detailed what to implement","agentId":"exact-agent-id-here"}]`;

    const skipPerms = getStudioSetting(getDb(ctx.dataDir), "dangerousSkipPermissions", "false") === "true";
    const planEnv: Record<string, string> = { ...process.env as Record<string, string> };
    if (skipPerms) planEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";

    try {
      // Use spawn + stdin to avoid exposing prompt in process listing
      const stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn(claudeBin, ["--print", "--allowedTools", "Read,Glob,Grep,WebFetch,WebSearch"], {
          cwd: ctx.projectDir, env: planEnv, stdio: ["pipe", "pipe", "pipe"],
        });
        proc.stdin.write(prompt + "\n");
        proc.stdin.end();
        let out = "";
        proc.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
        proc.on("close", (code) => code === 0 ? resolve(out) : reject(new Error(`Exit ${code}`)));
        proc.on("error", reject);
      });

      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return c.json({ error: "Failed to parse plan — Claude output:\n" + stdout.slice(0, 300) }, 500);
      }

      const plan = JSON.parse(jsonMatch[0]) as Subtask[];

      // Validate agent IDs — fall back to "general" for unknown ones
      const validIds = new Set(agents.map(a => a.id));
      const sanitized = plan.map(s => ({
        ...s,
        agentId: validIds.has(s.agentId) ? s.agentId : "general",
      }));

      return c.json({ plan: sanitized });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // POST /api/company/run — spawn workers in parallel worktrees, stream all events
  app.post("/run", async (c) => {
    const parsed = CompanyRunSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
    }
    const body = parsed.data;
    const claudeBin = findClaudeBin(ctx.projectDir);
    const runId = randomUUID().slice(0, 8);
    const plan = body.plan.slice(0, MAX_WORKERS);
    const agents = loadAgents(ctx.projectDir);
    const agentMap = new Map(agents.map(a => [a.id, a]));

    activeRun = true;

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        const worktreeDirs = new Map<number, string>();

        async function runWorker(subtask: Subtask): Promise<{ id: number; output: string; hasChanges: boolean; testPassed: boolean; testSkipped: boolean }> {
          const branchName = `studio-swarm-${runId}-${subtask.id}`;
          const worktreeDir = join(tmpdir(), branchName);
          worktreeDirs.set(subtask.id, worktreeDir);

          send({ type: "worker_start", id: subtask.id, title: subtask.title, agentId: subtask.agentId });

          // Update worker status to running in DB
          try {
            const db = getDb(ctx.dataDir);
            db.prepare(
              "UPDATE swarm_workers SET status='running', started_at=? WHERE run_id=? AND worker_id=?"
            ).run(Date.now(), runId, subtask.id);
          } catch {}

          try {
            await execFile("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: ctx.projectDir,
            });
            logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
            send({ type: "worker_error", id: subtask.id, error: `Worktree failed: ${msg}` });
            try {
              const db = getDb(ctx.dataDir);
              db.prepare(
                "UPDATE swarm_workers SET status='error', error=?, completed_at=? WHERE run_id=? AND worker_id=?"
              ).run(`Worktree failed: ${msg}`, Date.now(), runId, subtask.id);
            } catch {}
            throw err;
          }

          // Build worker prompt — inject agent definition as context
          const agentDef = agentMap.get(subtask.agentId);
          const agentContext = agentDef
            ? `You are operating as the agent defined below. Follow its instructions exactly.\n\n---AGENT DEFINITION---\n${agentDef.content}\n---END AGENT DEFINITION---\n\n`
            : "";

          const workerPrompt = `${agentContext}Overall objective: ${body.task}

Your specific subtask: ${subtask.title}

${subtask.description}

Work in the current directory. Make the necessary code changes, create or modify files as needed.`;

          const workerSkipPerms = getStudioSetting(getDb(ctx.dataDir), "dangerousSkipPermissions", "false") === "true";
          const workerEnv: Record<string, string> = { ...process.env as Record<string, string> };
          if (workerSkipPerms) workerEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";

          return new Promise((resolve, reject) => {
            const workerArgs = buildClaudeArgs({ mode: "build" });
            const proc = spawn(claudeBin, workerArgs, {
              cwd: worktreeDir,
              stdio: ["pipe", "pipe", "pipe"],
              env: workerEnv,
            });

            // Send prompt via stdin
            proc.stdin.write(workerPrompt + "\n");
            proc.stdin.end();

            let fullOutput = "";
            const parser = createStreamParser();

            proc.stdout.on("data", (chunk: Buffer) => {
              const events = parser.push(chunk);
              for (const ev of events) {
                if (ev.type === "text") {
                  fullOutput += ev.text;
                  send({ type: "worker_chunk", id: subtask.id, text: ev.text });
                } else if (ev.type === "tool_use") {
                  send({ type: "worker_tool", id: subtask.id, tool: ev.tool });
                } else if (ev.type === "cost") {
                  send({ type: "worker_cost", id: subtask.id, cost: ev.totalUsd });
                }
              }
              try {
                const db = getDb(ctx.dataDir);
                db.prepare(
                  "UPDATE swarm_workers SET output = ? WHERE run_id=? AND worker_id=?"
                ).run(fullOutput, runId, subtask.id);
              } catch {}
            });

            proc.stderr.on("data", () => {});

            proc.on("close", async (code: number | null) => {
              // Drain any remaining data in the parser buffer
              const remaining = parser.flush();
              for (const ev of remaining) {
                if (ev.type === "text") {
                  fullOutput += ev.text;
                  send({ type: "worker_chunk", id: subtask.id, text: ev.text });
                } else if (ev.type === "tool_use") {
                  send({ type: "worker_tool", id: subtask.id, tool: ev.tool });
                } else if (ev.type === "cost") {
                  send({ type: "worker_cost", id: subtask.id, cost: ev.totalUsd });
                }
              }

              if (code !== 0 && code !== null) {
                send({ type: "worker_error", id: subtask.id, error: `Exit code ${code}` });
                try {
                  const db = getDb(ctx.dataDir);
                  db.prepare(
                    "UPDATE swarm_workers SET status='error', error=?, completed_at=? WHERE run_id=? AND worker_id=?"
                  ).run(`Exit code ${code}`, Date.now(), runId, subtask.id);
                } catch {}
                reject(new Error(`Exit ${code}`));
                return;
              }

              let hasChanges = false;
              try {
                const { stdout: statusOut } = await execFile("git", ["status", "--porcelain"], { cwd: worktreeDir });
                hasChanges = statusOut.trim().length > 0;
                if (hasChanges) {
                  await execFile("git", ["add", "-A"], { cwd: worktreeDir });
                  await execFile("git", ["commit", "-m", `feat(swarm/${runId}): agent ${subtask.id} - ${subtask.title}`], { cwd: worktreeDir });
                  logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_commit", target: branchName, outcome: "success" });
                }
              } catch {}

              // Parse and log file write / bash events from agent output
              const actionEvents = parseActionsFromOutput(fullOutput, runId, subtask.agentId, subtask.id);
              for (const ev of actionEvents) logAgentAction(ctx.dataDir, ev);

              // Test verification step
              let testResult: { passed: boolean; output: string; skipped: boolean } = { passed: true, output: "", skipped: false };

              try {
                const pkgPath = join(worktreeDir, "package.json");
                let hasTestScript = false;
                try {
                  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                  hasTestScript = !!(pkg?.scripts?.test && !pkg.scripts.test.includes("no test specified"));
                } catch {}

                if (hasTestScript) {
                  send({ type: "worker_verifying", id: subtask.id });
                  const { stdout: testOut, stderr: testErr } = await execFile(
                    "npm", ["test", "--", "--passWithNoTests"],
                    { cwd: worktreeDir, timeout: 60000, maxBuffer: 512 * 1024 }
                  ).catch((e: { stdout?: string; stderr?: string }) => ({ stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));
                  const combined = testOut + testErr;
                  const passed = !combined.match(/\b(FAILED|FAIL|failed|Error:|error:)\b/) || combined.includes("passing");
                  testResult = { passed, output: combined.slice(0, 2000), skipped: false };
                  send({ type: "worker_verify_result", id: subtask.id, passed: testResult.passed, output: testResult.output });
                } else {
                  testResult.skipped = true;
                  send({ type: "worker_verify_result", id: subtask.id, passed: true, output: "", skipped: true });
                }
              } catch (err) {
                testResult = { passed: false, output: String(err), skipped: false };
                send({ type: "worker_verify_result", id: subtask.id, passed: false, output: String(err) });
              }

              try {
                const db = getDb(ctx.dataDir);
                db.prepare(
                  "UPDATE swarm_workers SET status='done', completed_at=? WHERE run_id=? AND worker_id=?"
                ).run(Date.now(), runId, subtask.id);
              } catch {}

              send({ type: "worker_done", id: subtask.id, output: fullOutput, hasChanges });
              resolve({ id: subtask.id, output: fullOutput, hasChanges, testPassed: testResult.passed, testSkipped: testResult.skipped });
            });

            proc.on("error", (err: Error) => {
              send({ type: "worker_error", id: subtask.id, error: err.message });
              try {
                const db = getDb(ctx.dataDir);
                db.prepare(
                  "UPDATE swarm_workers SET status='error', error=?, completed_at=? WHERE run_id=? AND worker_id=?"
                ).run(err.message, Date.now(), runId, subtask.id);
              } catch {}
              reject(err);
            });
          });
        }

        if (body.plan.length > plan.length) {
          send({ type: "warning", message: `Plan had ${body.plan.length} workers; capped to ${plan.length} (max ${MAX_WORKERS})` });
        }

        async function orchestrate() {
          // Insert run + workers into DB
          try {
            const db = getDb(ctx.dataDir);
            db.prepare(
              "INSERT INTO swarm_runs (id, task, status, worker_count, created_at) VALUES (?, ?, 'running', ?, ?)"
            ).run(runId, body.task, plan.length, Date.now());
            for (const subtask of plan) {
              const agentDef = agentMap.get(subtask.agentId);
              db.prepare(
                "INSERT INTO swarm_workers (run_id, worker_id, title, agent_id, agent_name, status) VALUES (?, ?, ?, ?, ?, 'pending')"
              ).run(runId, subtask.id, subtask.title, subtask.agentId, agentDef?.name ?? subtask.agentId);
            }
          } catch {}

          // Run workers in batches of MAX_CONCURRENT_CLAUDE
          const results: PromiseSettledResult<{ id: number; output: string; hasChanges: boolean; testPassed: boolean; testSkipped: boolean }>[] = [];
          for (let i = 0; i < plan.length; i += MAX_CONCURRENT_CLAUDE) {
            const batch = plan.slice(i, i + MAX_CONCURRENT_CLAUDE).map(runWorker);
            const batchResults = await Promise.allSettled(batch);
            results.push(...batchResults);
          }

          send({ type: "phase", phase: "merging" });

          const merged: number[] = [];
          const conflicts: number[] = [];
          const skipped: number[] = [];

          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const subtask = plan[i];
            const branchName = `studio-swarm-${runId}-${subtask.id}`;

            if (result.status === "rejected") { conflicts.push(subtask.id); continue; }
            if (!result.value.hasChanges) { skipped.push(subtask.id); continue; }

            try {
              await execFile("git", [
                "merge", branchName, "--no-ff",
                "-m", `feat(swarm): merge agent ${subtask.id} - ${subtask.title}`,
              ], { cwd: ctx.projectDir });
              merged.push(subtask.id);
              logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_merge", target: branchName, outcome: "success" });
            } catch {
              try { await execFile("git", ["merge", "--abort"], { cwd: ctx.projectDir }); } catch {}
              conflicts.push(subtask.id);
              logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_merge", target: branchName, outcome: "failure", detail: "merge conflict" });
            }
          }

          // Cleanup
          for (const subtask of plan) {
            const branchName = `studio-swarm-${runId}-${subtask.id}`;
            const worktreeDir = worktreeDirs.get(subtask.id);
            try {
              if (worktreeDir) {
                await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: ctx.projectDir });
                logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_remove", target: branchName, outcome: "success" });
              }
            } catch {}
            try { await execFile("git", ["branch", "-D", branchName], { cwd: ctx.projectDir }); } catch {}
          }

          // Persist merge result
          try {
            const db = getDb(ctx.dataDir);
            db.prepare(
              "UPDATE swarm_runs SET merged_count=?, conflict_count=?, skipped_count=?, status='done', completed_at=? WHERE id=?"
            ).run(merged.length, conflicts.length, skipped.length, Date.now(), runId);
          } catch {}

          send({ type: "merge_result", merged, conflicts, skipped, testResults: plan.map((s, i) => {
            const r = results[i];
            return {
              id: s.id,
              testPassed: r.status === "fulfilled" ? r.value.testPassed : null,
              testSkipped: r.status === "fulfilled" ? r.value.testSkipped : false,
            };
          }) });
          send({ type: "complete" });

          activeRun = false;
          controller.close();
        }

        orchestrate().catch((err) => {
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
          try {
            const db = getDb(ctx.dataDir);
            db.prepare(
              "UPDATE swarm_runs SET status='error', completed_at=? WHERE id=?"
            ).run(Date.now(), runId);
          } catch {}
          activeRun = false;
          controller.close();
        });
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

  // GET /api/company/runs — list past swarm runs with workers
  app.get("/runs", (c) => {
    const db = getDb(ctx.dataDir);
    const runs = db.prepare(
      "SELECT * FROM swarm_runs ORDER BY created_at DESC LIMIT 50"
    ).all() as Record<string, unknown>[];
    const workers = db.prepare(
      "SELECT * FROM swarm_workers WHERE run_id IN (SELECT id FROM swarm_runs ORDER BY created_at DESC LIMIT 50) ORDER BY worker_id"
    ).all() as Record<string, unknown>[];

    const workersByRun = new Map<string, Record<string, unknown>[]>();
    for (const w of workers) {
      const rid = w.run_id as string;
      if (!workersByRun.has(rid)) workersByRun.set(rid, []);
      workersByRun.get(rid)!.push(w);
    }

    const result = runs.map(r => ({ ...r, workers: workersByRun.get(r.id as string) ?? [] }));
    return c.json({ runs: result });
  });

  // GET /api/company/runs/:id — single run + workers
  app.get("/runs/:id", (c) => {
    const db = getDb(ctx.dataDir);
    const run = db.prepare("SELECT * FROM swarm_runs WHERE id=?").get(c.req.param("id")) as Record<string, unknown> | undefined;
    if (!run) return c.json({ error: "Not found" }, 404);
    const workers = db.prepare(
      "SELECT * FROM swarm_workers WHERE run_id=? ORDER BY worker_id"
    ).all(c.req.param("id")) as Record<string, unknown>[];
    return c.json({ run, workers });
  });

  // DELETE /api/company/runs/:id — delete run (cascades to workers)
  app.delete("/runs/:id", (c) => {
    const db = getDb(ctx.dataDir);
    db.prepare("DELETE FROM swarm_runs WHERE id=?").run(c.req.param("id"));
    return c.json({ ok: true });
  });

  // POST /api/company/conflicts — detect file-level overlaps from parsed agent output
  // Accepts a list of agents with their touched files (parsed client-side from output).
  // Returns conflicts where 2+ agents touch the same file, scored by severity.
  app.post("/conflicts", async (c) => {
    const body = await c.req.json<{
      agents: Array<{ id: string; name: string; files: string[] }>;
    }>();

    if (!Array.isArray(body.agents) || body.agents.length < 2) {
      return c.json({
        hasConflicts: false,
        conflicts: [],
        summary: "Need at least 2 agents with file data to detect conflicts",
      });
    }

    // Build file -> agents map
    const fileToAgents = new Map<string, string[]>();
    for (const agent of body.agents) {
      for (const file of agent.files ?? []) {
        const existing = fileToAgents.get(file) ?? [];
        existing.push(agent.id);
        fileToAgents.set(file, existing);
      }
    }

    // High-impact file patterns (same as dep-graph.ts)
    const HIGH_IMPACT = [
      /package\.json$/,
      /tsconfig.*\.json$/,
      /\.env/,
      /prisma\/schema/,
      /schema\.(ts|js)$/,
      /middleware\.(ts|js)$/,
    ];

    interface ConflictItem {
      file: string;
      agents: string[];
      severity: "high" | "medium" | "low";
    }

    const conflicts: ConflictItem[] = [];
    for (const [file, agentIds] of fileToAgents) {
      if (agentIds.length > 1) {
        let severity: "high" | "medium" | "low" = "medium";
        if (agentIds.length > 2) severity = "high";
        else if (HIGH_IMPACT.some(p => p.test(file))) severity = "high";

        conflicts.push({ file, agents: agentIds, severity });
      }
    }

    // Sort high severity first
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    conflicts.sort((a, b) => order[a.severity] - order[b.severity]);

    return c.json({
      hasConflicts: conflicts.length > 0,
      conflicts,
      summary: conflicts.length === 0
        ? "No conflicts detected"
        : `${conflicts.length} file(s) modified by multiple agents`,
    });
  });

  return app;
}

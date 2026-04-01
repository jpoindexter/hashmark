/**
 * /api/run — single-agent run orchestrator
 * Spawns one claude process in a git worktree, streams output as SSE,
 * auto-commits changes, merges back to main, cleans up.
 */

import { Hono } from "hono";
import { spawn, execFile as execFileCb } from "child_process";
import { join } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { tmpdir } from "os";
import { logAgentAction, parseActionsFromOutput } from "../lib/action-log.js";
import { loadAgents, type AgentDef } from "../lib/agents.js";
import { getDb, getStudioSetting } from "../db.js";
import { findClaudeBin, buildClaudeArgs } from "../lib/bin-resolver.js";
import { z } from "zod";
import { checkUsage, recordInvocation, getUsageStats } from "../lib/claude-usage.js";
import { createStreamParser, type StudioEvent } from "../lib/claude-stream.js";
import { withRetry, isRetryableExit, NonRetryableError } from "../lib/retry.js";
import type { WorkspaceCtx } from "./workspaces.js";

const execFile = promisify(execFileCb);

const RunBodySchema = z.object({
  task: z.string().min(1).max(8000),
  agentId: z.string().max(200).optional(),
  mode: z.enum(["plan", "build"]).optional(),
  resumeRunId: z.string().max(100).optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

let activeRun = false;
let activeProc: ReturnType<typeof spawn> | null = null;
const RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function runRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  app.get("/status", (c) => c.json({ active: activeRun }));

  app.get("/usage", (c) => c.json(getUsageStats()));

  // DELETE /api/run — cancel an active run and kill the subprocess
  app.delete("/", (c) => {
    if (activeProc) {
      try { activeProc.kill("SIGTERM"); } catch {}
      activeProc = null;
    }
    activeRun = false;
    return c.json({ ok: true, message: "Run cancelled" });
  });

  // GET /api/runs — list past runs newest first
  app.get("/runs", (c) => {
    try {
      const db = getDb(ctx.dataDir);
      const rows = db
        .prepare(
          `SELECT id, task, status, started_at AS created_at, worktree_branch
           FROM runs ORDER BY started_at DESC LIMIT 50`
        )
        .all() as { id: string; task: string; status: string; created_at: number; worktree_branch: string | null }[];
      return c.json({ runs: rows });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // GET /api/runs/:id/diff — return git diff for the run's worktree branch
  app.get("/runs/:id/diff", async (c) => {
    const id = c.req.param("id");
    try {
      const db = getDb(ctx.dataDir);
      const run = db.prepare("SELECT worktree_branch, task FROM runs WHERE id = ?").get(id) as
        | { worktree_branch: string | null; task: string } | undefined;
      if (!run) return c.json({ error: "Run not found" }, 404);

      const branch = run.worktree_branch;
      if (!branch) return c.json({ diff: "", branch: null });

      // Try branch diff first; fall back to commit search if branch was deleted post-merge
      let diff = "";
      try {
        const res = await execFile("git", ["diff", `main...${branch}`], {
          cwd: ctx.projectDir,
          maxBuffer: 4 * 1024 * 1024,
        });
        diff = res.stdout;
      } catch {
        try {
          const logRes = await execFile(
            "git", ["log", "--all", "--oneline", `--grep=run/${id}`],
            { cwd: ctx.projectDir }
          );
          const hash = logRes.stdout.trim().split(/\s/)[0];
          if (hash) {
            const showRes = await execFile("git", ["show", hash], {
              cwd: ctx.projectDir,
              maxBuffer: 4 * 1024 * 1024,
            });
            diff = showRes.stdout;
          }
        } catch { /* no diff available */ }
      }

      return c.json({ diff, branch });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // POST /api/run/runs/:id/merge — user-triggered merge after reviewing Claude's changes
  app.post("/runs/:id/merge", async (c) => {
    const id = c.req.param("id");
    const db = getDb(ctx.dataDir);
    const run = db.prepare("SELECT worktree_branch FROM runs WHERE id = ?").get(id) as
      | { worktree_branch: string | null } | undefined;
    if (!run) return c.json({ error: "Run not found" }, 404);
    const branch = run.worktree_branch;
    if (!branch) return c.json({ error: "No branch for this run" }, 400);

    try {
      await execFile(
        "git",
        ["merge", branch, "--no-ff", "-m", `feat(run): merge ${branch}`],
        { cwd: ctx.projectDir }
      );
      logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId: id, agentId: "general", action: "git_merge", target: branch, outcome: "success" });
      try { await execFile("git", ["branch", "-d", branch], { cwd: ctx.projectDir }); } catch {}
      return c.json({ ok: true });
    } catch (err) {
      try { await execFile("git", ["merge", "--abort"], { cwd: ctx.projectDir }); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId: id, agentId: "general", action: "git_merge", target: branch, outcome: "failure", detail: "merge conflict" });
      return c.json({ error: "Merge conflict — resolve manually", branch, detail: msg }, 409);
    }
  });

  // POST /api/run — start a single-agent run, returns SSE stream
  app.post("/", async (c) => {
    if (activeRun) {
      return c.json({ error: "A run is already in progress" }, 409);
    }

    const usage = checkUsage();
    if (!usage.allowed) {
      return c.json({ error: usage.reason, usage: { invocationsThisHour: usage.invocationsThisHour, limit: usage.limit } }, 429);
    }

    const parsed = RunBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
    }
    const body = parsed.data;
    const mode = body.mode ?? "build";

    const claudeBin = findClaudeBin(ctx.projectDir);
    const runId = randomUUID().slice(0, 8);
    const agents = loadAgents(ctx.projectDir);
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // Resume support: look up prior run's claude_session_id
    let resumeSessionId: string | null = null;
    if (body.resumeRunId) {
      try {
        const db = getDb(ctx.dataDir);
        const prior = db.prepare("SELECT claude_session_id FROM runs WHERE id = ?").get(body.resumeRunId) as { claude_session_id: string | null } | undefined;
        resumeSessionId = prior?.claude_session_id ?? null;
      } catch {}
    }

    activeRun = true;

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        const branchName = `studio-run-${runId}`;
        const worktreeDir = join(tmpdir(), branchName);

        async function run() {
          send({ type: "start", runId, task: body.task, agentId: body.agentId ?? null });

          // Persist run record to DB
          try {
            const db = getDb(ctx.dataDir);
            db.prepare(
              `INSERT INTO runs (id, task, status, worktree_branch, started_at) VALUES (?, ?, 'running', ?, ?)`
            ).run(runId, body.task, branchName, Date.now());
          } catch { /* non-fatal */ }

          // Create worktree
          try {
            await execFile("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: ctx.projectDir,
            });
            logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
            send({ type: "error", error: `Worktree failed: ${msg}` });
            activeRun = false;
            controller.close();
            return;
          }

          // Build prompt — inject agent definition if provided
          const agentDef = body.agentId ? agentMap.get(body.agentId) : undefined;
          const agentContext = agentDef
            ? `You are operating as the agent defined below. Follow its instructions exactly.\n\n---AGENT DEFINITION---\n${agentDef.content}\n---END AGENT DEFINITION---\n\n`
            : "";

          const planPrefix = mode === "plan"
            ? `You are operating in PLAN MODE. You may read files, analyze code, and produce reports. You MUST NOT write or modify any files, run git commands, or execute shell commands that modify state. Provide a detailed analysis and action plan instead.\n\n`
            : "";

          const prompt = `${planPrefix}${agentContext}${body.task}\n\nWork in the current directory. Make the necessary code changes, create or modify files as needed.`;

          // Spawn claude and stream output
          const skipPerms = getStudioSetting(getDb(ctx.dataDir), "dangerousSkipPermissions", "false") === "true";
          const runEnv: Record<string, string> = { ...process.env as Record<string, string> };
          if (skipPerms) runEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";

          let fullOutput = "";
          let capturedSessionId: string | null = null;
          let runCostUsd = 0;
          recordInvocation();
          const agentTools = agentDef?.tools;
          const cliArgs = buildClaudeArgs({ mode, allowedTools: agentTools, resume: resumeSessionId ?? undefined });

          const MAX_SPAWN_RETRIES = 3;

          await withRetry(
            () =>
              new Promise<void>((resolve, reject) => {
                const proc = spawn(claudeBin, cliArgs, {
                  cwd: worktreeDir,
                  stdio: ["pipe", "pipe", "pipe"],
                  env: runEnv,
                });
                activeProc = proc;

                // Send prompt via stdin
                proc.stdin.write(prompt + "\n");
                proc.stdin.end();

                const timeout = setTimeout(() => {
                  send({ type: "error", error: "Run timed out after 10 minutes" });
                  try { proc.kill("SIGTERM"); } catch {}
                  activeRun = false;
                  activeProc = null;
                }, RUN_TIMEOUT_MS);

                const parser = createStreamParser();

                proc.stdout.on("data", (chunk: Buffer) => {
                  const events = parser.push(chunk);
                  for (const ev of events) {
                    switch (ev.type) {
                      case "text":
                        fullOutput += ev.text;
                        send({ type: "chunk", text: ev.text });
                        break;
                      case "tool_use":
                        send({ type: "tool_use", tool: ev.tool, input: ev.input });
                        break;
                      case "tool_result":
                        send({ type: "tool_result", content: ev.content });
                        break;
                      case "tool_progress":
                        send({ type: "tool_progress", tool: ev.tool, elapsed: ev.elapsed });
                        break;
                      case "thinking":
                        send({ type: "thinking", content: ev.content });
                        break;
                      case "cost":
                        runCostUsd = ev.totalUsd;
                        send({ type: "cost", totalUsd: ev.totalUsd, durationMs: ev.durationMs });
                        break;
                      case "session_id":
                        capturedSessionId = ev.sessionId;
                        break;
                      case "task_started":
                        send({ type: "task_started", taskId: ev.taskId, description: ev.description });
                        break;
                      case "task_progress":
                        send({ type: "task_progress", taskId: ev.taskId, message: ev.message });
                        break;
                      case "error":
                        send({ type: "error", error: ev.message });
                        break;
                      case "progress":
                        send({ type: "progress", message: ev.message });
                        break;
                    }
                  }
                });

                proc.stderr.on("data", (chunk: Buffer) => {
                  const line = chunk.toString().trim();
                  if (line) send({ type: "progress", message: line });
                });

                proc.on("close", (code: number | null, signal: string | null) => {
                  clearTimeout(timeout);
                  activeProc = null;

                  // Drain any remaining data in the parser buffer
                  const remaining = parser.flush();
                  for (const ev of remaining) {
                    switch (ev.type) {
                      case "text":
                        fullOutput += ev.text;
                        send({ type: "chunk", text: ev.text });
                        break;
                      case "tool_use":
                        send({ type: "tool_use", tool: ev.tool, input: ev.input });
                        break;
                      case "tool_result":
                        send({ type: "tool_result", content: ev.content });
                        break;
                      case "tool_progress":
                        send({ type: "tool_progress", tool: ev.tool, elapsed: ev.elapsed });
                        break;
                      case "thinking":
                        send({ type: "thinking", content: ev.content });
                        break;
                      case "cost":
                        runCostUsd = ev.totalUsd;
                        send({ type: "cost", totalUsd: ev.totalUsd, durationMs: ev.durationMs });
                        break;
                      case "session_id":
                        capturedSessionId = ev.sessionId;
                        break;
                      case "task_started":
                        send({ type: "task_started", taskId: ev.taskId, description: ev.description });
                        break;
                      case "task_progress":
                        send({ type: "task_progress", taskId: ev.taskId, message: ev.message });
                        break;
                      case "error":
                        send({ type: "error", error: ev.message });
                        break;
                      case "progress":
                        send({ type: "progress", message: ev.message });
                        break;
                    }
                  }

                  // Success or intentional kill -- resolve normally
                  if (code === 0 || code === null || signal === "SIGTERM") {
                    resolve();
                    return;
                  }

                  // Retryable failure -- reject so withRetry can retry
                  if (isRetryableExit(code, signal)) {
                    reject(new Error(`Claude exited with code ${code}`));
                    return;
                  }

                  // Non-retryable failure (e.g. exit 2 = auth error)
                  send({ type: "error", error: `Claude exited with code ${code}` });
                  reject(new NonRetryableError(`Claude exited with code ${code}`));
                });

                proc.on("error", (err: Error) => {
                  clearTimeout(timeout);
                  activeProc = null;
                  send({ type: "error", error: err.message });
                  reject(new NonRetryableError(err.message));
                });
              }),
            {
              maxRetries: MAX_SPAWN_RETRIES,
              baseDelayMs: 1000,
              maxDelayMs: 30000,
              onRetry: (attempt, error, delayMs) => {
                // Reset output for the retry -- previous attempt's partial output is stale
                fullOutput = "";
                send({
                  type: "progress",
                  message: `Retrying... (attempt ${attempt + 1}/${MAX_SPAWN_RETRIES + 1}, waiting ${(delayMs / 1000).toFixed(1)}s) -- ${error}`,
                });
              },
            },
          ).catch((err) => {
            // All retries exhausted or non-retryable -- error already sent via SSE above
            if (!(err instanceof NonRetryableError)) {
              send({ type: "error", error: `Claude failed after ${MAX_SPAWN_RETRIES + 1} attempts: ${err.message}` });
            }
          });

          // In plan mode, skip commit + merge entirely
          let hasChanges = false;
          if (mode === "plan") {
            try { getDb(ctx.dataDir).prepare("UPDATE runs SET status = ?, ended_at = ?, cost_usd = ?, claude_session_id = ? WHERE id = ?").run("complete", Date.now(), runCostUsd, capturedSessionId, runId); } catch (e) { console.error("[run] db update failed:", e); }
            send({ type: "complete", hasChanges: false, mode: "plan" });
            activeRun = false;
            controller.close();
            // Cleanup worktree
            try { await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: ctx.projectDir }); } catch {}
            try { await execFile("git", ["branch", "-D", branchName], { cwd: ctx.projectDir }); } catch {}
            return;
          }

          // Parse and log file write / bash events from agent output
          const actionEvents = parseActionsFromOutput(fullOutput, runId, body.agentId ?? "general");
          for (const ev of actionEvents) logAgentAction(ctx.dataDir, ev);

          // Commit if there are changes
          try {
            const { stdout: statusOut } = await execFile("git", ["status", "--porcelain"], { cwd: worktreeDir });
            hasChanges = statusOut.trim().length > 0;
            if (hasChanges) {
              await execFile("git", ["add", "-A"], { cwd: worktreeDir });
              await execFile("git", ["commit", "--no-verify", "-m", `feat(run/${runId}): ${body.task.slice(0, 72)}`], { cwd: worktreeDir });
              logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_commit", target: branchName, outcome: "success" });
              send({ type: "committed", hasChanges: true, branch: branchName });
            } else {
              send({ type: "committed", hasChanges: false, branch: branchName });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", error: `Commit failed: ${msg}` });
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
            send({ type: "ready_to_merge", branch: branchName, filesChanged });
          }

          // Remove worktree but keep branch — user triggers merge via POST /api/run/runs/:id/merge
          try {
            await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: ctx.projectDir });
            logAgentAction(ctx.dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_remove", target: branchName, outcome: "success" });
          } catch {}

          // Update run status in DB -- persist cost + session ID for resume
          try {
            const db = getDb(ctx.dataDir);
            db.prepare(
              `UPDATE runs SET status = ?, ended_at = ?, cost_usd = ?,
               claude_session_id = ?, duration_api_ms = ? WHERE id = ?`
            ).run("complete", Date.now(), runCostUsd, capturedSessionId, 0, runId);
          } catch { /* non-fatal */ }

          send({ type: "complete", hasChanges, mode: "build", runId });
          activeRun = false;
          controller.close();
        }

        run()
          .catch((err) => {
            try { getDb(ctx.dataDir).prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run("error", Date.now(), runId); } catch {}
            send({ type: "error", error: err instanceof Error ? err.message : String(err) });
            try { controller.close(); } catch {}
          })
          .finally(() => {
            activeProc = null;
            activeRun = false;
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

  return app;
}

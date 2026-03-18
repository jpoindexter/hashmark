/**
 * /api/company — multi-agent "software company" orchestrator
 * Decomposes tasks into subtasks, runs Claude agents in parallel git worktrees,
 * then merges results back.
 */

import { Hono } from "hono";
import { spawn, execFile as execFileCb } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { tmpdir } from "os";

const execFile = promisify(execFileCb);

const MAX_WORKERS = 4;

interface Subtask {
  id: number;
  title: string;
  description: string;
  agentType: "frontend" | "backend" | "testing" | "analysis";
}

// Track active runs
let activeRun = false;

function findClaudeBin(projectDir: string): string {
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

export function companyRoutes(projectDir: string) {
  const app = new Hono();

  // GET /api/company/status
  app.get("/status", (c) => {
    return c.json({ active: activeRun });
  });

  // POST /api/company/plan — decompose a task into subtasks
  app.post("/plan", async (c) => {
    const body = await c.req.json<{ task: string }>();
    const claudeBin = findClaudeBin(projectDir);

    const prompt = `You are a software project manager. Decompose this task into 2-4 concrete subtasks that can be worked on in parallel by different developers. Each subtask should be independent and not depend on the others.

Task: ${body.task}

Respond with ONLY a JSON array, no markdown, no explanation. Each item must have these fields:
- "id": number (1-based)
- "title": short title (under 50 chars)
- "description": detailed description of what to implement
- "agentType": one of "frontend", "backend", "testing", "analysis"

Example format:
[{"id":1,"title":"Setup database schema","description":"Create the database...","agentType":"backend"}]`;

    try {
      const { stdout } = await execFile(claudeBin, ["--print", prompt], {
        cwd: projectDir,
        env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
        maxBuffer: 1024 * 1024,
      });

      // Extract JSON array from output (claude may wrap in markdown)
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return c.json({ error: "Failed to parse plan from Claude output", raw: stdout }, 500);
      }

      const plan = JSON.parse(jsonMatch[0]) as Subtask[];
      return c.json({ plan });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // POST /api/company/run — run all subtasks in parallel, stream results
  app.post("/run", async (c) => {
    const body = await c.req.json<{ task: string; plan: Subtask[] }>();
    const claudeBin = findClaudeBin(projectDir);
    const runId = randomUUID().slice(0, 8);
    const plan = body.plan.slice(0, MAX_WORKERS);

    activeRun = true;

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        const worktreeDirs: Map<number, string> = new Map();

        async function runWorker(subtask: Subtask): Promise<{ id: number; output: string; hasChanges: boolean }> {
          const branchName = `studio-company-${runId}-${subtask.id}`;
          const worktreeDir = join(tmpdir(), branchName);
          worktreeDirs.set(subtask.id, worktreeDir);

          send({ type: "worker_start", id: subtask.id, title: subtask.title });

          // Create git worktree
          try {
            await execFile("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "worker_error", id: subtask.id, error: `Worktree creation failed: ${msg}` });
            throw err;
          }

          // Run claude in the worktree
          const workerPrompt = `Overall task: ${body.task}\n\nYour specific subtask: ${subtask.title}\n\n${subtask.description}`;

          return new Promise((resolve, reject) => {
            const proc = spawn(claudeBin, ["--print", workerPrompt], {
              cwd: worktreeDir,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
            });

            let fullOutput = "";

            proc.stdout.on("data", (chunk: Buffer) => {
              const text = chunk.toString();
              fullOutput += text;
              send({ type: "worker_chunk", id: subtask.id, text });
            });

            proc.stderr.on("data", () => {
              // Ignore stderr noise from claude CLI
            });

            proc.on("close", async (code: number | null) => {
              if (code !== 0 && code !== null) {
                send({ type: "worker_error", id: subtask.id, error: `Claude exited with code ${code}` });
                reject(new Error(`Claude exited with code ${code}`));
                return;
              }

              // Check if there are any changes to commit
              let hasChanges = false;
              try {
                const { stdout: statusOut } = await execFile("git", ["status", "--porcelain"], { cwd: worktreeDir });
                hasChanges = statusOut.trim().length > 0;
                if (hasChanges) {
                  await execFile("git", ["add", "-A"], { cwd: worktreeDir });
                  await execFile("git", ["commit", "-m", `feat: agent ${subtask.id} - ${subtask.title}`], { cwd: worktreeDir });
                }
              } catch {
                // No changes or commit failed
              }

              send({ type: "worker_done", id: subtask.id, output: fullOutput });
              resolve({ id: subtask.id, output: fullOutput, hasChanges });
            });

            proc.on("error", (err: Error) => {
              send({ type: "worker_error", id: subtask.id, error: err.message });
              reject(err);
            });
          });
        }

        async function orchestrate() {
          // Run all workers in parallel
          const results = await Promise.allSettled(plan.map(runWorker));

          // Merge phase
          send({ type: "phase", phase: "merging" });

          const merged: number[] = [];
          const conflicts: number[] = [];
          const skipped: number[] = [];

          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const subtask = plan[i];
            const branchName = `studio-company-${runId}-${subtask.id}`;

            if (result.status === "rejected") {
              conflicts.push(subtask.id);
              continue;
            }

            if (!result.value.hasChanges) {
              skipped.push(subtask.id);
              continue;
            }

            // Merge the branch
            try {
              await execFile("git", [
                "merge", branchName, "--no-ff",
                "-m", `feat: agent ${subtask.id} - ${subtask.title}`,
              ], { cwd: projectDir });
              merged.push(subtask.id);
            } catch {
              // Merge conflict — abort
              try {
                await execFile("git", ["merge", "--abort"], { cwd: projectDir });
              } catch {}
              conflicts.push(subtask.id);
            }
          }

          // Cleanup worktrees
          for (const subtask of plan) {
            const branchName = `studio-company-${runId}-${subtask.id}`;
            const worktreeDir = worktreeDirs.get(subtask.id);
            try {
              if (worktreeDir) {
                await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
              }
            } catch {}
            try {
              await execFile("git", ["branch", "-D", branchName], { cwd: projectDir });
            } catch {}
          }

          send({ type: "merge_result", merged, conflicts, skipped });
          send({ type: "complete", summary: `Merged: ${merged.length}, Conflicts: ${conflicts.length}, Skipped: ${skipped.length}` });

          activeRun = false;
          controller.close();
        }

        orchestrate().catch((err) => {
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
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

  return app;
}

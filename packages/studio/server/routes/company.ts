/**
 * /api/company — multi-agent swarm orchestrator
 * Decomposes tasks into subtasks, runs agents in parallel git worktrees,
 * injecting each agent's definition as system context, then merges results.
 */

import { Hono } from "hono";
import { spawn, execFile as execFileCb } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { tmpdir } from "os";

const execFile = promisify(execFileCb);

const MAX_WORKERS = 5;

// ─── Agent loading ────────────────────────────────────────────────────────────

interface AgentDef {
  id: string;
  name: string;
  description: string;
  content: string;
}

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subtask {
  id: number;
  title: string;
  description: string;
  agentId: string;          // matches AgentDef.id; "general" = no specific agent
}

let activeRun = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Routes ───────────────────────────────────────────────────────────────────

export function companyRoutes(projectDir: string) {
  const app = new Hono();

  // GET /api/company/status
  app.get("/status", (c) => {
    return c.json({ active: activeRun });
  });

  // GET /api/company/agents — list available agents for the UI
  app.get("/agents", (c) => {
    const agents = loadAgents(projectDir).map(({ id, name, description }) => ({ id, name, description }));
    return c.json({ agents });
  });

  // POST /api/company/plan — use Claude to decompose task + assign to available agents
  app.post("/plan", async (c) => {
    const body = await c.req.json<{ task: string }>();
    const claudeBin = findClaudeBin(projectDir);
    const agents = loadAgents(projectDir);

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

    try {
      const { stdout } = await execFile(claudeBin, ["--print", prompt], {
        cwd: projectDir,
        env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
        maxBuffer: 1024 * 1024,
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
    const body = await c.req.json<{ task: string; plan: Subtask[] }>();
    const claudeBin = findClaudeBin(projectDir);
    const runId = randomUUID().slice(0, 8);
    const plan = body.plan.slice(0, MAX_WORKERS);
    const agents = loadAgents(projectDir);
    const agentMap = new Map(agents.map(a => [a.id, a]));

    activeRun = true;

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        const worktreeDirs = new Map<number, string>();

        async function runWorker(subtask: Subtask): Promise<{ id: number; output: string; hasChanges: boolean }> {
          const branchName = `studio-swarm-${runId}-${subtask.id}`;
          const worktreeDir = join(tmpdir(), branchName);
          worktreeDirs.set(subtask.id, worktreeDir);

          send({ type: "worker_start", id: subtask.id, title: subtask.title, agentId: subtask.agentId });

          try {
            await execFile("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "worker_error", id: subtask.id, error: `Worktree failed: ${msg}` });
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

            proc.stderr.on("data", () => {});

            proc.on("close", async (code: number | null) => {
              if (code !== 0 && code !== null) {
                send({ type: "worker_error", id: subtask.id, error: `Exit code ${code}` });
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
                }
              } catch {}

              send({ type: "worker_done", id: subtask.id, output: fullOutput, hasChanges });
              resolve({ id: subtask.id, output: fullOutput, hasChanges });
            });

            proc.on("error", (err: Error) => {
              send({ type: "worker_error", id: subtask.id, error: err.message });
              reject(err);
            });
          });
        }

        async function orchestrate() {
          const results = await Promise.allSettled(plan.map(runWorker));

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
              ], { cwd: projectDir });
              merged.push(subtask.id);
            } catch {
              try { await execFile("git", ["merge", "--abort"], { cwd: projectDir }); } catch {}
              conflicts.push(subtask.id);
            }
          }

          // Cleanup
          for (const subtask of plan) {
            const branchName = `studio-swarm-${runId}-${subtask.id}`;
            const worktreeDir = worktreeDirs.get(subtask.id);
            try {
              if (worktreeDir) await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
            } catch {}
            try { await execFile("git", ["branch", "-D", branchName], { cwd: projectDir }); } catch {}
          }

          send({ type: "merge_result", merged, conflicts, skipped });
          send({ type: "complete" });

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

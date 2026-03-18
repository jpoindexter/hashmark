/**
 * /api/run — single-agent run orchestrator
 * Spawns one claude process in a git worktree, streams output as SSE,
 * auto-commits changes, merges back to main, cleans up.
 */

import { Hono } from "hono";
import { spawn, execFile as execFileCb } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { tmpdir } from "os";
import { logAgentAction, parseActionsFromOutput } from "../lib/action-log.js";

const execFile = promisify(execFileCb);

// ─── Agent loading (same as company.ts) ───────────────────────────────────────

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

let activeRun = false;

export function runRoutes(projectDir: string) {
  const app = new Hono();
  const dataDir = `${projectDir}/.hashmark`;

  app.get("/status", (c) => c.json({ active: activeRun }));

  // POST /api/run — start a single-agent run, returns SSE stream
  app.post("/", async (c) => {
    if (activeRun) {
      return c.json({ error: "A run is already in progress" }, 409);
    }

    const body = await c.req.json<{ task: string; agentId?: string; mode?: "plan" | "build" }>();
    if (!body.task?.trim()) {
      return c.json({ error: "task is required" }, 400);
    }
    const mode = body.mode === "plan" ? "plan" : "build";

    const claudeBin = findClaudeBin(projectDir);
    const runId = randomUUID().slice(0, 8);
    const agents = loadAgents(projectDir);
    const agentMap = new Map(agents.map((a) => [a.id, a]));

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

          // Create worktree
          try {
            await execFile("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir,
            });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
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
          let fullOutput = "";
          await new Promise<void>((resolve) => {
            const proc = spawn(claudeBin, ["--print", prompt], {
              cwd: worktreeDir,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
            });

            proc.stdout.on("data", (chunk: Buffer) => {
              const text = chunk.toString();
              fullOutput += text;
              send({ type: "chunk", text });
            });

            proc.stderr.on("data", () => {});

            proc.on("close", (code: number | null) => {
              if (code !== 0 && code !== null) {
                send({ type: "error", error: `Claude exited with code ${code}` });
              }
              resolve();
            });

            proc.on("error", (err: Error) => {
              send({ type: "error", error: err.message });
              resolve();
            });
          });

          // In plan mode, skip commit + merge entirely
          let hasChanges = false;
          if (mode === "plan") {
            send({ type: "complete", hasChanges: false, mode: "plan" });
            activeRun = false;
            controller.close();
            // Cleanup worktree
            try { await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir }); } catch {}
            try { await execFile("git", ["branch", "-D", branchName], { cwd: projectDir }); } catch {}
            return;
          }

          // Parse and log file write / bash events from agent output
          const actionEvents = parseActionsFromOutput(fullOutput, runId, body.agentId ?? "general");
          for (const ev of actionEvents) logAgentAction(dataDir, ev);

          // Commit if there are changes
          try {
            const { stdout: statusOut } = await execFile("git", ["status", "--porcelain"], { cwd: worktreeDir });
            hasChanges = statusOut.trim().length > 0;
            if (hasChanges) {
              await execFile("git", ["add", "-A"], { cwd: worktreeDir });
              await execFile("git", ["commit", "-m", `feat(run/${runId}): ${body.task.slice(0, 72)}`], { cwd: worktreeDir });
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_commit", target: branchName, outcome: "success" });
              send({ type: "committed", hasChanges: true, branch: branchName });
            } else {
              send({ type: "committed", hasChanges: false, branch: branchName });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", error: `Commit failed: ${msg}` });
          }

          // Merge back to main branch
          if (hasChanges) {
            try {
              await execFile("git", [
                "merge", branchName, "--no-ff",
                "-m", `feat(run): merge ${branchName}`,
              ], { cwd: projectDir });
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_merge", target: branchName, outcome: "success" });
              send({ type: "merged" });
            } catch {
              try { await execFile("git", ["merge", "--abort"], { cwd: projectDir }); } catch {}
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_merge", target: branchName, outcome: "failure", detail: "merge conflict" });
              send({ type: "merge_conflict", branch: branchName });
            }
          }

          // Cleanup worktree + branch (skip if conflict — branch preserved intentionally)
          try {
            await execFile("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_remove", target: branchName, outcome: "success" });
          } catch {}

          if (hasChanges) {
            // Only delete branch if merge succeeded (no conflict)
            try {
              await execFile("git", ["branch", "-d", branchName], { cwd: projectDir });
            } catch {}
          }

          send({ type: "complete", hasChanges, mode: "build" });
          activeRun = false;
          controller.close();
        }

        run().catch((err) => {
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

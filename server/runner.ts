/**
 * Task Runner
 *
 * Spawns `claude --print` processes, captures output, streams via SSE.
 * No API key required — reuses the local claude CLI's existing auth.
 */

import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getDb, getStudioSetting } from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus = "pending" | "running" | "done" | "failed" | "killed";

export interface Task {
  id: string;
  agentId: string | null;
  agentName: string;
  agentDept: string;
  prompt: string;
  status: TaskStatus;
  output: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
}

type SSEListener = (chunk: string) => void;

// ---------------------------------------------------------------------------
// TaskStore — in-memory, with SSE subscriber map
// ---------------------------------------------------------------------------

class TaskStore {
  private tasks = new Map<string, Task>();
  private processes = new Map<string, ChildProcess>();
  private listeners = new Map<string, Set<SSEListener>>();

  create(agentId: string | null, agentName: string, agentDept: string, prompt: string): Task {
    const task: Task = {
      id: randomUUID(),
      agentId,
      agentName,
      agentDept,
      prompt,
      status: "pending",
      output: "",
      createdAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  list(): Task[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  update(id: string, patch: Partial<Task>) {
    const task = this.tasks.get(id);
    if (!task) return;
    Object.assign(task, patch);
  }

  append(id: string, text: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    task.output += text;
    this.emit(id, text);
  }

  subscribe(id: string, fn: SSEListener) {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(fn);
    return () => this.listeners.get(id)?.delete(fn);
  }

  private emit(id: string, chunk: string) {
    this.listeners.get(id)?.forEach((fn) => fn(chunk));
  }

  setProcess(id: string, proc: ChildProcess) {
    this.processes.set(id, proc);
  }

  killProcess(id: string) {
    const proc = this.processes.get(id);
    if (proc && !proc.killed) {
      proc.kill("SIGTERM");
      return true;
    }
    return false;
  }
}

export const taskStore = new TaskStore();

// ---------------------------------------------------------------------------
// Runner — spawns claude and streams output
// ---------------------------------------------------------------------------

function buildPrompt(agentContent: string, userPrompt: string, agentName: string): string {
  // Strip YAML frontmatter from agent .md to get the body
  const body = agentContent.replace(/^---[\s\S]*?---\n?/, "").trim();
  return `${body}\n\n---\n\nTask: ${userPrompt}`;
}

export function runTask(
  projectDir: string,
  taskId: string,
  agentContent: string | null,
  agentName: string,
) {
  const task = taskStore.get(taskId);
  if (!task) return;

  const fullPrompt = agentContent
    ? buildPrompt(agentContent, task.prompt, agentName)
    : task.prompt;

  taskStore.update(taskId, { status: "running", startedAt: Date.now() });
  taskStore.append(taskId, `> Running task with agent: ${agentName}\n> ${new Date().toLocaleTimeString()}\n\n`);

  // Find claude binary
  const candidates = [
    join(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude",
  ];
  const claudeBin = candidates.find((p) => {
    try { return !p.includes("node_modules") ? existsSync(p) : existsSync(p); } catch { return false; }
  }) ?? "claude";

  const dataDir = join(projectDir, ".hashmark");
  const skipPerms = getStudioSetting(getDb(dataDir), "dangerousSkipPermissions", "false") === "true";
  const taskEnv: Record<string, string> = { ...process.env as Record<string, string> };
  if (skipPerms) taskEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";

  const proc = spawn(claudeBin, ["--print", fullPrompt], {
    cwd: projectDir,
    env: taskEnv,
  });

  taskStore.setProcess(taskId, proc);

  proc.stdout.on("data", (chunk: Buffer) => {
    taskStore.append(taskId, chunk.toString());
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    taskStore.append(taskId, text);
  });

  proc.on("close", (code: number | null) => {
    const killed = code === null || code === 130 || code === 143;
    taskStore.update(taskId, {
      status: killed ? "killed" : code === 0 ? "done" : "failed",
      endedAt: Date.now(),
      exitCode: code ?? -1,
    });
    taskStore.append(taskId, `\n\n> Exit code: ${code ?? "killed"}`);
  });

  proc.on("error", (err: Error) => {
    taskStore.append(taskId, `\n> Error: ${err.message}\n> Make sure 'claude' CLI is installed and authenticated.\n`);
    taskStore.update(taskId, { status: "failed", endedAt: Date.now() });
  });
}

// ---------------------------------------------------------------------------
// Load agent content from disk
// ---------------------------------------------------------------------------

export function loadAgentContent(projectDir: string, agentPath: string): string | null {
  try {
    const fullPath = join(projectDir, ".claude", "agents", agentPath);
    if (existsSync(fullPath)) return readFileSync(fullPath, "utf-8");
  } catch {}
  return null;
}

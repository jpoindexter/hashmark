import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

export interface ToolResult { content: string; isError: boolean; }

export const TOOL_SCHEMAS = [
  {
    name: "bash",
    description: "Execute a bash command in the project directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The bash command to execute in the project directory" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 30000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read",
    description: "Read a file. Returns line-numbered content.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute or project-relative path to the file to read" },
        offset: { type: "number", description: "Line number to start reading from (0-based, default 0)" },
        limit: { type: "number", description: "Maximum number of lines to read (default 2000)" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write",
    description: "Write content to a file. Creates directories as needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Full file content to write" },
        file_path: { type: "string", description: "Absolute or project-relative path to the file" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "edit",
    description: "Edit a file by replacing an exact string with new content.",
    input_schema: {
      type: "object" as const,
      properties: {
        old_string: { type: "string", description: "Exact text to find and replace (must be unique in the file)" },
        new_string: { type: "string", description: "Replacement text" },
        file_path: { type: "string", description: "Absolute or project-relative path to the file" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a pattern.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Glob pattern to match filenames (e.g. '**/*.ts')" },
        path: { type: "string", description: "Directory to search in (defaults to project root)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents with a regex pattern.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for in file contents" },
        path: { type: "string", description: "File or directory to search (defaults to project root)" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "spawn_agent",
    description: "Create a new agent session and start it with a message. Returns the session_id so you can reference or track it. Use this to delegate sub-tasks to parallel agents.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "The initial task message to send to the new agent." },
        title: { type: "string", description: "Session title (shown in the tab bar). Defaults to first 50 chars of message." },
        system_prompt: { type: "string", description: "Optional system prompt to configure the agent's behavior and role." },
      },
      required: ["message"],
    },
  },
  {
    name: "update_plan",
    description: "Update the visible task plan for this session. Call this at the start of work to set tasks, and after completing each task to mark it done. The user sees this checklist live in the chat UI.",
    input_schema: {
      type: "object" as const,
      properties: {
        tasks: {
          type: "array",
          description: "Full list of tasks for the current plan. Each call replaces the entire plan.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique task identifier (e.g. 't1', 't2')" },
              title: { type: "string", description: "Task description shown to the user" },
              done: { type: "boolean", description: "Whether this task is complete" },
            },
            required: ["id", "title", "done"],
          },
        },
      },
      required: ["tasks"],
    },
  },
] as const;

export type ToolName = typeof TOOL_SCHEMAS[number]["name"];

export function toOpenAITools(schemas = TOOL_SCHEMAS) {
  return schemas.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}
export function toGeminiTools(schemas = TOOL_SCHEMAS) {
  return [{ functionDeclarations: schemas.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
}

export function needsApproval(name: string): boolean {
  return name === "bash" || name === "write" || name === "edit";
}

const TOOL_LIMITS: Record<string, number> = {
  read: 50_000,
  bash: 30_000,
  grep: 20_000,
  glob: 10_000,
};

function truncate(content: string, tool: string): string {
  const max = TOOL_LIMITS[tool] ?? 30_000;
  if (content.length <= max) return content;
  const half = Math.floor(max / 2);
  return content.slice(0, half) + `\n\n…[${content.length - max} chars truncated]…\n\n` + content.slice(-half);
}

export async function executeTool(name: string, input: Record<string, unknown>, projectDir: string): Promise<ToolResult> {
  try {
    switch (name) {
      case "bash":         return await execBash(input, projectDir);
      case "read":         return execRead(input, projectDir);
      case "write":        return execWrite(input, projectDir);
      case "edit":         return execEdit(input, projectDir);
      case "glob":         return await execGlob(input, projectDir);
      case "grep":         return await execGrep(input, projectDir);
      case "spawn_agent":  return await execSpawnAgent(input, projectDir);
      case "update_plan": {
        const tasks = (input.tasks ?? []) as Array<{id: string; title: string; done: boolean}>;
        return { content: JSON.stringify({ updated: true, tasks }), isError: false };
      }
      default: return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}

function resolvePath(p: string, projectDir: string): string | null {
  if (!p) return null;
  const resolved = p.startsWith("/") ? resolve(p) : resolve(projectDir, p);
  const dir = projectDir.endsWith("/") ? projectDir : projectDir + "/";
  if (!resolved.startsWith(dir) && resolved !== projectDir && !resolved.startsWith("/tmp/") && resolved !== "/tmp") return null;
  return resolved;
}

async function execBash(input: Record<string, unknown>, projectDir: string): Promise<ToolResult> {
  const command = String(input.command ?? "");
  if (!command) return { content: "No command provided", isError: true };
  const timeout = Number(input.timeout) || 30000;
  return new Promise((res) => {
    let out = "", err = "";
    const proc = spawn("sh", ["-c", command], { cwd: projectDir, timeout, env: { ...process.env } });
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    proc.on("close", (code) => {
      const raw = out + (err ? `\nSTDERR:\n${err}` : "");
      const content = truncate(raw || `(exit code ${code})`, "bash");
      res({ content, isError: code !== 0 });
    });
    proc.on("error", (e) => res({ content: e.message, isError: true }));
  });
}

function execRead(input: Record<string, unknown>, projectDir: string): ToolResult {
  const p = resolvePath(String(input.file_path ?? ""), projectDir);
  if (!p) return { content: "Invalid path", isError: true };
  if (!existsSync(p)) return { content: `Not found: ${p}`, isError: true };
  const lines = readFileSync(p, "utf-8").split("\n");
  const offset = Number(input.offset) || 0;
  const limit = Number(input.limit) || 2000;
  const raw = lines.slice(offset, offset + limit).map((l, i) => `${offset + i + 1}\t${l}`).join("\n");
  return { content: truncate(raw, "read"), isError: false };
}

function execWrite(input: Record<string, unknown>, projectDir: string): ToolResult {
  const p = resolvePath(String(input.file_path ?? ""), projectDir);
  if (!p) return { content: "Invalid path", isError: true };
  const content = String(input.content ?? "");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf-8");
  return { content: `Wrote ${content.length} bytes to ${p}`, isError: false };
}

function execEdit(input: Record<string, unknown>, projectDir: string): ToolResult {
  const p = resolvePath(String(input.file_path ?? ""), projectDir);
  if (!p) return { content: "Invalid path", isError: true };
  if (!existsSync(p)) return { content: `Not found: ${p}`, isError: true };
  const old = String(input.old_string ?? "");
  const next = String(input.new_string ?? "");
  if (!old) return { content: "old_string required", isError: true };
  const src = readFileSync(p, "utf-8");
  const occurrences = src.split(old).length - 1;
  if (occurrences === 0) return { content: `old_string not found in ${p}`, isError: true };
  if (occurrences > 1) return { content: `old_string is not unique in ${p} — found ${occurrences} occurrences. Provide more context to make it unique.`, isError: true };
  writeFileSync(p, src.replace(old, next), "utf-8");
  return { content: `Edited ${p}`, isError: false };
}

async function execGlob(input: Record<string, unknown>, projectDir: string): Promise<ToolResult> {
  const pattern = String(input.pattern ?? "");
  if (!pattern) return { content: "No pattern", isError: true };
  const searchDir = String(input.path || projectDir);
  return new Promise((res) => {
    const proc = spawn("rg", ["--files", "-g", pattern, "-g", "!node_modules", "-g", "!.git", "-g", "!dist", searchDir], { timeout: 10000 });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      const lines = out.trim().split("\n").filter(Boolean).slice(0, 200);
      res({ content: lines.join("\n") || "(no matches)", isError: false });
    });
    proc.on("error", () => res({ content: "ripgrep not found — install with: brew install ripgrep", isError: true }));
  });
}

async function execGrep(input: Record<string, unknown>, projectDir: string): Promise<ToolResult> {
  const pattern = String(input.pattern ?? "");
  if (!pattern) return { content: "No pattern", isError: true };
  const searchPath = String(input.path || projectDir);
  return new Promise((res) => {
    const proc = spawn("rg", ["--color=never", "-n", "--max-count=50", pattern, searchPath,
      "--glob=!node_modules", "--glob=!.git", "--glob=!dist",
    ], { cwd: projectDir, timeout: 10000 });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => res({ content: truncate(out || "(no matches)", "grep"), isError: false }));
    proc.on("error", () => res({ content: "ripgrep not found — install with: brew install ripgrep", isError: true }));
  });
}

async function execSpawnAgent(input: Record<string, unknown>, projectDir: string): Promise<ToolResult> {
  const message = String(input.message ?? "").trim();
  if (!message) return { content: "message required", isError: true };
  const title = String(input.title ?? message.slice(0, 50));
  const system_prompt = input.system_prompt ? String(input.system_prompt) : undefined;

  const tokenPath = resolve(projectDir, ".hashmark/studio.token");
  let token = "";
  try { token = readFileSync(tokenPath, "utf-8").trim(); } catch { /* no token file */ }

  const port = process.env.HASHMARK_PORT ?? "3200";
  const base = `http://localhost:${port}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  let sessionId: string;
  try {
    const createRes = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title, system_prompt, project_dir: projectDir }),
    });
    if (!createRes.ok) return { content: `Session create failed: ${createRes.status}`, isError: true };
    const created = await createRes.json() as { id: string };
    sessionId = created.id;
  } catch (err) {
    return { content: `Failed to reach local API: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }

  // Fire-and-forget: enqueue the initial message without waiting for SSE completion
  fetch(`${base}/api/sessions/${sessionId}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  }).catch(() => {});

  return { content: JSON.stringify({ session_id: sessionId, url: `/api/sessions/${sessionId}` }), isError: false };
}

/**
 * Tool execution engine.
 * Executes tools server-side when Claude returns tool_use blocks.
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, resolve, join, relative } from "path";

export interface ToolResult {
  content: string;
  isError: boolean;
}

interface ExecOpts {
  projectDir: string;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  opts: ExecOpts,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "bash": return await execBash(input, opts);
      case "read": return execRead(input, opts);
      case "write": return execWrite(input, opts);
      case "edit": return execEdit(input, opts);
      case "glob": return await execGlob(input, opts);
      case "grep": return await execGrep(input, opts);
      default: return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}

/** Auto-approve reads and searches, require approval for writes and bash */
export function needsApproval(name: string): boolean {
  return name === "bash" || name === "write" || name === "edit";
}

// ── bash ──────────────────────────────────────────────────────────────────────

async function execBash(input: Record<string, unknown>, opts: ExecOpts): Promise<ToolResult> {
  const command = String(input.command ?? "");
  if (!command) return { content: "No command provided", isError: true };

  const timeout = Number(input.timeout) || 30000;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn("sh", ["-c", command], {
      cwd: opts.projectDir,
      timeout,
      env: { ...process.env, HOME: process.env.HOME ?? "" },
    });

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      const output = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")).slice(0, 50000);
      resolve({ content: output || `(exit code ${code})`, isError: code !== 0 });
    });

    proc.on("error", (err) => {
      resolve({ content: err.message, isError: true });
    });
  });
}

// ── read ──────────────────────────────────────────────────────────────────────

function execRead(input: Record<string, unknown>, opts: ExecOpts): ToolResult {
  const filePath = resolvePath(String(input.file_path ?? ""), opts.projectDir);
  if (!filePath) return { content: "Invalid file path", isError: true };
  if (!existsSync(filePath)) return { content: `File not found: ${filePath}`, isError: true };

  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  const offset = Number(input.offset) || 0;
  const limit = Number(input.limit) || 2000;
  const slice = lines.slice(offset, offset + limit);

  const numbered = slice.map((line, i) => `${offset + i + 1}\t${line}`).join("\n");
  return { content: numbered, isError: false };
}

// ── write ─────────────────────────────────────────────────────────────────────

function execWrite(input: Record<string, unknown>, opts: ExecOpts): ToolResult {
  const filePath = resolvePath(String(input.file_path ?? ""), opts.projectDir);
  if (!filePath) return { content: "Invalid file path", isError: true };

  const content = String(input.content ?? "");
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  return { content: `Wrote ${content.length} bytes to ${filePath}`, isError: false };
}

// ── edit ──────────────────────────────────────────────────────────────────────

function execEdit(input: Record<string, unknown>, opts: ExecOpts): ToolResult {
  const filePath = resolvePath(String(input.file_path ?? ""), opts.projectDir);
  if (!filePath) return { content: "Invalid file path", isError: true };
  if (!existsSync(filePath)) return { content: `File not found: ${filePath}`, isError: true };

  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  if (!oldStr) return { content: "old_string is required", isError: true };

  const content = readFileSync(filePath, "utf-8");
  if (!content.includes(oldStr)) {
    return { content: `old_string not found in ${filePath}`, isError: true };
  }

  const updated = content.replace(oldStr, newStr);
  writeFileSync(filePath, updated, "utf-8");
  return { content: `Edited ${filePath}`, isError: false };
}

// ── glob ──────────────────────────────────────────────────────────────────────

async function execGlob(input: Record<string, unknown>, opts: ExecOpts): Promise<ToolResult> {
  const pattern = String(input.pattern ?? "");
  if (!pattern) return { content: "No pattern provided", isError: true };

  const cwd = String(input.path || opts.projectDir);

  // Use find + grep for glob-like matching (no dependency needed)
  return new Promise((resolve) => {
    const proc = spawn("find", [cwd, "-type", "f",
      "-not", "-path", "*/node_modules/*",
      "-not", "-path", "*/.git/*",
      "-not", "-path", "*/dist/*",
      "-name", pattern,
    ], { timeout: 10000 });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      const lines = out.trim().split("\n").filter(Boolean).slice(0, 200);
      resolve({ content: lines.join("\n") || "(no matches)", isError: false });
    });
    proc.on("error", (err) => resolve({ content: err.message, isError: true }));
  });
}

// ── grep ──────────────────────────────────────────────────────────────────────

async function execGrep(input: Record<string, unknown>, opts: ExecOpts): Promise<ToolResult> {
  const pattern = String(input.pattern ?? "");
  if (!pattern) return { content: "No pattern provided", isError: true };

  const searchPath = String(input.path || opts.projectDir);

  return new Promise((resolve) => {
    const args = [
      "--color=never", "-n", "--max-count=50",
      "-r", pattern, searchPath,
      "--glob=!node_modules", "--glob=!.git", "--glob=!dist",
    ];
    const proc = spawn("rg", args, { cwd: opts.projectDir, timeout: 10000 });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      resolve({ content: out.slice(0, 30000) || "(no matches)", isError: false });
    });
    proc.on("error", () => {
      // rg not installed, fall back to grep
      resolve({ content: "ripgrep (rg) not found", isError: true });
    });
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function resolvePath(p: string, projectDir: string): string | null {
  if (!p) return null;
  const resolved = p.startsWith("/") ? p : resolve(projectDir, p);
  // Prevent path traversal outside project
  if (!resolved.startsWith(projectDir) && !resolved.startsWith("/tmp")) return null;
  return resolved;
}

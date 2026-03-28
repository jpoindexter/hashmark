/**
 * Resolves binary paths for CLI tools like `claude`, `codex`, `gemini`.
 * Checks project-local node_modules first, then well-known global locations.
 */

import { existsSync } from "fs";
import { join } from "path";

export function findBin(name: string, projectDir: string): string {
  const candidates = [
    join(projectDir, "node_modules", ".bin", name),
    `/Applications/Conductor.app/Contents/Resources/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    name, // fallback to PATH
  ];
  return (
    candidates.find((p) => {
      try { return existsSync(p); } catch { return false; }
    }) ?? name
  );
}

export function findClaudeBin(projectDir: string): string {
  return findBin("claude", projectDir);
}

// Default tools agents are allowed to use without interactive permission prompts.
// This replaces CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS with explicit tool approval.
const DEFAULT_ALLOWED_TOOLS = [
  "Edit", "Write", "Read", "Bash", "Glob", "Grep",
  "WebFetch", "WebSearch",
];

export function buildClaudeArgs(
  prompt: string,
  opts?: { resume?: string; outputFormat?: string; allowedTools?: string[] },
): string[] {
  const args: string[] = ["--print", prompt];
  const tools = opts?.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
  if (tools.length > 0) args.push("--allowedTools", tools.join(","));
  if (opts?.outputFormat) args.push("--output-format", opts.outputFormat);
  if (opts?.resume) args.push("--resume", opts.resume);
  return args;
}

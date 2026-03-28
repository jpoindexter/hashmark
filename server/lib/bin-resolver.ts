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

// Scoped tool sets -- agents only get what they need.
// "Hashmark never requests more permissions than each agent needs."
export const TOOL_PRESETS = {
  // Read-only: scanning, reviewing, analyzing
  readonly: ["Read", "Glob", "Grep"],
  // Standard: can read + write files, no shell
  standard: ["Read", "Write", "Edit", "Glob", "Grep"],
  // Full: can also run shell commands and fetch web
  full: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"],
  // Plan mode: read-only, no mutations
  plan: ["Read", "Glob", "Grep", "WebFetch", "WebSearch"],
} as const;

export function buildClaudeArgs(
  prompt: string,
  opts?: {
    resume?: string;
    outputFormat?: string;
    allowedTools?: string[];
    mode?: "plan" | "build";
  },
): string[] {
  const args: string[] = ["--print", prompt];

  // Priority: explicit tools > mode-based preset > standard default
  let tools: readonly string[];
  if (opts?.allowedTools && opts.allowedTools.length > 0) {
    tools = opts.allowedTools;
  } else if (opts?.mode === "plan") {
    tools = TOOL_PRESETS.plan;
  } else {
    tools = TOOL_PRESETS.full;
  }

  args.push("--allowedTools", tools.join(","));
  if (opts?.outputFormat) args.push("--output-format", opts.outputFormat);
  if (opts?.resume) args.push("--resume", opts.resume);
  return args;
}

/**
 * Permission modes for Claude agent execution.
 * 5-level cascade matching Claude Code's own permission system.
 *
 * Replaces the binary dangerousSkipPermissions toggle with granular control.
 * The old toggle maps to "bypass" mode; the new default is "auto".
 */

import type Database from "better-sqlite3";
import { getStudioSetting, setStudioSetting } from "../db.js";

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "auto"
  | "bypass";

const VALID_MODES: ReadonlySet<string> = new Set([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypass",
]);

export function isValidPermissionMode(v: unknown): v is PermissionMode {
  return typeof v === "string" && VALID_MODES.has(v);
}

export const PERMISSION_MODES = {
  default: {
    label: "Default",
    description: "Ask before each tool use",
    allowedTools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    cliFlags: [] as string[],
  },
  acceptEdits: {
    label: "Accept Edits",
    description: "Auto-approve file changes, ask for shell commands",
    allowedTools: [
      "Read", "Write", "Edit", "Glob", "Grep",
      "WebSearch", "WebFetch", "Agent",
    ],
    cliFlags: [] as string[],
  },
  plan: {
    label: "Plan Only",
    description: "Read-only analysis, no mutations",
    allowedTools: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    cliFlags: ["--permission-mode", "plan"],
  },
  auto: {
    label: "Auto",
    description: "Full tool access, no permission prompts",
    allowedTools: [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "WebSearch", "WebFetch", "Agent",
    ],
    cliFlags: [] as string[],
  },
  bypass: {
    label: "Dangerous: Bypass All",
    description: "Skip all permission checks (CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS)",
    allowedTools: [
      "Read", "Write", "Edit", "Bash", "Glob", "Grep",
      "WebSearch", "WebFetch", "Agent",
    ],
    cliFlags: [] as string[],
    envFlag: "CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS" as const,
  },
} as const;

/**
 * Read the current permission mode from studio_settings.
 * Falls back to "auto" -- the previous default behavior.
 */
export function getPermissionMode(db: Database.Database): PermissionMode {
  const raw = getStudioSetting(db, "permissionMode", "auto");
  return isValidPermissionMode(raw) ? raw : "auto";
}

/**
 * Persist the permission mode. Also keeps the legacy dangerousSkipPermissions
 * flag in sync so older code paths that haven't been migrated yet still work.
 */
export function setPermissionMode(
  db: Database.Database,
  mode: PermissionMode,
): void {
  setStudioSetting(db, "permissionMode", mode);
  // Keep legacy flag in sync: only "bypass" sets it to "true"
  setStudioSetting(
    db,
    "dangerousSkipPermissions",
    mode === "bypass" ? "true" : "false",
  );
}

export interface PermissionArgs {
  allowedTools: string[];
  cliFlags: string[];
  env: Record<string, string>;
}

/**
 * Build the concrete tools list, CLI flags, and env vars for a given mode.
 *
 * If `agentTools` is provided (from the agent's YAML frontmatter), those
 * tools intersect with the mode's allowed set -- the agent never gets more
 * tools than the mode permits.
 */
export function buildArgsForMode(
  mode: PermissionMode,
  agentTools?: string[],
): PermissionArgs {
  const modeDef = PERMISSION_MODES[mode];

  // Start with the mode's tool set
  let tools: string[] = [...modeDef.allowedTools];

  // If the agent declares its own tools, intersect with mode's allowed set
  if (agentTools && agentTools.length > 0) {
    const allowed: Set<string> = new Set(modeDef.allowedTools);
    tools = agentTools.filter((t) => allowed.has(t));
    // If intersection is empty, fall back to mode defaults
    if (tools.length === 0) tools = [...modeDef.allowedTools];
  }

  const cliFlags = [...modeDef.cliFlags];
  const env: Record<string, string> = {};

  // Only bypass mode sets the dangerous env flag
  if (mode === "bypass") {
    env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";
  }

  return { allowedTools: tools, cliFlags, env };
}

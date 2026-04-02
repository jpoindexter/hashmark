/**
 * Tool plugin system -- lets users define custom tools as JSON files
 * in .hashmark/tools/*.json that get injected into Claude's prompt context.
 *
 * Inspired by OpenCode's plugin/tool registry pattern, simplified for
 * hashmark's architecture: JSON definitions + shell command execution.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync } from "fs";
import { join, extname, basename } from "path";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

export interface ToolPlugin {
  name: string;
  description: string;
  command: string;
  requiresApproval: boolean;
  timeout: number;
  parseOutput?: "text" | "json";
}

/**
 * Scan .hashmark/tools/ for JSON tool definitions.
 * Each file should contain a single ToolPlugin object.
 * Invalid files are silently skipped.
 */
export function loadToolPlugins(projectDir: string): ToolPlugin[] {
  const toolsDir = join(projectDir, ".hashmark", "tools");
  if (!existsSync(toolsDir)) return [];

  const plugins: ToolPlugin[] = [];

  let entries: string[];
  try {
    entries = readdirSync(toolsDir).filter((f) => extname(f) === ".json");
  } catch {
    return [];
  }

  for (const file of entries) {
    const fullPath = join(toolsDir, file);
    try {
      const raw = readFileSync(fullPath, "utf-8");
      const parsed = JSON.parse(raw);
      const plugin = validatePlugin(parsed, file);
      if (plugin) plugins.push(plugin);
    } catch {
      // Skip malformed files
    }
  }

  return plugins;
}

/**
 * Validate and normalize a parsed JSON object into a ToolPlugin.
 * Returns null if the object is invalid.
 */
function validatePlugin(obj: unknown, filename: string): ToolPlugin | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const raw = obj as Record<string, unknown>;

  // name: required, or infer from filename
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : basename(filename, ".json");

  // description: required
  if (typeof raw.description !== "string" || !raw.description.trim()) return null;

  // command: required
  if (typeof raw.command !== "string" || !raw.command.trim()) return null;

  return {
    name,
    description: raw.description.trim(),
    command: raw.command.trim(),
    requiresApproval:
      typeof raw.requiresApproval === "boolean" ? raw.requiresApproval : true,
    timeout:
      typeof raw.timeout === "number" && raw.timeout > 0
        ? Math.min(raw.timeout, 600_000) // cap at 10 min
        : 60_000,
    parseOutput:
      raw.parseOutput === "json" ? "json" : "text",
  };
}

/**
 * Execute a tool plugin's command in the project directory.
 * Returns the command's stdout. Throws on failure.
 */
export async function executeToolPlugin(
  plugin: ToolPlugin,
  projectDir: string,
): Promise<{ output: string; exitCode: number }> {
  // Split command into binary + args for execFile (no shell injection)
  const parts = plugin.command.split(/\s+/);
  const bin = parts[0];
  const args = parts.slice(1);

  if (!bin) throw new Error(`Tool "${plugin.name}" has an empty command`);

  const { stdout, stderr } = await execFile(bin, args, {
    cwd: projectDir,
    timeout: plugin.timeout,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env as Record<string, string> },
  });

  const output = stdout.trim() || stderr.trim();

  if (plugin.parseOutput === "json") {
    // Validate it's valid JSON but return as string
    try {
      JSON.parse(output);
    } catch {
      return { output: `Tool output was not valid JSON:\n${output}`, exitCode: 0 };
    }
  }

  return { output, exitCode: 0 };
}

/**
 * Build the prompt injection block for custom tools.
 * Claude sees this and knows to use Bash to run them.
 */
export function buildToolPluginPrompt(plugins: ToolPlugin[]): string {
  if (plugins.length === 0) return "";

  const lines = plugins.map((p) => {
    const approval = p.requiresApproval ? " (requires user approval)" : "";
    return `- ${p.name}: Run \`${p.command}\` -- ${p.description}${approval}`;
  });

  return [
    "",
    "CUSTOM TOOLS AVAILABLE:",
    "The following project-specific tools are available. Run them using Bash.",
    ...lines,
    "",
  ].join("\n");
}

/**
 * Ensure the .hashmark/tools/ directory exists.
 */
export function ensureToolsDir(projectDir: string): string {
  const toolsDir = join(projectDir, ".hashmark", "tools");
  if (!existsSync(toolsDir)) {
    mkdirSync(toolsDir, { recursive: true });
  }
  return toolsDir;
}

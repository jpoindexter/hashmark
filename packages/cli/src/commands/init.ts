import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import * as clack from "@clack/prompts";
import pc from "picocolors";

// ── types ─────────────────────────────────────────────────────────────────────

interface HashmarkConfig {
  projectName: string;
  language: string;
  formats: string[];
  watchByDefault: boolean;
  createdAt: string;
}

// ── .gitignore helpers ────────────────────────────────────────────────────────

function updateGitignore(projectDir: string): void {
  const gitignorePath = join(projectDir, ".gitignore");
  const entry = ".hashmark/";

  let content = "";
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(entry)) return; // already present
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${content}${separator}${entry}\n`, "utf-8");
}

// ── defaults ──────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { value: "TypeScript", label: "TypeScript" },
  { value: "JavaScript", label: "JavaScript" },
  { value: "Python", label: "Python" },
  { value: "Go", label: "Go" },
  { value: "Rust", label: "Rust" },
  { value: "Other", label: "Other" },
];

const FORMAT_OPTIONS = [
  { value: "CLAUDE.md", label: "CLAUDE.md", hint: "recommended" },
  { value: "AGENTS.md", label: "AGENTS.md", hint: "recommended" },
  { value: ".cursorrules", label: ".cursorrules" },
  { value: ".windsurfrules", label: ".windsurfrules" },
  { value: "openai-system-prompt", label: "openai-system-prompt" },
];

const DEFAULT_FORMATS = ["CLAUDE.md", "AGENTS.md"];

// ── next steps output ─────────────────────────────────────────────────────────

function printNextSteps(): void {
  console.log();
  console.log(pc.bold(pc.green("hashmark initialized!")));
  console.log();
  console.log("Next steps:");
  console.log(`  ${pc.cyan("hashmark scan")}          Generate CLAUDE.md and context files`);
  console.log(`  ${pc.cyan("hashmark watch")}         Auto-update on file changes`);
  console.log(`  ${pc.cyan("hashmark mcp")}           Start MCP server for IDE integration`);
  console.log(`  ${pc.cyan("hashmark doctor")}        Run health checks`);
  console.log();
  console.log(`Docs: ${pc.dim("https://hashmark.md/docs")}`);
  console.log();
}

// ── interactive flow ──────────────────────────────────────────────────────────

async function promptInteractive(projectDir: string): Promise<HashmarkConfig> {
  const defaultName = basename(projectDir);

  clack.intro(pc.bold("hashmark init"));

  const projectName = await clack.text({
    message: "Project name?",
    defaultValue: defaultName,
    placeholder: defaultName,
  });
  if (clack.isCancel(projectName)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  const language = await clack.select({
    message: "Main language/framework?",
    options: LANGUAGE_OPTIONS,
  });
  if (clack.isCancel(language)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  const formats = await clack.multiselect({
    message: "Which output formats?",
    options: FORMAT_OPTIONS,
    initialValues: DEFAULT_FORMATS,
    required: true,
  });
  if (clack.isCancel(formats)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  const watchByDefault = await clack.confirm({
    message: "Enable watch mode by default?",
    initialValue: false,
  });
  if (clack.isCancel(watchByDefault)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  return {
    projectName: projectName as string,
    language: language as string,
    formats: formats as string[],
    watchByDefault: watchByDefault as boolean,
    createdAt: new Date().toISOString(),
  };
}

// ── yes-mode defaults ─────────────────────────────────────────────────────────

function buildDefaults(projectDir: string): HashmarkConfig {
  return {
    projectName: basename(projectDir),
    language: "TypeScript",
    formats: DEFAULT_FORMATS,
    watchByDefault: false,
    createdAt: new Date().toISOString(),
  };
}

// ── main export ───────────────────────────────────────────────────────────────

export async function runInit(
  projectDir: string,
  opts: { yes?: boolean }
): Promise<void> {
  const hashmarkDir = join(projectDir, ".hashmark");
  const configPath = join(hashmarkDir, "config.json");

  // Check if already initialized
  if (existsSync(hashmarkDir)) {
    if (!opts.yes) {
      clack.intro(pc.bold("hashmark init"));
      const reInit = await clack.confirm({
        message: "hashmark is already initialized here. Re-initialize?",
        initialValue: false,
      });
      if (clack.isCancel(reInit) || !reInit) {
        if (!clack.isCancel(reInit)) clack.outro("Aborted.");
        else clack.cancel("Cancelled.");
        return;
      }
      clack.outro(""); // close the intro block before re-running prompts
    }
  }

  // Gather config
  let config: HashmarkConfig;
  if (opts.yes) {
    config = buildDefaults(projectDir);
    console.log(pc.dim("Using defaults (--yes)"));
  } else {
    // If we already ran intro above during re-init prompt, clack state is fine —
    // but when there's no existing dir we still need to run the full interactive flow.
    if (!existsSync(hashmarkDir)) {
      config = await promptInteractive(projectDir);
    } else {
      // Re-init was confirmed — run prompts fresh
      config = await promptInteractive(projectDir);
    }
  }

  // Create .hashmark/ and write config
  mkdirSync(hashmarkDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Update .gitignore
  updateGitignore(projectDir);

  if (!opts.yes) {
    clack.outro(pc.green("Done!"));
  }

  printNextSteps();
}

/**
 * Interactive Setup Flow
 *
 * Runs an interactive Q&A using @clack/prompts when user runs hashmark for the
 * first time (no .hashmark/config.json) or via `hashmark setup`. Detects the
 * stack, lets the user confirm patterns, asks about team size and AI tools, and
 * collects custom rules. Saves answers to .hashmark/config.json.
 */

import * as p from "@clack/prompts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Framework } from "./types.js";

export interface SetupConfig {
  teamSize: "solo" | "small" | "medium" | "large";
  aiTools: string[];
  customRules: string[];
  confirmedStack: {
    framework: string;
    language: string;
    styling?: string;
    testing?: string;
  };
  setupCompletedAt: string;
}

const AI_TOOL_OPTIONS = [
  { value: "claude", label: "Claude Code / Claude.ai" },
  { value: "cursor", label: "Cursor" },
  { value: "github-copilot", label: "GitHub Copilot" },
  { value: "windsurf", label: "Windsurf" },
  { value: "codeium", label: "Codeium" },
  { value: "gemini", label: "Gemini Code Assist" },
  { value: "copilot-chat", label: "Copilot Chat" },
  { value: "aider", label: "Aider" },
];

const TEAM_SIZE_OPTIONS = [
  { value: "solo", label: "Solo", hint: "just me" },
  { value: "small", label: "Small team", hint: "2-5 engineers" },
  { value: "medium", label: "Mid-size team", hint: "6-20 engineers" },
  { value: "large", label: "Large org", hint: "20+ engineers" },
];

/** Path to the project-level setup config */
export function getSetupConfigPath(dir: string): string {
  return join(dir, ".hashmark", "config.json");
}

/** Returns true if this project has already been set up */
export function isSetupComplete(dir: string): boolean {
  return existsSync(getSetupConfigPath(dir));
}

/** Reads the saved setup config, or null if not found */
export function readSetupConfig(dir: string): SetupConfig | null {
  const path = getSetupConfigPath(dir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as SetupConfig;
  } catch {
    return null;
  }
}

/** Persists setup config to .hashmark/config.json */
export function saveSetupConfig(dir: string, config: SetupConfig): void {
  const hashmarkDir = join(dir, ".hashmark");
  if (!existsSync(hashmarkDir)) mkdirSync(hashmarkDir, { recursive: true });
  writeFileSync(getSetupConfigPath(dir), JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Runs the interactive setup flow.
 *
 * @param dir - Project root directory
 * @param framework - Pre-detected framework info from scanner (may be null if setup runs before scan)
 * @param testFramework - Pre-detected test framework (optional)
 * @returns The completed SetupConfig, or null if user cancelled
 */
export async function runSetup(
  dir: string,
  framework?: Framework | null,
  testFramework?: string
): Promise<SetupConfig | null> {
  p.intro("  hashmark setup");

  // Show detected stack for confirmation
  const detectedFramework = framework?.name ?? "Unknown";
  const detectedLanguage = framework?.language ?? "Unknown";
  const detectedStyling = framework?.styling;
  const detectedVersion = framework?.version ? ` ${framework.version}` : "";
  const detectedRouter = framework?.router ? ` (${framework.router})` : "";

  p.note(
    [
      `Framework : ${detectedFramework}${detectedVersion}${detectedRouter}`,
      `Language  : ${detectedLanguage}`,
      detectedStyling ? `Styling   : ${detectedStyling}` : null,
      testFramework && testFramework !== "none" ? `Testing   : ${testFramework}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    "Detected stack"
  );

  const confirmStack = await p.confirm({
    message: "Does this look right?",
    initialValue: true,
  });

  if (p.isCancel(confirmStack)) {
    p.cancel("Setup cancelled.");
    return null;
  }

  let finalFramework = detectedFramework;
  let finalLanguage = detectedLanguage;

  if (!confirmStack) {
    const overrideFramework = await p.text({
      message: "What framework are you using?",
      placeholder: detectedFramework,
      defaultValue: detectedFramework,
    });
    if (p.isCancel(overrideFramework)) {
      p.cancel("Setup cancelled.");
      return null;
    }
    finalFramework = overrideFramework as string;

    const overrideLanguage = await p.select({
      message: "Primary language?",
      options: [
        { value: "TypeScript", label: "TypeScript" },
        { value: "JavaScript", label: "JavaScript" },
        { value: "Python", label: "Python" },
        { value: "Go", label: "Go" },
        { value: "Rust", label: "Rust" },
        { value: "Ruby", label: "Ruby" },
        { value: "Java", label: "Java" },
        { value: "Kotlin", label: "Kotlin" },
        { value: "PHP", label: "PHP" },
        { value: "C#", label: "C#" },
        { value: "Swift", label: "Swift" },
      ],
      initialValue: detectedLanguage,
    });
    if (p.isCancel(overrideLanguage)) {
      p.cancel("Setup cancelled.");
      return null;
    }
    finalLanguage = overrideLanguage as string;
  }

  // Team size
  const teamSize = await p.select({
    message: "How big is your team?",
    options: TEAM_SIZE_OPTIONS,
    initialValue: "solo" as string,
  });

  if (p.isCancel(teamSize)) {
    p.cancel("Setup cancelled.");
    return null;
  }

  // AI tools
  const aiTools = await p.multiselect({
    message: "Which AI coding tools does your team use?",
    options: AI_TOOL_OPTIONS,
    required: false,
  });

  if (p.isCancel(aiTools)) {
    p.cancel("Setup cancelled.");
    return null;
  }

  // Custom rules
  const wantsRules = await p.confirm({
    message: "Add custom coding rules for AI tools?",
    initialValue: false,
  });

  if (p.isCancel(wantsRules)) {
    p.cancel("Setup cancelled.");
    return null;
  }

  const customRules: string[] = [];

  if (wantsRules) {
    p.note(
      "Enter one rule per line. Press Enter twice when done.\nExample: Always use named exports, never default exports.",
      "Custom rules"
    );

    let addingRules = true;
    while (addingRules) {
      const rule = await p.text({
        message: customRules.length === 0 ? "First rule:" : "Next rule (leave blank to finish):",
        placeholder: "e.g. Always validate API inputs with Zod",
      });

      if (p.isCancel(rule)) {
        p.cancel("Setup cancelled.");
        return null;
      }

      const ruleStr = (rule as string).trim();
      if (!ruleStr) {
        addingRules = false;
      } else {
        customRules.push(ruleStr);
      }
    }
  }

  // Confirm and save
  const config: SetupConfig = {
    teamSize: teamSize as "solo" | "small" | "medium" | "large",
    aiTools: aiTools as string[],
    customRules,
    confirmedStack: {
      framework: finalFramework,
      language: finalLanguage,
      styling: detectedStyling,
      testing: testFramework && testFramework !== "none" ? testFramework : undefined,
    },
    setupCompletedAt: new Date().toISOString(),
  };

  saveSetupConfig(dir, config);

  p.outro(
    `Setup saved to .hashmark/config.json\n  Run hashmark again to generate your context files.`
  );

  return config;
}

/**
 * AI Automation Hooks Scanner
 *
 * Discovers and generates "hooks" for AI coding assistants.
 * Inspired by Latent-K, these hooks tell the AI when to run specific
 * commands (e.g., formatting after edit, linting before commit).
 *
 * @module scanners/latent-hooks
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { LatentHook, Framework, Utilities } from "../types.js";

/**
 * Scans for AI automation hooks or generates them based on project stack
 *
 * @param dir - Project root directory
 * @param framework - Detected framework info
 * @param utilities - Detected utilities
 * @returns Array of AI automation hooks
 */
export async function scanLatentHooks(
  dir: string,
  framework: Framework,
  utilities: Utilities
): Promise<LatentHook[]> {
  const hooks: LatentHook[] = [];

  // 1. Check for explicit Latent-K config
  const latentkPath = join(dir, ".latentk.json");
  if (existsSync(latentkPath)) {
    try {
      const content = JSON.parse(readFileSync(latentkPath, "utf-8"));
      if (Array.isArray(content.hooks)) {
        hooks.push(...content.hooks);
      }
    } catch {
      // Ignore parse errors
    }
  }

  // 2. Generate Smart Hooks based on stack (the "advanced" part)
  
  // Standard formatting hook
  if (existsSync(join(dir, ".prettierrc")) || existsSync(join(dir, "prettier.config.js"))) {
    hooks.push({
      event: "file_edit",
      command: "npx prettier --write {{file}}",
      description: "Auto-format files after editing",
      pattern: "**/*.{ts,tsx,js,jsx,json,css,md}"
    });
  }

  // Next.js specific hooks
  if (framework.name === "Next.js") {
    hooks.push({
      event: "task_complete",
      command: "npm run lint",
      description: "Verify no linting regressions after task completion"
    });
  }

  // TypeScript hooks
  if (framework.language === "TypeScript") {
    hooks.push({
      event: "file_edit",
      command: "npx tsc --noEmit",
      description: "Check for type errors in the background",
      pattern: "**/*.{ts,tsx}"
    });
  }

  // Testing hooks
  if (existsSync(join(dir, "vitest.config.ts")) || existsSync(join(dir, "jest.config.js"))) {
    hooks.push({
      event: "file_edit",
      command: "npm test -- {{file}}",
      description: "Run related tests when a file is modified",
      pattern: "src/**/*.ts"
    });
  }

  // Prisma hooks
  if (utilities.customUtils.some(u => u.includes("prisma"))) {
    hooks.push({
      event: "file_edit",
      command: "npx prisma generate",
      description: "Regenerate Prisma client when schema changes",
      pattern: "prisma/schema.prisma"
    });
  }

  // Session start hook
  hooks.push({
    event: "session_start",
    command: "ls -d node_modules || npm install",
    description: "Ensure dependencies are installed at start of session"
  });

  // Component creation hook
  hooks.push({
    event: "file_create",
    command: "mkdir -p src/components/ui",
    description: "Always place new UI primitives in the standard UI folder",
    pattern: "src/components/ui/*.tsx"
  });

  return hooks;
}

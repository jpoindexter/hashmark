/**
 * Custom Hooks Scanner
 *
 * Discovers custom React hooks in a codebase by scanning the hooks directory.
 * Extracts hook names, file paths, and detects client-only requirements.
 *
 * @module scanners/hooks
 */

import fg from "fast-glob";
import { readFileSync } from "fs";
import { basename } from "path";

/** Custom hook information */
export interface Hook {
  /** Hook name (e.g., "useAuth") */
  name: string;
  /** Relative file path */
  path: string;
  /** Import path for use in code */
  importPath: string;
  /** Whether the hook requires "use client" directive */
  isClientOnly: boolean;
}

/** Glob patterns for finding hook files */
const HOOK_PATTERNS = [
  "src/hooks/**/*.ts",
  "src/hooks/**/*.tsx",
  "hooks/**/*.ts",
  "hooks/**/*.tsx",
  // Recursive: monorepo support — match nested project directories
  "**/src/hooks/**/*.ts",
  "**/src/hooks/**/*.tsx",
  "**/hooks/**/*.ts",
  "**/hooks/**/*.tsx",
  // Composables (Vue convention)
  "**/src/composables/**/*.ts",
  "**/composables/**/*.ts",
  // Exclusions
  "!**/node_modules/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/.next/**",
  "!**/*.test.*",
  "!**/*.spec.*",
  "!**/index.ts",  // Skip barrel exports
];

/**
 * Scans for custom React hooks in a project
 *
 * @param dir - Project root directory
 * @returns Array of discovered hooks with metadata
 *
 * @example
 * const hooks = await scanHooks('/path/to/project');
 * // Returns: [{ name: 'useAuth', path: 'src/hooks/use-auth.ts', isClientOnly: true, ... }]
 */
export async function scanHooks(dir: string): Promise<Hook[]> {
  const files = await fg(HOOK_PATTERNS, {
    cwd: dir,
    absolute: false,
  });

  const hooks: Hook[] = [];

  for (const file of files) {
    const content = readFileSync(`${dir}/${file}`, "utf-8");
    const hookNames = extractHookNames(content);
    const isClientOnly = content.includes("'use client'") || content.includes('"use client"');

    for (const name of hookNames) {
      hooks.push({
        name,
        path: file,
        importPath: toImportPath(file),
        isClientOnly,
      });
    }
  }

  return hooks.sort((a, b) => a.name.localeCompare(b.name));
}

/** Extracts hook names from file content (functions starting with "use") */
function extractHookNames(content: string): string[] {
  const hooks: string[] = [];

  // export function useXxx
  const funcMatches = content.matchAll(/export\s+function\s+(use[A-Z][a-zA-Z0-9]*)/g);
  for (const match of funcMatches) {
    hooks.push(match[1]);
  }

  // export const useXxx
  const constMatches = content.matchAll(/export\s+const\s+(use[A-Z][a-zA-Z0-9]*)/g);
  for (const match of constMatches) {
    hooks.push(match[1]);
  }

  return [...new Set(hooks)];
}

/** Converts a file path to an import path (handles monorepo nesting) */
function toImportPath(file: string): string {
  const withoutExt = file.replace(/\.(tsx?|jsx?)$/, "");
  // Find the last occurrence of src/ for monorepo support
  const srcIndex = withoutExt.lastIndexOf("src/");
  if (srcIndex !== -1) {
    return "@/" + withoutExt.slice(srcIndex + 4);
  }
  return "@/" + withoutExt;
}

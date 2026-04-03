/**
 * Parse project-level .env files for injection into spawned CLI processes.
 * Reads .env.local first (higher priority), then .env as fallback.
 * Returns KEY=VALUE pairs -- values included (unlike /api/settings/env which strips them).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export function loadProjectEnvVars(projectDir: string): Record<string, string> {
  const vars: Record<string, string> = {};

  // .env is lower priority -- load first so .env.local overrides
  for (const fname of [".env", ".env.local"]) {
    const filePath = join(projectDir, fname);
    if (!existsSync(filePath)) continue;

    try {
      const raw = readFileSync(filePath, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;

        const key = trimmed.slice(0, eq).trim();
        if (!key) continue;

        // Strip surrounding quotes from value (single or double)
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        vars[key] = value;
      }
    } catch {
      // Unreadable file -- skip silently
    }
  }

  return vars;
}

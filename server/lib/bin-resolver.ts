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

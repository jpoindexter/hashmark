/**
 * Dependency graph utilities for detecting conflicts between parallel agent worktrees.
 * Uses git diff to find overlapping file changes, and regex-based import scanning
 * to surface downstream files that may break when a dependency is modified.
 */

import { execFileSync } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  status: "M" | "A" | "D";
  additions: number;
  deletions: number;
}

export interface Conflict {
  file: string;
  workers: string[];
  severity: "high" | "medium" | "low";
}

export interface ConflictReport {
  hasConflicts: boolean;
  conflicts: Conflict[];
  summary: string;
}

export interface ImpactedFile {
  /** The file that imports a changed file */
  file: string;
  /** Which changed files it depends on */
  dependsOn: string[];
}

export interface ImpactReport {
  changedFiles: FileChange[];
  impacted: ImpactedFile[];
  summary: string;
}

// ─── Git diff parsing ───────────────────────────────────────────────────────

/**
 * Get files changed between two git refs.
 * Returns empty array if the diff fails (e.g. branch doesn't exist).
 */
export function getChangedFiles(
  cwd: string,
  branch: string,
  base: string = "HEAD"
): FileChange[] {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--numstat", `${base}...${branch}`],
      { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );

    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [add, del, path] = line.split("\t");
        // Binary files show "-" for numstat
        const additions = parseInt(add) || 0;
        const deletions = parseInt(del) || 0;
        let status: FileChange["status"] = "M";
        if (additions > 0 && deletions === 0) status = "A";
        if (additions === 0 && deletions > 0) status = "D";
        return { path, status, additions, deletions };
      });
  } catch {
    return [];
  }
}

// ─── Conflict detection ─────────────────────────────────────────────────────

const HIGH_IMPACT_PATTERNS = [
  /package\.json$/,
  /tsconfig.*\.json$/,
  /\.env/,
  /prisma\/schema/,
  /schema\.(ts|js)$/,
  /middleware\.(ts|js)$/,
];

function scoreSeverity(file: string, workerCount: number): Conflict["severity"] {
  if (workerCount > 2) return "high";
  if (HIGH_IMPACT_PATTERNS.some((p) => p.test(file))) return "high";
  return "medium";
}

/**
 * Detect file-level conflicts between parallel worker branches.
 * Two workers touching the same file = conflict.
 */
export function detectConflicts(
  cwd: string,
  workers: Array<{ id: string; branch: string }>,
  baseBranch: string = "main"
): ConflictReport {
  const fileToWorkers = new Map<string, string[]>();

  for (const worker of workers) {
    const files = getChangedFiles(cwd, worker.branch, baseBranch);
    for (const file of files) {
      const existing = fileToWorkers.get(file.path) ?? [];
      existing.push(worker.id);
      fileToWorkers.set(file.path, existing);
    }
  }

  const conflicts: Conflict[] = [];
  for (const [file, workerIds] of fileToWorkers) {
    if (workerIds.length > 1) {
      conflicts.push({
        file,
        workers: workerIds,
        severity: scoreSeverity(file, workerIds.length),
      });
    }
  }

  // Sort high severity first
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  conflicts.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    summary:
      conflicts.length === 0
        ? "No conflicts detected"
        : `${conflicts.length} file(s) modified by multiple workers`,
  };
}

// ─── Import scanning (regex-based, no AST) ──────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build",
  ".cache", "__pycache__", "coverage", ".turbo",
]);

/**
 * Extract import/require targets from a source file.
 * Returns raw specifiers (e.g. "./foo", "../lib/bar", "@/utils").
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ES import: import ... from "specifier"
  const esRe = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(esRe)) imports.push(m[1]);

  // Side-effect import: import "specifier"
  const sideRe = /import\s+['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(sideRe)) imports.push(m[1]);

  // Dynamic import: import("specifier") or await import("specifier")
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of content.matchAll(dynRe)) imports.push(m[1]);

  // require("specifier")
  const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of content.matchAll(reqRe)) imports.push(m[1]);

  // Only return relative imports (skip node_modules packages)
  return imports.filter((s) => s.startsWith(".") || s.startsWith("@/"));
}

/**
 * Walk the project and build a map: filePath -> list of relative import specifiers.
 * Caps at 5000 files to avoid blowing up on monorepos.
 */
function buildImportMap(
  projectDir: string
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  let count = 0;
  const MAX_FILES = 5000;

  function walk(dir: string) {
    if (count >= MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (count >= MAX_FILES) break;
      if (IGNORED_DIRS.has(name) || name.startsWith(".")) continue;

      const fullPath = join(dir, name);
      let s;
      try {
        s = statSync(fullPath);
      } catch {
        continue;
      }

      if (s.isDirectory()) {
        walk(fullPath);
      } else if (SOURCE_EXTENSIONS.has(extname(name))) {
        count++;
        const relPath = relative(projectDir, fullPath);
        try {
          const content = readFileSync(fullPath, "utf-8");
          const imports = extractImports(content);
          result.set(relPath, imports);
        } catch {
          /* unreadable file */
        }
      }
    }
  }

  walk(projectDir);
  return result;
}

/**
 * Normalize an import specifier relative to the importing file's directory
 * into a project-relative path, stripping extensions and handling index files.
 * Returns null if the specifier is a package import (not relative).
 */
function resolveImportToPath(
  specifier: string,
  importerRelDir: string
): string | null {
  // @/ alias -- treat as project root
  if (specifier.startsWith("@/")) {
    return specifier.slice(2);
  }
  if (!specifier.startsWith(".")) return null;

  const parts = importerRelDir.split("/");
  const specParts = specifier.split("/");

  for (const seg of specParts) {
    if (seg === ".") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }

  return parts.join("/");
}

/**
 * Find all project files that import any of the changed files.
 * Uses regex-based import scanning -- no AST required.
 */
export function findImpactedFiles(
  projectDir: string,
  changedFiles: FileChange[]
): ImpactedFile[] {
  const importMap = buildImportMap(projectDir);

  // Build a set of changed file stems (without extension) for matching
  // e.g. "src/lib/db.ts" -> "src/lib/db"
  const changedStems = new Set<string>();
  const changedPaths = new Set<string>();
  for (const f of changedFiles) {
    changedPaths.add(f.path);
    const ext = extname(f.path);
    changedStems.add(ext ? f.path.slice(0, -ext.length) : f.path);
    // Also match index imports: "src/lib/foo/index.ts" -> "src/lib/foo"
    if (f.path.endsWith("/index.ts") || f.path.endsWith("/index.tsx") ||
        f.path.endsWith("/index.js") || f.path.endsWith("/index.jsx")) {
      changedStems.add(f.path.replace(/\/index\.(ts|tsx|js|jsx)$/, ""));
    }
  }

  const impacted: ImpactedFile[] = [];

  for (const [filePath, imports] of importMap) {
    // Skip the changed file itself
    if (changedPaths.has(filePath)) continue;

    const fileDir = filePath.includes("/")
      ? filePath.slice(0, filePath.lastIndexOf("/"))
      : "";

    const dependsOn: string[] = [];

    for (const spec of imports) {
      const resolved = resolveImportToPath(spec, fileDir);
      if (!resolved) continue;

      // Check if the resolved path matches any changed file stem
      if (changedStems.has(resolved)) {
        // Find the actual changed path for this stem
        const match = changedFiles.find((f) => {
          const ext = extname(f.path);
          const stem = ext ? f.path.slice(0, -ext.length) : f.path;
          return stem === resolved;
        });
        if (match) dependsOn.push(match.path);
      }
    }

    if (dependsOn.length > 0) {
      impacted.push({ file: filePath, dependsOn: [...new Set(dependsOn)] });
    }
  }

  // Sort by number of dependencies (most impacted first)
  impacted.sort((a, b) => b.dependsOn.length - a.dependsOn.length);

  return impacted;
}

/**
 * Full impact analysis: changed files + downstream dependents.
 */
export function analyzeImpact(
  projectDir: string,
  branch: string,
  base: string = "HEAD"
): ImpactReport {
  const changedFiles = getChangedFiles(projectDir, branch, base);
  const impacted = findImpactedFiles(projectDir, changedFiles);

  const totalImpacted = impacted.length;
  const summary =
    changedFiles.length === 0
      ? "No changes detected"
      : `${changedFiles.length} file(s) changed, ${totalImpacted} downstream file(s) may be affected`;

  return { changedFiles, impacted, summary };
}

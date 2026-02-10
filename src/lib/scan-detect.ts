import { readdir, stat, access } from "fs/promises";
import { join } from "path";
import { tryReadFile } from "./scan-utils";

/** Check if a path exists */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-detect the best scan root for monorepo projects.
 * Returns a subdirectory path (e.g., "web") or null if root should be used.
 */
export async function autoDetectScanRoot(tmpDir: string): Promise<string | null> {
  // Check if root has a non-workspace framework config
  const rootPkg = await tryReadFile(join(tmpDir, "package.json"));
  if (rootPkg) {
    try {
      const pkg = JSON.parse(rootPkg);
      const hasWorkspaces = pkg.workspaces || false;
      const hasPnpmWorkspace = await pathExists(join(tmpDir, "pnpm-workspace.yaml"));
      const hasLerna = await pathExists(join(tmpDir, "lerna.json"));

      // If it's NOT a monorepo workspace root, scan from root
      if (!hasWorkspaces && !hasPnpmWorkspace && !hasLerna) {
        return null;
      }

      // It IS a monorepo — find the best candidate
      return await findBestCandidate(tmpDir);
    } catch {
      return null;
    }
  }

  // Check for Go workspace
  if (await pathExists(join(tmpDir, "go.work"))) {
    return await findBestCandidate(tmpDir);
  }

  // Check for Rust workspace
  const cargoContent = await tryReadFile(join(tmpDir, "Cargo.toml"));
  if (cargoContent && cargoContent.includes("[workspace]")) {
    return await findBestCandidate(tmpDir);
  }

  return null;
}

/** Score and pick the best subdirectory candidate for scanning */
async function findBestCandidate(tmpDir: string): Promise<string | null> {
  const candidates: Array<{ dir: string; score: number }> = [];

  // Check immediate subdirs, apps/*, packages/*
  const searchDirs = ["."];
  for (const prefix of ["apps", "packages"]) {
    if (await pathExists(join(tmpDir, prefix))) {
      searchDirs.push(prefix);
    }
  }

  for (const searchDir of searchDirs) {
    const base = searchDir === "." ? tmpDir : join(tmpDir, searchDir);
    let entries: string[];
    try {
      entries = await readdir(base);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const candidatePath = searchDir === "." ? entry : `${searchDir}/${entry}`;
      const fullPath = join(tmpDir, candidatePath);

      try {
        const s = await stat(fullPath);
        if (!s.isDirectory()) continue;
      } catch {
        continue;
      }

      let score = 0;

      // Has framework config?
      if (await pathExists(join(fullPath, "package.json")) ||
          await pathExists(join(fullPath, "go.mod")) ||
          await pathExists(join(fullPath, "Cargo.toml")) ||
          await pathExists(join(fullPath, "pyproject.toml"))) {
        score += 1;
      }

      // Has src/app directory (Next.js App Router)
      if (await pathExists(join(fullPath, "src", "app"))) {
        score += 10;
      }

      // Has src/components directory
      if (await pathExists(join(fullPath, "src", "components"))) {
        score += 5;
      }

      // Has src directory at all
      if (await pathExists(join(fullPath, "src"))) {
        score += 2;
      }

      // Name is "web", "app", "frontend"
      const dirName = entry.toLowerCase();
      if (["web", "app", "frontend", "client"].includes(dirName)) {
        score += 3;
      }

      if (score > 0) {
        candidates.push({ dir: candidatePath, score });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending, pick highest
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].dir;
}

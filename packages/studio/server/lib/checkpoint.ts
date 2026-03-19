/**
 * Reusable git checkpoint creation for pre-turn safety.
 * Uses git plumbing (write-tree, commit-tree, update-ref) to snapshot
 * the working tree without touching HEAD or the index.
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "checkpoint";
}

export interface CheckpointResult {
  id: string;
  ref: string;
  label: string;
  timestamp: number;
}

/**
 * Create a lightweight git checkpoint using refs (no branch, no HEAD change).
 * Safe to call before each turn -- takes ~50ms on typical repos.
 */
export async function createCheckpoint(
  projectDir: string,
  label: string
): Promise<CheckpointResult | null> {
  const opts = { cwd: projectDir };
  const timestamp = Date.now();
  const slug = `${timestamp}-${slugify(label)}`;
  const refName = `refs/studio-checkpoints/${slug}`;

  try {
    const { stdout: treeHash } = await execFile("git", ["write-tree"], opts);

    let parentArgs: string[] = [];
    try {
      const { stdout: headHash } = await execFile("git", ["rev-parse", "HEAD"], opts);
      if (headHash.trim()) parentArgs = ["-p", headHash.trim()];
    } catch {
      // No HEAD yet (empty repo) -- commit without parent
    }

    const { stdout: commitHash } = await execFile(
      "git",
      ["commit-tree", treeHash.trim(), ...parentArgs, "-m", `studio-checkpoint: ${label}`],
      opts
    );

    await execFile("git", ["update-ref", refName, commitHash.trim()], opts);

    return { id: slug, ref: refName, label, timestamp };
  } catch {
    // Git not available or not a repo -- skip silently
    return null;
  }
}

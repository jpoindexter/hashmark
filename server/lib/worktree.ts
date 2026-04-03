/**
 * Git worktree management.
 * Each session can run in an isolated worktree for safe parallel editing.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join, basename } from "path";

const exec = promisify(execFile);

export interface Worktree {
  path: string;
  branch: string;
  isMain: boolean;
}

/** List all git worktrees for the project */
export async function listWorktrees(projectDir: string): Promise<Worktree[]> {
  try {
    const { stdout } = await exec("git", ["worktree", "list", "--porcelain"], { cwd: projectDir });
    const trees: Worktree[] = [];
    for (const block of stdout.split("\n\n").filter(Boolean)) {
      const pathMatch = block.match(/^worktree (.+)$/m);
      const branchMatch = block.match(/^branch refs\/heads\/(.+)$/m);
      if (pathMatch) {
        trees.push({
          path: pathMatch[1],
          branch: branchMatch?.[1] ?? "(detached)",
          isMain: !branchMatch || block.includes("bare"),
        });
      }
    }
    // First entry is always the main worktree
    if (trees.length > 0) trees[0].isMain = true;
    return trees;
  } catch {
    return [{ path: projectDir, branch: "main", isMain: true }];
  }
}

/** Create a new worktree with a branch for a session */
export async function createWorktree(
  projectDir: string,
  sessionId: string,
  baseBranch?: string,
): Promise<Worktree> {
  const branchName = `studio-session-${sessionId.slice(0, 8)}`;
  const worktreePath = join(projectDir, ".hashmark", "worktrees", branchName);

  const base = baseBranch ?? "HEAD";
  await exec("git", ["worktree", "add", "-b", branchName, worktreePath, base], { cwd: projectDir });

  return { path: worktreePath, branch: branchName, isMain: false };
}

/** Remove a worktree and its branch */
export async function removeWorktree(projectDir: string, worktreePath: string): Promise<void> {
  if (!existsSync(worktreePath)) return;
  const branch = basename(worktreePath);
  await exec("git", ["worktree", "remove", worktreePath, "--force"], { cwd: projectDir }).catch(() => {});
  await exec("git", ["branch", "-D", branch], { cwd: projectDir }).catch(() => {});
}

/** Reset a worktree to match its base branch */
export async function resetWorktree(worktreePath: string): Promise<void> {
  await exec("git", ["checkout", "--", "."], { cwd: worktreePath });
  await exec("git", ["clean", "-fd"], { cwd: worktreePath });
}

/**
 * Git Scanner
 */

import { execSync } from "child_process";
import type { GitInfo, GitCommit } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class GitScanner implements ScannerPlugin<GitInfo | null> {
  name = "git";
  filePatterns = []; // Uses shell commands, no files needed

  private gitInfo: GitInfo | null = null;

  async setup(context: ScannerContext) {
    this.gitInfo = scanGitLog(context.cwd);
  }

  getResult() {
    return this.gitInfo;
  }
}

/**
 * Scans git log for recent commits
 */
export function scanGitLog(dir: string, limit: number = 10): GitInfo | null {
  try {
    // Check if it's a git repo
    execSync("git rev-parse --is-inside-work-tree", { cwd: dir, stdio: "pipe" });
  } catch {
    return null;
  }

  try {
    // Get current branch
    let branch = "main";
    try {
      branch = execSync("git branch --show-current", { cwd: dir, encoding: "utf-8" }).trim();
    } catch {
      branch = "HEAD";
    }

    // Get remote URL
    let remoteUrl: string | undefined;
    try {
      remoteUrl = execSync("git remote get-url origin", { cwd: dir, encoding: "utf-8" }).trim();
    } catch {}

    // Get recent commits
    const logFormat = "%H|%ad|%an|%s";
    const logOutput = execSync(
      `git log -${limit} --pretty=format:"${logFormat}" --date=short`,
      { cwd: dir, encoding: "utf-8" }
    );

    const commits: GitCommit[] = logOutput
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const [hash, date, author, ...messageParts] = line.split("|");
        return {
          hash: hash.slice(0, 7),
          date,
          author,
          message: messageParts.join("|").slice(0, 80),
        };
      });

    return { commits, branch, remoteUrl };
  } catch {
    return null;
  }
}

/** Gets git diff */
export function getGitDiff(dir: string): string | null {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd: dir, stdio: "pipe" });
    const diff = execSync("git diff HEAD", { cwd: dir, encoding: "utf-8" });
    return diff.trim() || null;
  } catch {
    return null;
  }
}

/** Formats git diff as markdown */
export function formatGitDiff(diff: string): string {
  if (!diff) return "";
  const lines = ["## Uncommitted Changes", "", "```diff", diff.slice(0, 5000)];
  if (diff.length > 5000) lines.push(`... (${((diff.length - 5000) / 1024).toFixed(1)}KB more)`);
  lines.push("```", "");
  return lines.join("\n");
}

/** Formats git log as markdown */
export function formatGitLog(gitInfo: GitInfo): string {
  if (!gitInfo || gitInfo.commits.length === 0) return "";
  const lines = ["## Recent Changes", "", `Branch: \`${gitInfo.branch}\``, ""];
  if (gitInfo.remoteUrl) lines.push(`Remote: ${gitInfo.remoteUrl}`, "");
  lines.push("### Recent Commits", "");
  for (const commit of gitInfo.commits) {
    lines.push(`- \`${commit.hash}\` ${commit.message} *(${commit.date})*`);
  }
  lines.push("");
  return lines.join("\n");
}

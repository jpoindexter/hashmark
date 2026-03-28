/**
 * /api/drift — CLAUDE.md / AGENTS.md / GEMINI.md drift detection
 */

import { Hono } from "hono";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";

import type { WorkspaceCtx } from "./workspaces.js";

const execAsync = promisify(execFile);

const CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];

export type DriftLevel = "none" | "minor" | "major";

export interface DriftSignal {
  type: "file_count_delta" | "age_days" | "commit_mismatch";
  current?: number;
  baseline?: number;
  delta?: number;
  days?: number;
  fileCommit?: string;
  headCommit?: string;
}

export interface DriftResult {
  hasContextFile: true;
  fileName: string;
  driftLevel: DriftLevel;
  signals: DriftSignal[];
  recommendation: string;
}

export interface NoDriftResult {
  hasContextFile: false;
}

/** Extract file count from lines like "**Codebase**: 319 files" */
function extractBaselineFileCount(content: string): number | null {
  const m = content.match(/\*\*Codebase\*\*[^0-9]*(\d+)\s*files/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Extract commit hash from a hashmark header comment like "<!-- commit: abc1234 -->" */
function extractCommitHash(content: string): string | null {
  const m = content.match(/<!--\s*commit:\s*([a-f0-9]{7,40})\s*-->/i);
  return m ? m[1] : null;
}

export function driftRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  app.get("/check", async (c) => {
    // Find first matching context file
    let fileName: string | null = null;
    let content: string | null = null;

    for (const name of CONTEXT_FILES) {
      try {
        content = await readFile(join(ctx.projectDir, name), "utf-8");
        fileName = name;
        break;
      } catch {
        // not found, try next
      }
    }

    if (!fileName || !content) {
      return c.json<NoDriftResult>({ hasContextFile: false });
    }

    const signals: DriftSignal[] = [];

    // --- Current state ---
    let currentFileCount: number | null = null;
    let headCommit: string | null = null;

    try {
      const { stdout } = await execAsync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard"],
        { cwd: ctx.projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      const allFiles = stdout.split("\n").filter(Boolean);
      currentFileCount = allFiles.filter(f =>
        /\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs)$/.test(f)
      ).length;
    } catch {
      // not a git repo or git failed — skip count signal
    }

    try {
      const { stdout } = await execAsync("git", ["log", "--oneline", "-1"], { cwd: ctx.projectDir });
      headCommit = stdout.trim().split(" ")[0] ?? null;
    } catch {
      // git not available
    }

    // --- Signal: file count delta ---
    const baselineCount = extractBaselineFileCount(content);
    if (baselineCount !== null && currentFileCount !== null && baselineCount > 0) {
      const delta = Math.round(Math.abs(currentFileCount - baselineCount) / baselineCount * 100);
      if (delta >= 5) {
        signals.push({
          type: "file_count_delta",
          current: currentFileCount,
          baseline: baselineCount,
          delta,
        });
      }
    }

    // --- Signal: commit mismatch ---
    const fileCommit = extractCommitHash(content);
    if (fileCommit && headCommit && !headCommit.startsWith(fileCommit) && !fileCommit.startsWith(headCommit)) {
      signals.push({ type: "commit_mismatch", fileCommit, headCommit });
    }

    // --- Signal: age ---
    let ageDays: number | null = null;
    try {
      // Try git log to get the last commit that touched this file
      const { stdout } = await execAsync(
        "git",
        ["log", "-1", "--format=%ct", "--", fileName],
        { cwd: ctx.projectDir }
      );
      const ts = parseInt(stdout.trim(), 10);
      if (!isNaN(ts) && ts > 0) {
        ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);
      }
    } catch {
      // fall back to mtime
    }

    if (ageDays === null) {
      try {
        const s = await stat(join(ctx.projectDir, fileName));
        ageDays = Math.floor((Date.now() - s.mtimeMs) / 86400000);
      } catch {
        // can't determine age
      }
    }

    if (ageDays !== null && ageDays >= 7) {
      signals.push({ type: "age_days", days: ageDays });
    }

    // --- Determine drift level ---
    let driftLevel: DriftLevel = "none";

    const fileCountSignal = signals.find(s => s.type === "file_count_delta");
    const hasCommitMismatch = signals.some(s => s.type === "commit_mismatch");
    const ageDaysVal = (signals.find(s => s.type === "age_days") as { days?: number } | undefined)?.days ?? 0;

    if (fileCountSignal && (fileCountSignal.delta ?? 0) >= 20) {
      driftLevel = "major";
    } else if (hasCommitMismatch) {
      driftLevel = "major";
    } else if (signals.length > 0) {
      driftLevel = "minor";
    }

    // --- Recommendation ---
    let recommendation = `${fileName} appears up to date`;
    if (driftLevel === "major") {
      if (fileCountSignal && (fileCountSignal.delta ?? 0) >= 20) {
        recommendation = `Regenerate context file — file count has drifted ${fileCountSignal.delta}% since last scan`;
      } else if (hasCommitMismatch) {
        recommendation = `Regenerate context file — commit has changed since last scan`;
      }
    } else if (driftLevel === "minor") {
      if (ageDaysVal >= 7) {
        recommendation = `${fileName} is ${ageDaysVal} days old — consider regenerating`;
      } else if (fileCountSignal) {
        recommendation = `File count shifted ${fileCountSignal.delta}% — regeneration recommended`;
      }
    }

    return c.json<DriftResult>({
      hasContextFile: true,
      fileName,
      driftLevel,
      signals,
      recommendation,
    });
  });

  return app;
}

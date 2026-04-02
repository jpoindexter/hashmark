/**
 * Kairos -- persistent intelligent mode.
 *
 * Always-on background agent that watches for changes in the project
 * and proactively surfaces actions the user should know about:
 * - Uncommitted changes piling up
 * - New commits from others (behind remote)
 * - Test failures (if test script configured)
 * - Session memory updates worth reviewing
 * - CI status changes (if git remote configured)
 *
 * Different from Dream Mode: Dream runs every 4h between sessions
 * to consolidate memory. Kairos is always watching and generating
 * real-time actionable alerts.
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { getDb, getStudioSetting, setStudioSetting } from "../db.js";

const execFile = promisify(execFileCb);

const LOOP_INTERVAL_MS = 60_000;
const MAX_PENDING_ACTIONS = 50;
const STALE_THRESHOLD_MS = 24 * 3600_000; // auto-dismiss after 24h

// Thresholds for generating actions
const UNCOMMITTED_FILE_THRESHOLD = 5;
const BEHIND_REMOTE_THRESHOLD = 1;
const AHEAD_REMOTE_THRESHOLD = 10;

export interface KairosAction {
  id: string;
  type: "suggestion" | "alert" | "memory";
  title: string;
  description: string;
  createdAt: number;
  dismissed: boolean;
}

export interface KairosStatus {
  enabled: boolean;
  lastHeartbeat: number;
  lastAction: string | null;
  pendingActions: KairosAction[];
  loopRunning: boolean;
}

// In-memory state -- persisted to studio_settings for enabled flag only
let loopRunning = false;
let lastHeartbeat = 0;
let lastAction: string | null = null;
let pendingActions: KairosAction[] = [];
let loopTimer: ReturnType<typeof setInterval> | null = null;

// Dedup: track fingerprints of recently created actions to avoid spam
const recentFingerprints = new Set<string>();
const FINGERPRINT_TTL_MS = 10 * 60_000; // 10 min dedup window

function actionFingerprint(type: string, title: string): string {
  return `${type}:${title}`;
}

function addAction(type: KairosAction["type"], title: string, description: string): void {
  const fp = actionFingerprint(type, title);
  if (recentFingerprints.has(fp)) return;
  recentFingerprints.add(fp);
  setTimeout(() => recentFingerprints.delete(fp), FINGERPRINT_TTL_MS);

  const action: KairosAction = {
    id: randomUUID(),
    type,
    title,
    description,
    createdAt: Date.now(),
    dismissed: false,
  };

  pendingActions.push(action);
  lastAction = title;

  // Cap pending actions -- drop oldest dismissed first, then oldest active
  if (pendingActions.length > MAX_PENDING_ACTIONS) {
    const dismissed = pendingActions.filter((a) => a.dismissed);
    if (dismissed.length > 0) {
      pendingActions = pendingActions.filter((a) => a !== dismissed[0]);
    } else {
      pendingActions.shift();
    }
  }

  console.log(`[kairos] action: ${title}`);
}

function pruneStaleActions(): void {
  const cutoff = Date.now() - STALE_THRESHOLD_MS;
  pendingActions = pendingActions.filter(
    (a) => !a.dismissed || a.createdAt > cutoff,
  );
}

// -- Watchers ----------------------------------------------------------------

interface GitSnapshot {
  branch: string;
  uncommittedCount: number;
  ahead: number;
  behind: number;
  hasStaged: boolean;
}

async function checkGitStatus(projectDir: string): Promise<GitSnapshot | null> {
  try {
    const [statusOut, branchOut] = await Promise.all([
      execFile("git", ["status", "--porcelain=v1"], { cwd: projectDir }),
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectDir }),
    ]);

    const branch = branchOut.stdout.trim();
    const lines = statusOut.stdout.trim().split("\n").filter(Boolean);
    const uncommittedCount = lines.length;
    const hasStaged = lines.some((l) => {
      const x = l[0];
      return x !== " " && x !== "?";
    });

    let ahead = 0;
    let behind = 0;
    try {
      const { stdout } = await execFile(
        "git",
        ["rev-list", "--left-right", "--count", `${branch}...@{u}`],
        { cwd: projectDir },
      );
      const parts = stdout.trim().split(/\s+/);
      ahead = parseInt(parts[0]) || 0;
      behind = parseInt(parts[1]) || 0;
    } catch {
      // no upstream tracking -- that's fine
    }

    return { branch, uncommittedCount, ahead, behind, hasStaged };
  } catch {
    return null;
  }
}

function evaluateGitSnapshot(snap: GitSnapshot): void {
  if (snap.uncommittedCount >= UNCOMMITTED_FILE_THRESHOLD) {
    addAction(
      "suggestion",
      `${snap.uncommittedCount} uncommitted files`,
      `You have ${snap.uncommittedCount} uncommitted changes on ${snap.branch}. Consider committing or stashing.`,
    );
  }

  if (snap.behind >= BEHIND_REMOTE_THRESHOLD) {
    addAction(
      "alert",
      `${snap.behind} commits behind remote`,
      `Branch ${snap.branch} is ${snap.behind} commit${snap.behind > 1 ? "s" : ""} behind the remote. Pull to stay in sync.`,
    );
  }

  if (snap.ahead >= AHEAD_REMOTE_THRESHOLD) {
    addAction(
      "suggestion",
      `${snap.ahead} unpushed commits`,
      `Branch ${snap.branch} has ${snap.ahead} unpushed commits. Consider pushing to back up your work.`,
    );
  }
}

async function checkTestStatus(projectDir: string): Promise<void> {
  // Only check if package.json has a test script
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };

    if (!pkg.scripts?.test) return;

    // Check for common test result files (jest, vitest)
    for (const resultFile of [
      "test-results.json",
      "junit.xml",
      ".vitest-result.json",
    ]) {
      const fp = join(projectDir, resultFile);
      if (!existsSync(fp)) continue;

      try {
        const raw = readFileSync(fp, "utf-8");
        // Simple heuristic: look for failure indicators
        if (raw.includes('"numFailedTests":') && !raw.includes('"numFailedTests":0') && !raw.includes('"numFailedTests": 0')) {
          addAction(
            "alert",
            "Test failures detected",
            `Found failing tests in ${resultFile}. Run tests to see details.`,
          );
        }
      } catch {
        // result file not parseable
      }
    }
  } catch {
    // can't read package.json
  }
}

function checkSessionMemory(dataDir: string): void {
  const memPath = join(dataDir, "session-memory.md");
  if (!existsSync(memPath)) return;

  try {
    const content = readFileSync(memPath, "utf-8");
    // Count entry separators to gauge memory size
    const entries = content.split(/\n\n---\n\n/).length - 1;
    if (entries >= 10) {
      addAction(
        "memory",
        "Session memory growing large",
        `session-memory.md has ${entries} entries. Consider reviewing and pruning stale learnings.`,
      );
    }
  } catch {
    // file read error
  }
}

function checkActiveWork(dataDir: string): { sessions: number; runs: number; swarms: number } {
  try {
    const db = getDb(dataDir);
    const sessions = (db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE status = 'streaming'").get() as { cnt: number }).cnt;
    const runs = (db.prepare("SELECT COUNT(*) AS cnt FROM runs WHERE status = 'running'").get() as { cnt: number }).cnt;
    const swarms = (db.prepare("SELECT COUNT(*) AS cnt FROM swarm_runs WHERE status = 'running'").get() as { cnt: number }).cnt;
    return { sessions, runs, swarms };
  } catch {
    return { sessions: 0, runs: 0, swarms: 0 };
  }
}

function checkCrashedWork(dataDir: string): void {
  try {
    const db = getDb(dataDir);
    const crashed = db.prepare(
      "SELECT COUNT(*) AS cnt FROM runs WHERE status = 'crashed' AND ended_at > ?",
    ).get(Date.now() - 3600_000) as { cnt: number };

    if (crashed.cnt > 0) {
      addAction(
        "alert",
        `${crashed.cnt} recently crashed run${crashed.cnt > 1 ? "s" : ""}`,
        `Found ${crashed.cnt} run${crashed.cnt > 1 ? "s" : ""} that crashed in the last hour. Check the Runs page for details.`,
      );
    }
  } catch {
    // DB not available
  }
}

// -- Loop --------------------------------------------------------------------

async function tick(projectDir: string, dataDir: string): Promise<void> {
  lastHeartbeat = Date.now();
  pruneStaleActions();

  const snap = await checkGitStatus(projectDir);
  if (snap) evaluateGitSnapshot(snap);

  await checkTestStatus(projectDir);
  checkSessionMemory(dataDir);
  checkCrashedWork(dataDir);
}

function startLoop(projectDir: string, dataDir: string): void {
  if (loopRunning) return;
  loopRunning = true;
  console.log("[kairos] loop started");

  // Run first tick immediately (non-blocking)
  tick(projectDir, dataDir).catch((err) => {
    console.error("[kairos] tick error:", err instanceof Error ? err.message : String(err));
  });

  loopTimer = setInterval(() => {
    tick(projectDir, dataDir).catch((err) => {
      console.error("[kairos] tick error:", err instanceof Error ? err.message : String(err));
    });
  }, LOOP_INTERVAL_MS);
  loopTimer.unref();
}

function stopLoop(): void {
  if (!loopRunning) return;
  loopRunning = false;
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  console.log("[kairos] loop stopped");
}

// -- Public API --------------------------------------------------------------

export function getKairosStatus(): KairosStatus {
  return {
    enabled: loopRunning,
    lastHeartbeat,
    lastAction,
    pendingActions: pendingActions.filter((a) => !a.dismissed),
    loopRunning,
  };
}

export function getAllActions(): KairosAction[] {
  return [...pendingActions];
}

export function getPendingActions(): KairosAction[] {
  return pendingActions.filter((a) => !a.dismissed);
}

export function dismissAction(actionId: string): boolean {
  const action = pendingActions.find((a) => a.id === actionId);
  if (!action) return false;
  action.dismissed = true;
  return true;
}

export function dismissAllActions(): void {
  for (const action of pendingActions) {
    action.dismissed = true;
  }
}

export function enableKairos(projectDir: string, dataDir: string): void {
  const db = getDb(dataDir);
  setStudioSetting(db, "kairos.enabled", "true");
  startLoop(projectDir, dataDir);
}

export function disableKairos(dataDir: string): void {
  const db = getDb(dataDir);
  setStudioSetting(db, "kairos.enabled", "false");
  stopLoop();
}

/**
 * Initialize Kairos on server startup.
 * Reads persisted enabled state from studio_settings.
 * Only starts the loop if the user previously enabled it.
 */
export function initKairos(projectDir: string, dataDir: string): void {
  if (projectDir === "__unset__") return;

  try {
    const db = getDb(dataDir);
    const enabled = getStudioSetting(db, "kairos.enabled", "false") === "true";
    if (enabled) {
      startLoop(projectDir, dataDir);
    }
  } catch {
    // DB not ready yet -- that's fine, user can enable manually
  }
}

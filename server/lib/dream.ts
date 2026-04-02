/**
 * Dream Mode -- background memory consolidation.
 * Inspired by Claude Code's autoDream system.
 *
 * Periodically reviews past session transcripts and consolidates
 * patterns, preferences, and project knowledge into a memory file
 * at .hashmark/dream.md
 *
 * Gates:
 * - >= 4 hours since last consolidation
 * - >= 3 completed sessions since last consolidation
 * - No active runs/sessions in progress
 * - File lock to prevent concurrent dreams
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getDb, getStudioSetting, setStudioSetting } from "../db.js";
import { findClaudeBin } from "./bin-resolver.js";
import { checkUsage, recordInvocation } from "./claude-usage.js";

const DREAM_INTERVAL_MS = 30 * 60_000; // check every 30 min
const MIN_HOURS_SINCE_LAST = 4;
const MIN_SESSIONS_SINCE_LAST = 3;
const MAX_SESSIONS_TO_REVIEW = 5;
const MAX_TRANSCRIPT_CHARS = 12_000; // per session, truncated to key exchanges

interface DreamState {
  lastConsolidatedAt: number;
  sessionCountAtLastDream: number;
}

let dreaming = false;

function loadDreamState(dataDir: string): DreamState {
  const db = getDb(dataDir);
  const lastAt = parseInt(getStudioSetting(db, "dream.lastConsolidatedAt", "0"), 10);
  const count = parseInt(getStudioSetting(db, "dream.sessionCountAtLastDream", "0"), 10);
  return { lastConsolidatedAt: lastAt, sessionCountAtLastDream: count };
}

function saveDreamState(dataDir: string, state: DreamState): void {
  const db = getDb(dataDir);
  setStudioSetting(db, "dream.lastConsolidatedAt", String(state.lastConsolidatedAt));
  setStudioSetting(db, "dream.sessionCountAtLastDream", String(state.sessionCountAtLastDream));
}

function getTotalSessionCount(dataDir: string): number {
  const db = getDb(dataDir);
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE status != 'streaming'").get() as { cnt: number };
  return row.cnt;
}

function hasActiveWork(dataDir: string): boolean {
  const db = getDb(dataDir);
  const activeSessions = db.prepare(
    "SELECT COUNT(*) AS cnt FROM sessions WHERE status = 'streaming'"
  ).get() as { cnt: number };
  if (activeSessions.cnt > 0) return true;

  const activeRuns = db.prepare(
    "SELECT COUNT(*) AS cnt FROM runs WHERE status = 'running'"
  ).get() as { cnt: number };
  if (activeRuns.cnt > 0) return true;

  const activeSwarms = db.prepare(
    "SELECT COUNT(*) AS cnt FROM swarm_runs WHERE status = 'running'"
  ).get() as { cnt: number };
  return activeSwarms.cnt > 0;
}

interface SessionTranscript {
  sessionId: string;
  title: string;
  messages: Array<{ role: string; content: string }>;
}

function loadRecentTranscripts(dataDir: string, sinceTimestamp: number): SessionTranscript[] {
  const db = getDb(dataDir);

  // Grab completed sessions since last dream, newest first
  const sessions = db.prepare(
    `SELECT id, title FROM sessions
     WHERE status != 'streaming' AND created_at > ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(sinceTimestamp, MAX_SESSIONS_TO_REVIEW) as Array<{ id: string; title: string }>;

  const transcripts: SessionTranscript[] = [];

  for (const session of sessions) {
    const msgs = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(session.id) as Array<{ role: string; content: string }>;

    if (msgs.length === 0) continue;

    // Truncate long transcripts -- keep first and last exchanges
    const truncated = truncateTranscript(msgs);
    transcripts.push({ sessionId: session.id, title: session.title, messages: truncated });
  }

  return transcripts;
}

function truncateTranscript(
  msgs: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  let totalChars = 0;
  const result: Array<{ role: string; content: string }> = [];

  for (const msg of msgs) {
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + "\n[...truncated]"
      : msg.content;
    totalChars += content.length;

    if (totalChars > MAX_TRANSCRIPT_CHARS) {
      result.push({ role: "system", content: `[...${msgs.length - result.length} more messages truncated]` });
      break;
    }
    result.push({ role: msg.role, content });
  }

  return result;
}

function buildConsolidationPrompt(existingMemory: string, transcripts: SessionTranscript[]): string {
  const sessionBlocks = transcripts.map((t) => {
    const msgText = t.messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");
    return `### Session: ${t.title}\n${msgText}`;
  }).join("\n\n---\n\n");

  return `Review the following session transcripts and extract key learnings.
Focus on: project patterns, user preferences, common workflows, mistakes to avoid.
Output a concise markdown summary of what you learned. Be specific and actionable.
Do not repeat information already in the existing memory file.
Format as markdown sections with ## headings. Keep it under 500 words.

EXISTING MEMORY:
${existingMemory || "(empty -- this is the first consolidation)"}

RECENT SESSIONS:
${sessionBlocks}`;
}

function spawnClaudeForDream(claudeBin: string, projectDir: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      claudeBin,
      ["--print", "--allowedTools", "Read,Glob,Grep"],
      {
        cwd: projectDir,
        env: { ...process.env as Record<string, string> },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    proc.stdin.write(prompt + "\n");
    proc.stdin.end();

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timeout = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      reject(new Error("Dream process timed out after 2 minutes"));
    }, 120_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Dream exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function appendToDreamFile(dataDir: string, content: string): void {
  const dreamPath = join(dataDir, "dream.md");
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `\n\n---\n\n<!-- consolidated: ${timestamp} -->\n\n${content}`;

  if (existsSync(dreamPath)) {
    const existing = readFileSync(dreamPath, "utf-8");
    writeFileSync(dreamPath, existing + entry, "utf-8");
  } else {
    const header = `# Dream Log\n\nAuto-consolidated learnings from studio sessions.\n`;
    writeFileSync(dreamPath, header + entry, "utf-8");
  }
}

function readDreamFile(dataDir: string): string {
  const dreamPath = join(dataDir, "dream.md");
  if (!existsSync(dreamPath)) return "";
  try {
    return readFileSync(dreamPath, "utf-8");
  } catch {
    return "";
  }
}

async function runDreamCycle(projectDir: string, dataDir: string): Promise<void> {
  if (dreaming) return;

  const state = loadDreamState(dataDir);
  const now = Date.now();

  // Gate: enough time elapsed
  const hoursSinceLast = (now - state.lastConsolidatedAt) / 3600_000;
  if (hoursSinceLast < MIN_HOURS_SINCE_LAST) return;

  // Gate: enough new sessions
  const totalSessions = getTotalSessionCount(dataDir);
  const newSessions = totalSessions - state.sessionCountAtLastDream;
  if (newSessions < MIN_SESSIONS_SINCE_LAST) return;

  // Gate: no active work
  if (hasActiveWork(dataDir)) return;

  // Gate: usage rate limit
  const usage = checkUsage();
  if (!usage.allowed) return;

  dreaming = true;
  console.log("[dream] starting consolidation cycle");

  try {
    const transcripts = loadRecentTranscripts(dataDir, state.lastConsolidatedAt);
    if (transcripts.length === 0) {
      console.log("[dream] no transcripts to review, skipping");
      return;
    }

    const existingMemory = readDreamFile(dataDir);
    const prompt = buildConsolidationPrompt(existingMemory, transcripts);
    const claudeBin = findClaudeBin(projectDir);

    recordInvocation();
    const result = await spawnClaudeForDream(claudeBin, projectDir, prompt);

    if (result.length < 20) {
      console.log("[dream] result too short, skipping write");
      return;
    }

    appendToDreamFile(dataDir, result);
    saveDreamState(dataDir, {
      lastConsolidatedAt: now,
      sessionCountAtLastDream: totalSessions,
    });

    console.log(`[dream] consolidated ${transcripts.length} sessions into dream.md`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dream] consolidation failed:", msg);
  } finally {
    dreaming = false;
  }
}

export function startDreamLoop(projectDir: string, dataDir: string): void {
  if (projectDir === "__unset__") return;

  // Run first check after 5 minutes (let the server settle)
  const initialDelay = setTimeout(() => {
    runDreamCycle(projectDir, dataDir).catch(() => {});
  }, 5 * 60_000);
  initialDelay.unref();

  // Then check every 30 minutes
  const interval = setInterval(() => {
    runDreamCycle(projectDir, dataDir).catch(() => {});
  }, DREAM_INTERVAL_MS);
  interval.unref();
}

export interface DreamStatus {
  lastConsolidatedAt: number;
  nextEligibleAt: number;
  sessionsSinceLastDream: number;
  dreaming: boolean;
  dreamFileExists: boolean;
}

export function getDreamStatus(dataDir: string): DreamStatus {
  const state = loadDreamState(dataDir);
  const totalSessions = getTotalSessionCount(dataDir);
  const dreamPath = join(dataDir, "dream.md");

  return {
    lastConsolidatedAt: state.lastConsolidatedAt,
    nextEligibleAt: state.lastConsolidatedAt + MIN_HOURS_SINCE_LAST * 3600_000,
    sessionsSinceLastDream: totalSessions - state.sessionCountAtLastDream,
    dreaming,
    dreamFileExists: existsSync(dreamPath),
  };
}

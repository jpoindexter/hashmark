/**
 * Session Memory -- cross-session learning extraction.
 *
 * After every N chat turns in a session, forks a lightweight Claude agent
 * to extract learnings from recent messages. Appends findings to
 * .hashmark/session-memory.md, which is injected into future session prompts
 * for cross-session awareness.
 *
 * Different from Dream Mode: Dream runs in the background every 4h across
 * all sessions. Session memory runs DURING a session, extracting learnings
 * in near-real-time after every 5 turns.
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getDb } from "../db.js";
import { findClaudeBin } from "./bin-resolver.js";
import { checkUsage, recordInvocation } from "./claude-usage.js";

const EXTRACTION_INTERVAL = 5;
const MAX_MEMORY_SIZE = 25 * 1024; // 25KB cap (matches Claude Code's MEMORY.md limit)
const EXTRACTION_TIMEOUT_MS = 30_000;
const MEMORY_FILENAME = "session-memory.md";

interface SessionMemoryState {
  turnsSinceLastExtraction: number;
}

const sessionStates = new Map<string, SessionMemoryState>();

// Prevent concurrent extractions
let extracting = false;

export function onTurnComplete(
  sessionId: string,
  dataDir: string,
  projectDir: string,
): void {
  let state = sessionStates.get(sessionId);
  if (!state) state = { turnsSinceLastExtraction: 0 };
  state.turnsSinceLastExtraction++;
  sessionStates.set(sessionId, state);

  if (state.turnsSinceLastExtraction >= EXTRACTION_INTERVAL) {
    state.turnsSinceLastExtraction = 0;
    extractMemory(sessionId, dataDir, projectDir).catch(() => {});
  }
}

/** Clear tracking state when a session ends or is deleted */
export function clearSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

function loadRecentMessages(
  dataDir: string,
  sessionId: string,
  count: number,
): Array<{ role: string; content: string }> {
  const db = getDb(dataDir);
  return db.prepare(
    `SELECT role, content FROM session_messages
     WHERE session_id = ? AND sent_at IS NOT NULL
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(sessionId, count) as Array<{ role: string; content: string }>;
}

function readMemoryFile(dataDir: string): string {
  const memPath = join(dataDir, MEMORY_FILENAME);
  if (!existsSync(memPath)) return "";
  try {
    return readFileSync(memPath, "utf-8");
  } catch {
    return "";
  }
}

/** Load session-memory.md for injection into chat context */
export function loadSessionMemory(dataDir: string): string | null {
  const memPath = join(dataDir, MEMORY_FILENAME);
  if (!existsSync(memPath)) return null;
  try {
    const raw = readFileSync(memPath, "utf-8").trim();
    if (!raw) return null;
    return `## Session Memory (cross-session learnings)\n\n${raw}`;
  } catch {
    return null;
  }
}

function buildExtractionPrompt(
  messages: Array<{ role: string; content: string }>,
  existingMemory: string,
): string {
  const transcript = messages
    .reverse() // oldest first
    .map((m) => `[${m.role}]: ${m.content.slice(0, 1500)}`)
    .join("\n\n");

  return `You are a memory extraction agent. Review these recent chat messages and extract NEW learnings that are NOT already captured in the existing memory file.

Focus ONLY on durable, reusable knowledge:
- Project-specific patterns and conventions
- User preferences (coding style, tool choices, workflow habits)
- Tool/framework discoveries (what works, what doesn't)
- Common error patterns and their fixes
- Architecture decisions and their rationale

Do NOT extract:
- One-off task details ("user asked to add a button")
- Conversation meta ("user said thanks")
- Information already in the existing memory

Output format: bullet points grouped under short ## headings.
If there are no new learnings worth saving, output exactly: NONE

EXISTING MEMORY:
${existingMemory || "(empty)"}

RECENT MESSAGES:
${transcript}`;
}

function spawnClaudeForExtraction(
  claudeBin: string,
  projectDir: string,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      claudeBin,
      ["--print", "--allowedTools", "Read,Glob,Grep"],
      {
        cwd: projectDir,
        env: { ...process.env as Record<string, string> },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    proc.stdin.write(prompt + "\n");
    proc.stdin.end();

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    const timeout = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      reject(new Error("Session memory extraction timed out"));
    }, EXTRACTION_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Extraction exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function appendToMemoryFile(dataDir: string, content: string): void {
  const memPath = join(dataDir, MEMORY_FILENAME);
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `\n\n---\n\n<!-- extracted: ${timestamp} -->\n\n${content}`;

  if (existsSync(memPath)) {
    const existing = readFileSync(memPath, "utf-8");
    const updated = existing + entry;
    writeFileSync(memPath, truncateMemory(updated), "utf-8");
  } else {
    const header = `# Session Memory\n\nCross-session learnings extracted during active sessions.\n`;
    writeFileSync(memPath, header + entry, "utf-8");
  }
}

/**
 * Truncate memory file to stay under MAX_MEMORY_SIZE.
 * Keeps the header + most recent entries, drops oldest.
 */
function truncateMemory(content: string): string {
  if (Buffer.byteLength(content, "utf-8") <= MAX_MEMORY_SIZE) return content;

  // Split on entry separators, keep header + newest entries
  const parts = content.split(/\n\n---\n\n/);
  const header = parts[0];

  // Drop oldest entries (index 1 = oldest) until under limit
  let entries = parts.slice(1);
  while (entries.length > 1) {
    const assembled = header + "\n\n---\n\n" + entries.join("\n\n---\n\n");
    if (Buffer.byteLength(assembled, "utf-8") <= MAX_MEMORY_SIZE) return assembled;
    entries = entries.slice(1);
  }

  // Even single entry too large -- keep header + truncated last entry
  const last = entries[0] ?? "";
  const maxEntryBytes = MAX_MEMORY_SIZE - Buffer.byteLength(header + "\n\n---\n\n", "utf-8") - 50;
  return header + "\n\n---\n\n" + last.slice(0, Math.max(0, maxEntryBytes)) + "\n[...truncated]";
}

async function extractMemory(
  sessionId: string,
  dataDir: string,
  projectDir: string,
): Promise<void> {
  if (extracting) return;

  // Gate: usage rate limit
  const usage = checkUsage();
  if (!usage.allowed) return;

  extracting = true;
  console.log(`[session-memory] extracting learnings from session ${sessionId.slice(0, 8)}`);

  try {
    const messages = loadRecentMessages(dataDir, sessionId, EXTRACTION_INTERVAL);
    if (messages.length < 2) return; // not enough conversation to extract from

    const existingMemory = readMemoryFile(dataDir);
    const prompt = buildExtractionPrompt(messages, existingMemory);
    const claudeBin = findClaudeBin(projectDir);

    recordInvocation();
    const result = await spawnClaudeForExtraction(claudeBin, projectDir, prompt);

    // Skip if Claude found nothing worth saving
    if (!result || result.trim() === "NONE" || result.length < 20) {
      console.log("[session-memory] no new learnings extracted");
      return;
    }

    appendToMemoryFile(dataDir, result);
    console.log(`[session-memory] appended ${result.length} chars to ${MEMORY_FILENAME}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[session-memory] extraction failed:", msg);
  } finally {
    extracting = false;
  }
}

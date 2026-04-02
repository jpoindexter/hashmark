/**
 * Magic Docs -- self-updating documentation files.
 *
 * Ported from Claude Code's MagicDocs system. When a markdown file starts with
 * "# MAGIC DOC: [title]", hashmark periodically updates it using a background
 * agent that reads the current codebase and refreshes the content.
 *
 * Use cases:
 * - Auto-updating API docs
 * - Architecture decision records
 * - Dependency reports
 * - Changelog summaries
 * - Onboarding guides that stay current
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { findClaudeBin } from "./bin-resolver.js";
import { checkUsage, recordInvocation } from "./claude-usage.js";
import { getDb, getStudioSetting } from "../db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MagicDoc {
  path: string;
  title: string;
  lastUpdated: number | null;
  content: string;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const MAGIC_HEADER = /^#\s*MAGIC\s+DOC:\s*(.+)$/im;

/** Scan a directory for files with MAGIC DOC headers */
export function findMagicDocs(projectDir: string): MagicDoc[] {
  const docs: MagicDoc[] = [];
  const dirsToScan = [projectDir, join(projectDir, "docs"), join(projectDir, ".hashmark")];

  for (const dir of dirsToScan) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const filePath = join(dir, file);
        try {
          const content = readFileSync(filePath, "utf-8");
          const match = content.match(MAGIC_HEADER);
          if (match) {
            docs.push({
              path: filePath,
              title: match[1].trim(),
              lastUpdated: null,
              content,
            });
          }
        } catch {}
      }
    } catch {}
  }

  return docs;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

let updating = false;

/** Update a single magic doc using Claude */
export async function updateMagicDoc(
  doc: MagicDoc,
  projectDir: string,
  dataDir: string,
): Promise<boolean> {
  if (updating) return false;

  const usage = checkUsage();
  if (!usage.allowed) return false;

  updating = true;
  recordInvocation();

  const prompt = `You are updating a self-maintaining documentation file.

FILE: ${doc.path}
TITLE: ${doc.title}

CURRENT CONTENT:
${doc.content}

INSTRUCTIONS:
1. Read the relevant source files in this project to understand the current state
2. Update the documentation to reflect the current codebase accurately
3. Keep the "# MAGIC DOC: ${doc.title}" header exactly as-is
4. Add or update a "_Last updated: [date]_" line after the header
5. Be concise and accurate. Remove outdated information.
6. Only include information you can verify from the source files.
7. Output the COMPLETE updated file content.`;

  try {
    const claudeBin = findClaudeBin(projectDir);
    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn(claudeBin, ["--print", "--allowedTools", "Read,Glob,Grep"], {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      });

      proc.stdin.write(prompt + "\n");
      proc.stdin.end();

      let stdout = "";
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`exit ${code}`)));
      proc.on("error", reject);
    });

    if (output.trim().length > 100) {
      writeFileSync(doc.path, output.trim(), "utf-8");
      return true;
    }
  } catch (err) {
    console.error("[magic-docs] update failed:", err instanceof Error ? err.message : err);
  } finally {
    updating = false;
  }

  return false;
}

/** Update all magic docs in a project */
export async function updateAllMagicDocs(projectDir: string, dataDir: string): Promise<number> {
  const docs = findMagicDocs(projectDir);
  let updated = 0;
  for (const doc of docs) {
    const ok = await updateMagicDoc(doc, projectDir, dataDir);
    if (ok) updated++;
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Background loop
// ---------------------------------------------------------------------------

const UPDATE_INTERVAL_MS = 60 * 60_000; // every hour
let lastUpdateTime = 0;

export function startMagicDocsLoop(projectDir: string, dataDir: string): void {
  const timer = setInterval(async () => {
    const now = Date.now();
    if (now - lastUpdateTime < UPDATE_INTERVAL_MS) return;

    const docs = findMagicDocs(projectDir);
    if (docs.length === 0) return;

    lastUpdateTime = now;
    const count = await updateAllMagicDocs(projectDir, dataDir);
    if (count > 0) {
      console.log(`[magic-docs] updated ${count} doc(s)`);
    }
  }, 5 * 60_000).unref(); // check every 5 min, update hourly
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export function getMagicDocsStatus(projectDir: string): { docs: MagicDoc[]; lastUpdate: number; updating: boolean } {
  return {
    docs: findMagicDocs(projectDir),
    lastUpdate: lastUpdateTime,
    updating,
  };
}

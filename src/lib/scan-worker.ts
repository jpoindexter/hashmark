import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, readdir, rm, stat } from "fs/promises";
import { join, resolve } from "path";
import { db } from "./db";
import type { FileFormat } from "@prisma/client";

const execFileAsync = promisify(execFile);

/** Strict regex for GitHub repository full names (owner/repo) */
const REPO_NAME_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

/** Map well-known file names to Prisma FileFormat enum values */
export const FORMAT_MAP: Record<string, FileFormat> = {
  "AGENTS.md": "AGENTS_MD",
  "CLAUDE.md": "CLAUDE_MD",
  ".cursorrules": "CURSORRULES",
  ".windsurfrules": "WINDSURFRULES",
  "GEMINI.md": "GEMINI_MD",
  ".clinerules": "CLINE_RULES",
};

/** Rough token estimate: ~4 chars per token */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/** Try to read a file, return null if it doesn't exist */
async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/** Redact sensitive values from error messages before storing */
function sanitizeErrorMessage(msg: string, token: string): string {
  return msg
    .replaceAll(token, "[REDACTED]")
    .replace(/\/tmp\/hashmark-scan-\w+/g, "[SCAN_DIR]");
}

/** Clone a repo using execFile (no shell) with token passed via env header */
async function cloneRepo(fullName: string, token: string, tmpDir: string) {
  // Pass token via GIT_CONFIG env vars to avoid embedding in URLs / process args
  await execFileAsync("git", ["clone", "--depth", "1", `https://github.com/${fullName}.git`, tmpDir], {
    timeout: 60_000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
    },
  });
}

/** Parse AGENTS.index.json into structured scan results */
async function parseScanIndex(tmpDir: string) {
  let scanStats = {
    files: 0, lines: 0, components: 0, routes: 0, models: 0, tokens: 0, hooks: 0,
  };
  const results: {
    components: Array<{ name: string; path: string; category?: string }>;
    apiRoutes: Array<{ path: string; method: string; auth?: boolean }>;
    complexity: Array<{ path: string; score: number; lines: number }>;
    scanners: Array<{ name: string; found: number }>;
  } = { components: [], apiRoutes: [], complexity: [], scanners: [] };

  const indexContent = await tryReadFile(join(tmpDir, "AGENTS.index.json"));
  if (!indexContent) return { scanStats, results };

  try {
    const index = JSON.parse(indexContent);
    if (index.stats) scanStats = { ...scanStats, ...index.stats };

    if (Array.isArray(index.components)) {
      results.components = index.components.map(
        (c: { name: string; path: string; description?: string }) => ({
          name: c.name, path: c.path, category: c.description ?? undefined,
        })
      );
    }

    if (Array.isArray(index.routes)) {
      results.apiRoutes = index.routes.map(
        (r: { path: string; methods: string[]; protected?: boolean }) => ({
          path: r.path, method: r.methods?.[0] ?? "GET", auth: r.protected ?? false,
        })
      );
    }

    results.scanners = [
      { name: "Components", found: scanStats.components },
      { name: "Hooks", found: scanStats.hooks },
      { name: "API Routes", found: scanStats.routes },
      { name: "Models", found: scanStats.models },
    ];
  } catch {
    // JSON parse error — non-critical
  }

  return { scanStats, results };
}

/** Collect all generated format files from the scanned directory */
async function collectFiles(tmpDir: string) {
  const generatedFiles: Array<{
    format: FileFormat; fileName: string; content: string; tokenCount: number;
  }> = [];

  for (const [fileName, format] of Object.entries(FORMAT_MAP)) {
    const content = await tryReadFile(join(tmpDir, fileName));
    if (content) {
      generatedFiles.push({ format, fileName, content, tokenCount: estimateTokens(content) });
    }
  }

  const copilotContent = await tryReadFile(join(tmpDir, ".github", "copilot-instructions.md"));
  if (copilotContent) {
    generatedFiles.push({
      format: "COPILOT_INSTRUCTIONS",
      fileName: ".github/copilot-instructions.md",
      content: copilotContent,
      tokenCount: estimateTokens(copilotContent),
    });
  }

  try {
    const mdcDir = join(tmpDir, ".cursor", "rules");
    const mdcStat = await stat(mdcDir);
    if (mdcStat.isDirectory()) {
      const mdcFiles = await readdir(mdcDir);
      for (const mdcFile of mdcFiles.filter((f) => f.endsWith(".mdc"))) {
        const content = await readFile(join(mdcDir, mdcFile), "utf-8");
        generatedFiles.push({
          format: "CURSOR_MDC",
          fileName: `.cursor/rules/${mdcFile}`,
          content,
          tokenCount: estimateTokens(content),
        });
      }
    }
  } catch {
    // Dir may not exist
  }

  return generatedFiles;
}

/**
 * Run a full scan: clone → CLI → parse → store → cleanup.
 * Called fire-and-forget from server actions.
 */
export async function runScan(scanId: string, fullName: string, token: string) {
  // Validate repo name format to prevent injection
  if (!REPO_NAME_RE.test(fullName)) {
    await db.scan.update({
      where: { id: scanId },
      data: { status: "FAILED", error: "Invalid repository name format." },
    });
    return;
  }

  const tmpDir = `/tmp/hashmark-scan-${scanId}`;
  const startTime = Date.now();

  try {
    const updateProgress = (step: string, detail?: string) =>
      db.scan.update({
        where: { id: scanId },
        data: { results: { progress: { step, detail, updatedAt: Date.now() } } },
      });

    await db.scan.update({ where: { id: scanId }, data: { status: "SCANNING" } });

    // 1. Clone
    await updateProgress("CLONING", `Cloning ${fullName}...`);
    await cloneRepo(fullName, token, tmpDir);

    let commitSha: string | undefined;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tmpDir });
      commitSha = stdout.trim();
    } catch { /* Non-critical */ }

    // 2. Run CLI scanner (execFile — no shell)
    await updateProgress("SCANNING", "Running 27 scanners...");
    const cliPath = resolve(process.cwd(), "packages/cli/dist/cli.js");
    await execFileAsync("node", [cliPath, tmpDir, "--format", "all", "--json", "--force"], {
      timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    });

    // 3. Parse results
    await updateProgress("PARSING", "Parsing scan results...");
    const { scanStats, results } = await parseScanIndex(tmpDir);

    // 4. Collect files
    await updateProgress("COLLECTING", `Found ${scanStats.files} files, ${scanStats.components} components`);
    const generatedFiles = await collectFiles(tmpDir);

    const duration = Date.now() - startTime;

    // 5. Store results
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED", duration, commitSha,
        fileCount: scanStats.files, lineCount: scanStats.lines,
        componentCount: scanStats.components, apiRouteCount: scanStats.routes,
        modelCount: scanStats.models, tokenEstimate: scanStats.tokens,
        results,
      },
    });

    if (generatedFiles.length > 0) {
      await db.generatedFile.createMany({
        data: generatedFiles.map((f) => ({
          scanId, format: f.format, fileName: f.fileName, content: f.content, tokenCount: f.tokenCount,
        })),
      });
    }

    const scan = await db.scan.findUnique({ where: { id: scanId }, select: { repositoryId: true } });
    if (scan) {
      await db.repository.update({ where: { id: scan.repositoryId }, data: { lastScanAt: new Date() } });
    }
  } catch (error) {
    const message = formatScanError(error, token);
    await db.scan.update({
      where: { id: scanId },
      data: { status: "FAILED", duration: Date.now() - startTime, error: message },
    });
  } finally {
    try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* Ignore cleanup errors */ }
  }
}

/** Map raw errors to user-friendly messages, stripping sensitive data */
export function formatScanError(error: unknown, token?: string): string {
  let msg = error instanceof Error ? error.message : String(error);

  // Strip token and internal paths from any error before further processing
  if (token) msg = sanitizeErrorMessage(msg, token);

  if (msg.includes("Authentication failed") || msg.includes("could not read Username")) {
    return "GitHub authentication failed. Your access token may have expired — try signing out and back in.";
  }
  if (msg.includes("not found") && msg.includes("repository")) {
    return "Repository not found. It may have been deleted or made private without granting access.";
  }
  if (msg.includes("Permission denied") || msg.includes("403")) {
    return "Permission denied. Ensure Hashmark has access to this repository in your GitHub settings.";
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out") || msg.includes("timeout")) {
    return "Scan timed out. This can happen with very large repositories. Try again or contact support.";
  }
  if (msg.includes("ENOMEM") || msg.includes("out of memory")) {
    return "Scan ran out of memory. This repository may be too large for the current plan.";
  }
  if (msg.length > 200) {
    return msg.slice(0, 200) + "...";
  }

  return msg || "An unexpected error occurred during the scan.";
}

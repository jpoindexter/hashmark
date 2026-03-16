import { execFile } from "child_process";
import { promisify } from "util";
import { access, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { db } from "./db";
import { formatScanError } from "./scan-error";
import { autoDetectScanRoot } from "./scan-detect";
import { parseScanIndex, collectFiles } from "./scan-utils";

const execFileAsync = promisify(execFile);

/** Strict regex for GitHub repository full names (owner/repo) */
const REPO_NAME_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

/** CLI path — configurable via env var for production deployments */
const CLI_PATH = process.env.HASHMARK_CLI_PATH || resolve(process.cwd(), "packages/cli/dist/cli.js");

/** Check if a path exists */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Clone a repo using execFile (no shell) with token passed via env header */
async function cloneRepo(fullName: string, token: string, tmpDir: string) {
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

/**
 * Run a full scan: clone → CLI → parse → store → cleanup.
 * Called fire-and-forget from server actions.
 */
export async function runScan(scanId: string, fullName: string, token: string, scanRoot?: string | null, plan: string = "FREE", userId?: string) {
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

    // 2. Determine scan directory (user-set scanRoot, or auto-detect for monorepos)
    let scanDir = tmpDir;
    const effectiveScanRoot = scanRoot || await autoDetectScanRoot(tmpDir);
    if (effectiveScanRoot) {
      const candidateDir = join(tmpDir, effectiveScanRoot);
      if (await pathExists(candidateDir)) {
        scanDir = candidateDir;
      }
    }

    // 3. Inject custom rules for Pro/Team users (writes hashmark.config.json to scanDir)
    if (plan !== "FREE" && userId) {
      const customRules = await db.customRule.findMany({
        where: { userId, enabled: true },
        select: { rule: true },
        orderBy: { createdAt: "asc" },
      });
      if (customRules.length > 0) {
        const config = { rules: customRules.map((r) => r.rule) };
        await writeFile(join(scanDir, "hashmark.config.json"), JSON.stringify(config, null, 2));
      }
    }

    // 4. Run CLI scanner (execFile — no shell)
    await updateProgress("SCANNING", `Running scanners on ${effectiveScanRoot || "root"}...`);

    const cliArgs = [CLI_PATH, scanDir, "--format", "all", "--json", "--force"];
    if (plan !== "FREE") {
      cliArgs.push("--security");
    }

    await execFileAsync("node", cliArgs, {
      timeout: 300_000, maxBuffer: 10 * 1024 * 1024,
    });

    // 5. Parse results
    await updateProgress("PARSING", "Parsing scan results...");
    const { scanStats, results } = await parseScanIndex(scanDir);

    // 6. Collect files
    await updateProgress("COLLECTING", `Found ${scanStats.files} files, ${scanStats.components} components`);
    const generatedFiles = await collectFiles(scanDir);

    const duration = Date.now() - startTime;

    // 7. Store results
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED", duration, commitSha,
        fileCount: scanStats.files, lineCount: scanStats.lines,
        componentCount: scanStats.components, hookCount: scanStats.hooks,
        apiRouteCount: scanStats.routes,
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

      // Index for full-text search (non-critical — log errors but don't fail the scan)
      try {
        const { indexScanForSearch } = await import("./search-indexer");
        await indexScanForSearch(scanId, scan.repositoryId);
      } catch (indexErr) {
        console.error(`[scan-worker] Search indexing failed for scan ${scanId}:`, indexErr);
      }
    }
  } catch (error) {
    const execErr = error as { stderr?: string; stdout?: string; code?: number; killed?: boolean; signal?: string };
    console.error(`[scan-worker] Scan ${scanId} failed:`, {
      message: error instanceof Error ? error.message : String(error),
      stderr: execErr.stderr?.slice(0, 1000),
      stdout: execErr.stdout?.slice(0, 1000),
      exitCode: execErr.code,
      killed: execErr.killed,
      signal: execErr.signal,
    });
    const message = formatScanError(error, token);
    await db.scan.update({
      where: { id: scanId },
      data: { status: "FAILED", duration: Date.now() - startTime, error: message },
    });
  } finally {
    try { await rm(tmpDir, { recursive: true, force: true }); } catch (cleanupErr) { console.error(`[scan-worker] Cleanup failed for ${tmpDir}:`, cleanupErr); }
  }
}

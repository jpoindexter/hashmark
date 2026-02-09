import { exec } from "child_process";
import { promisify } from "util";
import { readFile, readdir, rm, stat } from "fs/promises";
import { join, resolve } from "path";
import { db } from "./db";
import type { FileFormat } from "@prisma/client";

const execAsync = promisify(exec);

/** Map well-known file names to Prisma FileFormat enum values */
const FORMAT_MAP: Record<string, FileFormat> = {
  "AGENTS.md": "AGENTS_MD",
  "CLAUDE.md": "CLAUDE_MD",
  ".cursorrules": "CURSORRULES",
  ".windsurfrules": "WINDSURFRULES",
  "GEMINI.md": "GEMINI_MD",
  ".clinerules": "CLINE_RULES",
};

/** Rough token estimate: ~4 chars per token */
function estimateTokens(content: string): number {
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

/**
 * Run a full scan: clone → CLI → parse → store → cleanup.
 * Called fire-and-forget from server actions.
 */
export async function runScan(
  scanId: string,
  fullName: string,
  token: string
) {
  const tmpDir = `/tmp/hashmark-scan-${scanId}`;
  const startTime = Date.now();

  try {
    await db.scan.update({
      where: { id: scanId },
      data: { status: "SCANNING" },
    });

    // 1. Clone repo (depth 1 for speed)
    const cloneUrl = `https://x-access-token:${token}@github.com/${fullName}.git`;
    await execAsync(`git clone --depth 1 "${cloneUrl}" "${tmpDir}"`, {
      timeout: 60_000,
    });

    // Get commit SHA
    let commitSha: string | undefined;
    try {
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd: tmpDir,
      });
      commitSha = stdout.trim();
    } catch {
      // Non-critical
    }

    // 2. Run CLI scanner
    const cliPath = resolve(process.cwd(), "packages/cli/dist/cli.js");
    await execAsync(
      `node "${cliPath}" "${tmpDir}" --format all --json --force`,
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
    );

    // 3. Parse AGENTS.index.json for structured stats
    let scanStats = {
      files: 0,
      lines: 0,
      components: 0,
      routes: 0,
      models: 0,
      tokens: 0,
      hooks: 0,
    };

    // Build results object for the intelligence page tables
    const results: {
      components: Array<{ name: string; path: string; category?: string }>;
      apiRoutes: Array<{ path: string; method: string; auth?: boolean }>;
      complexity: Array<{ path: string; score: number; lines: number }>;
      scanners: Array<{ name: string; found: number }>;
    } = { components: [], apiRoutes: [], complexity: [], scanners: [] };

    const indexContent = await tryReadFile(
      join(tmpDir, "AGENTS.index.json")
    );
    if (indexContent) {
      try {
        const index = JSON.parse(indexContent);

        // Stats
        if (index.stats) {
          scanStats = { ...scanStats, ...index.stats };
        }

        // Components → intelligence table
        if (Array.isArray(index.components)) {
          results.components = index.components.map(
            (c: { name: string; path: string; description?: string }) => ({
              name: c.name,
              path: c.path,
              category: c.description ?? undefined,
            })
          );
        }

        // API routes → intelligence table
        if (Array.isArray(index.routes)) {
          results.apiRoutes = index.routes.map(
            (r: {
              path: string;
              methods: string[];
              protected?: boolean;
            }) => ({
              path: r.path,
              method: r.methods?.[0] ?? "GET",
              auth: r.protected ?? false,
            })
          );
        }

        // Scanners coverage (reconstruct from stats)
        results.scanners = [
          { name: "Components", found: scanStats.components },
          { name: "Hooks", found: scanStats.hooks },
          { name: "API Routes", found: scanStats.routes },
          { name: "Models", found: scanStats.models },
        ];
      } catch {
        // JSON parse error — non-critical
      }
    }

    // 4. Collect generated files
    const generatedFiles: Array<{
      format: FileFormat;
      fileName: string;
      content: string;
      tokenCount: number;
    }> = [];

    // Top-level files
    for (const [fileName, format] of Object.entries(FORMAT_MAP)) {
      const content = await tryReadFile(join(tmpDir, fileName));
      if (content) {
        generatedFiles.push({
          format,
          fileName,
          content,
          tokenCount: estimateTokens(content),
        });
      }
    }

    // Copilot instructions (subdirectory)
    const copilotContent = await tryReadFile(
      join(tmpDir, ".github", "copilot-instructions.md")
    );
    if (copilotContent) {
      generatedFiles.push({
        format: "COPILOT_INSTRUCTIONS",
        fileName: ".github/copilot-instructions.md",
        content: copilotContent,
        tokenCount: estimateTokens(copilotContent),
      });
    }

    // Cursor MDC files (may be multiple .mdc files)
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

    const duration = Date.now() - startTime;

    // 5. Update scan record
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        duration,
        commitSha,
        fileCount: scanStats.files,
        lineCount: scanStats.lines,
        componentCount: scanStats.components,
        apiRouteCount: scanStats.routes,
        modelCount: scanStats.models,
        tokenEstimate: scanStats.tokens,
        results,
      },
    });

    // 6. Create GeneratedFile records
    if (generatedFiles.length > 0) {
      await db.generatedFile.createMany({
        data: generatedFiles.map((f) => ({
          scanId,
          format: f.format,
          fileName: f.fileName,
          content: f.content,
          tokenCount: f.tokenCount,
        })),
      });
    }

    // Update repo's lastScanAt
    const scan = await db.scan.findUnique({
      where: { id: scanId },
      select: { repositoryId: true },
    });
    if (scan) {
      await db.repository.update({
        where: { id: scan.repositoryId },
        data: { lastScanAt: new Date() },
      });
    }
  } catch (error) {
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  } finally {
    // 7. Clean up temp directory
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

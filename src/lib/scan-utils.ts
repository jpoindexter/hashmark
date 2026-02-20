import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import type { FileFormat } from "@prisma/client";

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
export async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/** Parse AGENTS.index.json into structured scan results */
export async function parseScanIndex(scanDir: string) {
  let scanStats = {
    files: 0,
    lines: 0,
    components: 0,
    routes: 0,
    models: 0,
    tokens: 0,
    hooks: 0,
  };
  const results: {
    components: Array<{ name: string; path: string; category?: string }>;
    apiRoutes: Array<{ path: string; method: string; auth?: boolean }>;
    complexity: Array<{ path: string; score: number; lines: number }>;
    scanners: Array<{ name: string; found: number }>;
    patterns?: string[];
    latentHooks?: Array<{
      event: string;
      command: string;
      description?: string;
      pattern?: string;
    }>;
    aiReadiness?: {
      total: number;
      breakdown: Record<string, number>;
      recommendations: string[];
    };
    astComplexity?: {
      topFunctions: Array<{
        name: string;
        file: string;
        line: number;
        cyclomatic: number;
        cognitive: number;
        halstead: { volume: number; effort: number; estimatedBugs: number };
        maintainabilityIndex: number;
      }>;
      fileScores: Array<{
        path: string;
        score: number;
        level: string;
        maintainabilityIndex?: number;
      }>;
    };
  } = { components: [], apiRoutes: [], complexity: [], scanners: [] };

  const indexContent = await tryReadFile(join(scanDir, "AGENTS.index.json"));
  if (!indexContent) return { scanStats, results };

  try {
    const index = JSON.parse(indexContent);
    if (index.stats) scanStats = { ...scanStats, ...index.stats };

    if (Array.isArray(index.components)) {
      results.components = index.components.map(
        (c: { name: string; path: string; description?: string }) => ({
          name: c.name,
          path: c.path,
          category: c.description ?? undefined,
        })
      );
    }

    if (Array.isArray(index.routes)) {
      results.apiRoutes = index.routes.map(
        (r: { path: string; methods: string[]; protected?: boolean }) => ({
          path: r.path,
          method: r.methods?.[0] ?? "GET",
          auth: r.protected ?? false,
        })
      );
    }

    results.scanners = [
      { name: "Components", found: scanStats.components },
      { name: "Hooks", found: scanStats.hooks },
      { name: "API Routes", found: scanStats.routes },
      { name: "Models", found: scanStats.models },
    ];

    if (index.complexity?.topFunctions || index.complexity?.fileScores) {
      results.astComplexity = {
        topFunctions: index.complexity.topFunctions ?? [],
        fileScores: index.complexity.fileScores ?? [],
      };
    }

    // Extract new fields added in Phase 4
    if (index.aiReadiness) {
      results.aiReadiness = index.aiReadiness;
    }
    if (index.latentHooks) {
      results.latentHooks = index.latentHooks;
    }
    if (index.patterns) {
      results.patterns = index.patterns;
    }
  } catch {
    // JSON parse error — non-critical
  }

  return { scanStats, results };
}

/** Collect all generated format files from the scanned directory */
export async function collectFiles(scanDir: string) {
  const generatedFiles: Array<{
    format: FileFormat;
    fileName: string;
    content: string;
    tokenCount: number;
  }> = [];

  for (const [fileName, format] of Object.entries(FORMAT_MAP)) {
    const content = await tryReadFile(join(scanDir, fileName));
    if (content) {
      generatedFiles.push({
        format,
        fileName,
        content,
        tokenCount: estimateTokens(content),
      });
    }
  }

  const copilotContent = await tryReadFile(
    join(scanDir, ".github", "copilot-instructions.md")
  );
  if (copilotContent) {
    generatedFiles.push({
      format: "COPILOT_INSTRUCTIONS",
      fileName: ".github/copilot-instructions.md",
      content: copilotContent,
      tokenCount: estimateTokens(copilotContent),
    });
  }

  try {
    const mdcDir = join(scanDir, ".cursor", "rules");
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

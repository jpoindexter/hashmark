/**
 * File Statistics Scanner
 *
 * Collects codebase statistics including:
 * - Total file count
 * - Total lines of code
 * - Total size in bytes
 * - Largest files
 * - File count by extension
 *
 * @module scanners/stats
 */

import fg from "fast-glob";
import { readFileSync, statSync } from "fs";
import type { FileStats } from "../types.js";
import type { ScannerPlugin } from "../engine/types.js";

export class StatsScanner implements ScannerPlugin<FileStats> {
  name = "stats";
  filePatterns = ["**/*"]; // Watch everything for stats

  private stats: FileStats = {
    totalFiles: 0,
    totalLines: 0,
    totalSize: 0,
    largestFiles: [],
    filesByType: {},
  };

  private fileEntries: { path: string; lines: number }[] = [];

  async onFile(path: string, content: string) {
    this.stats.totalFiles++;
    
    // Count lines
    const lines = content.split("\n").length;
    this.stats.totalLines += lines;
    
    // Calculate size (approximate from string length if not using actual fs.stat)
    // But since we have the content, we can use Buffer.byteLength
    const size = Buffer.byteLength(content, "utf-8");
    this.stats.totalSize += size;

    // Track for largest files
    this.fileEntries.push({ path, lines });

    // Track by extension
    const ext = path.split(".").pop() || "other";
    this.stats.filesByType[ext] = (this.stats.filesByType[ext] || 0) + 1;
  }

  finalize() {
    // Get top 5 largest files by lines
    this.stats.largestFiles = this.fileEntries
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 5);
  }

  getResult() {
    return this.stats;
  }
}

/**
 * Legacy support for file statistics
 * @deprecated Use ScannerEngine with StatsScanner plugin
 */
export async function scanStats(dir: string): Promise<FileStats> {
  const files = await fg(
    [
      "**/*.{ts,tsx,js,jsx,mjs,cjs,css,scss,less,json,md,mdx,py,go,rs,rb,java,kt,kts,php,vue,svelte,swift,m,h,c,cpp,cc,cxx,hpp,cs,sh,bash,zsh,yaml,yml,toml,sql,graphql,gql,proto}",
      "!**/node_modules/**",
      "!**/.next/**",
      "!**/.git/**",
      "!**/dist/**",
      "!**/build/**",
    ],
    { cwd: dir, absolute: false }
  );

  let totalLines = 0;
  let totalSize = 0;
  const filesByType: Record<string, number> = {};
  const fileSizes: { path: string; lines: number }[] = [];

  for (const file of files) {
    try {
      const fullPath = `${dir}/${file}`;
      const stat = statSync(fullPath);
      totalSize += stat.size;
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n").length;
      totalLines += lines;
      fileSizes.push({ path: file, lines });
      const ext = file.split(".").pop() || "other";
      filesByType[ext] = (filesByType[ext] || 0) + 1;
    } catch {}
  }

  return {
    totalFiles: files.length,
    totalLines,
    totalSize,
    largestFiles: fileSizes.sort((a, b) => b.lines - a.lines).slice(0, 5),
    filesByType,
  };
}

/** Formats bytes into human-readable string (B, KB, MB) */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

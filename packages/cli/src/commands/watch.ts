/**
 * hashmark watch
 *
 * File watcher that automatically rescans and regenerates CLAUDE.md (and other
 * configured formats) when source files change. Uses chokidar for reliable
 * cross-platform watching with debouncing.
 */

import { watch as chokidarWatch } from "chokidar";
import { resolve, join, relative } from "path";
import pc from "picocolors";

export interface WatchOptions {
  debounceMs: number;
  ignore: string[];
  verbose: boolean;
  formats: string[];
}

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.hashmark/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/__pycache__/**",
  "**/target/**",
];

const WATCH_GLOB = "**/*.{ts,tsx,js,jsx,py,go,rs,md}";

/**
 * Watches the project directory and triggers a full rescan on source file changes.
 *
 * @param projectDir - Absolute path to the project root
 * @param options - Watch configuration
 * @param runScan - Async function that performs the rescan; receives `rescanOnlyChanged: true`
 * @returns Cleanup function that stops the watcher
 */
export function watchProject(
  projectDir: string,
  options: WatchOptions,
  runScan: (opts: { rescanOnlyChanged: boolean; format?: string }) => Promise<{ tokenCount?: number; fileCount?: number }>
): () => void {
  const absDir = resolve(projectDir);
  const ignorePatterns = [...DEFAULT_IGNORE, ...options.ignore];

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let scanning = false;
  let pendingScan = false;
  const changedFiles: Set<string> = new Set();

  const triggerRescan = async () => {
    if (scanning) {
      pendingScan = true;
      return;
    }

    const fileCount = changedFiles.size;
    changedFiles.clear();
    scanning = true;

    process.stdout.write(
      pc.cyan(`[watch]`) + ` ${fileCount} file${fileCount === 1 ? "" : "s"} changed — rescanning...\n`
    );

    try {
      const result = await runScan({
        rescanOnlyChanged: true,
        format: options.formats.length > 0 ? options.formats.join(",") : undefined,
      });

      const tokens = result.tokenCount != null
        ? `${(result.tokenCount / 1000).toFixed(1)}k tokens`
        : "";
      const files = result.fileCount != null ? `${result.fileCount} files scanned` : "";
      const detail = [tokens, files].filter(Boolean).join(", ");

      console.log(
        pc.green(`[watch]`) + ` CLAUDE.md updated` + (detail ? ` (${detail})` : "")
      );
    } catch (err) {
      console.error(
        pc.red(`[watch]`) + ` rescan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      scanning = false;
      if (pendingScan) {
        pendingScan = false;
        triggerRescan();
      }
    }
  };

  const onFileChange = (filePath: string) => {
    const rel = relative(absDir, resolve(absDir, filePath));
    changedFiles.add(rel);

    if (options.verbose) {
      console.log(pc.dim(`[watch] changed: ${rel}`));
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerRescan, options.debounceMs);
  };

  const watcher = chokidarWatch(WATCH_GLOB, {
    cwd: absDir,
    ignored: ignorePatterns,
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on("change", onFileChange);
  watcher.on("add", onFileChange);
  watcher.on("unlink", onFileChange);

  const cleanup = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };

  return cleanup;
}

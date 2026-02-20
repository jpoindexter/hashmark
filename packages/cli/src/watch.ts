/**
 * hashmark watch
 *
 * File watcher that keeps `.hashmark/index.json` fresh during
 * development sessions. Uses chokidar to watch source files and
 * re-runs sync on changes with debouncing.
 *
 * @module watch
 */

import { resolve } from "path";
import pc from "picocolors";
import { watch as chokidarWatch } from "chokidar";
import { buildRelationshipIndex } from "./sync.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { clearIndexCache } from "./utils/load-index.js";

/** Source file patterns to watch */
const WATCH_PATTERNS = [
  "src/**/*.{ts,tsx,js,jsx}",
  "app/**/*.{ts,tsx,js,jsx}",
  "components/**/*.{ts,tsx,js,jsx}",
  "lib/**/*.{ts,tsx,js,jsx}",
  "pages/**/*.{ts,tsx,js,jsx}",
];

/** Patterns to ignore */
const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.hashmark/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/__pycache__/**",
  "**/target/**",
];

/**
 * Starts the file watcher. Runs until the process is terminated.
 *
 * @param dir - Project root directory to watch
 */
export async function startWatch(dir: string): Promise<void> {
  const absDir = resolve(dir);

  console.log(pc.cyan("  Watching for changes..."));
  console.log(pc.dim("  Press Ctrl+C to stop\n"));

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;
  let pendingSync = false;

  const runSync = async () => {
    if (syncing) {
      pendingSync = true;
      return;
    }

    syncing = true;
    try {
      const start = Date.now();
      const index = await buildRelationshipIndex(absDir);

      // Write index
      const hashmarkDir = join(absDir, ".hashmark");
      if (!existsSync(hashmarkDir)) {
        mkdirSync(hashmarkDir, { recursive: true });
      }
      writeFileSync(
        join(hashmarkDir, "index.json"),
        JSON.stringify(index, null, 2),
        "utf-8"
      );

      clearIndexCache();

      const elapsed = Date.now() - start;
      const timestamp = new Date().toLocaleTimeString();
      console.log(
        pc.dim(`  [${timestamp}]`) +
        pc.green(` ✓ Index updated: ${index.fileCount} files`) +
        pc.dim(` (${elapsed}ms)`)
      );
    } catch (error) {
      console.error(
        pc.red(`  ✗ Sync error: ${error instanceof Error ? error.message : error}`)
      );
    } finally {
      syncing = false;
      if (pendingSync) {
        pendingSync = false;
        runSync();
      }
    }
  };

  const debouncedSync = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(runSync, 500);
  };

  const watcher = chokidarWatch(WATCH_PATTERNS, {
    cwd: absDir,
    ignored: IGNORE_PATTERNS,
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on("change", debouncedSync);
  watcher.on("add", debouncedSync);
  watcher.on("unlink", debouncedSync);

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      console.log(pc.dim("\n  Stopped watching.\n"));
      watcher.close();
      resolve();
    });
    process.on("SIGTERM", () => {
      watcher.close();
      resolve();
    });
  });
}

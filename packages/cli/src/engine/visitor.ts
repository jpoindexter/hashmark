import fg from "fast-glob";
import { readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { ScannerRegistry } from "./registry.js";
import { detectFramework } from "../scanners/framework.js";
import { scanUtilities } from "../scanners/utilities.js";
import type { ScannerContext } from "./types.js";
import pc from "picocolors";

/** Maximum file size to process (256KB) to prevent OOM errors */
const MAX_FILE_SIZE = 256 * 1024;

/**
 * Performs a single-pass traversal of the codebase.
 * Dispatches file content to registered plugins via the ScannerRegistry.
 */
export class CodebaseVisitor {
  private registry: ScannerRegistry;

  constructor(registry: ScannerRegistry) {
    this.registry = registry;
  }

  /**
   * Traverses the directory and notifies plugins of relevant files.
   * 
   * @param dir - Project root directory.
   * @param excludePatterns - Glob patterns to ignore.
   * @param options - Additional traversal options.
   * @returns Foundational metadata and raw plugin results.
   */
  async visit(dir: string, excludePatterns: string[] = [], options: any = {}) {
    console.log(pc.dim("  Starting single-pass traversal..."));
    
    // 1. Foundational scans (independent of visitor for context setup)
    const framework = await detectFramework(dir);
    const utilities = await scanUtilities(dir);

    const changedFilesOnly: Set<string> | undefined = options.changedFilesOnly
      ? new Set<string>(options.changedFilesOnly as string[])
      : undefined;

    const context: ScannerContext = {
      cwd: dir,
      framework,
      utilities,
      excludePatterns,
      options,
      changedFilesOnly,
    };

    // 2. Prepare all plugins for the scan
    await this.registry.setupAll(context);

    // 3. Find all candidate files
    const files = await fg(
      [
        "**/*.{ts,tsx,js,jsx,json,md,py,go,rs,prisma,graphql,yml,yaml}",
        "!**/node_modules/**",
        "!**/.next/**",
        "!**/dist/**",
        "!**/build/**",
        "!**/.git/**",
        "!**/pnpm-lock.yaml",
        "!**/package-lock.json",
        "!**/*.zip",
        "!**/*.tar.gz",
        ...excludePatterns.map((p) => `!${p}`),
      ],
      { cwd: dir, absolute: false, followSymbolicLinks: false }
    );

    console.log(pc.dim(`  Traversing ${files.length} candidate files...`));

    // 4. Sequential dispatch to maintain memory safety
    for (const file of files) {
      // In incremental mode, skip files that haven't changed
      if (changedFilesOnly && !changedFilesOnly.has(file)) continue;

      try {
        const fullPath = join(dir, file);
        if (!existsSync(fullPath)) continue;

        const stats = statSync(fullPath);
        if (stats.size > MAX_FILE_SIZE) continue;

        const content = readFileSync(fullPath, "utf-8");
        await this.registry.dispatchFile(file, content, context);
      } catch (err) {
        // Skip inaccessible files or read errors
      }
    }

    // 5. Allow plugins to perform cross-file analysis (e.g., mapping)
    await this.registry.finalizeAll(context);

    return {
      framework,
      utilities,
      pluginResults: this.registry.getResults(),
    };
  }
}
